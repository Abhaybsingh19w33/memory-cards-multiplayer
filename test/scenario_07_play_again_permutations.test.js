/**
 * @file scenario_07_play_again_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 7: Round Reset, Play Again & New Game.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { registerSocketHandlers, findRoom } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');
const { makeDeck } = require('../src/models/Deck');

class MockSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.events = {};
    this.roomsJoined = new Set();
  }
  on(event, handler) { this.events[event] = handler; }
  emit() {}
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

test('Scenario 7 Permutations - Complete Field-by-Field State Reset Across Custom Hand Sizes', () => {
  const handSizes = [3, 5, 8, 10];

  for (const cpp of handSizes) {
    const room = new Room(`RESET_${cpp}`);
    const p1 = new Player({ name: 'Alice', socketId: 's1' });
    const p2 = new Player({ name: 'Bob', socketId: 's2' });
    const p3 = new Player({ name: 'Charlie', socketId: 's3' });
    room.players.push(p1, p2, p3);
    room.cardsPerPlayer = cpp;

    // Simulate deeply dirtied endgame state
    GameEngine.dealNewRound(room);
    GameEngine.revealAll(room);
    room.currentIndex = 2;
    room.stage = TURN_STAGES.JPOWER;
    room.qCount = 5;
    room.jCount = 3;
    room.drawn = { r: 'K' };
    room.drawnThisTurn = true;
    room.turnDiscardStarted = true;
    room.zeroPlayer = p1.pid;
    room.finalCaller = p2.pid;

    // Trigger Play Again
    GameEngine.dealNewRound(room);

    // Invariant assertions
    assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
    assert.strictEqual(room.stage, TURN_STAGES.START);
    assert.strictEqual(room.currentIndex, 0);
    assert.strictEqual(room.drawn, null);
    assert.strictEqual(room.drawnThisTurn, false);
    assert.strictEqual(room.turnDiscardStarted, false);
    assert.strictEqual(room.qCount, 0);
    assert.strictEqual(room.jCount, 0);
    assert.strictEqual(room.zeroPlayer, null);
    assert.strictEqual(room.finalCaller, null);

    // Hands and deck assertions
    assert.strictEqual(p1.hand.length, cpp);
    assert.strictEqual(p2.hand.length, cpp);
    assert.strictEqual(p3.hand.length, cpp);
    assert.strictEqual(room.discard.length, 1);

    const totalCards = makeDeck(3).length; // 104
    const expectedDeckCards = totalCards - (3 * cpp + 1);
    assert.strictEqual(room.deck.length, expectedDeckCards);
  }
});

test('Scenario 7 Permutations - Multiple Consecutive Rounds (Round 1 -> 2 -> 3)', () => {
  const room = new Room('CONSECUTIVE_ROUNDS');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);

  const originalP1Token = p1.token;
  const originalP1Pid = p1.pid;
  const originalP2Token = p2.token;
  const originalP2Pid = p2.pid;

  for (let roundNum = 1; roundNum <= 3; roundNum++) {
    // Deal round
    GameEngine.dealNewRound(room);
    assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
    assert.strictEqual(p1.hand.length, 5);
    assert.strictEqual(p2.hand.length, 5);

    // Identity and seats must remain 100% persistent
    assert.strictEqual(p1.token, originalP1Token);
    assert.strictEqual(p1.pid, originalP1Pid);
    assert.strictEqual(p2.token, originalP2Token);
    assert.strictEqual(p2.pid, originalP2Pid);

    // Simulate play and reveal
    GameEngine.callReveal(room, p1.pid);
    GameEngine.advanceTurn(room);
    GameEngine.advanceTurn(room);
    assert.strictEqual(room.phase, GAME_PHASES.REVEAL);

    const pub = room.toPublicState();
    assert.strictEqual(pub.phase, GAME_PHASES.REVEAL);
    assert.ok(pub.scores);
  }
});

test('Scenario 7 Permutations - Play Again Blocked in Non-Reveal Phases', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket = new MockSocket('s_pa_guard');
  io.connectionHandler(socket);
  socket.trigger('join', { roomCode: 'PA_GUARD', name: 'User' });
  const room = findRoom('PA_GUARD');

  const nonRevealPhases = [GAME_PHASES.LOBBY, GAME_PHASES.NORMAL, GAME_PHASES.FINAL];
  for (const ph of nonRevealPhases) {
    room.phase = ph;
    socket.trigger('playAgain');
    assert.strictEqual(room.phase, ph, `playAgain must have no effect when phase is ${ph}`);
  }
});

test('Scenario 7 Permutations - New Game Complete Reset to Lobby Matrix', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket1 = new MockSocket('s_ng_1');
  const socket2 = new MockSocket('s_ng_2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode: 'NG_ROOM', name: 'PlayerA' });
  socket2.trigger('join', { roomCode: 'NG_ROOM', name: 'PlayerB' });
  socket1.trigger('startGame');

  const room = findRoom('NG_ROOM');
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.players.length, 2);

  // Trigger New Game
  socket1.trigger('newGame');

  assert.strictEqual(room.phase, GAME_PHASES.LOBBY);
  assert.strictEqual(room.players.length, 0);
  assert.strictEqual(room.log.length, 0);

  // Fresh players can now join the room
  const socket3 = new MockSocket('s_ng_3');
  io.connectionHandler(socket3);
  socket3.trigger('join', { roomCode: 'NG_ROOM', name: 'FreshUser' });
  assert.strictEqual(room.players.length, 1);
  assert.strictEqual(room.players[0].name, 'FreshUser');
});

