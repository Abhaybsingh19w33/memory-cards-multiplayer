/**
 * @file scenario_02_deck_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 2: Deck, Card Valuation & Secrecy.
 */

const test = require('node:test');
const assert = require('node:assert');
const { RANKS, SUITS, GAME_PHASES, GAME_CONFIG } = require('../src/config/constants');
const { createCard, getCardValue, toPublicCard } = require('../src/models/Card');
const { makeDeck, shuffle, drawFromDeck } = require('../src/models/Deck');
const Player = require('../src/models/Player');
const Room = require('../src/models/Room');

test('Scenario 2 Permutations - Exhaustive 52-Card Valuation & Suits Matrix', () => {
  for (const [rank, val] of RANKS) {
    for (const [suit, color] of SUITS) {
      const card = createCard(rank, val, suit, color);
      const computedValue = getCardValue(card);

      if (rank === 'K') {
        if (color === 'red') {
          assert.strictEqual(computedValue, -2, `Red King (${suit}) must equal -2`);
        } else {
          assert.strictEqual(computedValue, 13, `Black King (${suit}) must equal 13`);
        }
      } else if (rank === 'Q') {
        assert.strictEqual(computedValue, 12, `Queen (${suit}) must equal 12`);
      } else if (rank === 'J') {
        assert.strictEqual(computedValue, 11, `Jack (${suit}) must equal 11`);
      } else if (rank === 'A') {
        assert.strictEqual(computedValue, 1, `Ace (${suit}) must equal 1`);
      } else {
        assert.strictEqual(computedValue, val, `Number card ${rank} (${suit}) must equal ${val}`);
      }

      // Ensure public serialization preserves rank, suit, and color
      const pub = toPublicCard(card);
      assert.strictEqual(pub.r, rank);
      assert.strictEqual(pub.s, suit);
      assert.strictEqual(pub.color, color);
      assert.strictEqual(pub.uid, undefined, 'UID must never appear in public card');
    }
  }
});

test('Scenario 2 Permutations - Boundary & Malformed Card Inputs', () => {
  assert.strictEqual(getCardValue(null), 0, 'Null card value must equal 0');
  assert.strictEqual(getCardValue(undefined), 0, 'Undefined card value must equal 0');
  assert.strictEqual(toPublicCard(null), null, 'Public representation of null card must be null');
  assert.strictEqual(toPublicCard(undefined), null, 'Public representation of undefined card must be null');

  // Custom non-standard card
  const weirdCard = { r: 'X', v: 99, s: '?', color: 'blue' };
  assert.strictEqual(getCardValue(weirdCard), 99);
  assert.deepStrictEqual(toPublicCard(weirdCard), { r: 'X', s: '?', color: 'blue' });
});

test('Scenario 2 Permutations - Multi-Deck Shoe Scaling & Rank Distribution', () => {
  // <= 5 players uses 2 decks (104 cards)
  for (let players = 1; players <= 5; players++) {
    const deck = makeDeck(players);
    assert.strictEqual(deck.length, 104, `Shoe for ${players} players must have 104 cards (2 decks)`);

    // In 2 standard decks: each rank appears 8 times (2 per suit * 4 suits)
    const rankCounts = {};
    for (const card of deck) {
      rankCounts[card.r] = (rankCounts[card.r] || 0) + 1;
    }
    for (const [r] of RANKS) {
      assert.strictEqual(rankCounts[r], 8, `Rank ${r} must appear exactly 8 times in 2-deck shoe`);
    }
  }

  // > 5 players uses 3 decks (156 cards)
  for (let players = 6; players <= 10; players++) {
    const deck = makeDeck(players);
    assert.strictEqual(deck.length, 156, `Shoe for ${players} players must have 156 cards (3 decks)`);

    // In 3 standard decks: each rank appears 12 times (3 per suit * 4 suits)
    const rankCounts = {};
    for (const card of deck) {
      rankCounts[card.r] = (rankCounts[card.r] || 0) + 1;
    }
    for (const [r] of RANKS) {
      assert.strictEqual(rankCounts[r], 12, `Rank ${r} must appear exactly 12 times in 3-deck shoe`);
    }
  }
});

test('Scenario 2 Permutations - Cryptographic UUID Collision Check (1000 Cards)', () => {
  const generatedUids = new Set();
  const sampleSize = 1000;

  for (let i = 0; i < sampleSize; i++) {
    const card = createCard('7', 7, '♥', 'red');
    assert.ok(card.uid, 'Card must have UUID');
    assert.strictEqual(generatedUids.has(card.uid), false, `UUID collision detected on iteration ${i}!`);
    generatedUids.add(card.uid);
  }
  assert.strictEqual(generatedUids.size, sampleSize, 'All 1000 generated cards must have unique UUIDs');
});

