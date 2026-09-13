/**
 * @file scenario_3_players.test.js
 * @description Comprehensive test suite verifying all game mechanics, turn cycles,
 * out-of-turn discards, powers, and scoring specifically for 3-player games.
 */

const test = require('node:test');
const assert = require('node:assert');
const Room = require('../src/models/Room');
const Player = require('../src/models/Player');
const GameEngine = require('../src/services/GameEngine');
const { registerSocketHandlers, findRoom } = require('../src/sockets/socketHandlers');
const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');
const { createCard } = require('../src/models/Card');

// Mock socket classes for 3-player network simulation
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

test('3-Player Scenario 1 - Lobby Setup, Seating, and Custom Cards Per Player', () => {
  const room = new Room('TRIO_LOBBY');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });

  room.players.push(p1, p2, p3);
  assert.strictEqual(room.players.length, 3);
  assert.strictEqual(room.hostPid(), p1.pid);

  // Configure custom cards per player (5 cards each in 3-player game)
  room.cardsPerPlayer = 5;
  GameEngine.dealNewRound(room);

  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(p1.hand.length, 5);
  assert.strictEqual(p2.hand.length, 5);
  assert.strictEqual(p3.hand.length, 5);

  // Total cards dealt = 15. Plus 1 open on discard pile = 16 cards removed from shoe.
  // 3 players = 2 decks (104 cards). Remaining draw deck = 104 - 16 = 88 cards.
  assert.strictEqual(room.deck.length, 88);
  assert.strictEqual(room.discard.length, 1);
  assert.strictEqual(room.currentIndex, 0);
  assert.strictEqual(room.currentPlayer().pid, p1.pid);
});

test('3-Player Scenario 2 - 3-Way Turn Ring Rotation & Inactive Player Guarding', () => {
  const room = new Room('TRIO_TURNS');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Turn 1: Alice is active (Seat 0)
  assert.strictEqual(room.currentPlayer().pid, p1.pid);

  // Inactive players Bob and Charlie rejected for turn-drawing actions
  const bobAction = GameEngine.draw(room, p2.pid);
  assert.strictEqual(bobAction.success, false);
  assert.strictEqual(bobAction.error, "It's not your turn.");

  const charlieAction = GameEngine.draw(room, p3.pid);
  assert.strictEqual(charlieAction.success, false);
  assert.strictEqual(charlieAction.error, "It's not your turn.");

  // Alice draws and completes turn
  GameEngine.draw(room, p1.pid);
  GameEngine.advanceTurn(room);

  // Turn 2: Advances to Bob (Seat 1)
  assert.strictEqual(room.currentPlayer().pid, p2.pid);
  assert.strictEqual(room.stage, TURN_STAGES.START);

  // Alice and Charlie rejected on Bob's turn
  assert.strictEqual(GameEngine.draw(room, p1.pid).success, false);
  assert.strictEqual(GameEngine.draw(room, p3.pid).success, false);

  // Bob draws and completes turn
  GameEngine.draw(room, p2.pid);
  GameEngine.advanceTurn(room);

  // Turn 3: Advances to Charlie (Seat 2)
  assert.strictEqual(room.currentPlayer().pid, p3.pid);
  assert.strictEqual(room.stage, TURN_STAGES.START);

  // Alice and Bob rejected on Charlie's turn
  assert.strictEqual(GameEngine.draw(room, p1.pid).success, false);
  assert.strictEqual(GameEngine.draw(room, p2.pid).success, false);

  // Charlie draws and completes turn
  GameEngine.draw(room, p3.pid);
  GameEngine.advanceTurn(room);

  // Turn 4: Smoothly wraps around back to Alice (Seat 0)
  assert.strictEqual(room.currentPlayer().pid, p1.pid);
  assert.strictEqual(room.currentIndex, 0);
});

