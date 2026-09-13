/**
 * @file scenario_05_powers_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 5: Queen Peek & Jack Blind-Swap Powers.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { createCard } = require('../src/models/Card');
const { TURN_STAGES } = require('../src/config/constants');

function setupPowerTable() {
  const room = new Room('POWERS_PERM_ROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  const p3 = new Player({ name: 'P3', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);
  return { room, p1, p2, p3 };
}

test('Scenario 5 Permutations - Queen Peek Validation & Boundary Matrix', () => {
  const { room, p1, p2 } = setupPowerTable();
  const c0 = createCard('2', 2, '♠', 'black');
  const c1 = createCard('K', 13, '♥', 'red');
  const c2 = createCard('9', 9, '♦', 'red');
  p1.hand = [c0, c1, c2];

  // 1. Calling peek when NOT in QPOWER stage
  assert.strictEqual(room.stage, TURN_STAGES.START);
  const badStagePeek = GameEngine.qPeek(room, p1.pid, 0);
  assert.strictEqual(badStagePeek.success, false);
  assert.strictEqual(badStagePeek.error, 'Cannot peek at this time.');

  // Queue 1 Queen
  GameEngine.queuePowersForCards(room, [createCard('Q', 12, '♥', 'red')]);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 1);

  // 2. Inactive player calling peek
  const inactivePeek = GameEngine.qPeek(room, p2.pid, 0);
  assert.strictEqual(inactivePeek.success, false);
  assert.strictEqual(inactivePeek.error, 'Cannot peek at this time.');

  // 3. Out-of-bounds positions
  const negPeek = GameEngine.qPeek(room, p1.pid, -1);
  assert.strictEqual(negPeek.success, false);
  assert.strictEqual(negPeek.error, 'Invalid card.');

  const oobPeek = GameEngine.qPeek(room, p1.pid, 99);
  assert.strictEqual(oobPeek.success, false);
  assert.strictEqual(oobPeek.error, 'Invalid card.');

  // 4. Valid peek at index 1 (Red King)
  const validPeek = GameEngine.qPeek(room, p1.pid, 1);
  assert.strictEqual(validPeek.success, true);
  assert.strictEqual(validPeek.card.r, 'K');
  assert.strictEqual(validPeek.card.s, '♥');
  assert.strictEqual(validPeek.card.color, 'red');
  assert.strictEqual(validPeek.card.uid, undefined, 'UID must never leak in peek response');
  assert.strictEqual(validPeek.remaining, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Stage returns to START when Q peeks done');
});

test('Scenario 5 Permutations - Jack Swap and Skip Edge-Case Matrix', () => {
  const { room, p1, p2, p3 } = setupPowerTable();
  const p1Card = createCard('A', 1, '♠', 'black');
  const p2Card = createCard('10', 10, '♦', 'red');
  p1.hand = [p1Card];
  p2.hand = [p2Card];

  // 1. Calling swap when NOT in JPOWER stage
  const badStageSwap = GameEngine.jSwap(room, p1.pid, p2.pid, 0, 0);
  assert.strictEqual(badStageSwap.success, false);
  assert.strictEqual(badStageSwap.error, 'Cannot swap cards at this time.');

  // Queue 2 Jacks
  GameEngine.queuePowersForCards(room, [
    createCard('J', 11, '♣', 'black'),
    createCard('J', 11, '♦', 'red'),
  ]);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.jCount, 2);

  // 2. Inactive player calling swap
  const inactiveSwap = GameEngine.jSwap(room, p2.pid, p1.pid, 0, 0);
  assert.strictEqual(inactiveSwap.success, false);

  // 3. Swap with self
  const selfSwap = GameEngine.jSwap(room, p1.pid, p1.pid, 0, 0);
  assert.strictEqual(selfSwap.success, false);
  assert.strictEqual(selfSwap.error, 'Invalid swap target.');

  // 4. Swap with non-existent target
  const nonTargetSwap = GameEngine.jSwap(room, p1.pid, 'fake-pid', 0, 0);
  assert.strictEqual(nonTargetSwap.success, false);
  assert.strictEqual(nonTargetSwap.error, 'Invalid swap target.');

  // 5. Out of bounds positions
  assert.strictEqual(GameEngine.jSwap(room, p1.pid, p2.pid, -1, 0).success, false);
  assert.strictEqual(GameEngine.jSwap(room, p1.pid, p2.pid, 5, 0).success, false);
  assert.strictEqual(GameEngine.jSwap(room, p1.pid, p2.pid, 0, -1).success, false);
  assert.strictEqual(GameEngine.jSwap(room, p1.pid, p2.pid, 0, 10).success, false);

  // 6. Valid Swap 1: Swap between p1 slot 0 and p2 slot 0
  const validSwap = GameEngine.jSwap(room, p1.pid, p2.pid, 0, 0);
  assert.strictEqual(validSwap.success, true);
  assert.strictEqual(p1.hand[0].uid, p2Card.uid);
  assert.strictEqual(p2.hand[0].uid, p1Card.uid);
  assert.strictEqual(room.jCount, 1);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER, 'Still in JPOWER since 1 swap remains');

  // 7. Skip Swap 2
  const skipRes = GameEngine.jSwapSkip(room, p1.pid);
  assert.strictEqual(skipRes.success, true);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Returns to START after all swaps resolved');
});

test('Scenario 5 Permutations - Compound Multi-Power Queue & Precedence Flow', () => {
  const { room, p1, p2 } = setupPowerTable();
  p1.hand = [
    createCard('2', 2, '♠', 'black'),
    createCard('3', 3, '♥', 'red'),
  ];
  p2.hand = [
    createCard('7', 7, '♦', 'red'),
    createCard('8', 8, '♣', 'black'),
  ];

  // Queue 2 Queens AND 2 Jacks simultaneously
  GameEngine.queuePowersForCards(room, [
    createCard('Q', 12, '♠', 'black'),
    createCard('Q', 12, '♥', 'red'),
    createCard('J', 11, '♦', 'red'),
    createCard('J', 11, '♣', 'black'),
  ]);

  // Queens MUST take precedence over Jacks
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 2);
  assert.strictEqual(room.jCount, 2);

  // Peek 1 of 2
  const p1Res = GameEngine.qPeek(room, p1.pid, 0);
  assert.strictEqual(p1Res.success, true);
  assert.strictEqual(p1Res.remaining, 1);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);

  // Peek 2 of 2 -> Must transition automatically to JPOWER!
  const p2Res = GameEngine.qPeek(room, p1.pid, 1);
  assert.strictEqual(p2Res.success, true);
  assert.strictEqual(p2Res.remaining, 0);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER, 'Must transition to JPOWER when Q peeks reach 0');

  // Jack action 1: Swap
  const swapRes = GameEngine.jSwap(room, p1.pid, p2.pid, 0, 1);
  assert.strictEqual(swapRes.success, true);
  assert.strictEqual(room.jCount, 1);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);

  // Jack action 2: Skip -> Must transition to START!
  const skipRes = GameEngine.jSwapSkip(room, p1.pid);
  assert.strictEqual(skipRes.success, true);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Must transition to START when J actions reach 0');
});

test('Scenario 5 Permutations - Powers Trigger From Discarding Wrong Cards', () => {
  const { room, p1 } = setupPowerTable();

  // Open card is 5
  room.discard = [createCard('5', 5, '♠', 'black')];
  room.turnDiscardStarted = false;

  // p1 selects a Queen (rank 'Q' !== '5'), which is a WRONG guess
  p1.hand = [
    createCard('Q', 12, '♦', 'red'),
    createCard('3', 3, '♣', 'black'),
  ];

  const res = GameEngine.matchSelected(room, p1.pid, [0]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.wrongCount, 1, 'Card was wrong');
  assert.strictEqual(res.result.penaltyCount, 2);

  // Golden Rule Verification: Even though it was a wrong guess, Queen landed in discard, so Q power MUST queue!
  assert.strictEqual(room.qCount, 1, 'Queen power must trigger even from wrong discard');
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
});

