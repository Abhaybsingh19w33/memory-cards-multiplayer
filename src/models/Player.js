/**
 * @file Player.js
 * @description Player model representing an active participant in a room.
 * Adheres to Golden Rules: Data isolation, token-based authentication for re-attaching dropped connections, zero private hand leakage.
 */

const crypto = require('crypto');

class Player {
  /**
   * @param {object} options
   * @param {string} [options.pid] - Player ID
   * @param {string} [options.token] - Reconnection token
   * @param {string} options.name - Display name
   * @param {string} options.socketId - Socket ID
   * @param {boolean} [options.connected=true] - Connectivity status
   */
  constructor({ pid, token, name, socketId, connected = true }) {
    this.pid = pid || crypto.randomUUID();
    this.token = token || crypto.randomUUID();
    this.name = name;
    this.hand = [];
    this.socketId = socketId;
    this.connected = connected;
  }

  /**
   * Serializes public player summary for room broadcast.
   * Golden Rule: The private card hand is NEVER serialized here.
   * Only the card count is visible to peers during normal play.
   * 
   * @returns {object} Public player representation
   */
  toPublicJSON() {
    return {
      pid: this.pid,
      name: this.name,
      count: this.hand.length,
      connected: this.connected,
    };
  }

  /**
   * Clears the player's hand.
   */
  clearHand() {
    this.hand = [];
  }
}

module.exports = Player;

