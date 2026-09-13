/**
 * @file scenario_01_lobby_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 1: Lobby, Matchmaking & Reconnection.
 */

const test = require('node:test');
const assert = require('node:assert');
const { registerSocketHandlers, findRoom, rooms } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, GAME_CONFIG } = require('../src/config/constants');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');

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

function setupMockServer() {
  const io = new MockIO();
  registerSocketHandlers(io);
  return io;
}

test('Scenario 1 Permutations - Room Code Normalization Matrix', () => {
  const io = setupMockServer();

  const testCases = [
    { input: '', expected: 'MAIN' },
    { input: null, expected: 'MAIN' },
    { input: undefined, expected: 'MAIN' },
    { input: '   ', expected: 'MAIN' },
    { input: '  poker  ', expected: 'POKER' },
    { input: 'friday_night', expected: 'FRIDAY_NIGHT' },
    { input: '12345678901234567890', expected: '123456789012' }, // Truncate to 12
    { input: '   lowercase12345   ', expected: 'LOWERCASE123' },
    { input: 'room-abc!?', expected: 'ROOM-ABC!?' },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const socket = new MockSocket(`s_rc_${i}`);
    io.connectionHandler(socket);
    socket.trigger('join', { roomCode: tc.input, name: `User_${i}` });

    const room = findRoom(tc.expected);
    assert.ok(room, `Room ${tc.expected} should exist for input "${tc.input}"`);
    assert.strictEqual(room.code, tc.expected);
    assert.ok(socket.roomsJoined.has(tc.expected));
  }
});

test('Scenario 1 Permutations - Player Name Normalization & Length Matrix', () => {
  const io = setupMockServer();

  const testCases = [
    { name: '', expectedName: 'Player' },
    { name: null, expectedName: 'Player' },
    { name: undefined, expectedName: 'Player' },
    { name: '   ', expectedName: 'Player' },
    { name: '  Bob  ', expectedName: 'Bob' },
    { name: 'AlexanderTheGreat123', expectedName: 'AlexanderTheGrea' }, // Truncate to 16
    { name: '   SpacesAroundLongName123   ', expectedName: 'SpacesAroundLong' },
  ];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const roomCode = `PNAME_RM_${i}`;
    const socket = new MockSocket(`s_pn_${i}`);
    io.connectionHandler(socket);
    socket.trigger('join', { roomCode, name: tc.name });

    const room = findRoom(roomCode);
    assert.ok(room);
    assert.strictEqual(room.players[0].name, tc.expectedName);
  }
});

test('Scenario 1 Permutations - Case-Insensitive Duplicate Name Matrix', () => {
  const io = setupMockServer();
  const roomCode = 'DUP_MATRIX';

  const socket1 = new MockSocket('s_dup_1');
  io.connectionHandler(socket1);
  socket1.trigger('join', { roomCode, name: 'Alice' });

  const duplicateAttempts = ['alice', 'ALICE', '  Alice  ', '  aLiCe  '];

  for (let i = 0; i < duplicateAttempts.length; i++) {
    const badName = duplicateAttempts[i];
    const socketBad = new MockSocket(`s_dup_bad_${i}`);
    io.connectionHandler(socketBad);
    socketBad.trigger('join', { roomCode, name: badName });

    const room = findRoom(roomCode);
    assert.strictEqual(room.players.length, 1, `Duplicate "${badName}" must be rejected`);

    const err = io.emitted.find((e) => e.channel === socketBad.id && e.event === 'errorMsg');
    assert.ok(err, `Error message must be emitted to ${socketBad.id}`);
    assert.strictEqual(err.payload.message, 'That name is taken in this room — pick another.');
  }

  // A distinct name should successfully join
  const socketValid = new MockSocket('s_dup_valid');
  io.connectionHandler(socketValid);
  socketValid.trigger('join', { roomCode, name: 'Bob' });
  const room = findRoom(roomCode);
  assert.strictEqual(room.players.length, 2, 'Distinct name Bob must be accepted');
});

