/**
 * @file scenario_06_scoring_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 6: Call Reveal, 0-Card Triggers & Scoring Formula.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { createCard } = require('../src/models/Card');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');

function setupGame(numPlayers = 3) {
  const room = new Room(`SCORING_${numPlayers}P`);
  for (let i = 0; i < numPlayers; i++) {
    room.players.push(new Player({ name: `User_${i + 1}`, socketId: `s_${i + 1}` }));
  }
  GameEngine.dealNewRound(room);
  return room;
}

test('Scenario 6 Permutations - Call Reveal Rotation Across 2, 3, and 4 Player Games', () => {
  // Test across 2, 3, and 4 players
  const playerCounts = [2, 3, 4];

  for (const n of playerCounts) {
    const room = setupGame(n);

    // Player 1 calls Reveal
    const p1 = room.players[0];
    const callRes = GameEngine.callReveal(room, p1.pid);
    assert.strictEqual(callRes.success, true);
    assert.strictEqual(room.phase, GAME_PHASES.FINAL);
    assert.strictEqual(room.finalCaller, p1.pid);

    // Next n-1 players get their final turn
    for (let step = 1; step < n; step++) {
      GameEngine.advanceTurn(room);
      assert.strictEqual(room.phase, GAME_PHASES.FINAL, `Phase must stay FINAL on turn ${step} for ${n} players`);
      assert.strictEqual(room.currentIndex, step);
    }

    // Rotating back to Player 1 must trigger game conclusion!
    GameEngine.advanceTurn(room);
    assert.strictEqual(room.phase, GAME_PHASES.REVEAL, `Game must reach REVEAL when rotating back to caller in ${n}p game`);
  }
});

test('Scenario 6 Permutations - Call Reveal From Non-First Player Seat', () => {
  const room = setupGame(4);
  const p1 = room.players[0];
  const p2 = room.players[1];

  // Advance turn to Player 2
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentIndex, 1);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);

  // Player 2 calls reveal
  const callRes = GameEngine.callReveal(room, p2.pid);
  assert.strictEqual(callRes.success, true);
  assert.strictEqual(room.finalCaller, p2.pid);

  // Turns rotate through p3 (idx 2), p4 (idx 3), p1 (idx 0)
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentIndex, 2);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentIndex, 3);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentIndex, 0);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  // Turn rotates back to p2 (caller) -> REVEAL!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
});

test('Scenario 6 Permutations - 0-Card Hand Rotation & Multi-Player 0 Hand Stability', () => {
  const room = setupGame(3);
  const p1 = room.players[0];
  const p2 = room.players[1];
  const p3 = room.players[2];

  // Player 1 discards last card
  p1.hand = [];
  GameEngine.checkZero(room);
  assert.strictEqual(room.zeroPlayer, p1.pid);

  // P1 advances to P2
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Phase remains NORMAL during zero countdown');
  assert.strictEqual(room.currentIndex, 1);

  // P2 also empties hand during countdown
  p2.hand = [];
  GameEngine.checkZero(room);
  // Crucial invariant: zeroPlayer must NOT be overwritten!
  assert.strictEqual(room.zeroPlayer, p1.pid, 'First zeroPlayer must be preserved');

  // P2 advances to P3
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.currentIndex, 2);

  // P3 advances back to P1 (first zeroPlayer) -> REVEAL!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
});

test('Scenario 6 Permutations - Inactive Caller & Invalid Turn Stage Rejections', () => {
  const room = setupGame(2);
  const p1 = room.players[0];
  const p2 = room.players[1];

  // Inactive player p2 calls reveal
  const badCaller = GameEngine.callReveal(room, p2.pid);
  assert.strictEqual(badCaller.success, false);
  assert.strictEqual(badCaller.error, 'Finish your turn first.');

  // Active player in DRAWN stage calls reveal
  room.stage = TURN_STAGES.DRAWN;
  const badStage = GameEngine.callReveal(room, p1.pid);
  assert.strictEqual(badStage.success, false);
  assert.strictEqual(badStage.error, 'Finish your turn first.');
});

test('Scenario 6 Permutations - Exhaustive Scoring Formula Combinations', () => {
  const room = setupGame(5);

  // Player 1: 0 cards -> exactly 0 points
  room.players[0].hand = [];

  // Player 2: 4 Red Kings (-2 each) -> -8 points (best possible score!)
  room.players[1].hand = [
    createCard('K', 13, '♥', 'red'),
    createCard('K', 13, '♦', 'red'),
    createCard('K', 13, '♥', 'red'),
    createCard('K', 13, '♦', 'red'),
  ];

  // Player 3: 4 Black Kings (13 each) -> 52 points (worst penalty hand!)
  room.players[2].hand = [
    createCard('K', 13, '♠', 'black'),
    createCard('K', 13, '♣', 'black'),
    createCard('K', 13, '♠', 'black'),
    createCard('K', 13, '♣', 'black'),
  ];

  // Player 4: 1 Red King (-2), 1 Black King (13), 1 Ace (1), 1 Ten (10), 1 Jack (11), 1 Queen (12)
  // Total = -2 + 13 + 1 + 10 + 11 + 12 = 45 points
  room.players[3].hand = [
    createCard('K', 13, '♥', 'red'),
    createCard('K', 13, '♠', 'black'),
    createCard('A', 1, '♦', 'red'),
    createCard('10', 10, '♣', 'black'),
    createCard('J', 11, '♦', 'red'),
    createCard('Q', 12, '♠', 'black'),
  ];

  // Player 5: 1 Red King (-2) and 1 Two (2) -> exactly 0 points (ties with 0-card hand)
  room.players[4].hand = [
    createCard('K', 13, '♦', 'red'),
    createCard('2', 2, '♣', 'black'),
  ];

  GameEngine.revealAll(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);

  const pubState = room.toPublicState();
  assert.strictEqual(pubState.scores[0], 0, '0-card hand score');
  assert.strictEqual(pubState.scores[1], -8, '4 Red Kings score');
  assert.strictEqual(pubState.scores[2], 52, '4 Black Kings score');
  assert.strictEqual(pubState.scores[3], 45, 'Mixed hand score');
  assert.strictEqual(pubState.scores[4], 0, 'Red King + Two score');

  // Verify lowest score is -8
  const minScore = Math.min(...pubState.scores);
  assert.strictEqual(minScore, -8, 'Lowest score should be -8 (Player 2)');
});

