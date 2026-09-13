# Memory Cards — Multiplayer

A real-time, hidden-information multiplayer card game powered by **Node.js, Express, and Socket.IO** with a clean, responsive web frontend.

Each player's browser only ever receives their own hand over the network — opponents' cards are never sent to your device until the round concludes.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite
npm test

# 3. Start the server
npm start
```

The game server starts at `http://localhost:3000`. Open this URL across multiple browser windows or share your local IP with friends on the same Wi-Fi network.

---

## Playing the Game

1. **Join a Room**: Enter your name and a shared room code (e.g. `FRIDAY`).
2. **Configure & Start**: Once 2 or more players join, set the cards-per-player (3–10) and hit **Start Game**.
3. **Turn Actions**:
   - **Draw**: Tap the draw deck to pick a card, then choose to discard it or slot it into your hand.
   - **Matching Discard**: Select face-down cards you remember matching either the open card or your drawn card. Wrong guesses earn 2 penalty cards!
   - **Special Powers**:
     - **Queen (Q)**: Grants a private, timed peek at one of your face-down cards.
     - **Jack (J)**: Allows a blind swap of a card with an opponent (or skip).
   - **Arrange**: Re-order your hand slots freely to keep track of your cards.
4. **Endgame & Scoring**:
   - Call **Reveal** or reduce your hand to 0 cards to trigger the final round.
   - Points: **Red Kings (♥, ♦) = -2 pts**, **Black Kings (♠, ♣) = 13 pts**, **Aces = 1 pt**, **Numbers = face value**.
   - Lowest score wins the trophy 🏆!
5. **Play Again**: Click "Play Again" from the ranking modal to seamlessly deal a fresh round with the same players.

---

## Documentation Suite

Comprehensive technical documentation is available in the [`docs/`](file:///docs/) directory:

- 📐 **[System Architecture](docs/ARCHITECTURE.md)**: Modular design, subsystem breakdown, before vs after refactoring.
- 🌟 **[Golden Rules](docs/GOLDEN_RULES.md)**: Authoritative networking, non-destructive DOM rendering, and security principles.
- 🛠️ **[Bug Post-Mortem: Play Again Resolution](docs/BUG_POSTMORTEM_PLAY_AGAIN.md)**: Deep dive into the button failure bug, root cause, and architectural fix.
- 📡 **[Socket.IO API & Events Catalog](docs/API_AND_EVENTS.md)**: Complete reference of all client-server events and schemas.

### Gameplay Scenarios & Code Segments
- [Scenario 1: Lobby & Matchmaking](docs/scenarios/01_LOBBY_AND_MATCHMAKING.md)
- [Scenario 2: Deck & Card Mechanics](docs/scenarios/02_DECK_AND_CARD_MECHANICS.md)
- [Scenario 3: Turn Lifecycle & Drawing](docs/scenarios/03_TURN_LIFECYCLE_AND_DRAWING.md)
- [Scenario 4: Matching & Discard Rules](docs/scenarios/04_MATCHING_AND_DISCARD_RULES.md)
- [Scenario 5: Special Powers (Q & J)](docs/scenarios/05_SPECIAL_POWERS_Q_AND_J.md)
- [Scenario 6: Call Reveal & Scoring](docs/scenarios/06_CALL_REVEAL_AND_SCORING.md)
- [Scenario 7: Round Reset & Play Again](docs/scenarios/07_ROUND_RESET_AND_PLAY_AGAIN.md)
- [Scenario 8: Client UI Architecture & Synchronization](docs/scenarios/08_CLIENT_UI_AND_SYNCHRONIZATION.md)
