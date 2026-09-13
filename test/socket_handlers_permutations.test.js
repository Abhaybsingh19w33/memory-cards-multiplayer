/**
 * @file socket_handlers_permutations.test.js
 * @description Comprehensive test suite verifying all 16 Socket.IO client events, payload validations, and channel isolation.
 */

const test = require('node:test');
const assert = require('node:assert');
const { registerSocketHandlers, findRoom, rooms } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

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

function setupSocketSuite(roomCode = 'ALL_EVENTS') {
  const io = new MockIO();
  registerSocketHandlers(io);

  const socket1 = new MockSocket('s1');
  const socket2 = new MockSocket('s2');
  io.connectionHandler(socket1);
  io.connectionHandler(socket2);

  socket1.trigger('join', { roomCode, name: 'Player1' });
  socket2.trigger('join', { roomCode, name: 'Player2' });

  const room = findRoom(roomCode);
  return { io, socket1, socket2, room };
}

test('Socket Protocol Permutations - Channel Privacy for Private vs Broadcast Events', () => {
  const roomCode = 'PRIV_CHAN';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);

  // 1. Verify "joined" event was sent privately to player PID, not broadcast
  const joinedEvents = io.emitted.filter((e) => e.event === 'joined');
  assert.strictEqual(joinedEvents.length, 2);
  assert.strictEqual(joinedEvents[0].channel, socket1.data.pid);
  assert.strictEqual(joinedEvents[1].channel, socket2.data.pid);

  // 2. Start game -> broadcasts "state" to roomCode
  socket1.trigger('startGame');
  const stateBroadcasts = io.emitted.filter((e) => e.channel === roomCode && e.event === 'state');
  assert.ok(stateBroadcasts.length > 0, 'State broadcasts must target roomCode');

  // 3. Draw card -> "yourDrawnCard" must be sent ONLY to active player's PID
  socket1.trigger('draw');
  const drawEmits = io.emitted.filter((e) => e.event === 'yourDrawnCard');
  assert.strictEqual(drawEmits.length, 1);
  assert.strictEqual(drawEmits[0].channel, socket1.data.pid, 'yourDrawnCard must be private to active player');
  assert.strictEqual(drawEmits[0].payload.card.uid, undefined, 'UID must be stripped');
});

test('Socket Protocol Permutations - MatchSelected DiscardReveal Channel Isolation', () => {
  const roomCode = 'DISC_REV';
  const { io, socket1, room } = setupSocketSuite(roomCode);
  socket1.trigger('startGame');

  // Set open card to match
  room.discard = [createCard('5', 5, '♠', 'black')];
  room.currentPlayer().hand = [createCard('5', 5, '♥', 'red'), createCard('9', 9, '♦', 'red')];

  socket1.trigger('matchSelected', { positions: [0] });

  const revealEmits = io.emitted.filter((e) => e.event === 'discardReveal');
  assert.strictEqual(revealEmits.length, 1);
  assert.strictEqual(revealEmits[0].channel, socket1.data.pid, 'discardReveal must be sent only to active player');
  assert.strictEqual(revealEmits[0].payload.requiredRank, '5');
});

test('Socket Protocol Permutations - Queen Peek Channel Isolation', () => {
  const roomCode = 'QPEEK_CHAN';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);
  socket1.trigger('startGame');

  // Force Queen power
  room.stage = TURN_STAGES.QPOWER;
  room.qCount = 1;
  room.currentPlayer().hand = [createCard('K', 13, '♥', 'red')];

  socket1.trigger('qPeekChoose', { position: 0 });

  const peekEmits = io.emitted.filter((e) => e.event === 'yourQPeek');
  assert.strictEqual(peekEmits.length, 1);
  assert.strictEqual(peekEmits[0].channel, socket1.data.pid, 'yourQPeek must be sent only to active player');
  assert.strictEqual(peekEmits[0].payload.card.r, 'K');
  assert.strictEqual(peekEmits[0].payload.card.uid, undefined);
});

