/**
 * @file scenario_05_powers.test.js
 * @description Test suite for Scenario 5: Special Powers (Queen Peek & Jack Blind-Swap).
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { TURN_STAGES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

test('Scenario 5 - Queen Power: Queueing and Peek Execution', () => {
  const room = new Room('ROOM_QPOWER');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Set known card at index 1
  const targetPeekCard = createCard('K', 13, '♥', 'red');
  p1.hand[1] = targetPeekCard;

  // Discard 2 Queens
  GameEngine.queuePowersForCards(room, [
    createCard('Q', 12, '♠', 'black'),
    createCard('Q', 12, '♥', 'red'),
  ]);

  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 2);

  // First peek
  const peek1 = GameEngine.qPeek(room, p1.pid, 1);
  assert.strictEqual(peek1.success, true);
  assert.strictEqual(peek1.card.r, 'K');
  assert.strictEqual(peek1.card.s, '♥');
  assert.strictEqual(peek1.remaining, 1);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER, 'Still in qpower since 1 peek remaining');

  // Second peek
  const peek2 = GameEngine.qPeek(room, p1.pid, 0);
  assert.strictEqual(peek2.success, true);
  assert.strictEqual(peek2.remaining, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Returns to start when peeks exhausted');
});

test('Scenario 5 - Jack Power: Blind Swap Mechanics', () => {
  const room = new Room('ROOM_JPOWER');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  const p1Card = createCard('A', 1, '♠', 'black');
  const p2Card = createCard('K', 13, '♦', 'red');
  p1.hand[0] = p1Card;
  p2.hand[2] = p2Card;

  // Queue Jack power
  GameEngine.queuePowersForCards(room, [createCard('J', 11, '♦', 'red')]);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.jCount, 1);

  // Prevent swap with oneself
  const selfSwap = GameEngine.jSwap(room, p1.pid, p1.pid, 0, 1);
  assert.strictEqual(selfSwap.success, false);
  assert.strictEqual(selfSwap.error, 'Invalid swap target.');

  // Execute valid swap between p1 slot 0 and p2 slot 2
  const validSwap = GameEngine.jSwap(room, p1.pid, p2.pid, 0, 2);
  assert.strictEqual(validSwap.success, true);
  assert.strictEqual(p1.hand[0].uid, p2Card.uid, 'p1 now holds p2 original card');
  assert.strictEqual(p2.hand[2].uid, p1Card.uid, 'p2 now holds p1 original card');
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('Scenario 5 - Jack Power: Skip Option', () => {
  const room = new Room('ROOM_JSKIP');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Queue Jack power
  GameEngine.queuePowersForCards(room, [createCard('J', 11, '♣', 'black')]);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.jCount, 1);

  // Skip swap
  const skipRes = GameEngine.jSwapSkip(room, p1.pid);
  assert.strictEqual(skipRes.success, true);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('Scenario 5 - Power Precedence: Queens Resolve Before Jacks', () => {
  const room = new Room('ROOM_PRECEDENCE');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Both Q and J discarded simultaneously
  GameEngine.queuePowersForCards(room, [
    createCard('Q', 12, '♠', 'black'),
    createCard('J', 11, '♥', 'red'),
  ]);

  // Stage must prioritize QPOWER first
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 1);
  assert.strictEqual(room.jCount, 1);

  // Resolve Q peek
  GameEngine.qPeek(room, p1.pid, 0);

  // Stage must automatically transition to JPOWER next!
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.jCount, 1);

  // Skip J swap
  GameEngine.jSwapSkip(room, p1.pid);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

