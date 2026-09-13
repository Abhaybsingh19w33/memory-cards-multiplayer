# Testing, Scenarios & Permutations Reference Guide

This document serves as the comprehensive testing specification and regression safety catalog for the **Memory Cards Multiplayer** game. It documents all 92 automated test suites, covering every scenario, edge case, mathematical permutation, boundary condition, and architectural invariant.
This document serves as the comprehensive testing specification and regression safety catalog for the **Memory Cards Multiplayer** game. It documents all 111 automated test suites, covering every scenario, edge case, mathematical permutation, boundary condition, and architectural invariant across 2-player and 3-player configurations.

---

## 1. Test Suite Architecture Overview

The testing suite is built natively on Node.js's test runner (`node:test` and `node:assert`) with **zero external dependencies** required for headless testing. A full side-by-side headed Playwright runner is also provided for visual verification.
The testing suite is built natively on Node.js's test runner (`node:test` and `node:assert`) with **zero external dependencies** required for headless testing. Dual-window and triple-window side-by-side headed Playwright runners are also provided for visual verification.

```
test/
├── gameEngine.test.js                              # Core engine unit tests
├── headed_suite.js                                 # Headed side-by-side browser tests
├── headed_suite.js                                 # Headed side-by-side browser tests (2 Players: Alice & Bob)
├── headed_suite_3_players.js                       # Headed 3-window browser tests (3 Players: Alice, Bob & Charlie)
├── scenario_01_lobby.test.js                       # Scenario 1 base tests
├── scenario_01_lobby_permutations.test.js          # Scenario 1 exhaustive permutation matrix
├── scenario_02_deck_cards.test.js                  # Scenario 2 base tests
├── scenario_02_deck_permutations.test.js           # Scenario 2 exhaustive card & shoe permutations
├── scenario_03_turn_lifecycle.test.js              # Scenario 3 base tests
├── scenario_03_turn_permutations.test.js           # Scenario 3 turn state machine & slot permutations
├── scenario_04_matching_discard.test.js            # Scenario 4 base tests
├── scenario_04_matching_permutations.test.js       # Scenario 4 Mode 1 & Mode 2 matching combinations
├── scenario_05_powers.test.js                      # Scenario 5 base tests
├── scenario_05_powers_permutations.test.js         # Scenario 5 Q & J power queue permutations
├── scenario_06_scoring_endgame.test.js             # Scenario 6 base tests
├── scenario_06_scoring_permutations.test.js        # Scenario 6 endgame rotation & score permutations
├── scenario_07_round_reset_play_again.test.js      # Scenario 7 base tests
├── scenario_07_play_again_permutations.test.js     # Scenario 7 field-by-field reset & round cycle tests
├── scenario_08_client_ui.test.js                   # Scenario 8 base tests (JSDOM)
├── scenario_08_client_ui_permutations.test.js      # Scenario 8 button states, DOM & XSS matrix
├── scenario_3_players.test.js                      # Scenario 1–10 exhaustive 3-player verification suite
├── socketHandlers.test.js                          # Base socket lifecycle integration tests
└── socket_handlers_permutations.test.js            # Socket event isolation & channel privacy matrix
```

---

## 2. Comprehensive Scenarios & Permutation Matrix

### Scenario 1: Lobby, Matchmaking & Session Reconnection

| Category | Input / Condition | Tested Invariant / Expected Behavior |
| :--- | :--- | :--- |
| **Room Code Normalization** | Empty string, `null`, `undefined`, whitespace | Defaults cleanly to `'MAIN'`. |
| | Mixed-case & whitespace (e.g. `'  poker  '`) | Trimmed and uppercased to `'POKER'`. |
| | Code length $> 12$ chars | Truncated to exactly 12 characters (`slice(0, 12)`). |
| **Player Name Normalization** | Empty string, `null`, whitespace | Defaults to `'Player'`. |
| | Name length $> 16$ chars | Truncated to exactly 16 characters. |
| | Duplicate names (case variations: `'Alice'`, `'alice'`, `' ALICE '`) | Case-insensitively blocked; second player receives error toast. |
| **Reconnection Token Matrix** | Valid token across `lobby`, `normal`, `final`, `reveal` | Restores exact seat, reconnects socket channels, marks `connected: true`. |
| | Nonexistent room code | Denied with `"That room no longer exists."` |
| | Invalid / expired token | Denied with `"Could not find your seat in that room."` |
| **Cards Per Player Adjustment** | Value $< 3$ (e.g. $-10, 1, 2$) | Clamped to minimum $3$. |
| | Value $0$ | Evaluates via `0 \|\| 5` to default $5$. |
| | Value $3 \dots 10$ | Configured to exact value. |
| | Value $> 10$ (e.g. $11, 50$) | Clamped to maximum $10$. |
| | Non-number (`'NaN'`, `'abc'`, `null`) | Falls back to default $5$. |
| | Adjustment during active game (`phase !== 'lobby'`) | Safely ignored. |
| **Game Start Constraints** | $0$ or $1$ player | Blocked with `"Need at least 2 players."` |
| | $\ge 2$ players | Successfully starts game, deals cards, phase becomes `normal`. |
| | Joining an active game | Blocked with `"This game already started. Ask for a new room code."` |

