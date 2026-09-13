/**
 * @file scenario_08_client_ui_permutations.test.js
 * @description Exhaustive permutations and edge-case tests for Scenario 8: Client UI, Reactive Rendering, and Button States.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { jsdom } = require('jsdom');

function createUIEnvironment() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const doc = jsdom(html);
  const win = doc.defaultView;

  const storage = {};
  win.localStorage = {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    clear: () => { for (const k in storage) delete storage[k]; },
  };

  win.SocketClient = {
    emitted: [],
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
  };

  global.window = win;
  global.document = doc;
  global.localStorage = win.localStorage;

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

test('Scenario 8 Permutations - Button Disabled / Enabled State Matrix', () => {
  const { document, Store, UI } = createUIEnvironment();
  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'BTN_MATRIX' };

  const testMatrix = [
    // [isMyTurn, stage, phase, expDiscard, expCall, expNext, expArrange]
    { isTurn: true, stage: 'start', phase: 'normal', expDiscard: false, expCall: false, expNext: false, expArrange: false },
    { isTurn: true, stage: 'drawn', phase: 'normal', expDiscard: true, expCall: true, expNext: true, expArrange: false },
    { isTurn: true, stage: 'qpower', phase: 'normal', expDiscard: true, expCall: true, expNext: true, expArrange: false },
    { isTurn: true, stage: 'jpower', phase: 'normal', expDiscard: true, expCall: true, expNext: true, expArrange: false },
    { isTurn: false, stage: 'start', phase: 'normal', expDiscard: true, expCall: true, expNext: true, expArrange: true },
    { isTurn: false, stage: 'drawn', phase: 'normal', expDiscard: true, expCall: true, expNext: true, expArrange: true },
    { isTurn: true, stage: 'start', phase: 'final', expDiscard: false, expCall: false, expNext: false, expArrange: false },
    { isTurn: false, stage: 'start', phase: 'final', expDiscard: true, expCall: true, expNext: true, expArrange: true },
  ];

  for (let i = 0; i < testMatrix.length; i++) {
    const tc = testMatrix[i];
    Store.s = {
      phase: tc.phase,
      currentIndex: tc.isTurn ? 0 : 1,
      currentName: tc.isTurn ? 'Alice' : 'Bob',
      stage: tc.stage,
      cardsPerPlayer: 5,
      players: [
        { pid: 'p1', name: 'Alice', count: 5, connected: true },
        { pid: 'p2', name: 'Bob', count: 5, connected: true },
      ],
      discardTop: { r: '10', s: '♠', color: 'black' },
      deckCount: 90,
      drawnThisTurn: tc.stage !== 'start',
      finalActive: tc.phase === 'final',
      log: [],
    };

    UI.render();

    const discardBtn = document.getElementById('discardSelBtn');
    const callBtn = document.getElementById('callBtn');
    const nextBtn = document.getElementById('nextBtn');
    const arrangeBtn = document.getElementById('arrangeBtn');

    assert.strictEqual(discardBtn.disabled, tc.expDiscard, `Discard btn disabled mismatch in tc ${i}`);
    assert.strictEqual(callBtn.disabled, tc.expCall, `Call btn disabled mismatch in tc ${i}`);
    assert.strictEqual(nextBtn.disabled, tc.expNext, `Next btn disabled mismatch in tc ${i}`);
    assert.strictEqual(arrangeBtn.disabled, tc.expArrange, `Arrange btn disabled mismatch in tc ${i}`);
  }
});

test('Scenario 8 Permutations - Persistent Button Immutability Across Full Game Lifecycle', () => {
  const { document, Store, UI } = createUIEnvironment();
  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'PERSIST_BTNS' };

  const stages = [
    { phase: 'lobby' },
    { phase: 'normal', stage: 'start' },
    { phase: 'final', stage: 'start' },
    { phase: 'reveal', hands: [[{ r: 'K', s: '♥', color: 'red' }]], scores: [-2] },
    { phase: 'normal', stage: 'start' }, // Play Again
  ];

  for (const st of stages) {
    Store.s = {
      phase: st.phase,
      currentIndex: 0,
      currentName: 'Alice',
      stage: st.stage || 'start',
      cardsPerPlayer: 5,
      players: [{ pid: 'p1', name: 'Alice', count: 5, connected: true }],
      discardTop: { r: 'A', s: '♠', color: 'black' },
      deckCount: 90,
      hands: st.hands,
      scores: st.scores,
      log: [],
    };

    UI.render();

    // Critical Invariant: Buttons must ALWAYS exist in the DOM
    const arrangeBtn = document.getElementById('arrangeBtn');
    const discardSelBtn = document.getElementById('discardSelBtn');
    const callBtn = document.getElementById('callBtn');
    const nextBtn = document.getElementById('nextBtn');

    assert.ok(arrangeBtn, `arrangeBtn must never be null in phase ${st.phase}`);
    assert.ok(discardSelBtn, `discardSelBtn must never be null in phase ${st.phase}`);
    assert.ok(callBtn, `callBtn must never be null in phase ${st.phase}`);
    assert.ok(nextBtn, `nextBtn must never be null in phase ${st.phase}`);
  }
});

test('Scenario 8 Permutations - Card Selection & Deselection Toggle Matrix', () => {
  const { document, Store, UI } = createUIEnvironment();
  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'SEL_TOGGLE' };
  Store.s = {
    phase: 'normal',
    currentIndex: 0,
    currentName: 'Alice',
    cardsPerPlayer: 4,
    players: [{ pid: 'p1', name: 'Alice', count: 4, connected: true }],
    discardTop: { r: '8', s: '♦', color: 'red' },
    deckCount: 90,
    stage: 'start',
    log: [],
  };

  UI.render();
  assert.strictEqual(Store.selected.size, 0);

  // Select card 0
  UI.toggleSelect(0);
  assert.strictEqual(Store.selected.has(0), true);
  assert.strictEqual(Store.selected.size, 1);

  // Select card 2
  UI.toggleSelect(2);
  assert.strictEqual(Store.selected.has(2), true);
  assert.strictEqual(Store.selected.size, 2);

  // Deselect card 0
  UI.toggleSelect(0);
  assert.strictEqual(Store.selected.has(0), false);
  assert.strictEqual(Store.selected.has(2), true);
  assert.strictEqual(Store.selected.size, 1);

  // Clear selections via round reset
  Store.resetRoundClientState();
  assert.strictEqual(Store.selected.size, 0);
});

test('Scenario 8 Permutations - Ranking Modal Lowest Score Winner & Ties', () => {
  const { document, Store, UI } = createUIEnvironment();
  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'RANKING_TEST' };

  // Case A: Clear winner with lowest score
  Store.s = {
    phase: 'reveal',
    players: [
      { pid: 'p1', name: 'Alice' },
      { pid: 'p2', name: 'Bob' },
      { pid: 'p3', name: 'Charlie' },
    ],
    scores: [15, -2, 8],
    hands: [[], [], []],
  };

  UI.showRanking();
  const modalBox = document.getElementById('modalBox');
  assert.ok(modalBox.innerHTML.includes('Bob'));
  assert.ok(modalBox.innerHTML.includes('-2'));
  assert.ok(modalBox.innerHTML.includes('🏆'));

  // Case B: Tie scores
  Store.s.scores = [4, 4, 10];
  UI.showRanking();
  assert.ok(modalBox.innerHTML.includes('Alice'));
  assert.ok(modalBox.innerHTML.includes('Bob'));
});

test('Scenario 8 Permutations - XSS Escaping Safeguards Matrix', () => {
  const { UI } = createUIEnvironment();

  const dangerousInputs = [
    { raw: '<script>alert("pwned")</script>', notContain: '<script>' },
    { raw: '<img src=x onerror=alert(1)>', notContain: '<img' },
    { raw: 'Hello & Goodbye', expected: 'Hello &amp; Goodbye' },
    { raw: 'Quotes "and" \'ticks\'', notContain: '"and"' },
  ];

  for (const tc of dangerousInputs) {
    const escaped = UI.esc(tc.raw);
    if (tc.notContain) {
      assert.strictEqual(escaped.includes(tc.notContain), false, `Raw HTML should be escaped: ${tc.raw}`);
    }
    if (tc.expected) {
      assert.strictEqual(escaped, tc.expected);
    }
  }
});

test('Scenario 8 Permutations - Queen Power 3-Second Peek Display & Reactive Render Immunity', () => {
  const { document, Store, UI, SocketClient } = createUIEnvironment();
  Store.me = { pid: 'p1', name: 'Alice', roomCode: 'QPEEK_UI' };
  Store.s = {
    phase: 'normal',
    currentIndex: 0,
    currentName: 'Alice',
    cardsPerPlayer: 4,
    players: [{ pid: 'p1', name: 'Alice', count: 4, connected: true }],
    discardTop: { r: 'Q', s: '♥', color: 'red' },
    deckCount: 90,
    stage: 'qpower',
    qCount: 1,
    log: [],
  };

  // 1. Render in qpower stage -> opens Q peek picker modal
  UI.render();
  const modal = document.getElementById('modal');
  const modalBox = document.getElementById('modalBox');

  assert.ok(!modal.classList.contains('hidden'), 'Q peek picker modal should be visible');
  assert.ok(modalBox.innerHTML.includes('Q Power — Peek at one of your cards'));
  assert.strictEqual(Store.autoModalOpen, 'q');

  // 2. Click card 1 to peek
  UI.qPeekPick(1);
  assert.strictEqual(Store.isPeeking, true);
  assert.strictEqual(Store.autoModalOpen, 'q_display');
  const lastEmit = SocketClient.emitted.pop();
  assert.ok(lastEmit);
  assert.strictEqual(lastEmit.event, 'qPeekChoose');
  assert.strictEqual(lastEmit.payload.position, 1);

  // 3. Receive peek card and trigger 3s countdown display
  UI.showQPeekDisplay({ r: 'K', s: '♦', color: 'red' }, 0);
  assert.ok(!modal.classList.contains('hidden'));
  assert.ok(modalBox.innerHTML.includes('modalCard'));
  assert.ok(modalBox.innerHTML.includes('peekTimer'));
  const peekTimerEl = document.getElementById('peekTimer');
  assert.strictEqual(peekTimerEl.textContent, '3');

  // 4. CRITICAL TEST: Server broadcasts state with stage 'start'.
  // UI.render() must NOT close or overwrite the active 3s peek modal!
  Store.s.stage = 'start';
  Store.s.qCount = 0;
  UI.render();

  assert.ok(!modal.classList.contains('hidden'), 'Peek modal must REMAIN visible when state broadcasts stage start');
  assert.ok(modalBox.innerHTML.includes('peekTimer'), 'Peek timer must NOT be destroyed by UI.render()');
  assert.strictEqual(Store.isPeeking, true);

  // Calling closeModalIfAutoFlow directly must also not close the modal while isPeeking is true
  UI.closeModalIfAutoFlow();
  assert.ok(!modal.classList.contains('hidden'), 'closeModalIfAutoFlow must NOT close active peek display');

  // Clean up interval timer
  if (UI._peekInterval) {
    clearInterval(UI._peekInterval);
    UI._peekInterval = null;
  }
});
