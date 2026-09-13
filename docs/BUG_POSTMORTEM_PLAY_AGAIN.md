# Post-Mortem: "Play Again" Button Failure & UI Control Lock

## 1. Executive Summary

| Attribute | Details |
| :--- | :--- |
| **Issue** | After completing a round and viewing the ranking screen, clicking **"Play Again (Same Players)"** transitioned to a new round, but all interactive buttons (Arrange, Discard selected, Call/Reveal, Next) were missing or unclickable. |
| **Severity** | High (Game loop broken on round restart, forcing manual page refresh). |
| **Status** | **RESOLVED** via Code Restructuring and Non-Destructive View Rendering. |
| **Impacted Files** | `public/index.html` (Legacy line 393 and line 223), `server.js` (State reset). |
| **Resolved In** | `public/js/ui.js`, `public/js/state.js`, `public/index.html`, `src/services/GameEngine.js`. |

---

## 2. Reported Symptoms

1. Players play a round until someone calls Reveal or goes down to 0 cards.
2. The game transitions to the `reveal` phase where all hands are displayed.
3. The user clicks **"Next — Show Ranking ▶"**, which opens the Final Ranking modal.
4. The user clicks **"Play Again (Same Players)"**.
5. The server correctly deals a fresh round of cards and broadcasts `phase: 'normal'`.
6. The client screens show the new game table, but:
   - The gameplay action buttons (**Arrange**, **Discard selected**, **Call / Reveal**, **Next ▶**) are missing or unresponsive.
   - The user cannot click buttons to interact with the game.
   - The ranking button remains visible or buttons are completely broken.

---

## 3. Root Cause Analysis

### 3.1 The Destructive DOM Mutation in `renderReveal()`
In the legacy `public/index.html` (lines 96–101), the action buttons were statically defined in the markup:

```html
<div class="controls">
  <button class="secondary" id="arrangeBtn" onclick="openArrange()">Arrange</button>
  <button class="secondary" id="discardSelBtn" onclick="submitMatch()">Discard selected</button>
  <button class="gold" id="callBtn" onclick="socket.emit('callReveal')">Call / Reveal</button>
  <button class="primary" id="nextBtn" onclick="socket.emit('next')">Next ▶</button>
</div>
```

When the game ended and entered `phase: 'reveal'`, the client ran `renderReveal()` (legacy line 392–394):

```javascript
// LEGACY CODE IN index.html
function renderReveal(){
  ...
  const controls = document.querySelector('.controls');
  controls.innerHTML = `<button class="gold" style="width:100%" onclick="showRanking()">Next — Show Ranking ▶</button>`;
}
```

> [!CAUTION]
> **This line permanently destroyed the DOM elements** `#arrangeBtn`, `#discardSelBtn`, `#callBtn`, and `#nextBtn`.

### 3.2 The Unhandled JavaScript Exception During New Round Render
When the user subsequently clicked "Play Again":
1. `socket.emit('playAgain')` sent the event to the server.
2. The server called `dealNewRound(room)` and broadcasted `phase: 'normal'`.
3. The client received the `'state'` event and triggered `render()`.
4. Inside `render()` (legacy lines 223–226):

```javascript
// LEGACY CODE IN index.html
$('discardSelBtn').disabled = !mine || s.stage!=='start'; // <-- NULL REFERENCE!
$('callBtn').disabled = !mine || s.stage!=='start';
$('nextBtn').disabled = !mine || s.stage!=='start';
$('arrangeBtn').disabled = !mine;
```

5. Because `controls.innerHTML` was replaced in step 3.1, `$('discardSelBtn')` returned `null`.
6. Evaluating `null.disabled = ...` immediately threw an unhandled runtime error:
   ```
   Uncaught TypeError: Cannot set properties of null (setting 'disabled')
       at render (index.html:223)
       at Socket.<anonymous> (index.html:158)
   ```