---

### Scenario 2: Deck, Card Valuation & Hidden Hand Secrecy

| Category | Permutations Tested | Invariant / Formula |
| :--- | :--- | :--- |
| **Card Valuation Matrix** | All 52 standard card ranks and suits | • **Red King ($\heartsuit, \diamondsuit$)**: $-2$ pts<br>• **Black King ($\spadesuit, \clubsuit$)**: $+13$ pts<br>• **Queens**: $+12$ pts<br>• **Jacks**: $+11$ pts<br>• **Numbers $2 \dots 10$**: Face value ($2 \dots 10$ pts)<br>• **Aces**: $+1$ pt |
| **Shoe Scaling Matrix** | $N \le 5$ players | Exactly 2 decks ($104$ cards, $8$ of each rank). |
| | $N > 5$ players | Exactly 3 decks ($156$ cards, $12$ of each rank). |
| **Cryptographic Uniqueness** | 1,000 generated cards | Zero UUID collisions; every card receives distinct `crypto.randomUUID()`. |
| **Discard Pile Reshuffle** | Empty deck + empty discard | Returns `null`. |
| | Empty deck + 1 card in discard | Returns `null`; preserves top face-up open card on discard. |
| | Empty deck + 2 cards in discard | Shuffles 1 card into deck, draws it, keeps top open card on discard pile. |
| | Empty deck + $K$ cards in discard | Shuffles $K-1$ cards into deck, draws 1 card, preserves top open card, logs event. |
| **Information Privacy** | Non-reveal phases (`lobby`, `normal`, `final`) | Public state strictly omits `hands` and `scores`. Player model serializes only count (`p.count`). Card UID stripped. |
| | Reveal phase (`reveal`) | Public state computes and reveals `hands` and `scores`. |

---

### Scenario 3: Turn Lifecycle, Drawing & Advancing

| Action | Stage / Condition | Result |
| :--- | :--- | :--- |
| **`draw`** | Active player, `stage === 'start'`, `!drawnThisTurn` | Success $\to$ card popped into `room.drawn`, `stage: 'drawn'`, `drawnThisTurn: true`. |
| | Inactive player | Blocked $\to$ `"It's not your turn."` |
| | Second draw in same turn | Blocked $\to$ `"You can only draw once per turn."` |
| | During `drawn`, `qpower`, or `jpower` | Blocked $\to$ `"Finish your current action first."` |
| | Depleted deck and discard | Blocked $\to$ `"No cards left to draw."` |
| **`keepDrawn`** | Slot $0$ (front of hand) | Inserts at index $0$, `hand.length + 1`, `turnDiscardStarted = true`, `stage = 'start'`. |
| | Slot middle (e.g. index $1, 2$) | Inserts at chosen index. |
| | Slot end (index $\text{hand.length}$) | Appends to end of hand. |
| | Slot negative or out of bounds | Clamped safely between $0$ and $\text{hand.length}$. |
| | `room.drawn === null` or stage $\ne$ `drawn` | Blocked $\to$ `"Nothing to place."` |
| **`discardDrawn`** | Number card (non-power) | Moves to discard pile, `stage = 'start'`. |
| | Queen ($Q$) | Moves to discard, `stage = 'qpower'`, `room.qCount = 1`. |
| | Jack ($J$) | Moves to discard, `stage = 'jpower'`, `room.jCount = 1`. |
| | `room.drawn === null` | Blocked $\to$ `"Nothing to discard."` |
| **`advanceTurn`** | Multi-player rotations ($2, 3, 5$ players) | `currentIndex = (currentIndex + 1) % players.length`. Atomic reset of `drawn`, `drawnThisTurn`, `turnDiscardStarted`, `stage`. |
| | Reaching `finalCaller` or `zeroPlayer` | Automatically triggers `revealAll(room)` ($\text{phase} = \text{'reveal'}$). |
| **`arrangeMove`** | Own hand, valid `from` and `to` indices | Slices and re-inserts without modifying card identities or leaking faces. |
| | Out-of-bounds indices or wrong player | Blocked safely. |

---

### Scenario 4: Matching, Discard Rules & Penalties

#### Mode 1: Discarding Without Drawing (`turnDiscardStarted === false`)
Matches against the current top open card on the discard pile (`room.getOpenCard().r`).

