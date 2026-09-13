/**
 * @file scenario_02_deck_cards.test.js
 * @description Test suite for Scenario 2: Deck & Card Mechanics.
 */

const test = require('node:test');
const assert = require('node:assert');
const { createCard, getCardValue, toPublicCard } = require('../src/models/Card');
const { makeDeck, shuffle, drawFromDeck } = require('../src/models/Deck');
const Player = require('../src/models/Player');
const Room = require('../src/models/Room');

test('Scenario 2 - Multi-deck Shoe Scaling by Player Count', () => {
  const smallGame = makeDeck(5);
  assert.strictEqual(smallGame.length, 104, '5 players should use 2 decks (104 cards)');

  const largeGame = makeDeck(6);
  assert.strictEqual(largeGame.length, 156, '6 players should use 3 decks (156 cards)');

  const hugeGame = makeDeck(10);
  assert.strictEqual(hugeGame.length, 156, '10 players should use 3 decks (156 cards)');
});

test('Scenario 2 - Comprehensive Card Valuation Rules', () => {
  // Red Kings (-2 points)
  const redKingH = createCard('K', 13, '♥', 'red');
  const redKingD = createCard('K', 13, '♦', 'red');
  assert.strictEqual(getCardValue(redKingH), -2);
  assert.strictEqual(getCardValue(redKingD), -2);

  // Black Kings (13 points)
  const blackKingS = createCard('K', 13, '♠', 'black');
  const blackKingC = createCard('K', 13, '♣', 'black');
  assert.strictEqual(getCardValue(blackKingS), 13);
  assert.strictEqual(getCardValue(blackKingC), 13);

  // Aces (1 point)
  assert.strictEqual(getCardValue(createCard('A', 1, '♠', 'black')), 1);
  assert.strictEqual(getCardValue(createCard('A', 1, '♥', 'red')), 1);

  // Numbers 2-10 (Face value)
  for (let n = 2; n <= 10; n++) {
    assert.strictEqual(getCardValue(createCard(String(n), n, '♦', 'red')), n);
  }

  // Face cards: Jack (11 points), Queen (12 points)
  assert.strictEqual(getCardValue(createCard('J', 11, '♣', 'black')), 11);
  assert.strictEqual(getCardValue(createCard('Q', 12, '♥', 'red')), 12);
});

test('Scenario 2 - Hidden Hand Security and Zero Information Leakage', () => {
  const player = new Player({ name: 'SecretAgent', socketId: 'sock_agent' });
  const secretCard = createCard('K', 13, '♥', 'red');
  player.hand.push(secretCard);

  // 1. Player serialization must not include hand array or token
  const publicPlayer = player.toPublicJSON();
  assert.strictEqual(publicPlayer.hand, undefined, 'Player public JSON must never leak private hand array');
  assert.strictEqual(publicPlayer.token, undefined, 'Player public JSON must never leak auth token');
  assert.strictEqual(publicPlayer.count, 1, 'Player public JSON should only report card count');

  // 2. Card public serialization must strip internal UUID
  const publicCard = toPublicCard(secretCard);
  assert.strictEqual(publicCard.uid, undefined, 'toPublicCard must strip private uid');
  assert.strictEqual(publicCard.r, 'K');
  assert.strictEqual(publicCard.s, '♥');
  assert.strictEqual(publicCard.color, 'red');

  // 3. Room public state must never include hands during normal or final phases
  const room = new Room('SECURE_ROOM');
  room.players.push(player);
  const normalState = room.toPublicState();
  assert.strictEqual(normalState.hands, undefined, 'Room public state must not expose hands during normal play');
  assert.strictEqual(normalState.scores, undefined, 'Room public state must not expose scores during normal play');
});

test('Scenario 2 - Reshuffling Discard Pile on Deck Exhaustion', () => {
  const room = new Room('RESHUFFLE_ROOM');
  room.deck = [];
  const card1 = createCard('4', 4, '♠', 'black');
  const card2 = createCard('8', 8, '♥', 'red');
  const topCard = createCard('Q', 12, '♦', 'red');

  room.discard = [card1, card2, topCard];

  const drawn = drawFromDeck(room);
  assert.ok(drawn, 'Should succeed in drawing a card');
  assert.strictEqual(room.discard.length, 1, 'Top open card must remain on discard pile');
  assert.strictEqual(room.discard[0].uid, topCard.uid, 'Top open card must remain Q of diamonds');
  assert.strictEqual(room.deck.length, 1, 'Remaining card should now be in the deck');
});

