# The Golden Rules of Memory Cards Multiplayer

The codebase adheres strictly to these fundamental architectural and software engineering principles. Any future enhancements or modifications must follow these golden rules.

---

## 1. Authoritative Server & Zero-Trust Client

> [!IMPORTANT]
> **Never send hidden information over the wire until the game is officially over.**

1. **Client Never Dictates Truth**: Clients submit *intentions* (`draw`, `matchSelected`, `qPeekChoose`, `jSwap`, `callReveal`). The server evaluates whether the player is allowed to perform that action, computes the result, updates the canonical room state, and broadcasts the public state.
2. **Hidden Hand Security**:
   - A player's private hand is only ever sent to that player's private socket room (`io.to(player.pid)`).
   - Other players receive only the *count* of cards (`p.count`).
   - Private card data is stripped using `toPublicCard()` during broadcast.
   - Hand contents are ONLY serialized to all players when `room.phase === 'reveal'`.
3. **Card Uniqueness**: Every card generated receives a `crypto.randomUUID()` to prevent duplicated card injection or tampering.

---

## 2. Non-Destructive DOM Rendering

> [!CAUTION]
> **Never destroy permanent DOM buttons or control containers using `.innerHTML` overwrites.**

1. **Persistent Control Layout**: Control buttons (`#arrangeBtn`, `#discardSelBtn`, `#callBtn`, `#nextBtn`) must remain permanently anchored in the DOM tree.
2. **State-Driven Display**: Transition between gameplay controls and endgame reveal controls using semantic container visibility (e.g. adding or removing `.hidden` class) rather than wiping out and recreating DOM nodes.
3. **No Dangling References**: Event listeners and query selectors (`document.getElementById(...)`) must always resolve to valid DOM elements across all phases (`lobby`, `normal`, `final`, `reveal`).

---

## 3. Single Responsibility Principle (SRP)

> [!TIP]
> **Every module, class, and file has one single reason to change.**

1. **Models (`src/models/`)**: Pure entity containers (`Card`, `Deck`, `Player`, `Room`). They define data structures, serialization formats, and basic collection operations without knowing about Express, WebSockets, or UI.
2. **Game Engine (`src/services/GameEngine.js`)**: Pure business logic and rule evaluations. Free from socket or transport dependencies; fully testable in isolation.
3. **Socket Handlers (`src/sockets/socketHandlers.js`)**: Focuses exclusively on network transport, protocol negotiation, session/token management, and dispatching.
4. **Client Modules (`public/js/`)**:
   - `state.js`: Stores client data and handles `localStorage` persistence.
   - `ui.js`: DOM manipulation, modal presentation, and HTML sanitization.
   - `socketClient.js`: Real-time network transport.
   - `app.js`: Top-level initialization and user input event dispatching.

---

## 4. Deterministic State Machine

1. **Explicit Phase Transitions**:
   $$\text{lobby} \longrightarrow \text{normal} \longrightarrow \text{final} \longrightarrow \text{reveal}$$
2. **Explicit Turn Stages**:
   $$\text{start} \longrightarrow \text{drawn} \longrightarrow \text{qpower} \longrightarrow \text{jpower} \longrightarrow \text{start}$$
3. **Atomic Turn Advance**: When a player completes their turn (`advanceTurn`), turn-specific temporary variables (`drawn`, `drawnThisTurn`, `turnDiscardStarted`, `stage`) are reset atomically.

---

## 5. Defensive Programming & Strict Boundary Checking

1. **Bound Validation**: All card index inputs from clients are sanitized using `Math.max(0, Math.min(maxIndex, parseInt(pos, 10)))`.
2. **Array De-duplication**: Indices in `matchSelected` are de-duplicated using `[...new Set(positions)]` and sorted numerically in descending order when splicing from hands to prevent index shift errors.
3. **Empty Deck Reshuffling**: When the draw pile runs out of cards, the discard pile is automatically reshuffled into the deck while leaving the top face-up card intact on the discard pile.
4. **Safe Navigation**: Never assume objects or arrays exist without validation guards.

---

## 6. Resilient Session Reconnection

1. **Private Reconnection Token**: When a player joins a room, a unique cryptographically secure token is assigned and stored in the browser's `localStorage`.
2. **Seamless Recovery**: If a player's device locks, loses Wi-Fi, or refreshes the page, the client automatically submits `rejoin` with the cached token, immediately re-attaching the player to their exact seat and hand.
3. **Non-destructive Disconnects**: When a player disconnects, their seat and cards are preserved, marked as `connected: false`, and an audit log entry notifies the table.

---

## 7. Comprehensive Audit Logging & Feedback

1. **Room Audit Log**: Every meaningful game event (drawing, keeping, discarding, penalties, powers, calls, disconnects) is pushed to `room.log`.
2. **Ephemeral Error Banners**: Client errors (e.g. wrong turn, missing selection) are displayed using a non-blocking toast banner with an auto-dismiss timer.
3. **XSS Sanitization**: All user-supplied strings (player names, room codes) are escaped using `esc()` before insertion into DOM trees.

