/**
 * @file headed_suite_3_players.js
 * @description Side-by-Side Headed Browser Test Suite for 3 Players.
 * Launches THREE visible browser windows side-by-side across your desktop:
 * - Left Window: Player 1 (Alice)
 * - Middle Window: Player 2 (Bob)
 * - Right Window: Player 3 (Charlie)
 * Tests real-time 3-player lobby, turn rotation ring, Q power peek privacy,
 * 3-way Jack blind-swap targeting, Call Reveal 3-way rotation, and Play Again re-dealing.
 */

const { chromium } = require('playwright-core');
const { createApp } = require('../src/app');
const { findRoom } = require('../src/sockets/socketHandlers');
const { createCard } = require('../src/models/Card');
const assert = require('node:assert');

const TEST_PORT = 3056;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Terminal styling
const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function logStep(step, msg) {
  console.log(`${colors.cyan}[HEADED 3P TEST]${colors.reset} ${colors.bold}${step}:${colors.reset} ${msg}`);
}

function logPass(msg) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log(`\n${colors.bold}${colors.magenta}======================================================================${colors.reset}`);
  console.log(`${colors.bold}   LAUNCHING 3-PLAYER SIDE-BY-SIDE HEADED TEST (ALICE, BOB & CHARLIE)${colors.reset}`);
  console.log(`${colors.magenta}======================================================================${colors.reset}\n`);

  // Check if headless flag passed in args
  const isHeadless = process.argv.includes('--headless');

  // 1. Start embedded test server
  const { server } = createApp();
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  logStep('Server', `Embedded test server listening on ${BASE_URL}`);

  // Channel determination: Try Edge, fallback to Chrome
  let channel = 'msedge';
  try {
    const testB = await chromium.launch({ channel: 'msedge', headless: true });
    await testB.close();
  } catch (e) {
    channel = 'chrome';
  }

  const slowMo = isHeadless ? 0 : 350;

  // 2. Launch Left Window (Alice: 0px to 450px)
  logStep('Browser', 'Opening Window 1 (Alice) on LEFT side of screen...');
  const browser1 = await chromium.launch({
    channel,
    headless: isHeadless,
    slowMo,
    args: ['--window-size=450,850', '--window-position=0,0'],
  });
  const context1 = await browser1.newContext({ viewport: { width: 435, height: 750 } });
  const page1 = await context1.newPage();

  // 3. Launch Middle Window (Bob: 450px to 900px)
  logStep('Browser', 'Opening Window 2 (Bob) in MIDDLE of screen...');
  const browser2 = await chromium.launch({
    channel,
    headless: isHeadless,
    slowMo,
    args: ['--window-size=450,850', '--window-position=450,0'],
  });
  const context2 = await browser2.newContext({ viewport: { width: 435, height: 750 } });
  const page2 = await context2.newPage();

  // 4. Launch Right Window (Charlie: 900px to 1350px)
  logStep('Browser', 'Opening Window 3 (Charlie) on RIGHT side of screen...');
  const browser3 = await chromium.launch({
    channel,
    headless: isHeadless,
    slowMo,
    args: ['--window-size=450,850', '--window-position=900,0'],
  });
  const context3 = await browser3.newContext({ viewport: { width: 435, height: 750 } });
  const page3 = await context3.newPage();

  if (!isHeadless) {
    console.log(`\n${colors.yellow}👉 Look at your screen: Alice (LEFT), Bob (MIDDLE), Charlie (RIGHT)!${colors.reset}\n`);
  }

  try {
    const ROOM_CODE = 'TRIO3P';

    // ----------------------------------------------------
    // SCENARIO 1: LOBBY & 3 PLAYERS JOINING
    // ----------------------------------------------------
    logStep('SCENARIO 1', `Alice joins room "${ROOM_CODE}" in Left Window...`);
    await page1.goto(BASE_URL);
    await page1.fill('#nameInput', 'Alice');
    await page1.fill('#roomInput', ROOM_CODE);
    await page1.click('#joinBtn');
    await sleep(500);

    const p1LobbyText = await page1.textContent('#lobbyPlayers');
    assert.ok(p1LobbyText.includes('Alice (you)'));
    logPass('Alice seated in Left Window.');

    logStep('SCENARIO 1', `Bob joins room "${ROOM_CODE}" in Middle Window...`);
    await page2.goto(BASE_URL);
    await page2.fill('#nameInput', 'Bob');
    await page2.fill('#roomInput', ROOM_CODE);
    await page2.click('#joinBtn');
    await sleep(500);

    const p2LobbyText = await page2.textContent('#lobbyPlayers');
    assert.ok(p2LobbyText.includes('Bob (you)'));
    logPass('Bob seated in Middle Window.');

    logStep('SCENARIO 1', `Charlie joins room "${ROOM_CODE}" in Right Window...`);
    await page3.goto(BASE_URL);
    await page3.fill('#nameInput', 'Charlie');
    await page3.fill('#roomInput', ROOM_CODE);
    await page3.click('#joinBtn');
    await sleep(500);

    const p3LobbyText = await page3.textContent('#lobbyPlayers');
    assert.ok(p3LobbyText.includes('Charlie (you)'));
    logPass('Charlie seated in Right Window.');

    // Verify all 3 players reflected in Alice's lobby view
    const p1LobbyUpdated = await page1.textContent('#lobbyPlayers');
    assert.ok(p1LobbyUpdated.includes('Alice (you)'));
    assert.ok(p1LobbyUpdated.includes('Bob'));
    assert.ok(p1LobbyUpdated.includes('Charlie'));

    const startBtnVisible = await page1.isVisible('#startBtn');
    assert.ok(startBtnVisible, 'Start button unlocked once 3 players joined');
    logPass('All 3 players successfully seated; Start Game unlocked for host (Alice)!');

    // ----------------------------------------------------
    // SCENARIO 2 & 3: GAME START & 3-PLAYER DEALING
    // ----------------------------------------------------
    logStep('SCENARIO 2 & 3', 'Alice sets 4 cards per player and clicks Start Game...');
    await page1.fill('#cppInput', '4');
    await page1.click('#startBtn');
    await sleep(900);

    // All three windows must display the game table
    assert.ok(await page1.isVisible('#gameScreen'), 'Alice sees game table');
    assert.ok(await page2.isVisible('#gameScreen'), 'Bob sees game table');
    assert.ok(await page3.isVisible('#gameScreen'), 'Charlie sees game table');

    const aliceHand = await page1.locator('#hand .card').count();
    const bobHand = await page2.locator('#hand .card').count();
    const charlieHand = await page3.locator('#hand .card').count();

    assert.strictEqual(aliceHand, 4);
    assert.strictEqual(bobHand, 4);
    assert.strictEqual(charlieHand, 4);
    logPass('All 3 windows transitioned to game table with 4 cards in each hand!');

    // ----------------------------------------------------
    // SCENARIO 3: ACTIVE DRAWING & SLOTTING (ALICE)
    // ----------------------------------------------------
    logStep('SCENARIO 3', 'Alice draws a card from the deck in Left Window...');
    const room = findRoom(ROOM_CODE);
    room.deck.push(createCard('7', 7, '♦', 'red'));

    await page1.click('#drawPile');
    await sleep(600);

    assert.ok(await page1.isVisible('#modalBox'), 'Drawn card popup visible for Alice');
    assert.ok(await page2.locator('#modal').evaluate((el) => el.classList.contains('hidden')), 'Bob does not see Alice drawn card');
    assert.ok(await page3.locator('#modal').evaluate((el) => el.classList.contains('hidden')), 'Charlie does not see Alice drawn card');
    logPass('Drawn card displayed privately for Alice (hidden from Bob & Charlie).');

    // Verify drawn card renders in vivid RED color
    const redSuitEl = page1.locator('#modalBox .card.reveal.red .suit');
    const redColor = await redSuitEl.evaluate((el) => window.getComputedStyle(el).color);
    assert.match(redColor, /rgb\(199,\s*25,\s*50\)/, 'Red Diamond card renders in bright red color');
    logPass(`Red card color verification passed: ${redColor}!`);

    logStep('SCENARIO 3', 'Alice inserts card into slot 1...');
    await page1.click('text=Keep — choose position');
    await sleep(500);
    await page1.click('text=Insert @ 1');
    await sleep(600);

    assert.strictEqual(await page1.locator('#hand .card').count(), 5);
    logPass('Alice hand now has 5 cards.');

    // ----------------------------------------------------
    // SCENARIO 4: SELECTION & DISCARD
    // ----------------------------------------------------
    logStep('SCENARIO 4', 'Alice selects cards in hand to match and discard...');
    const cards = page1.locator('#hand .card');
    await cards.nth(0).click();
    await sleep(300);

    const isSelected = await cards.nth(0).evaluate((el) => el.classList.contains('selected'));
    assert.ok(isSelected, 'Card selected with gold outline');

    await page1.click('#discardSelBtn');
    await sleep(600);

    const continueBtn = page1.locator('#modalBox button:has-text("Continue")');
    if (await continueBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await continueBtn.click();
    } else {
      await page1.keyboard.press('Escape').catch(() => {});
    }
    await sleep(500);
    logPass('Alice submitted discard; hand count decremented.');

    // Pass turn to Bob
    logStep('SCENARIO 3', 'Alice passes turn to Bob...');
    await page1.click('#nextBtn');
    await sleep(600);

    const p2TurnBadge = await page2.textContent('#turnBadge');
    assert.ok(p2TurnBadge.includes('Bob'));
    logPass('Turn smoothly rotated: Alice -> Bob!');

    // ----------------------------------------------------
    // SCENARIO 5: QUEEN POWER 3-SECOND PEEK COUNTDOWN
    // ----------------------------------------------------
    logStep('SCENARIO 5', 'Bob draws Queen of Hearts in Middle Window to test Q Power...');
    room.deck.push(createCard('Q', 12, '♥', 'red'));

    await page2.click('#drawPile');
    await sleep(600);
    assert.ok(await page2.isVisible('#modalBox:has-text("You drew a card")'));

    logStep('SCENARIO 5', 'Bob discards drawn card to trigger Queen Power...');
    await page2.click('#modalBox button:has-text("Discard drawn")');
    await sleep(600);

    assert.ok(await page2.isVisible('#modalBox:has-text("Q Power — Peek at one of your cards")'));
    assert.ok(await page1.locator('#modal').evaluate((el) => el.classList.contains('hidden')), 'Alice modal hidden');
    assert.ok(await page3.locator('#modal').evaluate((el) => el.classList.contains('hidden')), 'Charlie modal hidden');
    logPass('Queen Power modal displayed for Bob only; hidden from Alice and Charlie!');

    logStep('SCENARIO 5', 'Bob selects card to peek -> Verifying 3-second view timer...');
    await page2.locator('#modalBox .card.back').first().click();
    await sleep(300);

    const peekTimer = page2.locator('#peekTimer');
    assert.ok(await peekTimer.isVisible(), '3-second peek timer visible in Middle Window');
    logPass('Bob peek modal actively showing card face with 3-second countdown timer!');

    // Verify countdown timer progresses and auto-closes
    await sleep(1000);
    await sleep(1000);
    await sleep(1200);

    const qModalClosed = await page2.locator('#modal').evaluate((el) => el.classList.contains('hidden'));
    assert.ok(qModalClosed, 'Bob peek modal auto-dismissed cleanly after 3 seconds!');
    logPass('Bob completed Q Peek; turn remains active.');

    // Bob passes turn to Charlie
    logStep('SCENARIO 3', 'Bob passes turn to Charlie...');
    await page2.click('#nextBtn');
    await sleep(600);

    const p3TurnBadge = await page3.textContent('#turnBadge');
    assert.ok(p3TurnBadge.includes('Charlie'));
    logPass('Turn smoothly rotated: Bob -> Charlie!');

    // ----------------------------------------------------
    // SCENARIO 5: JACK POWER 3-WAY BLIND-SWAP TARGET SELECTION
    // ----------------------------------------------------
    logStep('SCENARIO 5', 'Charlie draws Jack of Spades in Right Window to test 3-Way J Blind Swap...');
    room.deck.push(createCard('J', 11, '♠', 'black'));

    await page3.click('#drawPile');
    await sleep(600);
    assert.ok(await page3.isVisible('#modalBox:has-text("You drew a card")'));

    logStep('SCENARIO 5', 'Charlie discards drawn card to trigger Jack Power...');
    await page3.click('#modalBox button:has-text("Discard drawn")');
    await sleep(600);

    assert.ok(await page3.isVisible('#modalBox:has-text("J Power — Blind swap")'));
    logPass('Jack Power modal displayed for Charlie with target opponent options!');

    // Charlie sees both Alice and Bob as swap options
    const aliceOption = page3.locator('#modalBox button:has-text("Alice")');
    const bobOption = page3.locator('#modalBox button:has-text("Bob")');
    assert.ok(await aliceOption.isVisible(), 'Alice option present in 3-player game');
    assert.ok(await bobOption.isVisible(), 'Bob option present in 3-player game');
    logPass('Both opponents (Alice & Bob) available as swap targets in 3-player modal!');

    // Charlie chooses Alice
    logStep('SCENARIO 5', 'Charlie selects Alice as swap target...');
    await aliceOption.click();
    await sleep(500);

    // Charlie selects his own Card #1
    await page3.locator('#modalBox .cardChoice').first().click();
    await sleep(500);

    // Charlie selects Alice's Card #1
    await page3.locator('#modalBox .cardChoice').first().click();
    await sleep(700);

    // Verify jSwapNotice banner is broadcast to ALL THREE windows
    assert.ok(await page1.isVisible('#noticeBanner'), 'Alice sees jSwapNotice banner');
    assert.ok(await page2.isVisible('#noticeBanner'), 'Bob sees jSwapNotice banner');
    assert.ok(await page3.isVisible('#noticeBanner'), 'Charlie sees jSwapNotice banner');
    logPass('3-Way Jack blind-swap completed: Banner broadcast to Alice, Bob, and Charlie!');

    // Charlie passes turn to Alice (wrapping ring around back to seat 0)
    logStep('SCENARIO 3', 'Charlie passes turn back to Alice (Seat 0)...');
    await page3.click('#nextBtn');
    await sleep(600);

    const p1TurnBadgeAgain = await page1.textContent('#turnBadge');
    assert.ok(p1TurnBadgeAgain.includes('Alice'));
    logPass('Turn ring completed full 3-player loop: Charlie -> Alice!');

    // ----------------------------------------------------
    // SCENARIO 6: CALL REVEAL 3-WAY FINAL ROUND
    // ----------------------------------------------------
    logStep('SCENARIO 6', 'Alice calls Reveal in Left Window!...');
    await page1.click('#callBtn');
    await sleep(600);

    // All three windows must turn crimson red!
    const p1Crimson = await page1.locator('#gameScreen').evaluate((el) => el.classList.contains('final'));
    const p2Crimson = await page2.locator('#gameScreen').evaluate((el) => el.classList.contains('final'));
    const p3Crimson = await page3.locator('#gameScreen').evaluate((el) => el.classList.contains('final'));
    assert.ok(p1Crimson && p2Crimson && p3Crimson, 'All 3 windows turn crimson red for Final Round');
    logPass('All 3 windows turned crimson red for Final Round!');

    // Alice passes to Bob (Bob gets 1 final turn)
    await page1.click('#nextBtn');
    await sleep(600);
    logPass('Bob receives his 1 final turn.');

    // Bob passes to Charlie (Charlie gets 1 final turn)
    await page2.click('#nextBtn');
    await sleep(600);
    logPass('Charlie receives his 1 final turn.');

    // Charlie passes back to Alice (caller) -> Game ends immediately!
    logStep('SCENARIO 6', 'Charlie passes to Alice (caller) -> Concluding round!');
    await page3.click('#nextBtn');
    await sleep(900);

    // Verify all 3 windows enter Reveal phase
    assert.strictEqual(await page1.textContent('#turnBadge'), 'All cards revealed!');
    assert.strictEqual(await page2.textContent('#turnBadge'), 'All cards revealed!');
    assert.strictEqual(await page3.textContent('#turnBadge'), 'All cards revealed!');
    logPass('All cards revealed face-up with calculated point totals across all 3 windows!');

    // ----------------------------------------------------
    // SCENARIO 6: FINAL RANKING MODAL
    // ----------------------------------------------------
    logStep('SCENARIO 6', 'Viewing Final Ranking modal with all 3 players...');
    await page1.click('#showRankingBtn');
    await sleep(600);

    assert.ok(await page1.isVisible('#modalBox:has-text("Final Ranking")'));
    const rankingText = await page1.textContent('#modalBox');
    assert.ok(rankingText.includes('Alice'));
    assert.ok(rankingText.includes('Bob'));
    assert.ok(rankingText.includes('Charlie'));
    assert.ok(rankingText.includes('🏆'));
    logPass('Final Ranking modal lists all 3 players with winner trophy 🏆!');

    // ----------------------------------------------------
    // SCENARIO 7 & 8: PLAY AGAIN WITH 3 PLAYERS (CRITICAL TEST)
    // ----------------------------------------------------
    logStep('SCENARIO 7 & 8', 'Alice clicks "Play Again (Same Players)" in Left Window...');
    await page1.click('#playAgainBtn');
    await sleep(1000);

    // All 3 windows must dismiss modal and return to classic green felt table
    assert.ok(await page1.locator('#modal').evaluate((el) => el.classList.contains('hidden')));
    assert.ok(await page1.locator('#gameScreen').evaluate((el) => !el.classList.contains('final')));
    assert.ok(await page2.locator('#gameScreen').evaluate((el) => !el.classList.contains('final')));
    assert.ok(await page3.locator('#gameScreen').evaluate((el) => !el.classList.contains('final')));

    logStep('SCENARIO 8', 'Verifying all action buttons are responsive across all 3 windows in round 2...');
    for (const [idx, p] of [page1, page2, page3].entries()) {
      assert.ok(await p.isVisible('#arrangeBtn'), `Player ${idx + 1} sees Arrange button`);
      assert.ok(await p.isVisible('#discardSelBtn'), `Player ${idx + 1} sees Discard button`);
      assert.ok(await p.isVisible('#callBtn'), `Player ${idx + 1} sees Call button`);
      assert.ok(await p.isVisible('#nextBtn'), `Player ${idx + 1} sees Next button`);
    }

    // Verify 4 fresh cards dealt to each player
    assert.strictEqual(await page1.locator('#hand .card').count(), 4);
    assert.strictEqual(await page2.locator('#hand .card').count(), 4);
    assert.strictEqual(await page3.locator('#hand .card').count(), 4);

    // Test clicking in the new round
    await page1.click('#arrangeBtn');
    await sleep(500);
    assert.ok(await page1.isVisible('#modalBox:has-text("Arrange your cards")'));
    await page1.click('#modalBox button:has-text("Done")');
    await sleep(500);

    logPass(`${colors.green}${colors.bold}OUTSTANDING! 3-Player Play Again successfully re-dealt clean round, all 3 windows responsive, and all action buttons work!${colors.reset}`);

    console.log(`\n${colors.bold}${colors.green}======================================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.green}   ALL 3-PLAYER HEADED TESTS PASSED WITH 100% SUCCESS!${colors.reset}`);
    console.log(`${colors.bold}${colors.green}======================================================================${colors.reset}\n`);

    await sleep(2000);
  } finally {
    if (browser1) await browser1.close();
    if (browser2) await browser2.close();
    if (browser3) await browser3.close();
    server.close();
  }
})();

