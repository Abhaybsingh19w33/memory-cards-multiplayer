# Socket.IO API & Real-Time Event Catalog

This document defines the complete real-time messaging contract between the client and server.

---

## 1. Client-to-Server Events

### `join`
Requests to join or create a game room.
- **Payload**:
  ```json
  {
    "roomCode": "FRIDAY",
    "name": "Alice"
  }
  ```
- **Validation**:
  - `roomCode`: Upper-cased string, max 12 chars (defaults to `MAIN`).
  - `name`: Trimmed string, max 16 chars.
  - Room must be in `lobby` phase.
  - Name must be unique within the room (case-insensitive).

---

### `rejoin`
Reconnects a disconnected player to an existing room and hand.
- **Payload**:
  ```json
  {
    "roomCode": "FRIDAY",
    "token": "4a71d2b8-..."
  }
  ```
- **Validation**:
  - `roomCode` must match an active room.
  - `token` must match a player's private token in that room.

---

### `setCardsPerPlayer`
Configures the starting number of cards per hand (lobby phase only).
- **Payload**:
  ```json
  {
    "n": 5
  }
  ```
- **Validation**: Clamped to range `[3, 10]`.

---

### `startGame`
Transitions the room from `lobby` to `normal` phase and deals hands.
- **Payload**: None.
- **Validation**: Room must have at least 2 players.

---

### `draw`
Pulls the top card from the draw deck during the active player's turn.
- **Payload**: None.
- **Validation**: Must be player's turn, `stage === 'start'`, `!drawnThisTurn`.

---

### `discardDrawn`
Discards the newly drawn card immediately without adding it to hand.
- **Payload**: None.
- **Validation**: Must be player's turn, `stage === 'drawn'`, `drawn !== null`.

---

### `keepDrawn`
Inserts the drawn card into the player's hand at a chosen slot.
- **Payload**:
  ```json
  {
    "position": 2
  }
  ```
- **Validation**: Must be player's turn, `stage === 'drawn'`. Clamped to `[0, hand.length]`. Sets `turnDiscardStarted = true`.

---

### `matchSelected`
Submits one or more cards from hand to match against either:
1. The first card selected (if active player drew/inserted a card this turn).
2. The open discard pile card (if active player has not drawn yet, or if discarding out of turn).
- **Payload**:
  ```json
  {
    "positions": [0, 2]
  }
  ```
- **Validation**: Active gameplay phase (`normal` or `final`), valid array of player's hand indices. If active player, must not be in `drawn`, `qpower`, or `jpower` stages. Out-of-turn players may discard matching cards at any time.

---

### `qPeekChoose`
Selects one of the player's own face-down cards to inspect using Queen power.
- **Payload**:
  ```json
  {
    "position": 1
  }
  ```
- **Validation**: Must be player's turn, `stage === 'qpower'`, `qCount > 0`, valid index.

---

### `jSwapSkip`
Skips a Jack blind-swap action.
- **Payload**: None.
- **Validation**: Must be player's turn, `stage === 'jpower'`, `jCount > 0`.

---

### `jSwap`
Performs a blind swap between one of the player's cards and an opponent's card.
- **Payload**:
  ```json
  {
    "targetPid": "uuid-opponent",
    "ownPos": 1,
    "theirPos": 3
  }
  ```
- **Validation**: Must be player's turn, `stage === 'jpower'`, valid target player and positions.

---

### `arrangeMove`
Reorders cards within the player's own hand without flipping them.
- **Payload**:
  ```json
  {
    "from": 0,
    "to": 3
  }
  ```
- **Validation**: Active gameplay phase (`normal` or `final`), valid index bounds within player's own hand. Available to all players at all times.

---

### `callReveal`
Calls "Reveal!", entering the final round where all other players get one last turn.
- **Payload**: None.
- **Validation**: Must be player's turn, `stage === 'start'`.

---

### `next`
Ends the active turn and passes play to the next player.
- **Payload**: None.
- **Validation**: Must be player's turn, `stage === 'start'`.

---

### `playAgain`
Deals a fresh round with the same players after reaching the `reveal` screen.
- **Payload**: None.
- **Validation**: Room must be in `reveal` phase.

---

### `newGame`
Resets the room back to the lobby.
- **Payload**: None.

---

## 2. Server-to-Client Events

### `joined`
Confirms successful join or rejoin.
- **Channel**: Sent only to `io.to(player.pid)`.
- **Payload**:
  ```json
  {
    "pid": "c1f7...",
    "token": "4a71...",
    "roomCode": "FRIDAY",
    "name": "Alice"
  }
  ```

---

### `state`
Canonical public room state broadcasted to all room members.
- **Channel**: `io.to(room.code)`.
- **Payload**:
  ```json
  {
    "phase": "normal",
    "cardsPerPlayer": 5,
    "players": [
      { "pid": "...", "name": "Alice", "count": 5, "connected": true },
      { "pid": "...", "name": "Bob", "count": 4, "connected": true }
    ],
    "currentIndex": 0,
    "currentName": "Alice",
    "discardTop": { "r": "7", "s": "♦", "color": "red" },
    "deckCount": 94,
    "stage": "start",
    "drawnThisTurn": false,
    "qCount": 0,
    "jCount": 0,
    "finalActive": false,
    "log": ["Alice drew a card and slotted it into their hand."]
  }
  ```
  *(During `reveal` phase only, `hands` and `scores` are appended).*

---

### `yourDrawnCard`
Sends the face of the card drawn from the deck.
- **Channel**: `io.to(player.pid)`.
- **Payload**:
  ```json
  {
    "card": { "r": "Q", "s": "♥", "color": "red" }
  }
  ```

---

### `discardReveal`
Reports the results of a matching discard action.
- **Channel**: `io.to(player.pid)`.
- **Payload**:
  ```json
  {
    "cards": [{ "r": "7", "s": "♦", "color": "red" }],
    "wrongCount": 0,
    "penaltyCount": 0,
    "requiredRank": "7",
    "drewOrInserted": false
  }
  ```

---

### `yourQPeek`
Reveals a single face-down card to the player for Queen power.
- **Channel**: `io.to(player.pid)`.
- **Payload**:
  ```json
  {
    "position": 2,
    "card": { "r": "K", "s": "♥", "color": "red" },
    "remaining": 0
  }
  ```

---

### `errorMsg`
Non-blocking error feedback.
- **Channel**: `io.to(target)`.
- **Payload**:
  ```json
  {
    "message": "It's not your turn."
  }
  ```

