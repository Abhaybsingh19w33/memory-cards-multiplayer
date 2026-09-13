/**
 * @file scenario_06_scoring_endgame.test.js
 * @description Test suite for Scenario 6: Call Reveal, Endgame Triggers & Scoring.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { GAME_PHASES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

test('Scenario 6 - Call Reveal Trigger and Final Round Rotation', () => {
  const room = new Room('ROOM_CALL_REVEAL');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Alice calls Reveal
  const callRes = GameEngine.callReveal(room, p1.pid);
  assert.strictEqual(callRes.success, true);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);
  assert.strictEqual(room.finalCaller, p1.pid);

  // Advance to Bob's final turn
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  // Advance to Charlie's final turn
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p3.pid);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  // Turn rotates back to Alice (the caller) -> GAME OVER & REVEAL!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
});

test('Scenario 6 - 0-Card Hand Trigger and Full Circle Countdown', () => {
  const room = new Room('ROOM_ZERO_COUNTDOWN');
  const p1 = new Player({ name: 'Dan', socketId: 's1' });
  const p2 = new Player({ name: 'Eve', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Dan empties hand
  p1.hand = [];
  GameEngine.checkZero(room);
  assert.strictEqual(room.zeroPlayer, p1.pid);

  // Dan passes turn to Eve
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Turn rotates back to Dan (zeroPlayer) -> GAME OVER & REVEAL!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
});

test('Scenario 6 - Accurate Final Scoring Formula in Public State', () => {
  const room = new Room('ROOM_SCORING');
  const p1 = new Player({ name: 'Player1', socketId: 's1' });
  const p2 = new Player({ name: 'Player2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // p1 hand: Red King (-2), Ace (1), 7 (7) = -2 + 1 + 7 = 6 points
  p1.hand = [
    createCard('K', 13, '♥', 'red'),
    createCard('A', 1, '♠', 'black'),
    createCard('7', 7, '♦', 'red'),
  ];

  // p2 hand: Black King (13), Queen (12) = 13 + 12 = 25 points
  p2.hand = [
    createCard('K', 13, '♣', 'black'),
    createCard('Q', 12, '♦', 'red'),
  ];

  GameEngine.revealAll(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);

  const publicState = room.toPublicState();
  assert.ok(publicState.scores, 'Scores must be calculated and broadcast in reveal state');
  assert.strictEqual(publicState.scores[0], 6, 'Player 1 score should equal 6');
  assert.strictEqual(publicState.scores[1], 25, 'Player 2 score should equal 25');
  assert.strictEqual(publicState.hands[0].length, 3);
  assert.strictEqual(publicState.hands[1].length, 2);
});