$$\Delta \text{Hand Size} = - N_{\text{correct}} + N_{\text{wrong}}$$

$$\text{Penalty Cards Added} = 2 \times N_{\text{wrong}}$$

| Selected Cards | Target Rank | Correct | Wrong | Penalties | $\Delta \text{Hand Size}$ |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `['7']` | `'7'` | 1 | 0 | 0 | $-1$ |
| `['9']` | `'7'` | 0 | 1 | 2 | $+1$ |
| `['7', '7']` | `'7'` | 2 | 0 | 0 | $-2$ |
| `['9', '8']` | `'7'` | 0 | 2 | 4 | $+2$ |
| `['7', '9']` | `'7'` | 1 | 1 | 2 | $0$ |
| `['7', '7', '9']` | `'7'` | 2 | 1 | 2 | $-1$ |
| `['7', '8', '9']` | `'7'` | 1 | 2 | 4 | $+1$ |
| `['7', '7', '7', '7']` | `'7'` | 4 | 0 | 0 | $-4$ |

#### Mode 2: Discarding After Drawing/Inserting (`turnDiscardStarted === true`)
Target rank is determined **strictly by the FIRST card selected** (`player.hand[indices[0]].r`). The open discard card is completely ignored!

| Selected Cards | Effective Target Rank | Correct | Wrong | Penalties | Note |
| :---: | :---: | :---: | :---: | :---: | :--- |
| `['4']` | `'4'` | 1 | 0 | 0 | Always matches itself. |
| `['4', '4']` | `'4'` | 2 | 0 | 0 | Both share rank of first card. |
| `['4', '9']` | `'4'` | 1 | 1 | 2 | First correct, second wrong. |
| `['5', '9', '9']` | `'5'` | 1 | 2 | 4 | Card 0 establishes '5'; cards 1 and 2 are both wrong despite matching each other. |

#### Defensive Splicing & Zero Hand Invariant
- **Descending Index Removal**: Selected indices are sorted and spliced in descending order (`for (let k = indices.length - 1; k >= 0; k--)`) to prevent index shift corruption.
- **Index Deduplication**: Submissions such as `[0, 0, 0]` are deduplicated via `Set` to prevent duplicate removal.
- **Penalty Replenishment**: If penalty card draws deplete the draw deck, the discard pile is reshuffled mid-penalty.
- **Zero Card Trigger**: When a player reaches 0 cards, `room.zeroPlayer = pid` is set. If already set by a previous player, the original zero-player is preserved.

---

### Scenario 5: Special Powers (Queen Peek & Jack Blind-Swap)

| Power | State & Trigger | Mechanics & Rules |
| :--- | :--- | :--- |
| **Queen (Q) Peek** | `stage === 'qpower'`, `qCount > 0` | • Allows active player to peek at one of their own face-down cards.<br>• Decrements `room.qCount`.<br>• Emits `yourQPeek` exclusively to active player.<br>• If `qCount == 0` and `jCount > 0`, transitions directly to `'jpower'`.<br>• If `qCount == 0` and `jCount == 0`, transitions to `'start'`. |
| **Jack (J) Blind-Swap** | `stage === 'jpower'`, `jCount > 0` | • Blindly swaps `me.hand[ownPos]` with `target.hand[theirPos]`.<br>• Neither player sees the swapped card faces.<br>• Decrements `room.jCount`.<br>• Prevents swapping with oneself or invalid positions.<br>• When `jCount == 0`, transitions to `'start'`. |
| **Jack (J) Skip** | `stage === 'jpower'` | • Active player may skip swap via `jSwapSkip`.<br>• Decrements `room.jCount` without modifying hands. |
| **Precedence Flow** | Both Q and J discarded simultaneously | • Queens **always** resolve before Jacks.<br>• Precedence: $\text{QPOWER} \to \text{JPOWER} \to \text{START}$. |
| **Wrong Discard Powers** | Discarding wrong cards that happen to be Q or J | • Powers trigger whenever a Q or J lands in the discard pile, regardless of guess correctness. |

---

### Scenario 6: Call Reveal, Endgame Rotation & Scoring Formula

1. **Call Reveal Rotation**:
   - Calling Reveal sets `phase = 'final'` and `room.finalCaller = pid`.
   - Every other player receives exactly 1 final turn.
   - The game officially ends (`phase = 'reveal'`) the exact moment the turn rotates back to `finalCaller`.
2. **0-Card Hand Rotation**:
   - Emptying hand sets `room.zeroPlayer = pid`.
   - Normal play continues for other players until the turn rotates full circle back to `zeroPlayer`, triggering `revealAll(room)`.
