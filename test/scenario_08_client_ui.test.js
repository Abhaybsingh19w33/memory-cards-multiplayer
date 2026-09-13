/**
 * @file scenario_08_client_ui.test.js
 * @description Test suite for Scenario 8: Client UI Architecture & Synchronization.
 * Evaluates real DOM rendering, modal lifecycle, and verifies the "Play Again" bug fix in JSDOM.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { jsdom } = require('jsdom');

/**
 * Helper to build a clean JSDOM instance initialized with the actual index.html and scripts.
 */
function createUIEnvironment() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const doc = jsdom(html);
  const win = doc.defaultView;

  // Mock localStorage
  const storage = {};
  win.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { for (const k in storage) delete storage[k]; },
  };

  // Mock SocketClient
  win.SocketClient = {
    emitted: [],
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
  };

  // Set global environment for evaluating browser scripts
  global.window = win;
  global.document = doc;
  global.localStorage = win.localStorage;

  // Evaluate client scripts into window
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'constants.js'), 'utf-8') +
    '; window.UI_PHASES = UI_PHASES; window.UI_STAGES = UI_STAGES; window.STORAGE_KEY = STORAGE_KEY;');
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'state.js'), 'utf-8') +
    '; window.Store = Store;');
  win.eval(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui.js'), 'utf-8') +
    '; window.UI = UI;');

  return {
    window: win,
    document: doc,
    Store: win.Store,
    UI: win.UI,
    SocketClient: win.SocketClient,
  };
}

test('Scenario 8 - Lobby UI Rendering and Start Button Dynamic Visibility', () => {
  const { document, Store, UI } = createUIEnvironment();

  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'ROOM1' };

  // 1 Player in Lobby -> Start button hidden
  Store.s = {
    phase: 'lobby',
    players: [{ pid: 'p1', name: 'Alice' }],
    cardsPerPlayer: 5,
  };
  UI.render();

  const lobbyScreen = document.getElementById('lobbyScreen');
  const gameScreen = document.getElementById('gameScreen');
  const startBtn = document.getElementById('startBtn');
  const lobbyPlayers = document.getElementById('lobbyPlayers');

  assert.ok(!lobbyScreen.classList.contains('hidden'), 'Lobby screen should be visible');
  assert.ok(gameScreen.classList.contains('hidden'), 'Game screen should be hidden');
  assert.ok(startBtn.classList.contains('hidden'), 'Start button must be hidden with < 2 players');
  assert.match(lobbyPlayers.innerHTML, /Alice \(you\)/);

  // 2 Players in Lobby -> Start button visible
  Store.s.players.push({ pid: 'p2', name: 'Bob' });
  UI.render();

  assert.ok(!startBtn.classList.contains('hidden'), 'Start button must be visible with 2 players');
});

test('Scenario 8 - Game Table and Local Player Hand Rendering', () => {
  const { document, Store, UI } = createUIEnvironment();

  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'ROOM1' };
  Store.s = {
    phase: 'normal',
    currentIndex: 0,
    currentName: 'Alice',
    cardsPerPlayer: 5,
    players: [
      { pid: 'p1', name: 'Alice', count: 5, connected: true },
      { pid: 'p2', name: 'Bob', count: 4, connected: true },
    ],
    discardTop: { r: '10', s: '♠', color: 'black' },
    deckCount: 94,
    stage: 'start',
    drawnThisTurn: false,
    finalActive: false,
    log: ['Game started!'],
  };

  UI.render();

  const lobbyScreen = document.getElementById('lobbyScreen');
  const gameScreen = document.getElementById('gameScreen');
  const discardPile = document.getElementById('discardPile');
  const hand = document.getElementById('hand');
  const players = document.getElementById('players');

  assert.ok(lobbyScreen.classList.contains('hidden'));
  assert.ok(!gameScreen.classList.contains('hidden'));
  assert.match(discardPile.innerHTML, /10/);
  assert.match(discardPile.innerHTML, /♠/);

  // Local player has 5 cards
  const cardsInHand = hand.querySelectorAll('.card');
  assert.strictEqual(cardsInHand.length, 5, 'Should render 5 face-down cards in local hand');

  // Opponents list shows Bob with count 4
  assert.match(players.innerHTML, /Bob/);
  assert.match(players.innerHTML, /4 cards/);
});

test('Scenario 8 - Card Selection Mechanics in Hand', () => {
  const { document, Store, UI } = createUIEnvironment();

  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'ROOM1' };
  Store.s = {
    phase: 'normal',
    currentIndex: 0,
    cardsPerPlayer: 5,
    players: [{ pid: 'p1', name: 'Alice', count: 5, connected: true }],
    stage: 'start',
  };
  UI.render();

  const hand = document.getElementById('hand');
  const selectedInfo = document.getElementById('selectedInfo');

  // Select card at index 1
  UI.toggleSelect(1);
  const cards = hand.querySelectorAll('.card');
  assert.ok(cards[1].classList.contains('selected'), 'Card 1 should have selected class');
  assert.strictEqual(selectedInfo.textContent, '1 selected');

  // Select card at index 3
  UI.toggleSelect(3);
  assert.strictEqual(selectedInfo.textContent, '2 selected');

  // Deselect card at index 1
  UI.toggleSelect(1);
  const updatedCards = hand.querySelectorAll('.card');
  assert.ok(!updatedCards[1].classList.contains('selected'));
  assert.strictEqual(selectedInfo.textContent, '1 selected');
});

