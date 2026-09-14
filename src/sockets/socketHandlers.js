/**
 * @file socketHandlers.js
 * @description Socket.IO networking layer, connection lifecycle, event dispatching, and state synchronization.
 * Adheres to Golden Rules: Input sanitization, authoritative validation, robust error feedback, isolation from raw game logic.
 */

const { GAME_PHASES, TURN_STAGES, GAME_CONFIG } = require('../config/constants');
const Room = require('../models/Room');
const Player = require('../models/Player');
const GameEngine = require('../services/GameEngine');
const { toPublicCard } = require('../models/Card');

// In-memory room store: Map<roomCode, Room>
const rooms = new Map();

/**
 * Retrieves a room by code.
 * @param {string} code 
 * @returns {Room|null}
 */
function findRoom(code) {
  return rooms.get(code) || null;
}

/**
 * Emits a standardized error message to a socket or room.
 * @param {object} io 
 * @param {string} target - Socket ID or Room/PID channel
 * @param {string} message - Error description
 */
function emitError(io, target, message) {
  io.to(target).emit('errorMsg', { message });
}

/**
 * Broadcasts the sanitized public room state to all clients in the room.
 * @param {object} io 
 * @param {Room} room 
 */
function broadcastState(io, room) {
  if (!room) return;
  io.to(room.code).emit('state', room.toPublicState());
}

/**
 * Registers all Socket.IO event listeners.
 * @param {object} io - Socket.IO server instance
 */
