/**
 * @file Deck.js
 * @description Deck generation, Fisher-Yates shuffling, drawing, and discard pile reshuffling.
 * Adheres to Golden Rules: High-entropy randomness, deterministic bounds, defensive checks against empty piles.
 */

const { RANKS, SUITS, GAME_CONFIG } = require('../config/constants');
const { createCard } = require('./Card');

/**
 * Performs an in-place Fisher-Yates shuffle on an array of cards.
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Builds a multi-deck shoe sized appropriately for the player count.
 * - <= 5 players: 2 standard 52-card decks (104 cards)
 * - > 5 players: 3 standard 52-card decks (156 cards)
 * 
 * @param {number} numPlayers - Number of players at the table
 * @returns {Array} Shuffled deck of cards
 */
function makeDeck(numPlayers) {
  const numDecks = numPlayers <= 5
    ? GAME_CONFIG.SMALL_GAME_DECK_COUNT
    : GAME_CONFIG.LARGE_GAME_DECK_COUNT;
    
  const deck = [];
  for (let n = 0; n < numDecks; n++) {
    for (const [r, v] of RANKS) {
      for (const [s, c] of SUITS) {
        deck.push(createCard(r, v, s, c));
      }
    }
  }
  return shuffle(deck);
}

/**
 * Draws a card from the room's draw deck.
 * If the draw deck is depleted, it takes all discard pile cards except the top open card,
 * reshuffles them into the deck, and draws.
 * 
 * @param {object} room - Room instance containing deck and discard
 * @returns {object|null} The drawn card, or null if deck and discard are both exhausted
 */
function drawFromDeck(room) {
  if (!room || !Array.isArray(room.deck)) return null;

  if (room.deck.length === 0) {
    if (room.discard && room.discard.length > 1) {
      const topOpenCard = room.discard.pop();
      room.deck = shuffle(room.discard);
      room.discard = [topOpenCard];
      if (typeof room.addLog === 'function') {
        room.addLog('Draw pile was empty — reshuffled the discard pile (keeping the open card).');
      }
    } else {
      return null;
    }
  }
  return room.deck.pop() || null;
}

module.exports = {
  shuffle,
  makeDeck,
  drawFromDeck,
};

