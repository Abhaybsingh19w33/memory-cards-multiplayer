/**
 * @file scenario_03_turn_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 3: Turn Lifecycle, Drawing & Advancing.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { TURN_STAGES, GAME_PHASES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

function setupTestRoom(numPlayers = 3) {
  const room = new Room('TURN_PERM_ROOM');
  for (let i = 0; i < numPlayers; i++) {
    room.players.push(new Player({ name: `P${i + 1}`, socketId: `s_${i + 1}` }));
  }
  GameEngine.dealNewRound(room);
  return room;
}

test('Scenario 3 Permutations - Turn Authorization & Inactive Player Rejection Matrix', () => {
  const room = setupTestRoom(3);
  const p1 = room.players[0];
  const p2 = room.players[1];
  const p3 = room.players[2];

  assert.strictEqual(room.isMyTurn(p1.pid), true);
  assert.strictEqual(room.isMyTurn(p2.pid), false);
  assert.strictEqual(room.isMyTurn(p3.pid), false);
  assert.strictEqual(room.isMyTurn('non-existent-pid'), false);

  // Inactive players cannot draw
  const p2Draw = GameEngine.draw(room, p2.pid);
  assert.strictEqual(p2Draw.success, false);
  assert.strictEqual(p2Draw.error, "It's not your turn.");

  const p3Draw = GameEngine.draw(room, p3.pid);
  assert.strictEqual(p3Draw.success, false);
  assert.strictEqual(p3Draw.error, "It's not your turn.");

  // Inactive players cannot discard drawn
  const p2Disc = GameEngine.discardDrawn(room, p2.pid);
  assert.strictEqual(p2Disc.success, false);
  assert.strictEqual(p2Disc.error, 'Nothing to discard.');

  // Inactive players cannot keep drawn
  const p2Keep = GameEngine.keepDrawn(room, p2.pid, 0);
  assert.strictEqual(p2Keep.success, false);
  assert.strictEqual(p2Keep.error, 'Nothing to place.');

  // Inactive players CAN arrange hand at any time during active play
  const p2Arr = GameEngine.arrangeMove(room, p2.pid, 0, 1);
  assert.strictEqual(p2Arr.success, true, 'Inactive player should be able to arrange cards');

  // Non-existent players cannot arrange hand
  const invalidArr = GameEngine.arrangeMove(room, 'non-existent-pid', 0, 1);
  assert.strictEqual(invalidArr.success, false);
});

test('Scenario 3 Permutations - Draw Action Stage Machine & Depletion Matrix', () => {
  const room = setupTestRoom(2);
  const p1 = room.players[0];

  // 1. Stage must be START
  const nonStartStages = [TURN_STAGES.DRAWN, TURN_STAGES.QPOWER, TURN_STAGES.JPOWER];
  for (const st of nonStartStages) {
    room.stage = st;
    const res = GameEngine.draw(room, p1.pid);
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, 'Finish your current action first.');
  }

  // 2. Exactly once per turn constraint
  room.stage = TURN_STAGES.START;
  room.drawnThisTurn = true;
  const twiceDraw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(twiceDraw.success, false);
  assert.strictEqual(twiceDraw.error, 'You can only draw once per turn.');

  // 3. Fully depleted deck and discard
  room.stage = TURN_STAGES.START;
  room.drawnThisTurn = false;
  room.deck = [];
  room.discard = []; // No cards to reshuffle
  const emptyDraw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(emptyDraw.success, false);
  assert.strictEqual(emptyDraw.error, 'No cards left to draw.');

  // 4. Valid draw transitions
  room.deck.push(createCard('7', 7, '♠', 'black'));
  const validDraw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(validDraw.success, true);
  assert.strictEqual(validDraw.card.r, '7');
  assert.strictEqual(room.stage, TURN_STAGES.DRAWN);
  assert.strictEqual(room.drawnThisTurn, true);
  assert.strictEqual(room.drawn.r, '7');
});

test('Scenario 3 Permutations - Keep Drawn Slot Insertion Boundary Matrix', () => {
  const room = setupTestRoom(2);
  const p1 = room.players[0];
  const initialHand = [
    createCard('2', 2, '♥', 'red'),
    createCard('4', 4, '♦', 'red'),
    createCard('6', 6, '♣', 'black'),
  ];
  p1.hand = [...initialHand];

  const slotTests = [
    { pos: 0, description: 'Insert at start of hand (index 0)', expectedIdx: 0 },
    { pos: 1, description: 'Insert at middle of hand (index 1)', expectedIdx: 1 },
    { pos: 3, description: 'Insert at end of hand (index 3)', expectedIdx: 3 },
    { pos: -5, description: 'Negative position clamps to index 0', expectedIdx: 0 },
    { pos: 999, description: 'Out-of-bounds position clamps to end', expectedIdx: 3 },
    { pos: 'NaN', description: 'NaN position defaults to index 0', expectedIdx: 0 },
  ];

  for (const tc of slotTests) {
    p1.hand = [...initialHand];
    const cardToInsert = createCard('9', 9, '♠', 'black');
    room.drawn = cardToInsert;
    room.stage = TURN_STAGES.DRAWN;
    const handLenBefore = p1.hand.length;

    const res = GameEngine.keepDrawn(room, p1.pid, tc.pos);
    assert.strictEqual(res.success, true, tc.description);
    assert.strictEqual(p1.hand.length, handLenBefore + 1);

    const expectedIndex = tc.expectedIdx !== undefined ? tc.expectedIdx : tc.pos;
    assert.strictEqual(p1.hand[expectedIndex].uid, cardToInsert.uid, tc.description);
    assert.strictEqual(room.drawn, null);
    assert.strictEqual(room.turnDiscardStarted, true);
    assert.strictEqual(room.stage, TURN_STAGES.START);
  }
});

test('Scenario 3 Permutations - Discard Drawn Powers Queueing Matrix', () => {
  const room = setupTestRoom(2);
  const p1 = room.players[0];

  // Case A: Discard regular number card (no powers)
  const regularCard = createCard('5', 5, '♥', 'red');
  room.drawn = regularCard;
  room.stage = TURN_STAGES.DRAWN;
  const resA = GameEngine.discardDrawn(room, p1.pid);
  assert.strictEqual(resA.success, true);
  assert.strictEqual(room.stage, TURN_STAGES.START);
  assert.strictEqual(room.qCount, 0);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.getOpenCard().uid, regularCard.uid);

  // Case B: Discard Queen -> Triggers QPOWER
  const queenCard = createCard('Q', 12, '♦', 'red');
  room.drawn = queenCard;
  room.stage = TURN_STAGES.DRAWN;
  const resB = GameEngine.discardDrawn(room, p1.pid);
  assert.strictEqual(resB.success, true);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 1);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.getOpenCard().uid, queenCard.uid);

  // Reset stage
  room.qCount = 0;
  room.stage = TURN_STAGES.START;

  // Case C: Discard Jack -> Triggers JPOWER
  const jackCard = createCard('J', 11, '♠', 'black');
  room.drawn = jackCard;
  room.stage = TURN_STAGES.DRAWN;
  const resC = GameEngine.discardDrawn(room, p1.pid);
  assert.strictEqual(resC.success, true);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.qCount, 0);
  assert.strictEqual(room.jCount, 1);
  assert.strictEqual(room.getOpenCard().uid, jackCard.uid);
});

test('Scenario 3 Permutations - Multi-Player Turn Rotation & State Reset', () => {
  const playerCounts = [2, 3, 5];

  for (const count of playerCounts) {
    const room = setupTestRoom(count);
    assert.strictEqual(room.currentIndex, 0);

    for (let round = 0; round < count * 2; round++) {
      const expectedIndex = round % count;
      assert.strictEqual(room.currentIndex, expectedIndex);
      assert.strictEqual(room.currentPlayer().pid, room.players[expectedIndex].pid);

      // Simulate active player dirtying turn state
      room.drawn = createCard('A', 1, '♠', 'black');
      room.drawnThisTurn = true;
      room.turnDiscardStarted = true;
      room.stage = TURN_STAGES.START;

      GameEngine.advanceTurn(room);

      // Verify atomic reset of turn flags on next player's turn
      assert.strictEqual(room.drawn, null, 'Drawn card must reset to null');
      assert.strictEqual(room.drawnThisTurn, false, 'drawnThisTurn must reset to false');
      assert.strictEqual(room.turnDiscardStarted, false, 'turnDiscardStarted must reset to false');
      assert.strictEqual(room.stage, TURN_STAGES.START, 'stage must reset to START');
    }
  }
});

test('Scenario 3 Permutations - Arrange Hand Reordering Boundaries', () => {
  const room = setupTestRoom(2);
  const p1 = room.players[0];
  const c0 = createCard('2', 2, '♠', 'black');
  const c1 = createCard('5', 5, '♥', 'red');
  const c2 = createCard('8', 8, '♦', 'red');
  const c3 = createCard('K', 13, '♣', 'black');
  p1.hand = [c0, c1, c2, c3];

  // Valid move: index 0 to 2
  const move1 = GameEngine.arrangeMove(room, p1.pid, 0, 2);
  assert.strictEqual(move1.success, true);
  // Expected order: [c1, c2, c0, c3]
  assert.strictEqual(p1.hand[0].uid, c1.uid);
  assert.strictEqual(p1.hand[1].uid, c2.uid);
  assert.strictEqual(p1.hand[2].uid, c0.uid);
  assert.strictEqual(p1.hand[3].uid, c3.uid);

  // Move to same index: 1 to 1
  const moveSame = GameEngine.arrangeMove(room, p1.pid, 1, 1);
  assert.strictEqual(moveSame.success, true);
  assert.strictEqual(p1.hand[1].uid, c2.uid);

  // Move out of bounds: negative
  const moveNeg = GameEngine.arrangeMove(room, p1.pid, -1, 2);
  assert.strictEqual(moveNeg.success, false);

  // Move out of bounds: beyond length
  const moveOob = GameEngine.arrangeMove(room, p1.pid, 1, 99);
  assert.strictEqual(moveOob.success, false);
});