test('3-Player Scenario 3 - Out-of-Turn Matching Discards and Penalty Isolation', () => {
  const room = new Room('TRIO_MATCHING');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Open card on discard pile is an 8
  room.discard = [createCard('8', 8, '♠', 'black')];

  // Set hands:
  // Alice (active): has cards [10, 4]
  // Bob (out of turn): has cards [8, 5] -> can match the 8!
  // Charlie (out of turn): has cards [8, 9] -> can match the 8!
  p1.hand = [createCard('10', 10, '♥', 'red'), createCard('4', 4, '♦', 'red')];
  p2.hand = [createCard('8', 8, '♦', 'red'), createCard('5', 5, '♣', 'black')];
  p3.hand = [createCard('8', 8, '♥', 'red'), createCard('9', 9, '♠', 'black')];

  // Bob (seat 1, out-of-turn) discards 8 to match open 8
  const bobRes = GameEngine.matchSelected(room, p2.pid, [0]);
  assert.strictEqual(bobRes.success, true);
  assert.strictEqual(p2.hand.length, 1);
  assert.strictEqual(room.getOpenCard().r, '8');

  // Charlie (seat 2, out-of-turn) also discards 8 to match open 8
  const charlieRes = GameEngine.matchSelected(room, p3.pid, [0]);
  assert.strictEqual(charlieRes.success, true);
  assert.strictEqual(p3.hand.length, 1);
  assert.strictEqual(room.getOpenCard().r, '8');

  // Now Charlie tries to throw his 9 out of turn (open card is 8 -> WRONG GUESS!)
  const wrongRes = GameEngine.matchSelected(room, p3.pid, [0]);
  assert.strictEqual(wrongRes.success, true);
  assert.strictEqual(wrongRes.result.wrongCount, 1);
  assert.strictEqual(wrongRes.result.penaltyCount, 2);

  // Charlie receives 2 penalty cards (1 original - 1 discarded + 2 penalties = 2 cards)
  assert.strictEqual(p3.hand.length, 2);

  // Alice and Bob hands remain completely unaffected
  assert.strictEqual(p1.hand.length, 2);
  assert.strictEqual(p2.hand.length, 1);
});

test('3-Player Scenario 4 - Jack Blind-Swap Across 3 Players with Specific Target Selection', () => {
  const room = new Room('TRIO_JACK_POWER');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Alice hand: [2♠, 4♥]
  // Bob hand:   [9♦, 9♣]
  // Charlie hand: [K♠, 3♥]
  const cardAlice0 = createCard('2', 2, '♠', 'black');
  const cardAlice1 = createCard('4', 4, '♥', 'red');
  const cardBob0 = createCard('9', 9, '♦', 'red');
  const cardBob1 = createCard('9', 9, '♣', 'black');
  const cardCharlie0 = createCard('K', 0, '♠', 'black');
  const cardCharlie1 = createCard('3', 3, '♥', 'red');

  p1.hand = [cardAlice0, cardAlice1];
  p2.hand = [cardBob0, cardBob1];
  p3.hand = [cardCharlie0, cardCharlie1];

  // Alice draws Jack and discards it
  room.drawn = createCard('J', -1, '♦', 'red');
  room.stage = TURN_STAGES.DRAWN;
  const discRes = GameEngine.discardDrawn(room, p1.pid);
  assert.strictEqual(discRes.success, true);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);

  // Alice cannot swap with herself
  const selfSwap = GameEngine.jSwap(room, p1.pid, p1.pid, 0, 0);
  assert.strictEqual(selfSwap.success, false);

  // Alice chooses Charlie (p3) as her swap target, swapping her Card #2 (index 1) with Charlie's Card #1 (index 0)
  const swapRes = GameEngine.jSwap(room, p1.pid, p3.pid, 1, 0);
  assert.strictEqual(swapRes.success, true);

  // Verify swap metadata
  assert.strictEqual(swapRes.swap.actorName, 'Alice');
  assert.strictEqual(swapRes.swap.targetName, 'Charlie');
  assert.strictEqual(swapRes.swap.ownCardNum, 2);
  assert.strictEqual(swapRes.swap.theirCardNum, 1);
  assert.strictEqual(
    swapRes.swap.message,
    "Alice exchanged Card #2 with Charlie's Card #1 using J power."
  );

  // Verify physical card transfer:
  // Alice now has Charlie's K♠ at index 1
  assert.strictEqual(p1.hand[1].r, 'K');
  // Charlie now has Alice's 4♥ at index 0
  assert.strictEqual(p3.hand[0].r, '4');
  // Bob's hand is completely untouched
  assert.strictEqual(p2.hand[0].r, '9');
  assert.strictEqual(p2.hand[1].r, '9');
});

