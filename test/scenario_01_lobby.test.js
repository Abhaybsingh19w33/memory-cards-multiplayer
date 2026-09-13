/**
 * @file scenario_01_lobby.test.js
 * @description Test suite for Scenario 1: Lobby & Matchmaking.
 */

const test = require('node:test');
const assert = require('node:assert');
const { registerSocketHandlers, findRoom, rooms } = require('../src/sockets/socketHandlers');
const { GAME_PHASES } = require('../src/config/constants');

class MockSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.events = {};
    this.emitted = [];
    this.roomsJoined = new Set();
  }
  on(event, handler) { this.events[event] = handler; }
  emit(event, payload) { this.emitted.push({ event, payload }); }
  join(room) { this.roomsJoined.add(room); }
  trigger(event, payload = {}) {
    if (this.events[event]) this.events[event](payload);
  }
}

class MockIO {
  constructor() {
    this.emitted = [];
  }
  on(evt, handler) {
    if (evt === 'connection') this.connectionHandler = handler;
  }
  to(channel) {
    return {
      emit: (event, payload) => {
        this.emitted.push({ channel, event, payload });
      },
    };
  }
}

test('Scenario 1 - Room Creation and Name Sanitization', () => {
  const io = new MockIO();
  registerSocketHandlers(io);
  const socket = new MockSocket('s1');
  io.connectionHandler(socket);

  socket.trigger('join', { roomCode: '  friday123456789extra  ', name: '  AliceVeryLongNameHere  ' });

  const room = findRoom('FRIDAY123456');
  assert.ok(room, 'Room code should be trimmed, uppercased, and truncated to 12 chars');
  assert.strictEqual(room.phase, GAME_PHASES.LOBBY);
  assert.strictEqual(room.players.length, 1);
  assert.strictEqual(room.players[0].name.length, 16, 'Name should be truncated to 16 chars');
  assert.ok(socket.roomsJoined.has('FRIDAY123456'));
});

test('Scenario 1 - Duplicate Name Prevention', () => {
  const io = new MockIO();
  registerSocketHandlers(io);
  const socket1 = new MockSocket('s1');
  const socket2 = new MockSocket('s2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode: 'ROOM_DUP', name: 'Charlie' });
  socket2.trigger('join', { roomCode: 'ROOM_DUP', name: 'charlie' }); // case-insensitive duplicate

  const room = findRoom('ROOM_DUP');
  assert.strictEqual(room.players.length, 1, 'Duplicate player must not be added to room');

  const errorEmit = io.emitted.find(e => e.channel === 's2' && e.event === 'errorMsg');
  assert.ok(errorEmit, 'Error message should be sent to socket2');
  assert.match(errorEmit.payload.message, /That name is taken/);
});

test('Scenario 1 - Seat Re-attachment on Reconnect (Token Persistence)', () => {
  const io = new MockIO();
  registerSocketHandlers(io);
  const socket1 = new MockSocket('s1');
  io.connectionHandler(socket1);

  socket1.trigger('join', { roomCode: 'ROOM_RECON', name: 'Dave' });
  const room = findRoom('ROOM_RECON');
  const player = room.players[0];
  const originalToken = player.token;
  const originalPid = player.pid;

  // Simulate dropped connection and reconnecting with a new socket ID
  const socketReconnect = new MockSocket('s_recon_99');
  io.connectionHandler(socketReconnect);

  socketReconnect.trigger('rejoin', { roomCode: 'ROOM_RECON', token: originalToken });

  assert.strictEqual(player.socketId, 's_recon_99', 'Socket ID must be updated');
  assert.strictEqual(player.connected, true);
  assert.strictEqual(player.pid, originalPid);
  assert.ok(socketReconnect.roomsJoined.has('ROOM_RECON'));
  assert.ok(socketReconnect.roomsJoined.has(originalPid));
});

test('Scenario 1 - Cards Per Player Adjustment', () => {
  const io = new MockIO();
  registerSocketHandlers(io);
  const socket = new MockSocket('s1');
  io.connectionHandler(socket);

  socket.trigger('join', { roomCode: 'ROOM_CPP', name: 'Eve' });
  const room = findRoom('ROOM_CPP');

  // Test normal value
  socket.trigger('setCardsPerPlayer', { n: 7 });
  assert.strictEqual(room.cardsPerPlayer, 7);

  // Test clamp min
  socket.trigger('setCardsPerPlayer', { n: 1 });
  assert.strictEqual(room.cardsPerPlayer, 3, 'Should clamp to min 3');

  // Test clamp max
  socket.trigger('setCardsPerPlayer', { n: 99 });
  assert.strictEqual(room.cardsPerPlayer, 10, 'Should clamp to max 10');
});

test('Scenario 1 - Minimum Players Constraint to Start', () => {
  const io = new MockIO();
  registerSocketHandlers(io);
  const socket1 = new MockSocket('s1');
  io.connectionHandler(socket1);

  socket1.trigger('join', { roomCode: 'ROOM_START', name: 'Frank' });
  const room = findRoom('ROOM_START');

  // Attempt start with only 1 player
  socket1.trigger('startGame');
  assert.strictEqual(room.phase, GAME_PHASES.LOBBY, 'Game must not start with fewer than 2 players');

  // Add second player
  const socket2 = new MockSocket('s2');
  io.connectionHandler(socket2);
  socket2.trigger('join', { roomCode: 'ROOM_START', name: 'Grace' });

  // Now start
  socket1.trigger('startGame');
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Game should start with 2 players');
});

