/**
 * @file gameEngine.test.js
 * @description Unit tests for Card, Deck, Player, Room, and GameEngine mechanics.
 */

const test = require('node:test');
const assert = require('node:assert');

const { GAME_PHASES, TURN_STAGES } = require('../src/config/constants');
const { createCard, getCardValue, toPublicCard } = require('../src/models/Card');
const { makeDeck, shuffle, drawFromDeck } = require('../src/models/Deck');
const Player = require('../src/models/Player');
const Room = require('../src/models/Room');
const GameEngine = require('../src/services/GameEngine');

test('Card Model - Valuation and Serialization', () => {
  const redKing = createCard('K', 13, '♥', 'red');
  const blackKing = createCard('K', 13, '♠', 'black');
  const ace = createCard('A', 1, '♦', 'red');
  const ten = createCard('10', 10, '♣', 'black');
  const queen = createCard('Q', 12, '♥', 'red');
  const jack = createCard('J', 11, '♠', 'black');

  // Golden rule verification: Red King = -2, Black King = 13
  assert.strictEqual(getCardValue(redKing), -2, 'Red King should equal -2');
  assert.strictEqual(getCardValue(blackKing), 13, 'Black King should equal 13');
  assert.strictEqual(getCardValue(ace), 1, 'Ace should equal 1');
  assert.strictEqual(getCardValue(ten), 10, '10 should equal 10');
  assert.strictEqual(getCardValue(queen), 12, 'Queen should equal 12');
  assert.strictEqual(getCardValue(jack), 11, 'Jack should equal 11');

  // Serialization must not expose uid
  const pub = toPublicCard(redKing);
  assert.deepStrictEqual(pub, { r: 'K', s: '♥', color: 'red' });
  assert.strictEqual(pub.uid, undefined, 'uid should not be exposed');
});

test('Deck Model - Multi-deck sizing and discard reshuffle', () => {
  const deckSmall = makeDeck(4);
  assert.strictEqual(deckSmall.length, 104, '4 players should have 2 decks (104 cards)');

  const deckLarge = makeDeck(6);
  assert.strictEqual(deckLarge.length, 156, '6 players should have 3 decks (156 cards)');

  // Test reshuffling when draw deck is depleted
  const mockRoom = {
    deck: [],
    discard: [
      createCard('2', 2, '♠', 'black'),
      createCard('3', 3, '♥', 'red'),
      createCard('7', 7, '♦', 'red'), // top card
    ],
    addLog: () => {},
  };

  const drawn = drawFromDeck(mockRoom);
  assert.ok(drawn, 'Should draw a card from reshuffled discard');
  assert.strictEqual(mockRoom.discard.length, 1, 'Top open card should remain on discard pile');
  assert.strictEqual(mockRoom.discard[0].r, '7', 'Top open card should be 7');
});

test('Player Model - Public serialization secrecy', () => {
  const player = new Player({ name: 'Alice', socketId: 'sock_1' });
  player.hand.push(createCard('A', 1, '♠', 'black'));
  player.hand.push(createCard('K', 13, '♥', 'red'));

  const pub = player.toPublicJSON();
  assert.strictEqual(pub.name, 'Alice');
  assert.strictEqual(pub.count, 2);
  assert.strictEqual(pub.hand, undefined, 'Hand must NOT be exposed in player public JSON');
  assert.strictEqual(pub.token, undefined, 'Token must NOT be exposed in player public JSON');
});