3. **Scoring Combinations**:
   - **0-Card Hand**: Exactly $0$ points.
   - **Red Kings Only**: $4 \times (-2) = -8$ points (best possible winning score).
   - **Black Kings Only**: $4 \times 13 = 52$ points (worst penalty score).
   - **All Aces**: $5 \times 1 = 5$ points.
   - **Mixed Hands**: Evaluated accurately across positive and negative values.
   - **Winner Resolution**: Lowest score wins; handles ties gracefully.

---

### Scenario 7: Round Reset, "Play Again" & "New Game"

1. **Play Again (Same Players)**:
   - Resets state machine: `phase = 'normal'`, `stage = 'start'`, `currentIndex = 0`, `drawn = null`, `drawnThisTurn = false`, `turnDiscardStarted = false`, `qCount = 0`, `jCount = 0`, `zeroPlayer = null`, `finalCaller = null`.
   - Clears and re-deals fresh hands of size `cardsPerPlayer` for all retained players.
   - Preserves player identities, seats, tokens, and socket bindings across multiple consecutive rounds ($1 \to 2 \to 3$).
   - Calling `playAgain` during non-reveal phases is strictly blocked.
2. **New Game (Reset to Lobby)**:
   - Resets room to `phase = 'lobby'`, purges all players, clears logs.
   - Leaves room code immediately available for new joins.

---

### Scenario 8: Client UI, DOM Immutability & XSS Protection

1. **Non-Destructive DOM Guarantee**:
   - Action buttons (`#arrangeBtn`, `#discardSelBtn`, `#callBtn`, `#nextBtn`) remain permanently attached in the DOM and are never wiped by `.innerHTML` overwrites.
   - Swapping between gameplay and reveal is managed via `.hidden` class toggling.
2. **Button Disabled / Enabled Matrix**:
   - Buttons are enabled **only** when `Store.isMyTurn()` is true and `s.stage === 'start'`.
   - When not the player's turn or during intermediate stages (`drawn`, `qpower`, `jpower`), buttons are safely disabled.
3. **Modal Lifecycle & Auto-Dismissal**:
   - Universal `#modal` dialog manages drawn card, insert picker, Q-peek, J-swap, and ranking displays.
   - Auto-modal flow closes dialogs cleanly when stage returns to `'start'`.
4. **XSS Protection**:
   - `UI.esc()` sanitizes all user inputs (player names, room codes, chat/audit log entries) before insertion into the DOM tree.

---

### Scenario 9 & 10: 3-Player Specific Lifecycle, Ring Rotation & Privacy

| Category | Input / Condition | Tested Invariant / Expected Behavior |
| :--- | :--- | :--- |
| **3-Way Turn Ring** | Alice (0) $\to$ Bob (1) $\to$ Charlie (2) | Circular turn transition cleanly wraps back to Alice (0). Inactive players rejected on every turn. |
| **Out-of-Turn Discard & Penalties** | Multiple players throwing matching cards | Bob & Charlie can match discard out-of-turn. Wrong guess gives 2 penalty cards to offender only, preserving other players' hand sizes. |
| **Jack Power Targeting** | Charlie draws Jack and triggers swap | Target selection presents Alice and Bob. Charlie can swap with Alice; Alice receives Charlie's card, Charlie receives Alice's card, Bob's hand is untouched. `jSwapNotice` banner broadcasts to all 3 players. |
| **Queen Peek Isolation** | Bob peeks at face-down card with 3s timer | Card face and 3-second countdown are strictly isolated to Bob. Alice and Charlie receive zero card leakage and modals remain hidden. |
| **Call Reveal 3-Way Final Round** | Alice calls Reveal | Every other player (Bob, Charlie) receives exactly 1 final turn. Round concludes the moment turn returns to Alice. |
| **Play Again 3-Player Reset** | Alice requests Play Again | All 3 players re-dealt clean hands of `cardsPerPlayer`. All UI action buttons (Arrange, Discard, Call, Next) active and responsive across all 3 windows. |

---

## 3. Running the Tests

### Fast Headless Unit & Permutation Suite
Executes all 92 automated tests across all 10 test suites:
Executes all 111 automated tests across all 21 test suites:
```powershell
npm test
```

### Side-by-Side Headed Visual Browser Suite
Spawns dual browser windows (Alice on the left, Bob on the right) for visual inspection of real-time multiplayer interactions:
### 3-Player Specific Headless Test Suite
Executes all 10 scenarios specifically tailored for 3 players:
```powershell
node --test test/scenario_3_players.test.js
```

### Side-by-Side Headed Visual Browser Suite (2 Players: Alice & Bob)
Spawns dual browser windows side-by-side on your desktop:
```powershell
npm run test:headed
```

### Triple-Window Headed Visual Browser Suite (3 Players: Alice, Bob & Charlie)
Spawns 3 browser windows side-by-side across your desktop:
```powershell
npm run test:headed:3p
```

