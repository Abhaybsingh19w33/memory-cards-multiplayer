/**
 * @file Card.js
 * @description Card entity definitions, valuation, and public serialization helpers.
 * Adheres to Golden Rules: Hidden Hand Security (zero information leakage), immutability where applicable.
 */

const crypto = require('crypto');

/**
 * Creates a unique card instance with rank, value, suit, color, and unique ID.
 * @param {string} r - Rank symbol (e.g., 'A', '7', 'K')
 * @param {number} v - Base numerical value
 * @param {string} s - Suit symbol ('♠', '♥', '♦', '♣')
 * @param {string} color - Suit color ('red' | 'black')
 * @returns {object} Card instance
 */
function createCard(r, v, s, color) {
  return {
    r,
    v,
    s,
    color,
    uid: crypto.randomUUID(),
  };
}

/**
 * Computes the game scoring value of a card according to game rules:
 * - Red King (♥, ♦) = -2 points
 * - Black King (♠, ♣) = 13 points
 * - Aces = 1 point
 * - Number cards = face value (2-10)
 * - Jack = 11 points
 * - Queen = 12 points
 * 
 * @param {object} card - Card instance
 * @returns {number} Point value
 */
function getCardValue(card) {
  if (!card) return 0;
  if (card.r === 'K') {
    return card.color === 'red' ? -2 : 13;
  }
  return card.v;
}

/**
 * Sanitizes a card for public broadcasting over Socket.IO.
 * Crucial Golden Rule: Strips private identifiers or internal metadata
 * and ensures face-up transmission only contains rank, suit, and color.
 * 
 * @param {object} card - Full card object
 * @returns {object|null} Public card representation
 */
function toPublicCard(card) {
  if (!card) return null;
  return {
    r: card.r,
    s: card.s,
    color: card.color,
  };
}

module.exports = {
  createCard,
  getCardValue,
  toPublicCard,
};

