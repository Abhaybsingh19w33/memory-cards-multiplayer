/**
 * @file GameEngine.js
 * @description Core game rules, validation, matching logic, penalty resolution, power queues, and turn progression.
 * Adheres to Golden Rules: Authoritative server, pure logic separated from sockets, defensive boundary checking.
 */

const { GAME_PHASES, TURN_STAGES } = require('../config/constants');
const { makeDeck, drawFromDeck } = require('../models/Deck');
const { toPublicCard } = require('../models/Card');

class GameEngine {
  /**
   * Initializes and deals a fresh round for all players in the room.
   * Completely resets round-specific variables and state machine flags.
   * 
   * @param {Room} room - The target room
   */
  static dealNewRound(room) {
    room.deck = makeDeck(room.players.length);
    room.discard = [];

    // Reset hands for all current players
    for (const player of room.players) {
      player.clearHand();
    }

    // Deal cardsPerPlayer to each player in round-robin fashion
    for (let round = 0; round < room.cardsPerPlayer; round++) {
      for (const player of room.players) {
        player.hand.push(room.deck.pop());
      }
    }

    // Turn over the first card to initialize the discard pile
    room.discard.push(room.deck.pop());

    // Reset game and turn state machine
    room.currentIndex = 0;
    room.phase = GAME_PHASES.NORMAL;
    room.stage = TURN_STAGES.START;
    room.drawn = null;
    room.drawnThisTurn = false;
    room.turnDiscardStarted = false;
    room.qCount = 0;
    room.jCount = 0;
    room.zeroPlayer = null;
    room.finalCaller = null;
  }

  /**
   * Draws a card from the deck for the current player's turn.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @returns {{ success: boolean, card?: object, error?: string }}
   */
  static draw(room, pid) {
    if (!room.isMyTurn(pid)) {
      return { success: false, error: "It's not your turn." };
    }
    if (room.stage !== TURN_STAGES.START) {
      return { success: false, error: 'Finish your current action first.' };
    }
    if (room.drawnThisTurn) {
      return { success: false, error: 'You can only draw once per turn.' };
    }

    const card = drawFromDeck(room);
    if (!card) {
      return { success: false, error: 'No cards left to draw.' };
    }

    room.drawn = card;
    room.drawnThisTurn = true;
    room.stage = TURN_STAGES.DRAWN;

    return { success: true, card };
  }

