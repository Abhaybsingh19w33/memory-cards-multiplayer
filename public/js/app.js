/**
 * @file app.js
 * @description Frontend bootstrap and user interaction bindings.
 */

function joinRoom() {
  const nameInput = document.getElementById('nameInput');
  const roomInput = document.getElementById('roomInput');
  if (!nameInput || !roomInput) return;

  const name = nameInput.value.trim();
  const roomCode = roomInput.value.trim().toUpperCase();

  if (!name) {
    UI.showErr('Enter your name first.');
    return;
  }
  if (!roomCode) {
    UI.showErr('Enter a room code (any word your friends will all type).');
    return;
  }

  SocketClient.emit('join', { roomCode, name });
}

function setCardsPerPlayer(count) {
  SocketClient.emit('setCardsPerPlayer', { n: count });
}

document.addEventListener('DOMContentLoaded', () => {
  // Pre-fill inputs if stored in local identity
  if (Store.me.name) {
    const nameInput = document.getElementById('nameInput');
    if (nameInput) nameInput.value = Store.me.name;
  }
  if (Store.me.roomCode) {
    const roomInput = document.getElementById('roomInput');
    if (roomInput) roomInput.value = Store.me.roomCode;
  }

  // Keyboard shortcut: Pressing Enter in name or room inputs triggers join
  ['nameInput', 'roomInput'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinRoom();
      });
    }
  });

  // Start Socket.IO connection
  SocketClient.init();
});