test('3-Player Scenario 5 - Queen Peek Channel Secrecy Among 3 Players', () => {
  const room = new Room('TRIO_QUEEN_SECRECY');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Advance turn to Bob (Seat 1)
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);

  // Bob draws Queen and discards it
  room.drawn = createCard('Q', 12, '♠', 'black');
  room.stage = TURN_STAGES.DRAWN;
  GameEngine.discardDrawn(room, p2.pid);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);

  // Bob peeks at his card at slot 0
  const peekRes = GameEngine.qPeek(room, p2.pid, 0);
  assert.strictEqual(peekRes.success, true);
  assert.ok(peekRes.card.r, 'Bob receives real card rank');

  // Verify room public state serialized to table hides card identities for Alice and Charlie
  const publicState = room.toPublicState();
  assert.strictEqual(publicState.players[1].count, p2.hand.length);
  assert.strictEqual(publicState.players[1].hand, undefined, 'Public state must never expose cards');
});

test('3-Player Scenario 6 - Call Reveal Final Round Rotation Across All 3 Players', () => {
  const room = new Room('TRIO_CALL_REVEAL');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Turn 1: Alice calls Reveal!
  const callRes = GameEngine.callReveal(room, p1.pid);
  assert.strictEqual(callRes.success, true);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);
  assert.strictEqual(room.finalCaller, p1.pid);

  // In a 3-player game, 2 other players must get their 1 final turn
  // Turn advances to Bob (final turn 1 of 2)
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  // Turn advances to Charlie (final turn 2 of 2)
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p3.pid);
  assert.strictEqual(room.phase, GAME_PHASES.FINAL);

  // Turn rotates back to Alice (the caller) -> Round terminates immediately!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
  assert.strictEqual(room.toPublicState().scores.length, 3);
});

test('3-Player Scenario 7 - 0-Card Hand Trigger with Full 3-Player Circle Countdown', () => {
  const room = new Room('TRIO_ZERO_CARD');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  // Alice (Seat 0, active) empties her hand
  p1.hand = [];
  GameEngine.checkZero(room, p1);
  assert.strictEqual(room.zeroPlayer, p1.pid);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Current player is Alice (Seat 0). Alice completes turn and advances to Bob.
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p2.pid);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Bob (Seat 1) completes turn and advances to Charlie.
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.currentPlayer().pid, p3.pid);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Charlie (Seat 2) completes turn and advances back to Alice (the zeroPlayer) -> REVEAL!
  GameEngine.advanceTurn(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);
  assert.strictEqual(room.toPublicState().scores.length, 3);
});

test('3-Player Scenario 8 - Mid-Game Reconnection for Player 2 (Bob)', () => {
  const room = new Room('TRIO_RECONNECT');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  GameEngine.dealNewRound(room);

  const bobToken = p2.token;
  const bobOriginalCards = [...p2.hand];

  // Bob temporarily disconnects
  p2.connected = false;
  p2.socketId = null;

  // Reconnection with token
  const reconnectedPlayer = room.players.find((p) => p.token === bobToken);
  assert.ok(reconnectedPlayer);
  reconnectedPlayer.socketId = 's2_new';
  reconnectedPlayer.connected = true;

  // Verify seat order (Seat 1) and hand preserved
  assert.strictEqual(room.players[1].name, 'Bob');
  assert.strictEqual(room.players[1].hand.length, bobOriginalCards.length);
  assert.strictEqual(room.players[0].name, 'Alice');
  assert.strictEqual(room.players[2].name, 'Charlie');
});

