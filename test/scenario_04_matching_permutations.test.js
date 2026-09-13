/**
 * @file scenario_04_matching_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 4: Matching, Discard Rules & Penalties.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { createCard } = require('../src/models/Card');
const { TURN_STAGES } = require('../src/config/constants');

function setupTestTable() {
  const room = new Room('MATCH_PERM_ROOM');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);
  return { room, p1, p2 };
}

test('Scenario 4 Permutations - Mode 1 (Without Drawing) Complete Matching Matrix', () => {
  const testMatrix = [
    // 1 card
    { cards: ['7'], open: '7', expCorrect: 1, expWrong: 0, expPenalties: 0, deltaHand: -1 },
    { cards: ['9'], open: '7', expCorrect: 0, expWrong: 1, expPenalties: 2, deltaHand: +1 },
    // 2 cards
    { cards: ['7', '7'], open: '7', expCorrect: 2, expWrong: 0, expPenalties: 0, deltaHand: -2 },
    { cards: ['9', '8'], open: '7', expCorrect: 0, expWrong: 2, expPenalties: 4, deltaHand: +2 },
    { cards: ['7', '9'], open: '7', expCorrect: 1, expWrong: 1, expPenalties: 2, deltaHand: 0 },
    // 3 cards
    { cards: ['7', '7', '7'], open: '7', expCorrect: 3, expWrong: 0, expPenalties: 0, deltaHand: -3 },
    { cards: ['7', '7', '9'], open: '7', expCorrect: 2, expWrong: 1, expPenalties: 2, deltaHand: -1 },
    { cards: ['7', '8', '9'], open: '7', expCorrect: 1, expWrong: 2, expPenalties: 4, deltaHand: +1 },
    { cards: ['6', '8', '9'], open: '7', expCorrect: 0, expWrong: 3, expPenalties: 6, deltaHand: +3 },
    // 4 cards
    { cards: ['7', '7', '7', '7'], open: '7', expCorrect: 4, expWrong: 0, expPenalties: 0, deltaHand: -4 },
  ];

  for (let i = 0; i < testMatrix.length; i++) {
    const tc = testMatrix[i];
    const { room, p1 } = setupTestTable();

    // Set open discard card
    room.discard = [createCard(tc.open, 7, '♠', 'black')];
    room.turnDiscardStarted = false;

    // Build p1 hand: cards to match + dummy card so hand isn't prematurely empty
    const dummyCard = createCard('K', 13, '♥', 'red');
    p1.hand = tc.cards.map((r, idx) => createCard(r, parseInt(r, 10) || 5, '♦', 'red'));
    p1.hand.push(dummyCard);

    const initialHandLen = p1.hand.length;
    const selectedIndices = tc.cards.map((_, idx) => idx);

    const res = GameEngine.matchSelected(room, p1.pid, selectedIndices);
    assert.strictEqual(res.success, true, `Matrix test ${i} failed`);
    assert.strictEqual(res.result.requiredRank, tc.open);
    assert.strictEqual(res.result.drewOrInserted, false);
    assert.strictEqual(res.result.wrongCount, tc.expWrong);
    assert.strictEqual(res.result.penaltyCount, tc.expPenalties);

    // Hand size calculation
    const expectedHandLen = initialHandLen + tc.deltaHand;
    assert.strictEqual(
      p1.hand.length,
      expectedHandLen,
      `Hand length mismatch in test ${i}: expected ${expectedHandLen}, got ${p1.hand.length}`
    );
  }
});

test('Scenario 4 Permutations - Mode 2 (After Drawing/Inserting) Target Rank Matrix', () => {
  const testMatrix = [
    // 1 card selected: always matches itself
    { cards: ['4'], expCorrect: 1, expWrong: 0, expPenalties: 0, reqRank: '4', deltaHand: -1 },
    // 2 cards selected of same rank
    { cards: ['4', '4'], expCorrect: 2, expWrong: 0, expPenalties: 0, reqRank: '4', deltaHand: -2 },
    // 2 cards selected of differing rank: first is correct, second is wrong
    { cards: ['4', '9'], expCorrect: 1, expWrong: 1, expPenalties: 2, reqRank: '4', deltaHand: 0 },
    // 3 cards selected: first establishes target '10'
    { cards: ['10', '10', '10'], expCorrect: 3, expWrong: 0, expPenalties: 0, reqRank: '10', deltaHand: -3 },
    { cards: ['10', '10', '3'], expCorrect: 2, expWrong: 1, expPenalties: 2, reqRank: '10', deltaHand: -1 },
    // Crucial rule: card 0 is '5', card 1 is '9', card 2 is '9'. Even though cards 1 and 2 match each other, card 0 established target rank '5'!
    { cards: ['5', '9', '9'], expCorrect: 1, expWrong: 2, expPenalties: 4, reqRank: '5', deltaHand: +1 },
  ];

  for (let i = 0; i < testMatrix.length; i++) {
    const tc = testMatrix[i];
    const { room, p1 } = setupTestTable();

    // Set open card to something completely unrelated (e.g. 'K') to prove Mode 2 ignores open card
    room.discard = [createCard('K', 13, '♠', 'black')];
    room.turnDiscardStarted = true; // flag set by keepDrawn

    const dummyCard = createCard('A', 1, '♣', 'black');
    p1.hand = tc.cards.map((r) => createCard(r, 5, '♦', 'red'));
    p1.hand.push(dummyCard);

    const initialHandLen = p1.hand.length;
    const selectedIndices = tc.cards.map((_, idx) => idx);

    const res = GameEngine.matchSelected(room, p1.pid, selectedIndices);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.result.drewOrInserted, true);
    assert.strictEqual(res.result.requiredRank, tc.reqRank);
    assert.strictEqual(res.result.wrongCount, tc.expWrong);
    assert.strictEqual(res.result.penaltyCount, tc.expPenalties);
    assert.strictEqual(p1.hand.length, initialHandLen + tc.deltaHand);
    assert.strictEqual(room.turnDiscardStarted, false, 'turnDiscardStarted must be reset after play');
  }
});

test('Scenario 4 Permutations - Unsorted Indices & Descending Splicing Integrity', () => {
  const { room, p1 } = setupTestTable();

  // Hand of 6 cards
  const c0 = createCard('3', 3, '♠', 'black');
  const c1 = createCard('8', 8, '♥', 'red');
  const c2 = createCard('5', 5, '♦', 'red');
  const c3 = createCard('8', 8, '♣', 'black');
  const c4 = createCard('K', 13, '♠', 'black');
  const c5 = createCard('8', 8, '♦', 'red');
  p1.hand = [c0, c1, c2, c3, c4, c5];

  // Open card is 8
  room.discard = [createCard('8', 8, '♠', 'black')];
  room.turnDiscardStarted = false;

  // Select all three 8s in reverse/jumbled order: [5, 1, 3] (indices 5, 1, and 3 are the 8s)
  const res = GameEngine.matchSelected(room, p1.pid, [5, 1, 3]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.wrongCount, 0);

  // Exactly 3 cards remain: c0 (3), c2 (5), and c4 (K) in preserved order
  assert.strictEqual(p1.hand.length, 3);
  assert.strictEqual(p1.hand[0].uid, c0.uid, 'c0 must remain at index 0');
  assert.strictEqual(p1.hand[1].uid, c2.uid, 'c2 must remain at index 1');
  assert.strictEqual(p1.hand[2].uid, c4.uid, 'c4 must remain at index 2');
});

test('Scenario 4 Permutations - Out of Bounds, Deduplication & Validation Matrix', () => {
  const { room, p1 } = setupTestTable();
  p1.hand = [createCard('7', 7, '♠', 'black'), createCard('7', 7, '♥', 'red')];
  room.discard = [createCard('7', 7, '♦', 'red')];

  // 1. Inactive player
  const inactiveRes = GameEngine.matchSelected(room, 'wrong-pid', [0]);
  assert.strictEqual(inactiveRes.success, false);
  assert.strictEqual(inactiveRes.error, 'You cannot do that right now.');

  // 2. Invalid stage (e.g. DRAWN)
  room.stage = TURN_STAGES.DRAWN;
  const stageRes = GameEngine.matchSelected(room, p1.pid, [0]);
  assert.strictEqual(stageRes.success, false);
  assert.strictEqual(stageRes.error, 'You cannot do that right now.');
  room.stage = TURN_STAGES.START;

  // 3. Empty array
  const emptyRes = GameEngine.matchSelected(room, p1.pid, []);
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error, 'No cards selected. Please select at least one card.');

  // 4. Non-array inputs
  assert.strictEqual(GameEngine.matchSelected(room, p1.pid, null).success, false);
  assert.strictEqual(GameEngine.matchSelected(room, p1.pid, undefined).success, false);
  assert.strictEqual(GameEngine.matchSelected(room, p1.pid, 123).success, false);
  assert.strictEqual(GameEngine.matchSelected(room, p1.pid, '0').success, false);

  // 5. Completely out-of-bounds indices
  const oobRes = GameEngine.matchSelected(room, p1.pid, [-1, 10, 999]);
  assert.strictEqual(oobRes.success, false);
  assert.strictEqual(oobRes.error, 'No valid cards selected.');

  // 6. Deduplication: [0, 0, 0] must only discard 1 card
  const dedupRes = GameEngine.matchSelected(room, p1.pid, [0, 0, 0]);
  assert.strictEqual(dedupRes.success, true);
  assert.strictEqual(p1.hand.length, 1);
});

test('Scenario 4 Permutations - Penalty Cards Draw Deck Depletion & Reshuffle', () => {
  const { room, p1 } = setupTestTable();

  // Draw deck only has 1 card remaining
  room.deck = [createCard('A', 1, '♠', 'black')];
  // Discard pile has 5 cards
  room.discard = [
    createCard('2', 2, '♠', 'black'),
    createCard('3', 3, '♥', 'red'),
    createCard('4', 4, '♦', 'red'),
    createCard('5', 5, '♣', 'black'),
    createCard('9', 9, '♦', 'red'), // top open card
  ];

  p1.hand = [
    createCard('8', 8, '♥', 'red'), // wrong card (incurs 2 penalties)
    createCard('K', 13, '♣', 'black'),
  ];
  room.turnDiscardStarted = false;

  // Discard wrong card -> needs 2 penalty cards, but deck only has 1!
  const res = GameEngine.matchSelected(room, p1.pid, [0]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.wrongCount, 1);
  assert.strictEqual(res.result.penaltyCount, 2, 'Must draw 2 penalty cards via reshuffle');
  assert.strictEqual(p1.hand.length, 3, '1 remaining original card + 2 penalty cards = 3');
});

test('Scenario 4 Permutations - Zero Card Trigger On Full Hand Discard', () => {
  const { room, p1 } = setupTestTable();

  // p1 has exactly two 6s
  p1.hand = [
    createCard('6', 6, '♠', 'black'),
    createCard('6', 6, '♥', 'red'),
  ];
  room.discard = [createCard('6', 6, '♦', 'red')];
  room.turnDiscardStarted = false;

  assert.strictEqual(room.zeroPlayer, null);

  // Discard both 6s
  const res = GameEngine.matchSelected(room, p1.pid, [0, 1]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(p1.hand.length, 0, 'Hand should now be empty');
  assert.strictEqual(room.zeroPlayer, p1.pid, 'p1 should be marked as zeroPlayer');
});

