/**
 * @file state.js
 * @description Centralized reactive client-side state store.
 * Manages player identity, cached server state, card selections, and local UI flags.
 */

const Store = {
  // Local player identity
  me: {
    pid: null,
    token: null,
    roomCode: null,
    name: null,
  },

  // Authoritative server state snapshot
  s: null,

  // Set of selected hand indices for discarding
  selected: new Set(),

  // Selected hand index during arrange mode
  arrangeSelected: null,

  // Tracks active auto-flow modal to prevent re-render flicker ('q' | 'j' | 'q_display')
  autoModalOpen: null,

  // Tracks active Queen peek countdown to prevent premature modal closure
  isPeeking: false,

  /**
   * Persists player identity credentials in browser localStorage.
   */
  saveIdentity() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.me));
    } catch (e) {
      console.warn('Unable to persist identity in localStorage', e);
    }
  },

  /**
   * Restores player identity credentials from localStorage.
   */
  loadIdentity() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        this.me = stored;
      }
    } catch (e) {
      console.warn('Unable to load identity from localStorage', e);
    }
  },

  /**
   * Clears saved identity.
   */
  clearIdentity() {
    this.me = { pid: null, token: null, roomCode: null, name: null };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  },

  /**
   * Resets card selections.
   */
  resetSelection() {
    this.selected.clear();
    this.arrangeSelected = null;
  },

  /**
   * Fully resets local state for a fresh round (e.g. on "Play Again").
   */
  resetRoundClientState() {
    this.selected.clear();
    this.arrangeSelected = null;
    this.autoModalOpen = null;
    this.isPeeking = false;
  },

  /**
   * Finds the local player's index in the server's players array.
   * @returns {number}
   */
  myIndex() {
    return this.s && Array.isArray(this.s.players)
      ? this.s.players.findIndex((p) => p.pid === this.me.pid)
      : -1;
  },

  /**
   * Gets the local player's public summary entry.
   * @returns {object|null}
   */
  myEntry() {
    const idx = this.myIndex();
    return idx >= 0 ? this.s.players[idx] : null;
  },

  /**
   * Checks if it is currently the local player's turn.
   * @returns {boolean}
   */
  isMyTurn() {
    return Boolean(
      this.s &&
      Array.isArray(this.s.players) &&
      this.s.players[this.s.currentIndex] &&
      this.s.players[this.s.currentIndex].pid === this.me.pid
    );
  },
};

// Auto-load credentials on script load
Store.loadIdentity();

