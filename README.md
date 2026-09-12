# Memory Cards — Multiplayer

A real backend (Node.js + Express + Socket.IO). Each player's browser only ever
receives their own hand over the network — other players' cards are never
sent to your device at all, so this is genuinely hidden, not just hidden by
convention.

## Run it (needs Node.js installed — nodejs.org)

```
npm install
npm start
```

This starts the server on `http://localhost:3000`. On your own laptop, open
that URL in a browser and it works immediately for anyone else on the same
Wi-Fi (they'd use your laptop's local IP instead of `localhost`, e.g.
`http://192.168.1.23:3000`).

## Making it reachable by friends elsewhere tonight

Easiest zero-signup option — in a second terminal, while the server is running:

```
npx localtunnel --port 3000
```

This prints a public URL like `https://short-word-123.loca.lt`. Send that link
to your friends. First-time visitors will see a small interstitial page from
localtunnel — they just click "Click to Continue" and land in the game.

(Alternative if that ever acts up: `npx ngrok http 3000`, which requires a
free ngrok account and auth token but tends to be more stable.)

Keep both terminal windows open for the whole game — closing either one ends
the session for everyone.

## Playing

1. Everyone opens the link and enters their name plus the **same room code**
   (any word works, e.g. `FRIDAY`) to land in the same game.
2. Once 2+ people have joined, whoever's there can set cards-per-player and
   hit **Start Game**.
3. Everything else — drawing, J/Q powers, penalties, Call/Reveal, Arrange —
   works exactly like the single-device version, just over the network.

## Notes

- If someone's phone locks or loses signal mid-game, reopening the same link
  automatically reconnects them to their same seat and hand (their browser
  remembers a private token in local storage).
- "New Game" resets the whole room back to the lobby for everyone.
- "Play Again" (from the ranking screen) re-deals a fresh round with the same
  players, no need to re-enter names.
