/**
 * @file ui.js
 * @description UI renderer, DOM management, modal dialogues, and control state coordination.
 * Adheres to Golden Rules:
 * - Deterministic non-destructive rendering: Controls are never destroyed via innerHTML.
 * - Clean state transitions: Automatically resets selection states and closes modals when a new round starts.
 * - Robust input validation and XSS prevention (sanitized output).
 */

const UI = {
  previousPhase: null,

  /**
   * Helper to query element by ID.
   * @param {string} id 
   * @returns {HTMLElement|null}
   */
  $(id) {
    return document.getElementById(id);
  },

  /**
   * HTML escape utility to prevent XSS.
   * @param {string} s 
   * @returns {string}
   */
  esc(s) {
    return String(s || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[m]));
  },

  /**
   * Generates card face HTML markup.
   * @param {object} c - Card object { r, s, color }
   * @param {string} [extraClass=''] 
   * @returns {string}
   */
  cardFaceHtml(c, extraClass = '') {
    if (!c) return '';
    const isRed = c.color === 'red' || c.s === '♥' || c.s === '♦';
    const textColor = isRed ? '#c71932' : '#111111';
    return `<div class="card reveal ${isRed ? 'red' : 'black'} ${extraClass}" style="color:${textColor}">
      <div class="rank" style="color:${textColor}">${this.esc(c.r)}</div>
      <div class="suit" style="color:${textColor}">${this.esc(c.s)}</div>
    </div>`;
  },

  /**
   * Generates card back HTML markup.
   * @param {string} [extraClass=''] 
   * @returns {string}
   */
  cardBackHtml(extraClass = '') {
    return `<div class="card back ${extraClass}"></div>`;
  },

  /**
   * Displays an ephemeral error/info banner.
   * @param {string} msg 
   */
  showErr(msg) {
    const el = this.$('errBanner');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this.showErr._t);
    this.showErr._t = setTimeout(() => el.classList.add('hidden'), 3500);
  },

  /**
   * Displays an ephemeral positive/informational notification banner.
   * @param {string} msg 
   */
  showNotice(msg) {
    const el = this.$('noticeBanner');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(this.showNotice._t);
    this.showNotice._t = setTimeout(() => el.classList.add('hidden'), 4500);
  },

  /**
   * Opens the universal modal popup with provided HTML.
   * @param {string} html 
   */
  openModal(html) {
    const box = this.$('modalBox');
    const modal = this.$('modal');
    if (!box || !modal) return;
    box.innerHTML = html;
    modal.classList.remove('hidden');
  },

  /**
   * Closes the universal modal popup.
   */
  closeModal() {
    const modal = this.$('modal');
    if (modal) modal.classList.add('hidden');
  },

  /**
   * Toggles collapse/expand state of the updates feed in the hand panel.
   * @param {boolean} [force] 
   */
  toggleLogCollapse(force) {
    Store.logCollapsed = typeof force === 'boolean' ? force : !Store.logCollapsed;
    if (Store.s) {
      this.renderLog(Store.s);
    }
  },

  /**
   * Alias for backward compatibility.
   * @param {boolean} [force]
   */
  toggleUpdates(force) {
    this.toggleLogCollapse(typeof force === 'boolean' ? !force : undefined);
  },

  /**
   * Closes automatic power modals if stage transitioned.
   */
  closeModalIfAutoFlow() {
    if (Store.isPeeking || Store.autoModalOpen === 'q_display') return;
    if (Store.autoModalOpen === 'q' || Store.autoModalOpen === 'j') {
      this.closeModal();
      Store.autoModalOpen = null;
    }
  },

  /**
   * Main reactive render pipeline invoked on every state change from the server.
   */
  render() {
    const s = Store.s;
    if (!s) return;

    // Detect phase transition from REVEAL -> NORMAL (i.e. "Play Again" was clicked)
    if (this.previousPhase === UI_PHASES.REVEAL && s.phase === UI_PHASES.NORMAL) {
      if (this._peekInterval) {
        clearInterval(this._peekInterval);
        this._peekInterval = null;
      }
      Store.resetRoundClientState();
      this.closeModal();
    }
    this.previousPhase = s.phase;

    if (s.phase === UI_PHASES.LOBBY) {
      this.renderLobby(s);
      return;
    }

    this.$('lobbyScreen').classList.add('hidden');
    this.$('gameScreen').classList.remove('hidden');
    this.$('gameScreen').classList.toggle('final', Boolean(s.finalActive));

    if (s.phase === UI_PHASES.REVEAL) {
      this.renderReveal(s);
      return;
    }

    // Normal or Final gameplay phase
    this.renderPlayers(s);
    this.renderPiles(s);
    this.renderHand(s);
    this.renderControls(s);
    this.updateHint(s);
    this.renderLog(s);

    const mine = Store.isMyTurn();
    if (mine) {
      if (Store.isPeeking || Store.autoModalOpen === 'q_display') {
        // Active peek countdown is displaying; keep peek modal open
        return;
      }
      if (s.stage === UI_STAGES.QPOWER) this.openQPeekModal();
      else if (s.stage === UI_STAGES.JPOWER) this.openJSwapModal();
      else this.closeModalIfAutoFlow();
    } else {
      this.closeModalIfAutoFlow();
    }
  },

  /**
   * Renders the pre-game Lobby screen.
   * @param {object} s 
   */
  renderLobby(s) {
    this.$('lobbyScreen').classList.remove('hidden');
    this.$('gameScreen').classList.add('hidden');

    let playersHtml = '';
    for (const p of s.players) {
      const isMe = p.pid === Store.me.pid;
      playersHtml += `<div class="badge">${this.esc(p.name)}${isMe ? ' (you)' : ''}</div>`;
    }
    this.$('lobbyPlayers').innerHTML = playersHtml;

    const hasPlayers = s.players.length > 0;
    this.$('cppField').style.display = hasPlayers ? 'block' : 'none';
    this.$('cppInput').value = s.cardsPerPlayer;

    const canStart = s.players.length >= 2;
    this.$('startBtn').classList.toggle('hidden', !canStart);
  },

  /**
   * Renders the other players summary bar with mini-card indicators.
   * @param {object} s 
   */
  renderPlayers(s) {
    let ps = '';
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const isCurrent = i === s.currentIndex;
      const isMe = p.pid === Store.me.pid;

      const hl = Store.getHighlight(p.pid) || (p.lastAction && (Date.now() - (p.lastAction.timestamp || 0) < 5000) ? p.lastAction : null);

      let miniCardsHtml = '';
      let actionPillHtml = '';

      if (hl && hl.type === 'draw_dispose') {
        const disposedIdx = typeof hl.disposedPos === 'number' ? hl.disposedPos : -1;
        const insertedIdx = typeof hl.insertedPos === 'number' ? hl.insertedPos : -1;

        for (let c = 0; c < p.count; c++) {
          if (c === disposedIdx) {
            miniCardsHtml += '<div class="miniCard highlight-red disposed" title="Disposed card"></div>';
          }
          const isGold = c === insertedIdx;
          miniCardsHtml += `<div class="miniCard ${isGold ? 'highlight-gold' : ''}" title="Card #${c + 1}"></div>`;
        }
        if (disposedIdx >= p.count) {
          miniCardsHtml += '<div class="miniCard highlight-red disposed" title="Disposed card"></div>';
        }

        const goldLabel = insertedIdx >= 0 ? `<span class="pillGold">★ Inserted #${insertedIdx + 1}</span>` : '';
        const redLabel = disposedIdx >= 0 ? `<span class="pillRed">✕ Disposed #${disposedIdx + 1}</span>` : '';
        actionPillHtml = `<div class="actionPill">${goldLabel}${redLabel}</div>`;

      } else if (hl && hl.type === 'arrange') {
        const fromIdx = typeof hl.fromPos === 'number' ? hl.fromPos : -1;
        const toIdx = typeof hl.toPos === 'number' ? hl.toPos : -1;

        for (let c = 0; c < p.count; c++) {
          let extra = '';
          if (c === toIdx) extra = 'highlight-gold';
          else if (c === fromIdx) extra = 'highlight-red';
          miniCardsHtml += `<div class="miniCard ${extra}" title="Card #${c + 1}"></div>`;
        }
        actionPillHtml = `<div class="actionPill"><span class="pillRed">From #${fromIdx + 1}</span> ➔ <span class="pillGold">To #${toIdx + 1}</span></div>`;

      } else if (hl && hl.type === 'insert') {
        const insertedIdx = typeof hl.insertedPos === 'number' ? hl.insertedPos : -1;
        for (let c = 0; c < p.count; c++) {
          const isGold = c === insertedIdx;
          miniCardsHtml += `<div class="miniCard ${isGold ? 'highlight-gold' : ''}" title="Card #${c + 1}"></div>`;
        }
        actionPillHtml = `<div class="actionPill"><span class="pillGold">★ Inserted #${insertedIdx + 1}</span></div>`;

      } else if (hl && hl.type === 'dispose') {
        const disposedIdx = typeof hl.disposedPos === 'number' ? hl.disposedPos : -1;
        for (let c = 0; c < p.count; c++) {
          if (c === disposedIdx) {
            miniCardsHtml += '<div class="miniCard highlight-red disposed" title="Disposed card"></div>';
          }
          miniCardsHtml += `<div class="miniCard" title="Card #${c + 1}"></div>`;
        }
        if (disposedIdx >= p.count) {
          miniCardsHtml += '<div class="miniCard highlight-red disposed" title="Disposed card"></div>';
        }
        actionPillHtml = `<div class="actionPill"><span class="pillRed">✕ Disposed #${disposedIdx + 1}</span></div>`;

      } else {
        miniCardsHtml = Array.from({ length: p.count })
          .map((_, idx) => `<div class="miniCard" title="Card #${idx + 1}"></div>`)
          .join('');
      }

      ps += `<div class="player ${isCurrent ? 'current' : ''} ${isMe ? 'me' : ''} ${p.connected ? '' : 'offline'}">
        <div class="pname">${this.esc(p.name)}${isMe ? ' (you)' : ''}${isCurrent ? ' •' : ''}</div>
        <div class="miniHand">${miniCardsHtml}</div>
        ${actionPillHtml}
        <div class="count">${p.count} card${p.count === 1 ? '' : 's'}${p.connected ? '' : ' · offline'}</div>
      </div>`;
    }
    this.$('players').innerHTML = ps;
  },

  /**
   * Renders the center table draw deck and discard pile.
   * @param {object} s 
   */
  renderPiles(s) {
    this.$('discardPile').innerHTML = s.discardTop ? this.cardFaceHtml(s.discardTop) : '—';
    this.$('turnBadge').textContent = `Turn: ${s.currentName || '—'}`;

    const statusBadge = this.$('statusBadge');
    if (statusBadge) {
      if (s.finalActive) {
        statusBadge.textContent = 'FINAL ROUND';
        statusBadge.classList.remove('hidden');
      } else {
        statusBadge.textContent = '';
        statusBadge.classList.add('hidden');
      }
    }

    const mine = Store.isMyTurn();
    const drawOff = !mine || s.stage !== UI_STAGES.START || s.drawnThisTurn;
    this.$('drawPile').classList.toggle('off', drawOff);
  },

  /**
   * Renders the local player's private face-down hand.
   * @param {object} s 
   */
  renderHand(s) {
    const handArea = this.$('handArea');
    if (handArea) handArea.classList.remove('hidden');

    const my = Store.myEntry();
    this.$('handTitle').textContent = my ? `Your cards (${my.count})` : 'Your cards';

    const hl = Store.getHighlight(Store.me.pid) || (my && my.lastAction && (Date.now() - (my.lastAction.timestamp || 0) < 5000) ? my.lastAction : null);

    let handHtml = '';
    if (my) {
      for (let i = 0; i < my.count; i++) {
        const isSelected = Store.selected.has(i);
        let hlClass = '';
        if (hl) {
          if (hl.type === 'draw_dispose' || hl.type === 'insert') {
            if (i === hl.insertedPos) hlClass = 'highlight-gold';
          } else if (hl.type === 'arrange') {
            if (i === hl.toPos) hlClass = 'highlight-gold';
            else if (i === hl.fromPos) hlClass = 'highlight-red';
          }
        }
        handHtml += `<div class="card back ${isSelected ? 'selected' : ''} ${hlClass}" onclick="UI.toggleSelect(${i})"></div>`;
      }
    }
    this.$('hand').innerHTML = handHtml;
    this.$('selectedInfo').textContent = Store.selected.size ? `${Store.selected.size} selected` : '';
  },

  /**
   * Renders the action control buttons.
   * GOLDEN FIX: Controls are rendered via dedicated containers (#gameplayControls and #revealControls)
   * so DOM nodes are NEVER destroyed or replaced with innerHTML during game over/reveal.
   * 
   * @param {object} s 
   */
  renderControls(s) {
    const mine = Store.isMyTurn();
    const isStartStage = s.stage === UI_STAGES.START;
    const my = Store.myEntry();
    const hasCards = Boolean(my && my.count > 0);
    const isPlayPhase = s.phase === UI_PHASES.NORMAL || s.phase === UI_PHASES.FINAL;

    const handArea = this.$('handArea');
    if (handArea) handArea.classList.remove('hidden');

    // Show gameplay controls and hide reveal controls
    const gameplayControls = this.$('gameplayControls');
    const revealControls = this.$('revealControls');

    if (gameplayControls) gameplayControls.classList.remove('hidden');
    if (revealControls) revealControls.classList.add('hidden');

    const discardSelBtn = this.$('discardSelBtn');
    const callBtn = this.$('callBtn');
    const nextBtn = this.$('nextBtn');
    const arrangeBtn = this.$('arrangeBtn');

    // Arrange and Discard selected are available at all times during active gameplay
    if (discardSelBtn) discardSelBtn.disabled = !hasCards || !isPlayPhase;
    if (arrangeBtn) arrangeBtn.disabled = !hasCards || !isPlayPhase;

    // Call and Next remain restricted to the active player in start stage
    if (callBtn) callBtn.disabled = !mine || !isStartStage;
    if (nextBtn) nextBtn.disabled = !mine || !isStartStage;
  },

  /**
   * Renders the endgame reveal screen with face-up hands and point totals.
   * @param {object} s 
   */
  renderReveal(s) {
    this.$('turnBadge').textContent = 'All cards revealed!';

    const statusBadge = this.$('statusBadge');
    if (statusBadge) {
      statusBadge.textContent = '';
      statusBadge.classList.add('hidden');
    }

    const handArea = this.$('handArea');
    if (handArea) handArea.classList.add('hidden');

    this.$('handTitle').textContent = '';
    this.$('hand').innerHTML = '';
    this.$('selectedInfo').textContent = '';
    this.$('hint').textContent = '';

    let ps = '';
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      const total = s.scores[i];
      const isMe = p.pid === Store.me.pid;
      const handCards = (s.hands[i] || []).map((c) => this.cardFaceHtml(c)).join('');

      ps += `<div class="player ${isMe ? 'me' : ''}">
        <div class="pname">${this.esc(p.name)}</div>
        <div class="hand" style="margin-top:8px">${handCards}</div>
        <div class="count" style="font-weight:bold;font-size:14px;margin-top:4px">${total} pts</div>
      </div>`;
    }
    this.$('players').innerHTML = ps;

    // Seamlessly swap control groups without destroying DOM elements!
    const gameplayControls = this.$('gameplayControls');
    const revealControls = this.$('revealControls');

    if (gameplayControls) gameplayControls.classList.add('hidden');
    if (revealControls) revealControls.classList.remove('hidden');

    this.renderLog(s);
  },

  /**
   * Updates the instructional hint banner for the active turn.
   * @param {object} s 
   */
  updateHint(s) {
    const mine = Store.isMyTurn();
    const hintEl = this.$('hint');
    if (!hintEl) return;

    if (!mine) {
      hintEl.textContent = `Waiting for ${s.currentName} to play…`;
      return;
    }
    if (s.stage === UI_STAGES.DRAWN) {
      hintEl.textContent = 'Check the popup — keep or discard your drawn card.';
      return;
    }
    if (s.stage === UI_STAGES.QPOWER) {
      hintEl.textContent = `Q Power: ${s.qCount} peek(s) left.`;
      return;
    }
    if (s.stage === UI_STAGES.JPOWER) {
      hintEl.textContent = `J Power: ${s.jCount} swap(s) left.`;
      return;
    }
    if (s.drawnThisTurn) {
      hintEl.textContent = 'You already drew this turn. Select more matches, or press Next when done.';
      return;
    }

    hintEl.textContent = s.discardTop
      ? `Open card: ${s.discardTop.r}${s.discardTop.s}. Select card(s) you remember matching it, or tap the draw deck.`
      : 'Tap the draw deck to begin your turn.';
  },

  /**
   * Renders room event log.
   * Latest messages are rendered on top with user-friendly formatting and action badges.
   * @param {object} s 
   */
  renderLog(s) {
    const logBox = this.$('logBox');
    if (!logBox) return;

    const rawLogs = s.log || [];
    const isCollapsed = Boolean(Store.logCollapsed);
    logBox.classList.toggle('collapsed', isCollapsed);

    if (rawLogs.length === 0) {
      logBox.innerHTML = `
        <div class="logHeader">
          <div class="logTitleWrap">
            <span>📜 Updates</span>
            <span class="logBadgeOrder">Latest on top</span>
          </div>
        </div>
        <div class="logList">
          <div class="logItem" style="color:#79aab8;font-style:italic">No updates yet. Tap draw deck to begin!</div>
        </div>
      `;
      return;
    }

    if (isCollapsed) {
      const latestMsg = rawLogs[rawLogs.length - 1];
      logBox.innerHTML = `
        <div class="logHeader collapsible" onclick="UI.toggleLogCollapse(false)" title="Click to expand updates">
          <div class="logTitleWrap">
            <span>📜 Updates</span>
            <span class="logSubText">(${rawLogs.length} events · Latest: ${this.esc(latestMsg.slice(0, 35))}…)</span>
          </div>
          <button class="logToggleBtn" onclick="event.stopPropagation(); UI.toggleLogCollapse(false)">▲ Expand</button>
        </div>
      `;
      return;
    }

    const logs = [...rawLogs].reverse().slice(0, 40);
    const itemsHtml = logs.map((line, i) => {
      const isLatest = i === 0;
      let icon = '•';
      if (/J power|exchanged|blind-swap/i.test(line)) icon = '🔄';
      else if (/Q power|peek/i.test(line)) icon = '👁️';
      else if (/wrong|penalty/i.test(line)) icon = '⚠️';
      else if (/played|matched|discard/i.test(line)) icon = '✨';
      else if (/drew/i.test(line)) icon = '🎴';
      else if (/called reveal|revealed/i.test(line)) icon = '📢';
      else if (/reconnected|disconnected/i.test(line)) icon = '🔌';

      return `<div class="logItem ${isLatest ? 'latest' : ''}">
        <span class="logIcon">${icon}</span>
        <span class="logText">${isLatest ? '<span class="logBadgeNew">NEW</span>' : ''}${this.esc(line)}</span>
      </div>`;
    }).join('');

    logBox.innerHTML = `
      <div class="logHeader open">
        <div class="logTitleWrap">
          <span>📜 Updates</span>
          <span class="logBadgeOrder">Latest on top</span>
        </div>
        <button class="logToggleBtn" onclick="UI.toggleLogCollapse(true)" title="Minimize updates">▼ Minimize</button>
      </div>
      <div class="logList">${itemsHtml}</div>
    `;
  },

  /**
   * Toggles selection state of a hand card.
   * @param {number} index 
   */
  toggleSelect(index) {
    if (Store.selected.has(index)) {
      Store.selected.delete(index);
    } else {
      Store.selected.add(index);
    }
    this.render();
  },

  /**
   * Submits selected cards for matching and discard.
   */
  submitMatch() {
    if (Store.selected.size === 0) {
      this.showErr('No cards selected. Please select at least one card.');
      return;
    }
    SocketClient.emit('matchSelected', { positions: [...Store.selected] });
    Store.selected.clear();
  },

  // ================= POPUP / MODAL DIALOGS =================

  /**
   * Shows the modal for a newly drawn card.
   * @param {object} card 
   */
  showDrawnCardModal(card) {
    this.openModal(`
      <h2>You drew a card</h2>
      ${this.cardFaceHtml(card, 'modalCard')}
      <p class="sub" style="text-align:center">Keep it or discard it.</p>
      <div class="footerBtns">
        <button class="danger" onclick="UI.closeModal(); SocketClient.emit('discardDrawn')">Discard drawn</button>
        <button class="primary" onclick="UI.openInsertPicker()">Keep — choose position</button>
      </div>
    `);
  },

  /**
   * Shows slot chooser for where to insert the drawn card into hand.
   */
  openInsertPicker() {
    const my = Store.myEntry();
    const count = my ? my.count : 0;
    let buttons = '';

    for (let i = 0; i <= count; i++) {
      buttons += `<button class="secondary" style="margin:3px" onclick="UI.closeModal(); SocketClient.emit('keepDrawn', { position: ${i} })">Insert @ ${i + 1}</button>`;
    }

    this.openModal(`
      <h2>Choose where to insert it</h2>
      <p class="sub">Your hand will grow by one card at this slot.</p>
      <div class="row" style="justify-content:center">${buttons}</div>
    `);
  },

  /**
   * Displays the discard reveal popup summarizing played cards and penalties.
   * @param {object} result 
   */
  showDiscardRevealModal({ cards, wrongCount, penaltyCount, requiredRank, drewOrInserted }) {
    const cardsHtml = cards.length
      ? `<div class="hand">${cards.map((c) => this.cardFaceHtml(c)).join('')}</div>`
      : '';

    const ruleExplanation = drewOrInserted
      ? 'Because you drew first, all cards in this action had to share the same rank as the first one you selected.'
      : `Because you didn't draw, every selected card had to match the open card <b>${this.esc(requiredRank || '?')}</b>.`;

    const penaltyText = wrongCount > 0
      ? `<br><b style="color:var(--danger)">${penaltyCount} penalty card(s)</b> added because ${wrongCount} selection(s) were wrong.`
      : '';

    this.openModal(`
      <h2>${wrongCount > 0 ? 'Discard completed with penalty' : 'Discard successful'}</h2>
      ${cardsHtml}
      <p>${cards.length} card(s) discarded.${penaltyText}</p>
      <p class="hint">${ruleExplanation}</p>
      <p class="hint">Remember another matching card? Select it and discard again before pressing Next.</p>
      <button class="primary" style="width:100%;margin-top:10px" onclick="UI.closeModal()">Continue</button>
    `);
  },

  /**
   * Queen Power: Shows modal to choose which own card to peek at.
   */
  openQPeekModal() {
    if (Store.isPeeking || Store.autoModalOpen === 'q_display' || Store.autoModalOpen === 'q') return;
    Store.autoModalOpen = 'q';

    const my = Store.myEntry();
    let cardsHtml = '';
    for (let i = 0; i < (my ? my.count : 0); i++) {
      cardsHtml += `<div class="card back" onclick="UI.qPeekPick(${i})"></div>`;
    }

    this.openModal(`
      <h2>Q Power — Peek at one of your cards</h2>
      <p>${Store.s.qCount} peek(s) available. Choose one of your own face-down cards.</p>
      <div class="hand">${cardsHtml}</div>
      <p class="hint">Only you should look — the card hides again after a few seconds.</p>
    `);
  },

  qPeekPick(i) {
    Store.isPeeking = true;
    Store.autoModalOpen = 'q_display';
    SocketClient.emit('qPeekChoose', { position: i });
  },

  /**
   * Displays the card peek with countdown timer.
   * @param {object} card 
   * @param {number} remaining 
   */
  showQPeekDisplay(card, remaining) {
    Store.isPeeking = true;
    Store.autoModalOpen = 'q_display';

    this.openModal(`
      <h2>Peek</h2>
      ${this.cardFaceHtml(card, 'modalCard')}
      <div class="timer" id="peekTimer">3</div>
      <p class="sub" style="text-align:center">Remember this card and its position.</p>
    `);

    let t = 3;
    if (this._peekInterval) {
      clearInterval(this._peekInterval);
      this._peekInterval = null;
    }

    this._peekInterval = setInterval(() => {
      t--;
      const el = this.$('peekTimer');
      if (el) el.textContent = t;
      if (t <= 0) {
        clearInterval(this._peekInterval);
        this._peekInterval = null;
        Store.isPeeking = false;
        Store.autoModalOpen = null;

        if (remaining > 0) {
          this.openQPeekModal();
        } else {
          this.closeModal();
          const s = Store.s;
          if (Store.isMyTurn() && s && s.stage === UI_STAGES.JPOWER) {
            this.openJSwapModal();
          } else {
            this.render();
          }
        }
      }
    }, 1000);
  },

  /**
   * Jack Power: Chooses target opponent for blind swap.
   */
  openJSwapModal() {
    if (Store.autoModalOpen === 'j') return;
    Store.autoModalOpen = 'j';

    let options = '';
    for (const p of Store.s.players) {
      if (p.pid === Store.me.pid) continue;
      options += `<button class="choice" onclick="UI.jChooseTarget('${p.pid}', '${this.esc(p.name)}', ${p.count})">${this.esc(p.name)} (${p.count} cards)</button>`;
    }

    this.openModal(`
      <h2>J Power — Blind swap</h2>
      <p>${Store.s.jCount} swap(s) available. Pick a player to swap one of your cards with. Neither of you sees either card.</p>
      <div>${options}</div>
      <div class="footerBtns">
        <button class="secondary" onclick="SocketClient.emit('jSwapSkip')">Skip this swap</button>
      </div>
    `);
  },

  jChooseTarget(targetPid, targetName, targetCount) {
    const my = Store.myEntry();
    let cardsHtml = '';
    for (let i = 0; i < (my ? my.count : 0); i++) {
      cardsHtml += `<div class="cardChoice" onclick="UI.jChooseOwn('${targetPid}', '${this.esc(targetName)}', ${targetCount}, ${i})">
        <div class="card back"></div>
        <div class="cardNum">Card #${i + 1}</div>
      </div>`;
    }

    this.openModal(`
      <h2>Choose your card</h2>
      <p class="sub">Select one of your cards to swap with ${this.esc(targetName)}.</p>
      <div class="hand">${cardsHtml}</div>
    `);
  },

  jChooseOwn(targetPid, targetName, targetCount, ownPos) {
    let cardsHtml = '';
    for (let i = 0; i < targetCount; i++) {
      cardsHtml += `<div class="cardChoice" onclick="UI.jFinish('${targetPid}', ${ownPos}, ${i})">
        <div class="card back"></div>
        <div class="cardNum">Card #${i + 1}</div>
      </div>`;
    }

    this.openModal(`
      <h2>Choose their card</h2>
      <p class="sub">Select one of ${this.esc(targetName)}'s cards to swap with your Card #${ownPos + 1}.</p>
      <div class="hand">${cardsHtml}</div>
    `);
  },

  jFinish(targetPid, ownPos, theirPos) {
    SocketClient.emit('jSwap', { targetPid, ownPos, theirPos });
    this.closeModal();
    Store.autoModalOpen = null;
  },

  /**
   * Opens the Arrange mode dialog.
   */
  openArrange() {
    Store.selected.clear();
    Store.arrangeSelected = null;
    this.renderArrange();
  },

  renderArrange() {
    const my = Store.myEntry();
    let cardsHtml = '';
    for (let i = 0; i < (my ? my.count : 0); i++) {
      const isSelected = Store.arrangeSelected === i;
      cardsHtml += `<div class="card back ${isSelected ? 'selected' : ''}" onclick="UI.arrangeTap(${i})" style="position:relative">
        <span style="position:absolute;bottom:4px;right:6px;font-size:11px;background:#0007;padding:1px 5px;border-radius:6px">${i + 1}</span>
      </div>`;
    }

    const hint = Store.arrangeSelected === null
      ? 'Tap a card to pick it up.'
      : `Slot ${Store.arrangeSelected + 1} picked up — tap where to drop it.`;

    this.openModal(`
      <h2>Arrange your cards</h2>
      <p class="sub">Cards stay hidden — only slot numbers show. Tap to pick up, tap again elsewhere to drop.</p>
      <div class="hand">${cardsHtml}</div>
      <p class="hint">${hint}</p>
      <button class="primary" style="width:100%;margin-top:10px" onclick="UI.closeModal()">Done</button>
    `);
  },

  arrangeTap(i) {
    if (Store.arrangeSelected === null) {
      Store.arrangeSelected = i;
    } else if (Store.arrangeSelected === i) {
      Store.arrangeSelected = null;
    } else {
      SocketClient.emit('arrangeMove', { from: Store.arrangeSelected, to: i });
      Store.arrangeSelected = null;
    }
    this.renderArrange();
  },

  /**
   * Displays the Final Ranking screen after all cards are revealed.
   */
  showRanking() {
    const s = Store.s;
    if (!s || !s.scores) return;

    const ranking = s.players
      .map((p, i) => ({ name: p.name, score: s.scores[i] }))
      .sort((a, b) => a.score - b.score);

    const minScore = ranking[0].score;
    const rows = ranking
      .map((item, idx) => {
        const isWinner = item.score === minScore;
        return `<div class="scoreRow ${isWinner ? 'winner' : ''}">
          <span>${idx + 1}. ${this.esc(item.name)}${isWinner ? ' 🏆' : ''}</span>
          <b>${item.score}</b>
        </div>`;
      })
      .join('');

    this.openModal(`
      <h2>Final Ranking</h2>
      <p class="sub">Lowest total wins.</p>
      ${rows}
      <div class="footerBtns">
        <button class="secondary" id="playAgainBtn" onclick="UI.onPlayAgainClick()">Play Again (Same Players)</button>
        <button class="primary" id="modalNewGameBtn" onclick="UI.onNewGameClick()">New Game</button>
      </div>
    `);
  },

  /**
   * Handles clicking Play Again from the ranking modal.
   */
  onPlayAgainClick() {
    this.closeModal();
    Store.resetRoundClientState();
    SocketClient.emit('playAgain');
  },

  /**
   * Handles clicking New Game.
   */
  onNewGameClick() {
    this.closeModal();
    Store.resetRoundClientState();
    SocketClient.emit('newGame');
  },

  /**
   * Shows confirmation prompt before resetting room.
   */
  confirmNewGame() {
    this.openModal(`
      <h2>Start over?</h2>
      <p>This resets the room for everyone.</p>
      <div class="footerBtns">
        <button class="secondary" onclick="UI.closeModal()">Cancel</button>
        <button class="danger" onclick="UI.onNewGameClick()">New game</button>
      </div>
    `);
  },
};

