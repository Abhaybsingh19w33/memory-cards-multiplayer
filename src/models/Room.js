/**
 * @file Room.js
 * @description Room entity containing game state, players, decks, discard pile, and turn orchestration.
 * Adheres to Golden Rules: State encapsulation, atomic state transitions, clean query methods.
 */

const { GAME_PHASES, TURN_STAGES, GAME_CONFIG } = require('../config/constants');
const { toPublicCard, getCardValue } = require('./Card');

class Room {
  /**
   * @param {string} code - Uppercase unique room code
   */
  constructor(code) {
    this.code = code;
    this.phase = GAME_PHASES.LOBBY;
    this.cardsPerPlayer = GAME_CONFIG.DEFAULT_CARDS_PER_PLAYER;
    this.players = []; // Array of Player instances
    this.currentIndex = 0;
    this.deck = [];
    this.discard = [];
    this.stage = TURN_STAGES.START;
    this.drawn = null;
    this.drawnThisTurn = false;
    this.turnDiscardStarted = false;
    this.qCount = 0;
    this.jCount = 0;
    this.zeroPlayer = null;
    this.finalCaller = null;
    this.log = [];
  }

  /**
   * Appends an audit message to the room's event log.
   * @param {string} msg - Log message
   */
  addLog(msg) {
    this.log.push(msg);
    if (this.log.length > GAME_CONFIG.LOG_MAX_ENTRIES) {
      this.log.shift();
    }
  }

  /**
   * Returns the player whose turn is currently active.
   * @returns {Player|null}
   */
  currentPlayer() {
    return this.players[this.currentIndex] || null;
  }

  /**
   * Finds a player in the room by their PID.
   * @param {string} pid - Player ID
   * @returns {Player|null}
   */
  findPlayer(pid) {
    return this.players.find((p) => p.pid === pid) || null;
  }

  /**
   * Finds a player in the room by their reconnection token.
   * @param {string} token - Secret player token
   * @returns {Player|null}
   */
  findPlayerByToken(token) {
    return this.players.find((p) => p.token === token) || null;
  }

  /**
   * Checks if it is currently the specified player's turn.
   * @param {string} pid - Player ID
   * @returns {boolean}
   */
  isMyTurn(pid) {
    const cp = this.currentPlayer();
    return Boolean(cp && cp.pid === pid);
  }

  /**
   * Gets the current top face-up card on the discard pile.
   * @returns {object|null}
   */
  getOpenCard() {
    return this.discard.length > 0 ? this.discard[this.discard.length - 1] : null;
  }

  /**
   * Resets all per-turn temporary variables.
   */
  resetTurnState() {
    this.drawn = null;
    this.drawnThisTurn = false;
    this.turnDiscardStarted = false;
    this.stage = TURN_STAGES.START;
  }

  /**
   * Serializes the room state for public broadcast.
   * Crucial Golden Rule: Private hands are NEVER sent to clients during
   * lobby, normal, or final phases. Hand contents are ONLY serialized
   * when the phase is strictly 'reveal'.
   * 
   * @returns {object} Public room state
   */
  toPublicState() {
    const cp = this.currentPlayer();
    const open = this.getOpenCard();

    const state = {
      phase: this.phase,
      cardsPerPlayer: this.cardsPerPlayer,
      players: this.players.map((p) => p.toPublicJSON()),
      currentIndex: this.currentIndex,
      currentName: cp ? cp.name : null,
      discardTop: open ? toPublicCard(open) : null,
      deckCount: this.deck.length,
      stage: this.stage,
      drawnThisTurn: this.drawnThisTurn,
      qCount: this.qCount,
      jCount: this.jCount,
      finalActive: this.finalCaller !== null,
      log: this.log.slice(-GAME_CONFIG.LOG_BROADCAST_ENTRIES),
    };

    if (this.phase === GAME_PHASES.REVEAL) {
      state.hands = this.players.map((p) => p.hand.map(toPublicCard));
      state.scores = this.players.map((p) =>
        p.hand.reduce((acc, card) => acc + getCardValue(card), 0)
      );
    }

    return state;
  }
}

module.exports = Room;