test('Socket Protocol Permutations - Jack Swap and Skip Sockets Flow', () => {
  const roomCode = 'JSWAP_SOCK';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);
  socket1.trigger('startGame');

  // Force Jack power
  room.stage = TURN_STAGES.JPOWER;
  room.jCount = 2;

  const p1Card = createCard('2', 2, '♠', 'black');
  const p2Card = createCard('8', 8, '♦', 'red');
  room.players[0].hand = [p1Card];
  room.players[1].hand = [p2Card];

  // 1. Valid swap via socket
  socket1.trigger('jSwap', {
    targetPid: socket2.data.pid,
    ownPos: 0,
    theirPos: 0,
  });

  assert.strictEqual(room.players[0].hand[0].uid, p2Card.uid);
  assert.strictEqual(room.players[1].hand[0].uid, p1Card.uid);
  assert.strictEqual(room.jCount, 1);

  // Verify jSwapNotice broadcast to room
  const notice = io.emitted.find((e) => e.event === 'jSwapNotice');
  assert.ok(notice, 'jSwapNotice must be emitted to room');
  assert.strictEqual(notice.channel, roomCode);
  assert.strictEqual(notice.payload.ownCardNum, 1);
  assert.strictEqual(notice.payload.theirCardNum, 1);
  assert.match(notice.payload.message, /Player1 exchanged Card #1 with Player2's Card #1 using J power/);

  // 2. Skip remaining swap via socket
  socket1.trigger('jSwapSkip');
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('Socket Protocol Permutations - Nonexistent Room Safety Guards Matrix', () => {
  const io = new MockIO();
  registerSocketHandlers(io);

  // Socket without joining any room
  const straySocket = new MockSocket('s_stray');
  io.connectionHandler(straySocket);
  straySocket.data.roomCode = 'DOES_NOT_EXIST';
  straySocket.data.pid = 'fake-pid';

  // None of these should throw or crash the server
  straySocket.trigger('draw');
  straySocket.trigger('discardDrawn');
  straySocket.trigger('keepDrawn', { position: 0 });
  straySocket.trigger('matchSelected', { positions: [0] });
  straySocket.trigger('qPeekChoose', { position: 0 });
  straySocket.trigger('jSwapSkip');
  straySocket.trigger('jSwap', { targetPid: 'x', ownPos: 0, theirPos: 0 });
  straySocket.trigger('arrangeMove', { from: 0, to: 1 });
  straySocket.trigger('callReveal');
  straySocket.trigger('next');
  straySocket.trigger('playAgain');
  straySocket.trigger('newGame');
  straySocket.trigger('disconnect');
  straySocket.trigger('setCardsPerPlayer', { n: 5 });
  straySocket.trigger('startGame');

  // Verify server stayed resilient
  assert.ok(true, 'Server executed all stray socket events without crashing');
});

test('Socket Protocol Permutations - Disconnect Broadcast Handling', () => {
  const roomCode = 'DISC_BCAST';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);

  socket2.trigger('disconnect');
  assert.strictEqual(room.players[1].connected, false);

  const lastBroadcast = io.emitted.filter((e) => e.channel === roomCode && e.event === 'state').pop();
  assert.ok(lastBroadcast);
  assert.strictEqual(lastBroadcast.payload.players[1].connected, false);
});

test('Socket Protocol Permutations - Out-of-Turn MatchSelected Handled via Sockets', () => {
  const roomCode = 'OOT_DISC';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);
  socket1.trigger('startGame');

  // Open card is 6
  room.discard = [createCard('6', 6, '♠', 'black')];
  // Inactive player socket2 has matching 6
  room.players[1].hand = [createCard('6', 6, '♥', 'red'), createCard('K', 13, '♣', 'black')];

  // socket2 triggers matchSelected out of turn
  socket2.trigger('matchSelected', { positions: [0] });

  // socket2 should receive discardReveal on their private channel
  const revealEmits = io.emitted.filter((e) => e.channel === socket2.data.pid && e.event === 'discardReveal');
  assert.strictEqual(revealEmits.length, 1);
  assert.strictEqual(revealEmits[0].payload.requiredRank, '6');
  assert.strictEqual(revealEmits[0].payload.isOutOfTurn, true);

  // Room broadcast received with updated card count
  const stateBroadcasts = io.emitted.filter((e) => e.channel === roomCode && e.event === 'state');
  const latestState = stateBroadcasts[stateBroadcasts.length - 1].payload;
  assert.strictEqual(latestState.players[1].count, 1);
});

test('Socket Protocol Permutations - Out-of-Turn ArrangeMove Handled via Sockets', () => {
  const roomCode = 'OOT_ARR';
  const { io, socket1, socket2, room } = setupSocketSuite(roomCode);
  socket1.trigger('startGame');

  const c0 = createCard('2', 2, '♦', 'red');
  const c1 = createCard('9', 9, '♠', 'black');
  room.players[1].hand = [c0, c1];

  // socket2 arranges hand out of turn
  socket2.trigger('arrangeMove', { from: 0, to: 1 });

  assert.strictEqual(room.players[1].hand[0].uid, c1.uid);
  assert.strictEqual(room.players[1].hand[1].uid, c0.uid);

  const stateBroadcasts = io.emitted.filter((e) => e.channel === roomCode && e.event === 'state');
  assert.ok(stateBroadcasts.length > 0);
});