test('Scenario 8 - Control Bar Integrity & "Play Again" Bug Resolution (CRITICAL TEST)', () => {
  const { document, Store, UI } = createUIEnvironment();

  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'ROOM1' };

  // 1. Initial normal phase
  Store.s = {
    phase: 'normal',
    currentIndex: 0,
    currentName: 'Alice',
    cardsPerPlayer: 5,
    players: [{ pid: 'p1', name: 'Alice', count: 5, connected: true }],
    stage: 'start',
    scores: [10],
    hands: [[{ r: '10', s: '♠', color: 'black' }]],
  };
  UI.render();

  const gameplayControls = document.getElementById('gameplayControls');
  const revealControls = document.getElementById('revealControls');
  const discardSelBtn = document.getElementById('discardSelBtn');
  const callBtn = document.getElementById('callBtn');
  const nextBtn = document.getElementById('nextBtn');
  const arrangeBtn = document.getElementById('arrangeBtn');

  assert.ok(!gameplayControls.classList.contains('hidden'), 'Gameplay controls must be visible');
  assert.ok(revealControls.classList.contains('hidden'), 'Reveal controls must be hidden');
  assert.strictEqual(discardSelBtn.disabled, false, 'Discard button must be enabled for active player');

  // 2. Transition to REVEAL phase (End of Game)
  Store.s.phase = 'reveal';
  UI.render();

  assert.ok(gameplayControls.classList.contains('hidden'), 'Gameplay controls must be hidden in reveal');
  assert.ok(!revealControls.classList.contains('hidden'), 'Reveal controls must be visible in reveal');

  // VERIFY GOLDEN RULE: Buttons must STILL exist in DOM and NOT be null or destroyed!
  assert.ok(document.getElementById('discardSelBtn') !== null, 'discardSelBtn must NEVER be destroyed');
  assert.ok(document.getElementById('callBtn') !== null, 'callBtn must NEVER be destroyed');
  assert.ok(document.getElementById('nextBtn') !== null, 'nextBtn must NEVER be destroyed');
  assert.ok(document.getElementById('arrangeBtn') !== null, 'arrangeBtn must NEVER be destroyed');

  // 3. User views ranking modal
  UI.showRanking();
  const modal = document.getElementById('modal');
  assert.ok(!modal.classList.contains('hidden'), 'Ranking modal should be visible');

  // 4. Click "Play Again" -> Server transitions phase back to 'normal'
  Store.s.phase = 'normal';
  Store.s.stage = 'start';
  Store.s.currentIndex = 0;

  // THIS IS THE EXACT STEP THAT USED TO CRASH WITH:
  // TypeError: Cannot set properties of null (setting 'disabled')
  assert.doesNotThrow(() => {
    UI.render();
  }, 'UI.render() must NOT throw an unhandled TypeError when transitioning from reveal to normal');

  // 5. Assert that controls are fully restored, modal is closed, and buttons are responsive!
  assert.ok(!gameplayControls.classList.contains('hidden'), 'Gameplay controls must be restored');
  assert.ok(revealControls.classList.contains('hidden'), 'Reveal controls must be hidden');
  assert.ok(modal.classList.contains('hidden'), 'Ranking modal must be closed on new round');
  assert.strictEqual(document.getElementById('discardSelBtn').disabled, false, 'Discard button must be re-enabled');
  assert.strictEqual(document.getElementById('callBtn').disabled, false, 'Call button must be re-enabled');
  assert.strictEqual(document.getElementById('nextBtn').disabled, false, 'Next button must be re-enabled');
  assert.strictEqual(document.getElementById('arrangeBtn').disabled, false, 'Arrange button must be re-enabled');
});

test('Scenario 8 - Universal Modal Lifecycle and Drawn Card Popup', () => {
  const { document, UI } = createUIEnvironment();

  // Test drawn card popup
  UI.showDrawnCardModal({ r: 'K', s: '♥', color: 'red' });

  const modal = document.getElementById('modal');
  const modalBox = document.getElementById('modalBox');

  assert.ok(!modal.classList.contains('hidden'));
  assert.match(modalBox.innerHTML, /You drew a card/);
  assert.match(modalBox.innerHTML, /modalCard/);

  // Close modal
  UI.closeModal();
  assert.ok(modal.classList.contains('hidden'));
});

test('Scenario 8 - Ephemeral Error Banner Display', () => {
  const { document, UI } = createUIEnvironment();

  const errBanner = document.getElementById('errBanner');
  assert.ok(errBanner.classList.contains('hidden'));

  UI.showErr('Illegal Move Attempted!');
  assert.ok(!errBanner.classList.contains('hidden'));
  assert.strictEqual(errBanner.textContent, 'Illegal Move Attempted!');
});