function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // ---------------- JOIN LOBBY ----------------
    socket.on('join', ({ roomCode, name }) => {
      roomCode = (roomCode || 'MAIN').trim().toUpperCase().slice(0, GAME_CONFIG.MAX_ROOM_CODE_LENGTH) || 'MAIN';
      name = (name || 'Player').trim().slice(0, GAME_CONFIG.MAX_NAME_LENGTH) || 'Player';

      let room = findRoom(roomCode);
      if (!room) {
        room = new Room(roomCode);
        rooms.set(roomCode, room);
      }

      if (room.phase !== GAME_PHASES.LOBBY) {
        emitError(io, socket.id, 'This game already started. Ask for a new room code.');
        return;
      }

      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        emitError(io, socket.id, 'That name is taken in this room — pick another.');
        return;
      }

      const player = new Player({ name, socketId: socket.id });
      room.players.push(player);

      socket.join(roomCode);
      socket.join(player.pid);
      socket.data.roomCode = roomCode;
      socket.data.pid = player.pid;

      room.addLog(`${name} joined the table.`);
      io.to(player.pid).emit('joined', {
        pid: player.pid,
        token: player.token,
        roomCode,
        name,
      });

      broadcastState(io, room);
    });

    // ---------------- REJOIN / RECONNECT ----------------
    socket.on('rejoin', ({ roomCode, token }) => {
      roomCode = (roomCode || '').trim().toUpperCase();
      const room = findRoom(roomCode);
      if (!room) {
        emitError(io, socket.id, 'That room no longer exists.');
        return;
      }

      const player = room.findPlayerByToken(token);
      if (!player) {
        emitError(io, socket.id, 'Could not find your seat in that room.');
        return;
      }

      player.socketId = socket.id;
      player.connected = true;

      socket.join(roomCode);
      socket.join(player.pid);
      socket.data.roomCode = roomCode;
      socket.data.pid = player.pid;

      io.to(player.pid).emit('joined', {
        pid: player.pid,
        token: player.token,
        roomCode,
        name: player.name,
      });

      room.addLog(`${player.name} reconnected.`);
      broadcastState(io, room);
    });

    // ---------------- LOBBY CONFIGURATION ----------------
    socket.on('setCardsPerPlayer', ({ n }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room || room.phase !== GAME_PHASES.LOBBY) return;

      room.cardsPerPlayer = Math.max(
        GAME_CONFIG.MIN_CARDS_PER_PLAYER,
        Math.min(GAME_CONFIG.MAX_CARDS_PER_PLAYER, parseInt(n, 10) || GAME_CONFIG.DEFAULT_CARDS_PER_PLAYER)
      );
      broadcastState(io, room);
    });

    // ---------------- START GAME ----------------
    socket.on('startGame', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room || room.phase !== GAME_PHASES.LOBBY) return;

      if (room.players.length < GAME_CONFIG.MIN_PLAYERS) {
        emitError(io, socket.data.pid, `Need at least ${GAME_CONFIG.MIN_PLAYERS} players.`);
        return;
      }

      GameEngine.dealNewRound(room);
      room.addLog(`Game started! ${room.currentPlayer().name} goes first.`);
      broadcastState(io, room);
    });

    // ---------------- DRAW CARD ----------------
    socket.on('draw', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.draw(room, pid);
      if (!res.success) {
        emitError(io, pid, res.error);
        return;
      }

      io.to(pid).emit('yourDrawnCard', { card: toPublicCard(res.card) });
      broadcastState(io, room);
    });

    // ---------------- DISCARD DRAWN CARD ----------------
    socket.on('discardDrawn', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.discardDrawn(room, pid);
      if (!res.success) {
        emitError(io, pid, res.error);
        return;
      }

      broadcastState(io, room);
    });

    // ---------------- KEEP DRAWN CARD IN HAND ----------------
    socket.on('keepDrawn', ({ position }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.keepDrawn(room, pid, position);
      if (!res.success) {
        emitError(io, pid, res.error);
        return;
      }

      if (res.insertedPos !== undefined) {
        io.to(room.code).emit('cardHighlight', {
          pid,
          type: 'insert',
          insertedPos: res.insertedPos,
          timestamp: Date.now(),
        });
      }

      broadcastState(io, room);
    });

    // ---------------- MATCH & DISCARD ----------------
    socket.on('matchSelected', ({ positions }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.matchSelected(room, pid, positions);
      if (!res.success) {
        emitError(io, pid, res.error);
        return;
      }

      if (res.highlight) {
        io.to(room.code).emit('cardHighlight', {
          pid,
          ...res.highlight,
        });
      }

      io.to(pid).emit('discardReveal', res.result);
      broadcastState(io, room);
    });

    // ---------------- QUEEN POWER: PEEK ----------------
    socket.on('qPeekChoose', ({ position }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.qPeek(room, pid, position);
      if (!res.success) {
        if (res.error) emitError(io, pid, res.error);
        return;
      }

      io.to(pid).emit('yourQPeek', {
        position: res.position,
        card: res.card,
        remaining: res.remaining,
      });
      broadcastState(io, room);
    });

    // ---------------- JACK POWER: SKIP SWAP ----------------
    socket.on('jSwapSkip', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.jSwapSkip(room, pid);
      if (!res.success) return;

      broadcastState(io, room);
    });

    // ---------------- JACK POWER: BLIND SWAP ----------------
    socket.on('jSwap', ({ targetPid, ownPos, theirPos }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.jSwap(room, pid, targetPid, ownPos, theirPos);
      if (!res.success) {
        if (res.error) emitError(io, pid, res.error);
        return;
      }

      if (res.swap) {
        io.to(room.code).emit('jSwapNotice', res.swap);
      }

      broadcastState(io, room);
    });

    // ---------------- ARRANGE HAND ----------------
    socket.on('arrangeMove', ({ from, to }) => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.arrangeMove(room, pid, from, to);
      if (!res.success) return;

      if (res.highlight) {
        io.to(room.code).emit('cardHighlight', {
          pid,
          ...res.highlight,
        });
      }

      broadcastState(io, room);
    });

    // ---------------- CALL REVEAL ----------------
    socket.on('callReveal', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      const res = GameEngine.callReveal(room, pid);
      if (!res.success) {
        emitError(io, pid, res.error);
        return;
      }

      broadcastState(io, room);
    });

    // ---------------- NEXT TURN ----------------
    socket.on('next', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const pid = socket.data.pid;
      if (!room.isMyTurn(pid)) return;
      if (room.stage !== TURN_STAGES.START) {
        emitError(io, pid, 'Finish this action first.');
        return;
      }

      GameEngine.advanceTurn(room);
      broadcastState(io, room);
    });

    // ---------------- PLAY AGAIN (SAME PLAYERS) ----------------
    socket.on('playAgain', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room || room.phase !== GAME_PHASES.REVEAL) return;

      GameEngine.dealNewRound(room);
      room.addLog('New round dealt with the same players.');
      broadcastState(io, room);
    });

    // ---------------- NEW GAME (RESET TO LOBBY) ----------------
    socket.on('newGame', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      room.phase = GAME_PHASES.LOBBY;
      room.players = [];
      room.log = [];
      broadcastState(io, room);
    });

    // ---------------- DISCONNECT ----------------
    socket.on('disconnect', () => {
      const room = findRoom(socket.data.roomCode);
      if (!room) return;

      const player = room.findPlayer(socket.data.pid);
      if (player) {
        player.connected = false;
        room.addLog(`${player.name} disconnected.`);
        broadcastState(io, room);
      }
    });
  });
}

module.exports = {
  rooms,
  findRoom,
  broadcastState,
  registerSocketHandlers,
};

