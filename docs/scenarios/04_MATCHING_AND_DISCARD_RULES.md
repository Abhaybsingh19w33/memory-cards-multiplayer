# Scenario 4: Matching & Discard Rules

## 1. Overview
Memory Cards allows players to reduce their hand size by discarding cards that match a required rank. The rank requirement depends on whether the player drew/inserted a card this turn or is playing against the open discard pile.

Crucially, **the Arrange and Discard selected buttons are available to all players at all times** during active play (`normal` and `final` phases). This enables both in-turn plays and out-of-turn "slap-down" matching discards across all seats.

---

## 2. Discard Modes

```mermaid
flowchart TD
    Submit["Player (Active or Inactive) submits card positions: [i0, i1, ...]"] --> CheckTurn{"room.isMyTurn(pid) && room.turnDiscardStarted == true?"}

    CheckTurn -- "YES (Active player drew & inserted card)" --> SetTargetFirst["Required Rank = Rank of FIRST selected card: hand[indices[0]].r"]
    CheckTurn -- "NO (Out-of-turn or active player before drawing)" --> SetTargetOpen["Required Rank = Rank of TOP OPEN discard card: openCard.r"]

    SetTargetFirst --> Evaluate["Iterate each selected card: Does card.r == requiredRank?"]
    SetTargetOpen --> Evaluate

    Evaluate --> Partition["Split into Correct [] and Wrong []"]
    Partition --> MoveDiscard["Remove ALL selected cards from hand -> Push to room.discard"]
    MoveDiscard --> CheckPenalties{"wrong.length > 0?"}

    CheckPenalties -- Yes --> DrawPenalties["For each wrong card: Draw 2 penalty cards from deck -> Add to player hand"]
    CheckPenalties -- No --> CheckActivePowers
    DrawPenalties --> CheckActivePowers{"room.isMyTurn(pid)?"}
    CheckActivePowers -- Yes --> QueuePowers["Queue Q and J powers for active player"]
    CheckActivePowers -- No --> CheckZeroHand
    QueuePowers --> CheckZeroHand["Check if player hand length == 0 (Trigger zero countdown)"]
    CheckZeroHand --> Broadcast["Emit 'discardReveal' to player & broadcast updated state to room"]
```

---

## 3. Out-of-Turn Discards ("Slap-Down Matching")

Any player at the table may discard one or more cards out of turn, provided the cards match the open discard card:
- **Scenario Example**:
  - Player 2 takes their turn and discards a **4**.
  - The open card on the discard pile is now **4**.
  - Player 5 (inactive) holds a 4 in hand. Player 5 selects card 4 and clicks **Discard selected**.
  - Player 5's 4 is discarded to the pile, reducing Player 5's hand by 1 card.
  - Player 4 (inactive) also holds a 4 in hand. Player 4 now selects their 4 and clicks **Discard selected**.
  - Player 4's 4 is discarded to the pile, reducing Player 4's hand by 1 card.
  - Turn rotation remains uninterrupted: Player 2 remains the active player until they press **Next ▶**.

---

## 4. Mathematical Rules for Penalties

1. **Selected Cards are Always Discarded**:
   Regardless of whether a selected card was correct or wrong, it is removed from the player's hand and placed face-up onto the discard pile.
2. **Penalty Formula**:
   $$\text{Penalty Cards Drawn} = 2 \times N_{\text{wrong}}$$
3. **Net Hand Change**:
   $$\Delta \text{Hand Size} = - N_{\text{correct}} + N_{\text{wrong}}$$
   - If a player guesses 1 correct card and 0 wrong cards: Hand decreases by 1 ($\Delta = -1$).
   - If a player guesses 0 correct and 1 wrong card: 1 card discarded, 2 penalty cards added $\implies$ Hand increases by 1 ($\Delta = +1$).
   - If a player guesses 1 correct and 1 wrong card: 2 cards discarded, 2 penalty cards added $\implies$ Hand size stays identical ($\Delta = 0$), but cards are randomized.

---

## 5. Multi-Card Discards
A player can select **multiple cards at once** (e.g. they remember that card 1, card 3, and card 5 are all 8s).
- If all three are 8s, all three are discarded, reducing the player's hand by 3 cards in a single move!
- If two are 8s and one was mistakenly a 9, the two 8s and the 9 are discarded, and 2 penalty cards are drawn, resulting in a net reduction of 1 card.

---

## 6. Implementation Safeguards
Implemented in `src/services/GameEngine.js` (`matchSelected`):
```javascript
// Remove cards in descending index order to avoid index shift corruption:
for (let k = indices.length - 1; k >= 0; k--) {
  const removedCard = player.hand.splice(indices[k], 1)[0];
  room.discard.push(removedCard);
}
```
- Deduplicates incoming index arrays (`[...new Set(positions)]`).
- Rejects out-of-bounds or non-integer indices.
- Validates that at least one valid card is selected.
- Triggers `checkZero(room, player)` when any player (in-turn or out-of-turn) reaches 0 cards.
