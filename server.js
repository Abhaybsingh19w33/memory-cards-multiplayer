const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ---------- Card model ----------
const RANKS = [
  ['A', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7],
  ['8', 8], ['9', 9], ['10', 10], ['J', 11], ['Q', 12], ['K', 13],
];
const SUITS = [['♠', 'black'], ['♥', 'red'], ['♦', 'red'], ['♣', 'black']];

function cardValue(card) {
  if (card.r === 'K') return card.color === 'red' ? -2 : 13;
  return card.v;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function makeDeck(numPlayers) {
  const numDecks = numPlayers <= 5 ? 2 : 3;
  const d = [];
  for (let n = 0; n < numDecks; n++) {
    for (const [r, v] of RANKS) {
      for (const [s, c] of SUITS) {
        d.push({ r, v, s, color: c, uid: crypto.randomUUID() });
      }
    }
  }
  return shuffle(d);
}
function publicCard(card) {
  return { r: card.r, s: card.s, color: card.color };
}

// ---------- Room state ----------
// rooms: Map<roomCode, Room>
const rooms = new Map();

function newRoom(code) {
  return {
    code,
    phase: 'lobby', // lobby | normal | final | reveal
    cardsPerPlayer: 5,
    players: [], // {pid, name, hand:[], connected, socketId}
    currentIndex: 0,
    deck: [],
    discard: [],
    stage: 'start', // start | drawn | qpower | jpower
    drawn: null,
    drawnThisTurn: false,
    turnDiscardStarted: false,
    qCount: 0,
    jCount: 0,
    zeroPlayer: null,
    finalCaller: null,
    log: [],
  };
}
function addLog(room, msg) {
  room.log.push(msg);
  if (room.log.length > 40) room.log.shift();
}
function findRoom(code) {
  return rooms.get(code) || null;
}
function currentPlayer(room) {
  return room.players[room.currentIndex] || null;
}
function findPlayer(room, pid) {
  return room.players.find((p) => p.pid === pid) || null;
}
function isMyTurn(room, pid) {
  const cp = currentPlayer(room);
  return !!cp && cp.pid === pid;
}

function drawFromDeck(room) {
  if (room.deck.length === 0) {
    if (room.discard.length > 1) {
      const top = room.discard.pop();
      room.deck = shuffle(room.discard);
      room.discard = [top];
      addLog(room, 'Draw pile was empty — reshuffled the discard pile (keeping the open card).');
    } else {
      return null;
    }
  }
  return room.deck.pop();
}
function openCard(room) {
  return room.discard[room.discard.length - 1] || null;
}

// Emit the full public state to everyone in the room.
function broadcastState(room) {
  const base = {
    phase: room.phase,
    cardsPerPlayer: room.cardsPerPlayer,
    players: room.players.map((p) => ({
      pid: p.pid, name: p.name, count: p.hand.length, connected: p.connected,
    })),
    currentIndex: room.currentIndex,
    currentName: currentPlayer(room) ? currentPlayer(room).name : null,
    discardTop: openCard(room) ? publicCard(openCard(room)) : null,
    deckCount: room.deck.length,
    stage: room.stage,
    drawnThisTurn: room.drawnThisTurn,
    qCount: room.qCount,
    jCount: room.jCount,
    finalActive: room.finalCaller !== null,
    log: room.log.slice(-30),
  };
  if (room.phase === 'reveal') {
    base.hands = room.players.map((p) => p.hand.map(publicCard));
    base.scores = room.players.map((p) => p.hand.reduce((a, c) => a + cardValue(c), 0));
  }
  io.to(room.code).emit('state', base);
}
function emitError(pid, message) {
  io.to(pid).emit('errorMsg', { message });
}

// Resolve Q/J powers for a set of cards that just landed in the discard pile.
// Any Q or J counts, whether it was a correct match or a wrong guess (it still
// physically ends up in the discard pile either way).
function queuePowersForCards(room, cards) {
  room.qCount += cards.filter((c) => c && c.r === 'Q').length;
  room.jCount += cards.filter((c) => c && c.r === 'J').length;
  if (room.qCount > 0) room.stage = 'qpower';
  else if (room.jCount > 0) room.stage = 'jpower';
  else room.stage = 'start';
}

function checkZero(room) {
  const cp = currentPlayer(room);
  if (cp && cp.hand.length === 0 && room.zeroPlayer === null) {
    room.zeroPlayer = cp.pid;
    addLog(room, `${cp.name} is down to 0 cards. Play continues until it comes back around to them.`);
  }
}

function advanceTurn(room) {
  room.currentIndex = (room.currentIndex + 1) % room.players.length;
  const cp = currentPlayer(room);
  if (room.zeroPlayer !== null && cp.pid === room.zeroPlayer) { revealAll(room); return; }
  if (room.finalCaller !== null && cp.pid === room.finalCaller) { revealAll(room); return; }
  room.drawn = null;
  room.drawnThisTurn = false;
  room.turnDiscardStarted = false;
  room.stage = 'start';
  broadcastState(room);
}
function revealAll(room) {
  room.phase = 'reveal';
  addLog(room, 'All hands are revealed. Game over!');
  broadcastState(room);
}

function dealNewRound(room) {
  room.deck = makeDeck(room.players.length);
  room.discard = [];
  for (const p of room.players) p.hand = [];
  for (let j = 0; j < room.cardsPerPlayer; j++) {
    for (const p of room.players) p.hand.push(room.deck.pop());
  }
  room.discard.push(room.deck.pop());
  room.currentIndex = 0;
  room.phase = 'normal';
  room.stage = 'start';
  room.drawn = null;
  room.drawnThisTurn = false;
  room.turnDiscardStarted = false;
  room.qCount = 0;
  room.jCount = 0;
  room.zeroPlayer = null;
  room.finalCaller = null;
}

// ---------- Socket handlers ----------
io.on('connection', (socket) => {
  socket.on('join', ({ roomCode, name }) => {
    roomCode = (roomCode || 'MAIN').trim().toUpperCase().slice(0, 12) || 'MAIN';
    name = (name || 'Player').trim().slice(0, 16) || 'Player';
    let room = findRoom(roomCode);
    if (!room) { room = newRoom(roomCode); rooms.set(roomCode, room); }
    if (room.phase !== 'lobby') {
      emitError(socket.id, 'This game already started. Ask for a new room code.');
      return;
    }
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      emitError(socket.id, 'That name is taken in this room — pick another.');
      return;
    }
    const pid = crypto.randomUUID();
    const token = crypto.randomUUID();
    room.players.push({ pid, token, name, hand: [], connected: true, socketId: socket.id });
    socket.join(roomCode);
    socket.join(pid);
    socket.data.roomCode = roomCode;
    socket.data.pid = pid;
    addLog(room, `${name} joined the table.`);
    io.to(pid).emit('joined', { pid, token, roomCode, name });
    broadcastState(room);
  });

  socket.on('rejoin', ({ roomCode, token }) => {
    roomCode = (roomCode || '').trim().toUpperCase();
    const room = findRoom(roomCode);
    if (!room) { emitError(socket.id, 'That room no longer exists.'); return; }
    const player = room.players.find((p) => p.token === token);
    if (!player) { emitError(socket.id, 'Could not find your seat in that room.'); return; }
    player.socketId = socket.id;
    player.connected = true;
    socket.join(roomCode);
    socket.join(player.pid);
    socket.data.roomCode = roomCode;
    socket.data.pid = player.pid;
    io.to(player.pid).emit('joined', { pid: player.pid, token: player.token, roomCode, name: player.name });
    addLog(room, `${player.name} reconnected.`);
    broadcastState(room);
  });

  socket.on('setCardsPerPlayer', ({ n }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    room.cardsPerPlayer = Math.max(3, Math.min(10, parseInt(n, 10) || 5));
    broadcastState(room);
  });

  socket.on('startGame', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (room.players.length < 2) { emitError(socket.data.pid, 'Need at least 2 players.'); return; }
    dealNewRound(room);
    addLog(room, `Game started! ${currentPlayer(room).name} goes first.`);
    broadcastState(room);
  });

  socket.on('draw', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid)) return emitError(pid, "It's not your turn.");
    if (room.stage !== 'start') return emitError(pid, 'Finish your current action first.');
    if (room.drawnThisTurn) return emitError(pid, 'You can only draw once per turn.');
    const card = drawFromDeck(room);
    if (!card) return emitError(pid, 'No cards left to draw.');
    room.drawn = card;
    room.drawnThisTurn = true;
    room.stage = 'drawn';
    io.to(pid).emit('yourDrawnCard', { card: publicCard(card) });
    broadcastState(room);
  });

  socket.on('discardDrawn', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'drawn') return emitError(pid, 'Nothing to discard.');
    const card = room.drawn;
    room.discard.push(card);
    room.drawn = null;
    addLog(room, `${currentPlayer(room).name} drew and discarded a card.`);
    queuePowersForCards(room, [card]);
    broadcastState(room);
  });

  socket.on('keepDrawn', ({ position }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'drawn') return emitError(pid, 'Nothing to place.');
    const p = currentPlayer(room);
    const idx = Math.max(0, Math.min(p.hand.length, parseInt(position, 10) || 0));
    p.hand.splice(idx, 0, room.drawn);
    room.drawn = null;
    room.turnDiscardStarted = true;
    room.stage = 'start';
    addLog(room, `${p.name} drew a card and slotted it into their hand.`);
    broadcastState(room);
  });

  // Handles BOTH "insert then dispose" (turnDiscardStarted) and
  // "matching discard without drawing" (against the open card).
  socket.on('matchSelected', ({ positions }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'start') return emitError(pid, 'You cannot do that right now.');
    if (!Array.isArray(positions) || positions.length === 0) {
      return emitError(pid, 'No cards selected. Please select at least one card.');
    }
    const p = currentPlayer(room);
    const indices = [...new Set(positions)].filter((i) => i >= 0 && i < p.hand.length).sort((a, b) => a - b);
    if (indices.length === 0) return emitError(pid, 'No valid cards selected.');

    const drewOrInserted = room.turnDiscardStarted === true;
    let correct = [];
    let wrong = [];
    let requiredRank = null;

    if (drewOrInserted) {
      const first = p.hand[indices[0]];
      requiredRank = first ? first.r : null;
      for (const i of indices) {
        const c = p.hand[i];
        if (c.r === requiredRank) correct.push(i); else wrong.push(i);
      }
    } else {
      const top = openCard(room);
      requiredRank = top ? top.r : null;
      for (const i of indices) {
        const c = p.hand[i];
        if (requiredRank && c.r === requiredRank) correct.push(i); else wrong.push(i);
      }
    }

    const selectedCards = indices.map((i) => p.hand[i]);
    for (let k = indices.length - 1; k >= 0; k--) {
      const c = p.hand.splice(indices[k], 1)[0];
      room.discard.push(c);
    }
    let penaltyCount = 0;
    for (let j = 0; j < wrong.length * 2; j++) {
      const c = drawFromDeck(room);
      if (c) { p.hand.push(c); penaltyCount++; }
    }

    room.turnDiscardStarted = false;
    let msg = `${p.name} played ${selectedCards.length} card(s) from their hand.`;
    if (wrong.length > 0) msg += ` ${wrong.length} were wrong — ${penaltyCount} penalty card(s) added.`;
    addLog(room, msg);

    io.to(pid).emit('discardReveal', {
      cards: selectedCards.map(publicCard),
      wrongCount: wrong.length,
      penaltyCount,
      requiredRank,
      drewOrInserted,
    });

    queuePowersForCards(room, selectedCards);
    checkZero(room);
    broadcastState(room);
  });

  socket.on('qPeekChoose', ({ position }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'qpower' || room.qCount <= 0) return;
    const p = currentPlayer(room);
    const idx = parseInt(position, 10);
    const card = p.hand[idx];
    if (!card) return emitError(pid, 'Invalid card.');
    room.qCount--;
    io.to(pid).emit('yourQPeek', { position: idx, card: publicCard(card), remaining: room.qCount });
    if (room.qCount <= 0) {
      room.stage = room.jCount > 0 ? 'jpower' : 'start';
    }
    broadcastState(room);
  });

  socket.on('jSwapSkip', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'jpower' || room.jCount <= 0) return;
    room.jCount--;
    if (room.jCount <= 0) room.stage = 'start';
    addLog(room, `${currentPlayer(room).name} skipped a J swap.`);
    broadcastState(room);
  });

  socket.on('jSwap', ({ targetPid, ownPos, theirPos }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'jpower' || room.jCount <= 0) return;
    const me = currentPlayer(room);
    const target = findPlayer(room, targetPid);
    if (!target || target.pid === pid) return emitError(pid, 'Invalid swap target.');
    const oi = parseInt(ownPos, 10), ti = parseInt(theirPos, 10);
    if (!(oi >= 0 && oi < me.hand.length) || !(ti >= 0 && ti < target.hand.length)) {
      return emitError(pid, 'Invalid card position.');
    }
    const tmp = me.hand[oi];
    me.hand[oi] = target.hand[ti];
    target.hand[ti] = tmp;
    room.jCount--;
    if (room.jCount <= 0) room.stage = 'start';
    addLog(room, `${me.name} used J power to blind-swap a card with ${target.name}.`);
    broadcastState(room);
  });

  socket.on('arrangeMove', ({ from, to }) => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid)) return;
    const p = currentPlayer(room);
    const f = parseInt(from, 10), t = parseInt(to, 10);
    if (!(f >= 0 && f < p.hand.length) || !(t >= 0 && t < p.hand.length)) return;
    const item = p.hand.splice(f, 1)[0];
    p.hand.splice(t, 0, item);
    broadcastState(room);
  });

  socket.on('callReveal', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid) || room.stage !== 'start') return emitError(pid, 'Finish your turn first.');
    room.finalCaller = pid;
    room.phase = 'final';
    addLog(room, `${currentPlayer(room).name} called Reveal! Everyone else gets one final turn.`);
    broadcastState(room);
  });

  socket.on('next', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const pid = socket.data.pid;
    if (!isMyTurn(room, pid)) return;
    if (room.stage !== 'start') return emitError(pid, 'Finish this action first.');
    advanceTurn(room);
  });

  socket.on('playAgain', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room || room.phase !== 'reveal') return;
    dealNewRound(room);
    addLog(room, 'New round dealt with the same players.');
    broadcastState(room);
  });

  socket.on('newGame', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    room.phase = 'lobby';
    room.players = [];
    room.log = [];
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const room = findRoom(socket.data.roomCode);
    if (!room) return;
    const p = findPlayer(room, socket.data.pid);
    if (p) {
      p.connected = false;
      addLog(room, `${p.name} disconnected.`);
      broadcastState(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Memory Cards server listening on :${PORT}`));
