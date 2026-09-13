/**
 * @file scenario_03_turn_lifecycle.test.js
 * @description Test suite for Scenario 3: Turn Lifecycle & Drawing Mechanics.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { TURN_STAGES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

test('Scenario 3 - Turn Authorization: Inactive Player Actions Blocked', () => {
  const room = new Room('ROOM_TURNS');
  const p1 = new Player({ name: 'ActivePlayer', socketId: 's1' });
  const p2 = new Player({ name: 'InactivePlayer', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Current turn is p1 (index 0)
  assert.strictEqual(room.currentPlayer().pid, p1.pid);

  // Inactive player p2 tries to draw
  const p2Draw = GameEngine.draw(room, p2.pid);
  assert.strictEqual(p2Draw.success, false);
  assert.strictEqual(p2Draw.error, "It's not your turn.");

  // Active player p1 draws
  const p1Draw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(p1Draw.success, true);
  assert.strictEqual(room.stage, TURN_STAGES.DRAWN);
});

test('Scenario 3 - Draw Limit: Exactly Once Per Turn', () => {
  const room = new Room('ROOM_DRAW_LIMIT');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Seed deck with a non-power card (5 of spades) for deterministic test
  room.deck.push(createCard('5', 5, '♠', 'black'));

  // First draw succeeds
  const firstDraw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(firstDraw.success, true);

  // Discard drawn
  GameEngine.discardDrawn(room, p1.pid);
  assert.strictEqual(room.drawnThisTurn, true);
  assert.strictEqual(room.stage, TURN_STAGES.START);

  // Second draw in same turn must be rejected
  const secondDraw = GameEngine.draw(room, p1.pid);
  assert.strictEqual(secondDraw.success, false);
  assert.strictEqual(secondDraw.error, 'You can only draw once per turn.');
});

test('Scenario 3 - Keep Drawn Card Slot Insertion', () => {
  const room = new Room('ROOM_KEEP');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  const initialHandCount = p1.hand.length; // 5

  // Draw card
  GameEngine.draw(room, p1.pid);
  const drawnCardUid = room.drawn.uid;

  // Keep at slot 2 (index 2)
  const keepRes = GameEngine.keepDrawn(room, p1.pid, 2);
  assert.strictEqual(keepRes.success, true);
  assert.strictEqual(p1.hand.length, initialHandCount + 1, 'Hand size should increase by 1');
  assert.strictEqual(p1.hand[2].uid, drawnCardUid, 'Drawn card should be placed at index 2');
  assert.strictEqual(room.turnDiscardStarted, true, 'turnDiscardStarted flag must be set');
  assert.strictEqual(room.drawn, null, 'Drawn card holder should be cleared');
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('Scenario 3 - Turn Advance and State Machine Reset', () => {
  const room = new Room('ROOM_ADVANCE');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Simulate p1 drawing and keeping
  GameEngine.draw(room, p1.pid);
  GameEngine.keepDrawn(room, p1.pid, 0);

  assert.strictEqual(room.drawnThisTurn, true);
  assert.strictEqual(room.turnDiscardStarted, true);

  // Advance turn
  GameEngine.advanceTurn(room);

  // Now current player is p2
  assert.strictEqual(room.currentIndex, 1);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);

  // Turn variables must be reset
  assert.strictEqual(room.drawn, null);
  assert.strictEqual(room.drawnThisTurn, false);
  assert.strictEqual(room.turnDiscardStarted, false);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