7. **Catastrophic Failure**:
   - The uncaught `TypeError` halted execution of the `render()` function mid-way.
   - The remaining code to populate hands, setup hints, reset modals, and attach listeners was aborted.
   - The `.controls` container was left containing only the "Show Ranking" button from the previous round, or was completely non-functional.
   - The player could not click any gameplay buttons!

---

## 4. The Solution: Architectural Redesign

To resolve this issue permanently and adhere to the **Golden Rules of Non-Destructive Rendering**:

### 4.1 Permanent Control Group Containers
In the restructured `public/index.html`, control buttons are divided into two dedicated, permanent containers:

```html
<div id="controlsContainer" class="controls-container">
  <!-- Gameplay buttons are NEVER destroyed -->
  <div id="gameplayControls" class="controls">
    <button class="secondary" id="arrangeBtn" onclick="UI.openArrange()">Arrange</button>
    <button class="secondary" id="discardSelBtn" onclick="UI.submitMatch()">Discard selected</button>
    <button class="gold" id="callBtn" onclick="SocketClient.emit('callReveal')">Call / Reveal</button>
    <button class="primary" id="nextBtn" onclick="SocketClient.emit('next')">Next ▶</button>
  </div>

  <!-- Reveal buttons are in a separate container -->
  <div id="revealControls" class="controls hidden">
    <button class="gold" id="showRankingBtn" style="width:100%" onclick="UI.showRanking()">Next — Show Ranking ▶</button>
  </div>
</div>
```

### 4.2 Non-Destructive Visibility Toggling in `UI.renderControls()`
In `public/js/ui.js`, switching between gameplay and reveal phases is done cleanly using CSS classes without touching `.innerHTML`:

```javascript
renderControls(s) {
  const mine = Store.isMyTurn();
  const isStartStage = s.stage === UI_STAGES.START;

  const gameplayControls = this.$('gameplayControls');
  const revealControls = this.$('revealControls');

  // Toggle visibility cleanly
  if (gameplayControls) gameplayControls.classList.remove('hidden');
  if (revealControls) revealControls.classList.add('hidden');

  // Safely update button disabled states
  const discardSelBtn = this.$('discardSelBtn');
  const callBtn = this.$('callBtn');
  const nextBtn = this.$('nextBtn');
  const arrangeBtn = this.$('arrangeBtn');

  if (discardSelBtn) discardSelBtn.disabled = !mine || !isStartStage;
  if (callBtn) callBtn.disabled = !mine || !isStartStage;
  if (nextBtn) nextBtn.disabled = !mine || !isStartStage;
  if (arrangeBtn) arrangeBtn.disabled = !mine;
}
```

### 4.3 Automated Phase Transition & State Cleanup
In `UI.render()`:
```javascript
// Automatically detect transition from REVEAL -> NORMAL
if (this.previousPhase === UI_PHASES.REVEAL && s.phase === UI_PHASES.NORMAL) {
  Store.resetRoundClientState(); // clears selections and auto-modals
  this.closeModal();             // closes the ranking modal
}
this.previousPhase = s.phase;
```

---

## 5. Verification & Testing

1. **Automated Unit Test (`test/gameEngine.test.js` - "Play Again Round Reset")**:
   - Simulates a completed round entering `REVEAL`.
   - Invokes `GameEngine.dealNewRound(room)`.
   - Asserts that all room flags (`phase`, `stage`, `drawnThisTurn`, `qCount`, `jCount`, `zeroPlayer`, `finalCaller`) are reset and player hands are re-dealt.
2. **Automated Socket Integration Test (`test/socketHandlers.test.js` - "Full Game Lifecycle & Play Again Integration")**:
   - Simulates 2 players joining and starting the game.
   - Simulates round completion and `socket.emit('playAgain')`.
   - Asserts that the broadcast state has `phase: 'normal'` and hands are securely hidden.
3. **Frontend Syntax & DOM Contract**:
   - Verified that `#discardSelBtn`, `#callBtn`, `#nextBtn`, `#arrangeBtn` are never `null`.
   - Zero runtime exceptions on round re-deals.