test('Scenario 2 Permutations - Discard Reshuffle Boundary Matrix', () => {
  // Case A: Deck empty, Discard empty -> null
  const roomA = { deck: [], discard: [], addLog: () => {} };
  assert.strictEqual(drawFromDeck(roomA), null);

  // Case B: Deck empty, Discard has 1 card (open card) -> cannot reshuffle, returns null
  const topCardB = createCard('K', 13, '♠', 'black');
  const roomB = { deck: [], discard: [topCardB], addLog: () => {} };
  assert.strictEqual(drawFromDeck(roomB), null);
  assert.strictEqual(roomB.discard.length, 1, 'Discard pile must still retain the open card');
  assert.strictEqual(roomB.discard[0].uid, topCardB.uid);

  // Case C: Deck empty, Discard has 2 cards -> 1 reshuffled into deck and drawn, top card remains
  const bottomCardC = createCard('3', 3, '♦', 'red');
  const topCardC = createCard('8', 8, '♣', 'black');
  let loggedC = false;
  const roomC = {
    deck: [],
    discard: [bottomCardC, topCardC],
    addLog: () => { loggedC = true; },
  };
  const drawnC = drawFromDeck(roomC);
  assert.ok(drawnC, 'Should draw the reshuffled card');
  assert.strictEqual(drawnC.uid, bottomCardC.uid);
  assert.strictEqual(roomC.discard.length, 1);
  assert.strictEqual(roomC.discard[0].uid, topCardC.uid, 'Top open card must remain on discard');
  assert.strictEqual(roomC.deck.length, 0, 'Deck should be empty after drawing the single reshuffled card');
  assert.strictEqual(loggedC, true, 'Audit log entry should be created on reshuffle');

  // Case D: Deck empty, Discard has 5 cards -> 4 reshuffled, 1 drawn, 3 left in deck, 1 on discard
  const discardCards = [
    createCard('2', 2, '♠', 'black'),
    createCard('4', 4, '♥', 'red'),
    createCard('6', 6, '♦', 'red'),
    createCard('9', 9, '♣', 'black'),
    createCard('A', 1, '♥', 'red'), // top card
  ];
  const roomD = {
    deck: [],
    discard: [...discardCards],
    addLog: () => {},
  };
  const drawnD = drawFromDeck(roomD);
  assert.ok(drawnD);
  assert.strictEqual(roomD.discard.length, 1);
  assert.strictEqual(roomD.discard[0].uid, discardCards[4].uid, 'Top card must be preserved');
  assert.strictEqual(roomD.deck.length, 3, 'Deck must have 3 remaining reshuffled cards');

  // Case E: Malformed room / deck
  assert.strictEqual(drawFromDeck(null), null);
  assert.strictEqual(drawFromDeck({ deck: null }), null);
});

test('Scenario 2 Permutations - Zero Information Leakage Across Phases', () => {
  const room = new Room('PRIVACY_TEST');
  const player1 = new Player({ name: 'P1', socketId: 's1' });
  const player2 = new Player({ name: 'P2', socketId: 's2' });
  room.players.push(player1, player2);

  player1.hand = [
    createCard('K', 13, '♥', 'red'),
    createCard('Q', 12, '♦', 'red'),
  ];
  player2.hand = [
    createCard('A', 1, '♠', 'black'),
    createCard('10', 10, '♣', 'black'),
  ];

  // Test across LOBBY, NORMAL, and FINAL phases
  const privatePhases = [GAME_PHASES.LOBBY, GAME_PHASES.NORMAL, GAME_PHASES.FINAL];
  for (const ph of privatePhases) {
    room.phase = ph;
    const pub = room.toPublicState();
    assert.strictEqual(pub.hands, undefined, `Hands must NOT be present in phase ${ph}`);
    assert.strictEqual(pub.scores, undefined, `Scores must NOT be present in phase ${ph}`);
    assert.strictEqual(pub.players[0].count, 2);
    assert.strictEqual(pub.players[1].count, 2);
    assert.strictEqual(pub.players[0].hand, undefined);
    assert.strictEqual(pub.players[0].token, undefined);
  }

  // REVEAL phase: Hands and scores are revealed
  room.phase = GAME_PHASES.REVEAL;
  const revealState = room.toPublicState();
  assert.ok(Array.isArray(revealState.hands), 'Hands must be present in reveal phase');
  assert.ok(Array.isArray(revealState.scores), 'Scores must be present in reveal phase');
  assert.strictEqual(revealState.scores[0], 10, '-2 (Red King) + 12 (Queen) = 10');
  assert.strictEqual(revealState.scores[1], 11, '1 (Ace) + 10 (Ten) = 11');

  // Ensure revealed hands use public representations without UUIDs
  for (const playerHand of revealState.hands) {
    for (const card of playerHand) {
      assert.strictEqual(card.uid, undefined, 'UID must not appear in revealed cards');
      assert.ok(card.r);
      assert.ok(card.s);
      assert.ok(card.color);
    }
  }
});