  /**
   * Discards the drawn card immediately onto the discard pile.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @returns {{ success: boolean, card?: object, error?: string }}
   */
  static discardDrawn(room, pid) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.DRAWN || !room.drawn) {
      return { success: false, error: 'Nothing to discard.' };
    }

    const card = room.drawn;
    room.discard.push(card);
    room.drawn = null;

    room.addLog(`${room.currentPlayer().name} drew and discarded a card.`);
    this.queuePowersForCards(room, [card]);

    return { success: true, card };
  }

  /**
   * Inserts the drawn card into the player's hand at the specified position.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @param {number} position 
   * @returns {{ success: boolean, error?: string }}
   */
  static keepDrawn(room, pid, position) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.DRAWN || !room.drawn) {
      return { success: false, error: 'Nothing to place.' };
    }

    const player = room.currentPlayer();
    const idx = Math.max(0, Math.min(player.hand.length, parseInt(position, 10) || 0));

    player.hand.splice(idx, 0, room.drawn);
    room.drawn = null;
    room.turnDiscardStarted = true;
    room.stage = TURN_STAGES.START;

    room.addLog(`${player.name} drew a card and slotted it into their hand.`);
    return { success: true };
  }

  /**
   * Executes a matching discard action for selected hand positions.
   * Handles both:
   * 1. Turn discard after drawing/inserting (first card establishes target rank).
   * 2. Matching discard without drawing or out of turn (matches against current open discard card).
   * Calculates correct matches, wrong guesses, and applies 2 penalty cards per wrong guess.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @param {number[]} positions 
   * @returns {{ success: boolean, result?: object, error?: string }}
   */
  static matchSelected(room, pid, positions) {
    if (room.phase !== GAME_PHASES.NORMAL && room.phase !== GAME_PHASES.FINAL) {
      return { success: false, error: 'You cannot do that right now.' };
    }

    const player = room.findPlayer(pid);
    if (!player) {
      return { success: false, error: 'You cannot do that right now.' };
    }

    const isMyTurn = room.isMyTurn(pid);
    if (isMyTurn && room.stage !== TURN_STAGES.START) {
      return { success: false, error: 'You cannot do that right now.' };
    }

    if (!Array.isArray(positions) || positions.length === 0) {
      return { success: false, error: 'No cards selected. Please select at least one card.' };
    }

    const indices = [...new Set(positions)]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < player.hand.length)
      .sort((a, b) => a - b);

    if (indices.length === 0) {
      return { success: false, error: 'No valid cards selected.' };
    }

    const drewOrInserted = isMyTurn && room.turnDiscardStarted === true;
    const correct = [];
    const wrong = [];
    let requiredRank = null;

    if (drewOrInserted) {
      const firstCard = player.hand[indices[0]];
      requiredRank = firstCard ? firstCard.r : null;
      for (const i of indices) {
        const card = player.hand[i];
        if (card.r === requiredRank) correct.push(i);
        else wrong.push(i);
      }
    } else {
      const topOpen = room.getOpenCard();
      requiredRank = topOpen ? topOpen.r : null;
      if (!requiredRank) {
        return { success: false, error: 'No open card on discard pile to match.' };
      }
      for (const i of indices) {
        const card = player.hand[i];
        if (requiredRank && card.r === requiredRank) correct.push(i);
        else wrong.push(i);
      }
    }

    const selectedCards = indices.map((i) => player.hand[i]);

    // Remove selected cards from hand (descending order to preserve indices) and move to discard
    for (let k = indices.length - 1; k >= 0; k--) {
      const removedCard = player.hand.splice(indices[k], 1)[0];
      room.discard.push(removedCard);
    }

    // Apply 2 penalty cards for each incorrect card
    let penaltyCount = 0;
    const totalPenaltyCards = wrong.length * 2;
    for (let j = 0; j < totalPenaltyCards; j++) {
      const penaltyCard = drawFromDeck(room);
      if (penaltyCard) {
        player.hand.push(penaltyCard);
        penaltyCount++;
      }
    }

    if (isMyTurn) {
      room.turnDiscardStarted = false;
    }

    let logMsg = isMyTurn
      ? `${player.name} played ${selectedCards.length} card(s) from their hand.`
      : `${player.name} discarded ${selectedCards.length} card(s) out of turn matching open card ${requiredRank}.`;
    if (wrong.length > 0) {
      logMsg += ` ${wrong.length} were wrong — ${penaltyCount} penalty card(s) added.`;
    }
    room.addLog(logMsg);

    if (isMyTurn) {
      this.queuePowersForCards(room, selectedCards);
    }
    this.checkZero(room, player);

    return {
      success: true,
      result: {
        cards: selectedCards.map(toPublicCard),
        wrongCount: wrong.length,
        penaltyCount,
        requiredRank,
        drewOrInserted,
        isOutOfTurn: !isMyTurn,
      },
    };
  }

  /**
   * Scans discarded cards for Queens and Jacks to queue special powers.
   * 
   * @param {Room} room 
   * @param {object[]} cards 
   */
  static queuePowersForCards(room, cards) {
    room.qCount += cards.filter((c) => c && c.r === 'Q').length;
    room.jCount += cards.filter((c) => c && c.r === 'J').length;

    if (room.qCount > 0) {
      room.stage = TURN_STAGES.QPOWER;
    } else if (room.jCount > 0) {
      room.stage = TURN_STAGES.JPOWER;
    } else {
      room.stage = TURN_STAGES.START;
    }
  }

  /**
   * Queen power: Peek at one's own face-down card.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @param {number} position 
   * @returns {{ success: boolean, card?: object, remaining?: number, error?: string }}
   */
  static qPeek(room, pid, position) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.QPOWER || room.qCount <= 0) {
      return { success: false, error: 'Cannot peek at this time.' };
    }

    const player = room.currentPlayer();
    const idx = parseInt(position, 10);
    const card = player.hand[idx];

    if (!card) {
      return { success: false, error: 'Invalid card.' };
    }

    room.qCount--;
    if (room.qCount <= 0) {
      room.stage = room.jCount > 0 ? TURN_STAGES.JPOWER : TURN_STAGES.START;
    }

    return {
      success: true,
      card: toPublicCard(card),
      position: idx,
      remaining: room.qCount,
    };
  }

  /**
   * Jack power: Skip the current blind swap.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @returns {{ success: boolean, error?: string }}
   */
  static jSwapSkip(room, pid) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.JPOWER || room.jCount <= 0) {
      return { success: false, error: 'Cannot skip swap at this time.' };
    }

    room.jCount--;
    if (room.jCount <= 0) {
      room.stage = TURN_STAGES.START;
    }
    room.addLog(`${room.currentPlayer().name} skipped a J swap.`);

    return { success: true };
  }

  /**
   * Jack power: Blind swap one own card with an opponent's card.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @param {string} targetPid 
   * @param {number} ownPos 
   * @param {number} theirPos 
   * @returns {{ success: boolean, error?: string }}
   */
  static jSwap(room, pid, targetPid, ownPos, theirPos) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.JPOWER || room.jCount <= 0) {
      return { success: false, error: 'Cannot swap cards at this time.' };
    }

    const me = room.currentPlayer();
    const target = room.findPlayer(targetPid);

    if (!target || target.pid === pid) {
      return { success: false, error: 'Invalid swap target.' };
    }

    const oi = parseInt(ownPos, 10);
    const ti = parseInt(theirPos, 10);

    if (!(oi >= 0 && oi < me.hand.length) || !(ti >= 0 && ti < target.hand.length)) {
      return { success: false, error: 'Invalid card position.' };
    }

    // Perform blind swap
    const temp = me.hand[oi];
    me.hand[oi] = target.hand[ti];
    target.hand[ti] = temp;

    room.jCount--;
    if (room.jCount <= 0) {
      room.stage = TURN_STAGES.START;
    }

    room.addLog(`${me.name} used J power to blind-swap a card with ${target.name}.`);
    return { success: true };
  }

  /**
   * Rearranges a card in player's own hand without exposing its face.
   * Can be performed by any player in the room at any time during active play.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @param {number} from 
   * @param {number} to 
   * @returns {{ success: boolean, error?: string }}
   */
  static arrangeMove(room, pid, from, to) {
    if (room.phase !== GAME_PHASES.NORMAL && room.phase !== GAME_PHASES.FINAL) {
      return { success: false, error: 'Cannot arrange outside of active play.' };
    }

    const player = room.findPlayer(pid);
    if (!player) return { success: false, error: 'Player not found.' };

    const f = parseInt(from, 10);
    const t = parseInt(to, 10);

    if (!(f >= 0 && f < player.hand.length) || !(t >= 0 && t < player.hand.length)) {
      return { success: false, error: 'Invalid card position.' };
    }

    const item = player.hand.splice(f, 1)[0];
    player.hand.splice(t, 0, item);

    return { success: true };
  }

  /**
   * Calls Reveal, initiating the final round where all other players get one last turn.
   * 
   * @param {Room} room 
   * @param {string} pid 
   * @returns {{ success: boolean, error?: string }}
   */
  static callReveal(room, pid) {
    if (!room.isMyTurn(pid) || room.stage !== TURN_STAGES.START) {
      return { success: false, error: 'Finish your turn first.' };
    }

    room.finalCaller = pid;
    room.phase = GAME_PHASES.FINAL;
    room.addLog(`${room.currentPlayer().name} called Reveal! Everyone else gets one final turn.`);

    return { success: true };
  }

  /**
   * Checks if a player has reduced their hand to 0 cards, triggering final countdown.
   * 
   * @param {Room} room 
   * @param {Player} [player] - Target player who performed discard (defaults to currentPlayer)
   */
  static checkZero(room, player) {
    const target = player || room.currentPlayer();
    if (target && target.hand.length === 0 && room.zeroPlayer === null) {
      room.zeroPlayer = target.pid;
      room.addLog(`${target.name} is down to 0 cards. Play continues until it comes back around to them.`);
    }
  }

  /**
   * Advances turn rotation to next player.
   * Ends game and enters reveal phase if returning to finalCaller or zeroPlayer.
   * 
   * @param {Room} room 
   */
  static advanceTurn(room) {
    room.currentIndex = (room.currentIndex + 1) % room.players.length;
    const cp = room.currentPlayer();

    // Endgame triggers: full circle after zeroPlayer or finalCaller
    if (room.zeroPlayer !== null && cp.pid === room.zeroPlayer) {
      this.revealAll(room);
      return;
    }
    if (room.finalCaller !== null && cp.pid === room.finalCaller) {
      this.revealAll(room);
      return;
    }

    room.resetTurnState();
  }

  /**
   * Transitions game to reveal phase and concludes the round.
   * 
   * @param {Room} room 
   */
  static revealAll(room) {
    room.phase = GAME_PHASES.REVEAL;
    room.addLog('All hands are revealed. Game over!');
  }
}

module.exports = GameEngine;