test('GameEngine - Deal Round and State Initialization', () => {
  const room = new Room('TESTROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);

  GameEngine.dealNewRound(room);

  assert.strictEqual(room.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(room.stage, TURN_STAGES.START);
  assert.strictEqual(room.currentIndex, 0);
  assert.strictEqual(p1.hand.length, 5);
  assert.strictEqual(p2.hand.length, 5);
  assert.strictEqual(room.discard.length, 1, 'One card should be open on discard pile');
  assert.ok(room.deck.length > 0, 'Deck should have remaining cards');
});

test('GameEngine - Draw, Keep, and Discard Flow', () => {
  const room = new Room('TESTROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);

  GameEngine.dealNewRound(room);

  // Wrong turn draw attempt
  const wrongDraw = GameEngine.draw(room, p2.pid);
  assert.strictEqual(wrongDraw.success, false);

  // Correct turn draw
  const drawRes = GameEngine.draw(room, p1.pid);
  assert.strictEqual(drawRes.success, true);
  assert.ok(drawRes.card);
  assert.strictEqual(room.stage, TURN_STAGES.DRAWN);

  // Keep drawn card
  const keepRes = GameEngine.keepDrawn(room, p1.pid, 2);
  assert.strictEqual(keepRes.success, true);
  assert.strictEqual(p1.hand.length, 6, 'Hand length should increase after inserting kept card');
  assert.strictEqual(room.turnDiscardStarted, true);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('GameEngine - Matching Discard and Penalty Rules', () => {
  const room = new Room('TESTROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Set open card to '5'
  room.discard = [createCard('5', 5, '♠', 'black')];
  // Set p1 hand: two '5's, one '9', one 'K'
  p1.hand = [
    createCard('5', 5, '♥', 'red'),
    createCard('5', 5, '♦', 'red'),
    createCard('9', 9, '♣', 'black'),
    createCard('K', 13, '♥', 'red'),
  ];

  // Try matching with wrong card (indices 0, 1, and 2: two 5s and one 9)
  // Matching against open card '5'
  room.turnDiscardStarted = false;
  const matchRes = GameEngine.matchSelected(room, p1.pid, [0, 1, 2]);

  assert.strictEqual(matchRes.success, true);
  assert.strictEqual(matchRes.result.wrongCount, 1, 'Card at index 2 (9) was wrong');
  assert.strictEqual(matchRes.result.penaltyCount, 2, '1 wrong card results in 2 penalties');
  // p1 had 4 cards, played 3 (leaving 1 card: the King), then received 2 penalty cards -> total 3 cards
  assert.strictEqual(p1.hand.length, 3);
});

test('GameEngine - Special Powers (Queen Peek & Jack Swap)', () => {
  const room = new Room('TESTROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);
  GameEngine.dealNewRound(room);

  // Queue a Queen power
  GameEngine.queuePowersForCards(room, [createCard('Q', 12, '♥', 'red')]);
  assert.strictEqual(room.stage, TURN_STAGES.QPOWER);
  assert.strictEqual(room.qCount, 1);

  // Execute Queen peek
  const peekRes = GameEngine.qPeek(room, p1.pid, 0);
  assert.strictEqual(peekRes.success, true);
  assert.strictEqual(peekRes.remaining, 0);
  assert.strictEqual(room.stage, TURN_STAGES.START);

  // Queue a Jack power
  GameEngine.queuePowersForCards(room, [createCard('J', 11, '♣', 'black')]);
  assert.strictEqual(room.stage, TURN_STAGES.JPOWER);
  assert.strictEqual(room.jCount, 1);

  const p1CardBefore = p1.hand[0];
  const p2CardBefore = p2.hand[0];

  // Execute Jack blind swap
  const swapRes = GameEngine.jSwap(room, p1.pid, p2.pid, 0, 0);
  assert.strictEqual(swapRes.success, true);
  assert.strictEqual(p1.hand[0].uid, p2CardBefore.uid);
  assert.strictEqual(p2.hand[0].uid, p1CardBefore.uid);
  assert.strictEqual(room.stage, TURN_STAGES.START);
});

test('GameEngine - Play Again Round Reset', () => {
  const room = new Room('TESTROOM');
  const p1 = new Player({ name: 'P1', socketId: 's1' });
  const p2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(p1, p2);

  // Complete a game and enter reveal phase
  GameEngine.dealNewRound(room);
  GameEngine.revealAll(room);
  assert.strictEqual(room.phase, GAME_PHASES.REVEAL);

  // Trigger Play Again
  GameEngine.dealNewRound(room);

  // Verify full state reset
  assert.strictEqual(room.phase, GAME_PHASES.NORMAL, 'Phase must reset to normal');
  assert.strictEqual(room.stage, TURN_STAGES.START, 'Stage must reset to start');
  assert.strictEqual(room.currentIndex, 0, 'Current index must reset to 0');
  assert.strictEqual(room.drawn, null);
  assert.strictEqual(room.drawnThisTurn, false);
  assert.strictEqual(room.turnDiscardStarted, false);
  assert.strictEqual(room.qCount, 0);
  assert.strictEqual(room.jCount, 0);
  assert.strictEqual(room.zeroPlayer, null);
  assert.strictEqual(room.finalCaller, null);
  assert.strictEqual(p1.hand.length, room.cardsPerPlayer);
  assert.strictEqual(p2.hand.length, room.cardsPerPlayer);

  // Ensure public state reflects normal game
  const state = room.toPublicState();
  assert.strictEqual(state.phase, GAME_PHASES.NORMAL);
  assert.strictEqual(state.hands, undefined, 'Hands must NOT be revealed in public state');
  assert.strictEqual(state.scores, undefined, 'Scores must NOT be revealed in public state');
});

