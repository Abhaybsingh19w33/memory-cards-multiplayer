# Scenario 9: 3-Player Gameplay, Turn Rings & Multi-Target Mechanics

## 1. Overview
In a 3-player game (e.g., Alice, Bob, and Charlie), game rules expand from simple head-to-head back-and-forth into circular turn rings, multi-target special powers, and isolated out-of-turn penalties.

---

## 2. Key 3-Player Architectural Invariants

### 2.1 Shoe Sizing & Card Distribution
- **Deck Shoe**: For $N \le 5$ players, the shoe uses exactly **2 decks (104 cards)**.
- **Dealt Cards**: At 5 cards each, 15 cards are dealt to players, plus 1 open face-up card on the discard pile (16 cards total removed from shoe), leaving 88 cards in the draw deck.

### 2.2 3-Way Circular Turn Ring
- Turn order advances deterministically: $\text{Seat 0 (Alice)} \to \text{Seat 1 (Bob)} \to \text{Seat 2 (Charlie)} \to \text{Seat 0 (Alice)}$.
- When Alice is active, drawing or turn-based actions by Bob and Charlie are rejected authoritative with `"It's not your turn."`.
- When Bob is active, Alice and Charlie are rejected.
- When Charlie is active, Alice and Bob are rejected.

### 2.3 Out-of-Turn Matching & Penalty Isolation
- Any inactive player (Bob or Charlie) may discard cards out-of-turn if they match the rank of the current open discard card.
- If Charlie attempts an incorrect guess out-of-turn, Charlie receives **2 penalty cards** added to his hand.
- Alice and Bob's hands remain completely untouched (penalty isolation).

### 2.4 Queen Power Peek Privacy
- When Bob discards a Queen, Bob enters the `'qpower'` stage.
- Bob chooses a face-down card from his hand to view with a **3-second countdown timer**.
- The card identity is transmitted **strictly** to Bob via `io.to(bob.pid).emit('yourQPeek')`.
- Alice and Charlie's clients receive zero card information; public room state continues hiding hand identities (`hands: undefined`).

### 2.5 Jack Power 3-Way Target Selection
- In a 2-player game, the swap target is implicit. In a 3-player game, the Jack power modal displays **all available opponents**:
  ```javascript
  for (const p of s.players) {
    if (p.pid === Store.me.pid) continue;
    // Renders button for Alice and button for Bob
  }
  ```
- When Charlie triggers Jack power, Charlie can choose Alice as target.
- Charlie and Alice swap designated cards blindly.
- Bob's cards and hand order are completely untouched.
- `jSwapNotice` event broadcasts to all 3 players: `"Charlie exchanged Card #1 with Alice's Card #1 using J power."`.

### 2.6 Call Reveal 3-Way Final Round
- When Alice calls Reveal:
  1. `room.phase = 'final'`, `room.finalCaller = alice.pid`.
  2. Bob receives 1 final turn.
  3. Charlie receives 1 final turn.
  4. Turn rotates back to Alice $\to$ `cp.pid === room.finalCaller`, triggering immediate transition to `phase: 'reveal'`.
- All hands are serialized face-up and scores are calculated for all 3 players.
- Final Ranking modal displays all 3 players ranked ascending by score with winner trophy (🏆).

### 2.7 "Play Again" 3-Player Re-Deal
- When Alice clicks **"Play Again (Same Players)"**:
  1. Server executes `GameEngine.dealNewRound(room)`.
  2. All 3 players retain their seat order, tokens, and connections.
  3. All 3 players receive fresh hands of `cardsPerPlayer`.
  4. All 3 client windows return to green felt table, closing modals.
  5. Action buttons (`#arrangeBtn`, `#discardSelBtn`, `#callBtn`, `#nextBtn`) are verified active and responsive in all 3 windows.

---

## 3. Automated & Headed 3-Player Test Suites

### 3.1 Headless Unit Test Suite
File: [`test/scenario_3_players.test.js`](file:///c:/Users/Abhay%20Singh/Desktop/Vamsee/Abhay/memory-cards-multiplayer/test/scenario_3_players.test.js)
```powershell
node --test test/scenario_3_players.test.js
```
Covers:
- **Scenario 1**: 3-Player Lobby setup, seating, custom cards per player, host PID.
- **Scenario 2**: 3-Way Turn Ring rotation & inactive player guarding.
- **Scenario 3**: Out-of-turn matching discards and penalty isolation.
- **Scenario 4**: Jack blind-swap across 3 players with specific target selection.
- **Scenario 5**: Queen peek channel secrecy among 3 players.
- **Scenario 6**: Call reveal final round rotation across all 3 players.
- **Scenario 7**: 0-card hand trigger with full 3-player circle countdown.
- **Scenario 8**: Mid-game reconnection for Player 2 (Bob) preserving seat & hand.
- **Scenario 9**: Play Again complete state reset for 3 players.
- **Scenario 10**: Socket protocol integration across 3 separate sockets.

### 3.2 Visual Triple-Window Headed Test Suite
File: [`test/headed_suite_3_players.js`](file:///c:/Users/Abhay%20Singh/Desktop/Vamsee/Abhay/memory-cards-multiplayer/test/headed_suite_3_players.js)
```powershell
npm run test:headed:3p
```
Spawns 3 side-by-side browser windows across your screen:
- **Left Window**: Player 1 (Alice)
- **Middle Window**: Player 2 (Bob)
- **Right Window**: Player 3 (Charlie)
Runs through real-time lobby joins, dealing, slotting, Q-peek countdown, 3-way Jack blind swap, Call Reveal crimson red transition, and Play Again re-dealing.