test('3-Player Scenario 9 - Play Again Complete State Reset for 3 Players', () => {
  const room = new Room('TRIO_PLAY_AGAIN');
  const p1 = new Player({ name: 'Alice', socketId: 's1' });
  const p2 = new Player({ name: 'Bob', socketId: 's2' });
  const p3 = new Player({ name: 'Charlie', socketId: 's3' });
  room.players.push(p1, p2, p3);
  room.cardsPerPlayer = 4;
  GameEngine.dealNewRound(room);

  // Force reveal phase
  GameEngine.revealAll(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);

  // Host triggers Play Again via dealNewRound
  GameEngine.dealNewRound(room);
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.stage, TURN_STAGES.START);
  assert.strictEqual(room.currentIndex, 0);
  assert.strictEqual(room.currentPlayer().pid, p1.pid);

  // Verify all 3 players received 4 fresh cards each
  assert.strictEqual(p1.hand.length, 4);
  assert.strictEqual(p2.hand.length, 4);
  assert.strictEqual(p3.hand.length, 4);
});

test('3-Player Scenario 10 - Socket Protocol Integration with 3 Sockets', () => {
  const io = new MockIO();
  let connectionHandler;
  io.on = (evt, handler) => {
    if (evt === 'connection') connectionHandler = handler;
  };
  registerSocketHandlers(io);

  const socket1 = new MockSocket('sock_alice');
  const socket2 = new MockSocket('sock_bob');
  const socket3 = new MockSocket('sock_charlie');

  connectionHandler(socket1);
  connectionHandler(socket2);
  connectionHandler(socket3);

  const roomCode = 'TRIO_SOCKET';

  // 1. All 3 players join room
  socket1.trigger('join', { roomCode, name: 'Alice' });
  socket2.trigger('join', { roomCode, name: 'Bob' });
  socket3.trigger('join', { roomCode, name: 'Charlie' });

  const room = findRoom(roomCode);
  assert.strictEqual(room.players.length, 3);

  // 2. Alice starts game
  socket1.trigger('startGame');
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);

  // Verify broadcast state emitted to room with 3 players
  const stateBroadcasts = io.emitted.filter((e) => e.channel === roomCode && e.event === 'state');
  assert.ok(stateBroadcasts.length > 0, 'State broadcasts must be sent to room');
  const latestState = stateBroadcasts[stateBroadcasts.length - 1].payload;
  assert.strictEqual(latestState.players.length, 3);
  assert.strictEqual(latestState.players[0].count, 5);
  assert.strictEqual(latestState.players[1].count, 5);
  assert.strictEqual(latestState.players[2].count, 5);

  // 3. J Swap notification broadcast across all 3 players
  room.drawn = createCard('J', -1, '♠', 'black');
  room.stage = TURN_STAGES.DRAWN;
  socket1.trigger('discardDrawn');
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);

  // Alice swaps Card #1 with Charlie's Card #2
  socket1.trigger('jSwap', { targetPid: room.players[2].pid, ownPos: 0, theirPos: 1 });

  // Verify jSwapNotice broadcast to room
  const noticeBroadcast = io.emitted.find(
    (e) => e.channel === roomCode && e.event === 'jSwapNotice'
  );
  assert.ok(noticeBroadcast, 'jSwapNotice event must be broadcast to room');
  assert.match(
    noticeBroadcast.payload.message,
    /Alice exchanged Card #1 with Charlie's Card #2 using J power/
  );
});
