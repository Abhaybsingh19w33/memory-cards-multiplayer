/**
 * @file socketHandlers.test.js
 * @description Integration tests for Socket.IO event routing, state broadcasting, and Play Again round transitions.
 */

const test = require('node:test');
const assert = require('node:assert');
const { registerSocketHandlers, findRoom, rooms } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');

class MockSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.events = {};
    this.roomsJoined = new Set();
  }

  on(event, handler) {
    this.events[event] = handler;
  }

  emit(event, payload) {
    // client received event
  }

  join(room) {
    this.roomsJoined.add(room);
  }

  trigger(event, payload = {}) {
    if (this.events[event]) {
      this.events[event](payload);
    }
  }
}

class MockIO {
  constructor() {
    this.emitted = [];
  }

  to(channel) {
    return {
      emit: (event, payload) => {
        this.emitted.push({ channel, event, payload });
      },
    };
  }
}

test('Socket Handlers - Full Game Lifecycle & Play Again Integration', () => {
  const io = new MockIO();
  let connectionHandler;

  // Intercept io.on('connection', ...)
  io.on = (evt, handler) => {
    if (evt === 'connection') connectionHandler = handler;
  };

  registerSocketHandlers(io);

  const socket1 = new MockSocket('s1');
  const socket2 = new MockSocket('s2');

  connectionHandler(socket1);
  connectionHandler(socket2);

  // 1. Player 1 joins
  socket1.trigger('join', { roomCode: 'GAME123', name: 'Player1' });
  const room = findRoom('GAME123');
  assert.ok(room, 'Room GAME123 should be created');
  assert.strictEqual(room.players.length, 1);
  assert.strictEqual(socket1.data.roomCode, 'GAME123');

  // 2. Player 2 joins
  socket2.trigger('join', { roomCode: 'GAME123', name: 'Player2' });
  assert.strictEqual(room.players.length, 2);

  // 3. Start game
  socket1.trigger('startGame');
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.players[0].hand.length, 5);
  assert.strictEqual(room.players[1].hand.length, 5);

  // 4. Force reveal phase (simulate endgame)
  room.phase = GAME_PHASES.REVEAL;
  const revealState = room.toPublicState();
  assert.strictEqual(revealState.phase, GAME_PHASES.REVEAL);
  assert.ok(revealState.hands, 'Hands should be visible in reveal state');
  assert.ok(revealState.scores, 'Scores should be visible in reveal state');

  // 5. Trigger Play Again
  socket1.trigger('playAgain');

  // 6. Verify room state is fully reset for normal play
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Phase should reset to normal');
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Stage should reset to start');
  assert.strictEqual(room.drawnThisTurn, false);
  assert.strictEqual(room.players[0].hand.length, 5, 'Player 1 should have fresh hand');
  assert.strictEqual(room.players[1].hand.length, 5, 'Player 2 should have fresh hand');
  assert.strictEqual(room.discard.length, 1, 'Discard pile should have new open card');

  const newRoundState = room.toPublicState();
  assert.strictEqual(newRoundState.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(newRoundState.hands, undefined, 'Hands must be hidden in new round');
});

