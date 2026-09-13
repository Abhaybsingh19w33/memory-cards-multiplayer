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

test('Scenario 4 - Out-of-Turn Matching Discard (Player 2 throws 4, Player 5 and Player 4 also throw 4)', () => {
  const room = new Room('ROOM_MULTI_OUT_OF_TURN');
  const players = ['P1', 'P2', 'P3', 'P4', 'P5'].map((name, i) => new Player({ name, socketId: `s${i + 1}` }));
  room.players.push(...players);
  GameEngine.dealNewRound(room);

  const [p1, p2, p3, p4, p5] = room.players;

  // Turn belongs to Player 2
  room.currentIndex = 1;
  assert.strictEqual(room.currentPlayer().name, 'P2');

  // Player 2 throws a 4
  const p2Card = createCard('4', 4, '♥', 'red');
  room.discard = [p2Card];
  assert.strictEqual(room.getOpenCard().r, '4');

  // Player 5 holds a 4 and an 8
  const p5Card4 = createCard('4', 4, '♣', 'black');
  const p5Card8 = createCard('8', 8, '♦', 'red');
  p5.hand = [p5Card4, p5Card8];

  // Player 4 holds a 4 and a 10
  const p4Card4 = createCard('4', 4, '♠', 'black');
  const p4Card10 = createCard('10', 10, '♥', 'red');
  p4.hand = [p4Card4, p4Card10];

  // Player 5 throws their 4 out of turn
  const p5Res = GameEngine.matchSelected(room, p5.pid, [0]);
  assert.strictEqual(p5Res.success, true);
  assert.strictEqual(p5Res.result.isOutOfTurn, true);
  assert.strictEqual(p5Res.result.requiredRank, '4');
  assert.strictEqual(p5Res.result.wrongCount, 0);
  assert.strictEqual(p5.hand.length, 1);
  assert.strictEqual(p5.hand[0].uid, p5Card8.uid);
  assert.strictEqual(room.getOpenCard().uid, p5Card4.uid, 'Discard top is now Player 5 card');

  // Player 4 now also throws their 4 out of turn
  const p4Res = GameEngine.matchSelected(room, p4.pid, [0]);
  assert.strictEqual(p4Res.success, true);
  assert.strictEqual(p4Res.result.isOutOfTurn, true);
  assert.strictEqual(p4Res.result.requiredRank, '4');
  assert.strictEqual(p4Res.result.wrongCount, 0);
  assert.strictEqual(p4.hand.length, 1);
  assert.strictEqual(p4.hand[0].uid, p4Card10.uid);
  assert.strictEqual(room.getOpenCard().uid, p4Card4.uid, 'Discard top is now Player 4 card');

  // Turn still belongs to Player 2
  assert.strictEqual(room.currentIndex, 1);
  assert.strictEqual(room.currentPlayer().name, 'P2');
});

test('Scenario 4 - Out-of-Turn Wrong Guess Incurring 2x Penalty Cards', () => {
  const room = new Room('ROOM_OUT_OF_TURN_PENALTY');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  const p3 = new Player({ name: 'P3', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Top card is 4
  room.discard = [createCard('4', 4, '♦', 'red')];

  // Inactive player p3 has a 9 (wrong) and a King
  p3.hand = [createCard('9', 9, '♠', 'black'), createCard('K', 13, '♥', 'red')];
  const initialHandLen = p3.hand.length;

  // p3 attempts to discard index 0 out of turn
  const res = GameEngine.matchSelected(room, p3.pid, [0]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.result.isOutOfTurn, true);
  assert.strictEqual(res.result.wrongCount, 1);
  assert.strictEqual(res.result.penaltyCount, 2);

  // 1 card discarded, 2 penalty cards added -> hand increases by 1
  assert.strictEqual(p3.hand.length, initialHandLen + 1);
});

test('Scenario 4 - Out-of-Turn Discard Emptying Hand Triggers zeroPlayer', () => {
  const room = new Room('ROOM_OUT_OF_TURN_ZERO');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Open card is 7
  room.discard = [createCard('7', 7, '♠', 'black')];

  // Inactive player p2 has exactly one card: a 7
  p2.hand = [createCard('7', 7, '♥', 'red')];
  assert.strictEqual(room.zeroPlayer, null);

  // p2 discards out of turn
  const res = GameEngine.matchSelected(room, p2.pid, [0]);
  assert.strictEqual(res.success, true);
  assert.strictEqual(p2.hand.length, 0);
  assert.strictEqual(room.zeroPlayer, p2.pid, 'p2 must be designated zeroPlayer out of turn');
});

test('Scenario 4 - Real-Time Hand Arrange Out of Turn', () => {
  const room = new Room('ROOM_ARRANGE_OUT_OF_TURN');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  const c0 = createCard('3', 3, '♠', 'black');
  const c1 = createCard('5', 5, '♥', 'red');
  const c2 = createCard('9', 9, '♦', 'red');
  p2.hand = [c0, c1, c2];

  // p2 (inactive player) rearranges slot 0 to slot 2
  const arrangeRes = GameEngine.arrangeMove(room, p2.pid, 0, 2);
  assert.strictEqual(arrangeRes.success, true);
  assert.strictEqual(p2.hand[0].uid, c1.uid);
  assert.strictEqual(p2.hand[1].uid, c2.uid);
  assert.strictEqual(p2.hand[2].uid, c0.uid);
});

