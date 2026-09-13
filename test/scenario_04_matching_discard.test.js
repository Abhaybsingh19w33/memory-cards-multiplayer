/**
 * @file scenario_04_matching_discard.test.js
 * @description Test suite for Scenario 4: Matching & Discard Rules.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { createCard } = require('../src/models/Card');

test('Scenario 4 - Discard Without Drawing (Matches Open Card)', () => {
  const room = new Room('ROOM_MATCH_OPEN');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Set open card to '8'
  room.discard = [createCard('8', 8, '♠', 'black')];
  // P1 hand: Two 8s and one 3
  p1.hand = [
    createCard('8', 8, '♥', 'red'),
    createCard('8', 8, '♦', 'red'),
    createCard('3', 3, '♣', 'black'),
  ];
  room.turnDiscardStarted = false;

  // Player discards the two 8s (indices 0 and 1)
  const res = GameEngine.matchSelected(room, p1.pid, [0, 1]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.wrongCount, 0);
  assert.strictEqual(res.result.penaltyCount, 0);
  assert.strictEqual(res.result.requiredRank, '8');
  assert.strictEqual(p1.hand.length, 1, 'Two cards discarded correctly without penalties');
  assert.strictEqual(p1.hand[0].r, '3');
});

test('Scenario 4 - Wrong Guess Incurring 2x Penalty Cards', () => {
  const room = new Room('ROOM_PENALTY');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Open card is '9'
  room.discard = [createCard('9', 9, '♣', 'black')];
  // P1 hand: one 9, one 6 (wrong), one K
  p1.hand = [
    createCard('9', 9, '♥', 'red'),
    createCard('6', 6, '♦', 'red'),
    createCard('K', 13, '♠', 'black'),
  ];
  room.turnDiscardStarted = false;

  // Select 9 (index 0) and 6 (index 1)
  const res = GameEngine.matchSelected(room, p1.pid, [0, 1]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.wrongCount, 1, 'The 6 was wrong');
  assert.strictEqual(res.result.penaltyCount, 2, '1 wrong card incurs 2 penalties');

  // P1 started with 3 cards, discarded 2, received 2 penalties -> total 3 cards
  assert.strictEqual(p1.hand.length, 3);
  // Open card on discard pile is now the last discarded card (the 9)
  assert.strictEqual(room.getOpenCard().r, '9');
});

test('Scenario 4 - Discard After Drawing/Inserting (Matches First Selected Card)', () => {
  const room = new Room('ROOM_MATCH_AFTER_DRAW');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Open card is 'K', but player drew and inserted a card
  room.discard = [createCard('K', 13, '♠', 'black')];
  p1.hand = [
    createCard('4', 4, '♥', 'red'),
    createCard('4', 4, '♦', 'red'),
    createCard('7', 7, '♣', 'black'),
  ];
  room.turnDiscardStarted = true; // flag set by keepDrawn

  // Player selects both 4s (indices 0 and 1)
  const res = GameEngine.matchSelected(room, p1.pid, [0, 1]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.drewOrInserted, true);
  assert.strictEqual(res.result.requiredRank, '4', 'Required rank established by first selected card');
  assert.strictEqual(res.result.wrongCount, 0);
  assert.strictEqual(res.result.penaltyCount, 0);
  assert.strictEqual(p1.hand.length, 1);
  assert.strictEqual(room.turnDiscardStarted, false, 'Flag must be cleared after discard');
});

test('Scenario 4 - Position Sanitization, Deduplication, and Bounds Protection', () => {
  const room = new Room('ROOM_BOUNDS');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Empty positions
  const emptyRes = GameEngine.matchSelected(room, p1.pid, []);
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error, 'No cards selected. Please select at least one card.');

  // Out of bounds positions
  const oobRes = GameEngine.matchSelected(room, p1.pid, [999, -5]);
  assert.strictEqual(oobRes.success, false);
  assert.strictEqual(oobRes.error, 'No valid cards selected.');

  // Deduplication: submitting [0, 0, 0] should only discard card 0 once
  p1.hand = [createCard('A', 1, '♠', 'black'), createCard('2', 2, '♥', 'red')];
  room.discard = [createCard('A', 1, '♦', 'red')];
  const dedupRes = GameEngine.matchSelected(room, p1.pid, [0, 0, 0]);
  assert.strictEqual(dedupRes.success, true);
  assert.strictEqual(p1.hand.length, 1, 'Only 1 card should be removed, not duplicated');
});
