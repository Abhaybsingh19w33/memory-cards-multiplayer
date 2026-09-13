/**
 * @file scenario_07_round_reset_play_again.test.js
 * @description Test suite for Scenario 7: Round Reset & Play Again.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { registerSocketHandlers, findRoom } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');

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

test('Scenario 7 - Play Again Server State Reset Verification', () => {
  const room = new Room('ROOM_PLAY_AGAIN');
  const p1 = new Player({ name: 'Player1', socketId: 's1' });
  const p2 = new Player({ name: 'Player2', socketId: 's2' });
  room.players.push(p1, p2);
  room.cardsPerPlayer = 6;

  // Simulate end of round
  GameEngine.dealNewRound(room);
  GameEngine.revealAll(room);
  room.qCount = 3;
  room.jCount = 2;
  room.zeroPlayer = p1.pid;
  room.finalCaller = p2.pid;
  room.drawnThisTurn = true;
  room.turnDiscardStarted = true;

  // Execute Play Again
  GameEngine.dealNewRound(room);

  // Assert complete reset of all flags
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Phase must reset to normal');
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Stage must reset to start');
  assert.strictEqual(room.currentIndex, 0, 'Turn must reset to index 0');
  assert.strictEqual(room.drawn, null);
  assert.strictEqual(room.drawnThisTurn, false);
  assert.strictEqual(room.turnDiscardStarted, false);
  assert.strictEqual(room.qCount, 0);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.zeroPlayer, null);
  assert.strictEqual(room.finalCaller, null);

  // Assert fresh hands dealt
  assert.strictEqual(p1.hand.length, 6);
  assert.strictEqual(p2.hand.length, 6);
  assert.strictEqual(room.discard.length, 1, 'Fresh open card on discard pile');

  // Assert public state hides hands
  const state = room.toPublicState();
  assert.strictEqual(state.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(state.hands, undefined, 'Hands must be hidden from public state');
  assert.strictEqual(state.scores, undefined, 'Scores must be hidden from public state');
});

test('Scenario 7 - Play Again via Socket Event Flow', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket1 = new MockSocket('s1');
  const socket2 = new MockSocket('s2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode: 'RM_RESET', name: 'User1' });
  socket2.trigger('join', { roomCode: 'RM_RESET', name: 'User2' });
  socket1.trigger('startGame');

  const room = findRoom('RM_RESET');

  // Put room into reveal phase
  room.phase = GAME_PHASES.REVEAL;

  // Trigger playAgain event from socket
  socket1.trigger('playAgain');

  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.players.length, 2, 'Same players retained');
  assert.strictEqual(room.players[0].hand.length, 5);
  assert.strictEqual(room.players[1].hand.length, 5);

  const lastBroadcast = io.emitted.filter(e => e.channel === 'RM_RESET' && e.event === 'state').pop();
  assert.ok(lastBroadcast);
  assert.strictEqual(lastBroadcast.payload.phase, GAME_PHASES.NORMAL);
});

test('Scenario 7 - New Game Reset to Lobby', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket1 = new MockSocket('s1');
  io.connectionHandler(socket1);
  socket1.trigger('join', { roomCode: 'RM_NEW_GAME', name: 'Solo' });
  socket1.trigger('startGame');

  const room = findRoom('RM_NEW_GAME');
  socket1.trigger('newGame');

  assert.strictEqual(room.phase, GAME_PHASES.LOBBY);
  assert.strictEqual(room.players.length, 0);
  assert.strictEqual(room.log.length, 0);
});
