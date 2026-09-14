/**
 * @file card_highlight.test.js
 * @description Comprehensive unit tests for card action highlights:
 * - Keep drawn card slot insertion tracking
 * - Draw & dispose highlight with index shift computation
 * - Arrange move highlight (from = red, to = gold)
 * - Public serialization privacy (zero card rank/suit leakage)
 * - Socket broadcast of cardHighlight events
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { registerSocketHandlers } = require('../src/sockets/socketHandlers');
const { createCard } = require('../src/models/Card');
const { TURN_STAGES, GAME_PHASES } = require('../src/config/constants');

class MockSocket {
  constructor(id) {
    this.id = id;
    this.data = {};
    this.events = {};
    this.emitted = [];
    this.roomsJoined = new Set();
  }
  on(event, handler) { this.events[event] = handler; }
  emit(event, payload) { this.emitted.push({ event, payload }); }
  join(room) { this.roomsJoined.add(room); }
  trigger(event, payload = {}) {
    if (this.events[event]) this.events[event](payload);
  }
}

class MockIO {
  constructor() {
    this.emitted = [];
  }
  on(evt, handler) {
    if (evt === 'connection') this.connectionHandler = handler;
  }
  to(channel) {
    return {
      emit: (event, payload) => {
        this.emitted.push({ channel, event, payload });
      },
    };
  }
}

test('Highlight Test 1 - keepDrawn sets pendingInsertPos and insert highlight', () => {
  const room = new Room('HL_TEST_1');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // P1 draws
  GameEngine.draw(room, p1.pid);
  assert.strictEqual(room.stage, TURN_STAGES.DRAWN);

  // P1 keeps at slot 2
  const res = GameEngine.keepDrawn(room, p1.pid, 2);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.insertedPos, 2);
  assert.strictEqual(p1.pendingInsertPos, 2);
  assert.ok(p1.lastAction);
  assert.strictEqual(p1.lastAction.type, 'insert');
  assert.strictEqual(p1.lastAction.insertedPos, 2);
  assert.ok(typeof p1.lastAction.timestamp === 'number');
});

test('Highlight Test 2 - matchSelected after keepDrawn produces draw_dispose highlight', () => {
  const room = new Room('HL_TEST_2');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Setup specific hand: 4 cards of rank '5'
  p1.hand = [
    createCard('5', 5, '♠', 'black'),
    createCard('5', 5, '♥', 'red'),
    createCard('5', 5, '♦', 'red'),
    createCard('5', 5, '♣', 'black'),
  ];

  // Draw card of rank '5'
  room.deck.push(createCard('5', 5, '♠', 'black'));
  GameEngine.draw(room, p1.pid);

  // Keep at slot 1 (inserted between cards 0 and 1 -> hand length becomes 5)
  GameEngine.keepDrawn(room, p1.pid, 1);
  assert.strictEqual(p1.hand.length, 5);
  assert.strictEqual(p1.pendingInsertPos, 1);

  // Now dispose card at slot 3 (disposedPos = 3, which is > insertedPos 1)
  const matchRes = GameEngine.matchSelected(room, p1.pid, [3]);
  assert.strictEqual(matchRes.success, true);
  assert.ok(matchRes.highlight);
  assert.strictEqual(matchRes.highlight.type, 'draw_dispose');
  assert.strictEqual(matchRes.highlight.insertedPos, 1); // insertedPos remains 1
  assert.strictEqual(matchRes.highlight.disposedPos, 3); // disposed card came from slot 3
  assert.strictEqual(p1.pendingInsertPos, null);
});

test('Highlight Test 3 - draw_dispose index shifting when disposed card is before inserted card', () => {
  const room = new Room('HL_TEST_3');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  p1.hand = [
    createCard('8', 8, '♠', 'black'),
    createCard('8', 8, '♥', 'red'),
    createCard('8', 8, '♦', 'red'),
    createCard('8', 8, '♣', 'black'),
  ];

  room.deck.push(createCard('8', 8, '♠', 'black'));
  GameEngine.draw(room, p1.pid);

  // Keep at slot 3 (index 3)
  GameEngine.keepDrawn(room, p1.pid, 3);
  assert.strictEqual(p1.pendingInsertPos, 3);

  // Dispose slot 0 (which is < insertedPos 3) -> insertedPos shifts left to 2!
  const matchRes = GameEngine.matchSelected(room, p1.pid, [0]);
  assert.strictEqual(matchRes.success, true);
  assert.strictEqual(matchRes.highlight.type, 'draw_dispose');
  assert.strictEqual(matchRes.highlight.insertedPos, 2); // 3 shifted down to 2
  assert.strictEqual(matchRes.highlight.disposedPos, 0);
});

test('Highlight Test 4 - arrangeMove sets fromPos (red) and toPos (gold) highlight', () => {
  const room = new Room('HL_TEST_4');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Alice arranges card 0 to card 3
  const res = GameEngine.arrangeMove(room, p1.pid, 0, 3);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.from, 0);
  assert.strictEqual(res.to, 3);
  assert.ok(res.highlight);
  assert.strictEqual(res.highlight.type, 'arrange');
  assert.strictEqual(res.highlight.fromPos, 0); // Source (red)
  assert.strictEqual(res.highlight.toPos, 3);   // Destination (gold)
  assert.strictEqual(res.highlight.disposedPos, 0);
  assert.strictEqual(res.highlight.insertedPos, 3);
  assert.strictEqual(p1.lastAction.type, 'arrange');
});

test('Highlight Test 5 - Zero information leakage in toPublicJSON serialization', () => {
  const player = new Player({ name: 'Alice', socketId: 's1' });
  player.hand = [
    createCard('K', -2, '♥', 'red'),
    createCard('A', 1, '♠', 'black'),
  ];
  player.lastAction = {
    type: 'draw_dispose',
    insertedPos: 1,
    disposedPos: 0,
    timestamp: 123456789,
  };

  const json = player.toPublicJSON();
  assert.strictEqual(json.name, 'Alice');
  assert.strictEqual(json.count, 2);
  assert.strictEqual(json.lastAction.type, 'draw_dispose');
  assert.strictEqual(json.lastAction.insertedPos, 1);
  assert.strictEqual(json.lastAction.disposedPos, 0);

  // Ensure absolutely no hand, rank, or suit is leaked
  assert.strictEqual(json.hand, undefined);
  assert.strictEqual(json.cards, undefined);
  assert.strictEqual(json.lastAction.rank, undefined);
  assert.strictEqual(json.lastAction.suit, undefined);
  assert.strictEqual(json.lastAction.card, undefined);
  assert.strictEqual(JSON.stringify(json).includes('♥'), false);
  assert.strictEqual(JSON.stringify(json).includes('♠'), false);
  assert.strictEqual(JSON.stringify(json).includes('♦'), false);
  assert.strictEqual(JSON.stringify(json).includes('♣'), false);
});

test('Highlight Test 6 - Socket handlers broadcast cardHighlight on arrange, keepDrawn, and matchSelected', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket1 = new MockSocket('s1');
  const socket2 = new MockSocket('s2');

  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode: 'HL_ROOM', name: 'Alice' });
  socket2.trigger('join', { roomCode: 'HL_ROOM', name: 'Bob' });
  socket1.trigger('startGame');

  // Test arrangeMove socket broadcast
  io.emitted.length = 0;
  socket1.trigger('arrangeMove', { from: 1, to: 3 });

  const hlArrange = io.emitted.find(
    (e) => e.channel === 'HL_ROOM' && e.event === 'cardHighlight' && e.payload.type === 'arrange'
  );
  assert.ok(hlArrange, 'cardHighlight event emitted for arrangeMove');
  assert.strictEqual(hlArrange.payload.fromPos, 1);
  assert.strictEqual(hlArrange.payload.toPos, 3);
  assert.strictEqual(hlArrange.payload.disposedPos, 1);
  assert.strictEqual(hlArrange.payload.insertedPos, 3);

  // Test keepDrawn socket broadcast
  socket1.trigger('draw');
  io.emitted.length = 0;
  socket1.trigger('keepDrawn', { position: 2 });

  const hlInsert = io.emitted.find(
    (e) => e.channel === 'HL_ROOM' && e.event === 'cardHighlight' && e.payload.type === 'insert'
  );
  assert.ok(hlInsert, 'cardHighlight event emitted for keepDrawn');
  assert.strictEqual(hlInsert.payload.insertedPos, 2);

  // Test matchSelected socket broadcast
  io.emitted.length = 0;
  socket1.trigger('matchSelected', { positions: [0] });

  const hlDrawDispose = io.emitted.find(
    (e) => e.channel === 'HL_ROOM' && e.event === 'cardHighlight' && e.payload.type === 'draw_dispose'
  );
  assert.ok(hlDrawDispose, 'cardHighlight event emitted for matchSelected');
  assert.strictEqual(hlDrawDispose.payload.disposedPos, 0);
  assert.strictEqual(hlDrawDispose.payload.insertedPos, 1); // shifted down from 2 to 1 because slot 0 was disposed
});

