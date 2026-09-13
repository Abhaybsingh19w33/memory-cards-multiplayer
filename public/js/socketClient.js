/**
 * @file socketClient.js
 * @description Real-time Socket.IO client interface.
 * Handles networking lifecycle, reconnect handshakes, and incoming server events.
 */

const SocketClient = {
  socket: null,

  /**
   * Initializes Socket.IO connection and registers incoming event dispatchers.
   */
  init() {
    this.socket = io();

    // Reconnection handshake: Automatically re-claim player's seat if token exists
    this.socket.on('connect', () => {
      if (Store.me.token && Store.me.roomCode) {
        this.emit('rejoin', {
          roomCode: Store.me.roomCode,
          token: Store.me.token,
        });
      }
    });

    // Successfully joined or rejoined a room
    this.socket.on('joined', (data) => {
      Store.me = data;
      Store.saveIdentity();
    });

    // Incoming error notification
    this.socket.on('errorMsg', ({ message }) => {
      Store.isPeeking = false;
      if (Store.autoModalOpen === 'q_display') {
        Store.autoModalOpen = null;
      }
      UI.showErr(message);
    });

    // Authoritative room state update
    this.socket.on('state', (stateData) => {
      Store.s = stateData;
      UI.render();
    });

    // Local player drew a card
    this.socket.on('yourDrawnCard', ({ card }) => {
      UI.showDrawnCardModal(card);
    });

    // Discard reveal summary and penalty notification
    this.socket.on('discardReveal', (result) => {
      UI.showDiscardRevealModal(result);
    });

    // Queen power peek card received
    this.socket.on('yourQPeek', ({ card, remaining }) => {
      UI.showQPeekDisplay(card, remaining);
    });
  },

  /**
   * Emits a message to the Socket.IO server.
   * @param {string} event 
   * @param {object} [payload] 
   */
  emit(event, payload) {
    if (this.socket) {
      this.socket.emit(event, payload);
    }
  },
};

