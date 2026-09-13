/**
 * @file constants.js
 * @description Core constants, configurations, and enumerations for the Memory Cards multiplayer game.
 * Follows the Golden Rules: Single source of truth, centralized configuration, descriptive naming.
 */

// Card Ranks with base numerical values
const RANKS = [
  ['A', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7],
  ['8', 8],
  ['9', 9],
  ['10', 10],
  ['J', 11],
  ['Q', 12],
  ['K', 13],
];

// Card Suits with associated color styling
const SUITS = [
  ['♠', 'black'],
  ['♥', 'red'],
  ['♦', 'red'],
  ['♣', 'black'],
];

// Game lifecycle phases
const GAME_PHASES = {
  LOBBY: 'lobby',
  NORMAL: 'normal',
  FINAL: 'final',
  REVEAL: 'reveal',
};

// Turn action stages
const TURN_STAGES = {
  START: 'start',
  DRAWN: 'drawn',
  QPOWER: 'qpower',
  JPOWER: 'jpower',
};

// Gameplay configuration parameters
const GAME_CONFIG = {
  MIN_PLAYERS: 2,
  DEFAULT_CARDS_PER_PLAYER: 5,
  MIN_CARDS_PER_PLAYER: 3,
  MAX_CARDS_PER_PLAYER: 10,
  LOG_MAX_ENTRIES: 40,
  LOG_BROADCAST_ENTRIES: 30,
  SMALL_GAME_DECK_COUNT: 2, // for <= 5 players
  LARGE_GAME_DECK_COUNT: 3, // for > 5 players
  MAX_NAME_LENGTH: 16,
  MAX_ROOM_CODE_LENGTH: 12,
  Q_PEEK_TIMER_SECONDS: 3,
};

module.exports = {
  RANKS,
  SUITS,
  GAME_PHASES,
  TURN_STAGES,
  GAME_CONFIG,
};