test('Scenario 1 Permutations - Reconnection Across All Game Phases', () => {
  const io = setupMockServer();
  const roomCode = 'RECON_PHASES';

  const socket1 = new MockSocket('s_rec_1');
  const socket2 = new MockSocket('s_rec_2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode, name: 'ReconUser1' });
  socket2.trigger('join', { roomCode, name: 'ReconUser2' });

  const room = findRoom(roomCode);
  const p1 = room.players[0];
  const p1Token = p1.token;
  const p1Pid = p1.pid;

  const phasesToTest = [
    GAME_PHASES.LOBBY,
    GAME_PHASES.NORMAL,
    GAME_PHASES.FINAL,
    GAME_PHASES.REVEAL,
  ];

  for (let i = 0; i < phasesToTest.length; i++) {
    const phase = phasesToTest[i];
    room.phase = phase;

    // Simulate disconnect
    socket1.trigger('disconnect');
    assert.strictEqual(p1.connected, false, `p1 should be marked disconnected in phase ${phase}`);

    // Simulate reconnect with fresh socket ID
    const reconSocket = new MockSocket(`s_recon_phase_${i}`);
    io.connectionHandler(reconSocket);
    reconSocket.trigger('rejoin', { roomCode, token: p1Token });

    assert.strictEqual(p1.connected, true, `p1 should be reconnected in phase ${phase}`);
    assert.strictEqual(p1.socketId, reconSocket.id);
    assert.strictEqual(p1.pid, p1Pid);
    assert.ok(reconSocket.roomsJoined.has(roomCode));
    assert.ok(reconSocket.roomsJoined.has(p1Pid));
  }
});

test('Scenario 1 Permutations - Reconnection Failure Matrix', () => {
  const io = setupMockServer();
  const roomCode = 'RECON_FAILS';

  const socket1 = new MockSocket('s_rf_1');
  io.connectionHandler(socket1);
  socket1.trigger('join', { roomCode, name: 'Original' });

  // Test 1: Nonexistent room code
  const sNonexistentRoom = new MockSocket('s_bad_room');
  io.connectionHandler(sNonexistentRoom);
  sNonexistentRoom.trigger('rejoin', { roomCode: 'NO_SUCH_ROOM', token: 'any-token' });
  const err1 = io.emitted.find((e) => e.channel === sNonexistentRoom.id && e.event === 'errorMsg');
  assert.strictEqual(err1.payload.message, 'That room no longer exists.');

  // Test 2: Nonexistent or mismatched token
  const sBadToken = new MockSocket('s_bad_token');
  io.connectionHandler(sBadToken);
  sBadToken.trigger('rejoin', { roomCode, token: 'invalid-token-uuid' });
  const err2 = io.emitted.find((e) => e.channel === sBadToken.id && e.event === 'errorMsg');
  assert.strictEqual(err2.payload.message, 'Could not find your seat in that room.');

  // Test 3: Null / empty token
  const sEmptyToken = new MockSocket('s_empty_token');
  io.connectionHandler(sEmptyToken);
  sEmptyToken.trigger('rejoin', { roomCode, token: '' });
  const err3 = io.emitted.find((e) => e.channel === sEmptyToken.id && e.event === 'errorMsg');
  assert.strictEqual(err3.payload.message, 'Could not find your seat in that room.');
});

test('Scenario 1 Permutations - Cards Per Player Boundary Matrix', () => {
  const io = setupMockServer();
  const roomCode = 'CPP_PERM_RM';

  const socket = new MockSocket('s_cpp_perm');
  io.connectionHandler(socket);
  socket.trigger('join', { roomCode, name: 'HostPlayer' });
  const room = findRoom(roomCode);

  const testMatrix = [
    { input: -10, expected: 3 },
    { input: 0, expected: 5 },
    { input: 1, expected: 3 },
    { input: 2, expected: 3 },
    { input: 3, expected: 3 },
    { input: 4, expected: 4 },
    { input: 5, expected: 5 },
    { input: 6, expected: 6 },
    { input: 7, expected: 7 },
    { input: 8, expected: 8 },
    { input: 9, expected: 9 },
    { input: 10, expected: 10 },
    { input: 11, expected: 10 },
    { input: 50, expected: 10 },
    { input: 'NaN', expected: 5 },
    { input: 'invalid', expected: 5 },
    { input: null, expected: 5 },
  ];

  for (const tc of testMatrix) {
    socket.trigger('setCardsPerPlayer', { n: tc.input });
    assert.strictEqual(
      room.cardsPerPlayer,
      tc.expected,
      `Cards per player for input ${tc.input} should be ${tc.expected}`
    );
  }

  // Attempting to set cardsPerPlayer when game is already started should be ignored
  room.phase = GAME_PHASES.NORMAL;
  socket.trigger('setCardsPerPlayer', { n: 8 });
  assert.strictEqual(room.cardsPerPlayer, 5, 'Should ignore setCardsPerPlayer when phase != lobby');
});

test('Scenario 1 Permutations - Start Game Player Count Constraints', () => {
  const io = setupMockServer();
  const roomCode = 'START_PERMS';

  const socket1 = new MockSocket('s_sp_1');
  io.connectionHandler(socket1);
  socket1.trigger('join', { roomCode, name: 'Solo' });

  // 1 Player: Start must be blocked
  socket1.trigger('startGame');
  const room = findRoom(roomCode);
  assert.strictEqual(room.phase, GAME_PHASES.LOBBY, 'Game must not start with 1 player');
  const err = io.emitted.find((e) => e.channel === socket1.data.pid && e.event === 'errorMsg');
  assert.strictEqual(err.payload.message, `Need at least ${GAME_CONFIG.MIN_PLAYERS} players.`);

  // 2 Players: Start succeeds
  const socket2 = new MockSocket('s_sp_2');
  io.connectionHandler(socket2);
  socket2.trigger('join', { roomCode, name: 'Duo' });
  socket1.trigger('startGame');

  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Game should start with 2 players');
  assert.strictEqual(room.players[0].hand.length, room.cardsPerPlayer);
  assert.strictEqual(room.players[1].hand.length, room.cardsPerPlayer);

  // Attempting to start game again while in normal phase should be safely ignored
  socket1.trigger('startGame');
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
});

test('Scenario 1 Permutations - Joining Active Game Forbidden', () => {
  const io = setupMockServer();
  const roomCode = 'JOIN_ACTIVE';

  const socket1 = new MockSocket('s_jf_1');
  const socket2 = new MockSocket('s_jf_2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);
  socket1.trigger('join', { roomCode, name: 'Player1' });
  socket2.trigger('join', { roomCode, name: 'Player2' });
  socket1.trigger('startGame');

  const room = findRoom(roomCode);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Player 3 tries to join the active game
  const socket3 = new MockSocket('s_jf_3');
  io.connectionHandler(socket3);
  socket3.trigger('join', { roomCode, name: 'LateComer' });

  assert.strictEqual(room.players.length, 2, 'Latecomer should not be added to active room');
  const err = io.emitted.find((e) => e.channel === socket3.id && e.event === 'errorMsg');
  assert.strictEqual(err.payload.message, 'This game already started. Ask for a new room code.');
});
