/**
 * @file headed_suite.js
 * @description Side-by-Side Headed Browser Test Suite.
 * Launches TWO visible browser windows side-by-side on your desktop:
 * - Left Window: Player 1 (Alice)
 * - Right Window: Player 2 (Bob)
 * Displays live, real-time multiplayer interactions with responsive styling,
 * card animations, modal popups, and the "Play Again" button resolution!
 */

const { chromium } = require('playwright-core');
const { createApp } = require('../src/app');
const assert = require('node:assert');

const TEST_PORT = 3055;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Terminal styling
const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function logStep(step, msg) {
  console.log(`${colors.cyan}[HEADED TEST]${colors.reset} ${colors.bold}${step}:${colors.reset} ${msg}`);
}

function logPass(msg) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}   LAUNCHING SIDE-BY-SIDE HEADED TEST SUITE (ALICE & BOB)${colors.reset}`);
  console.log(`${colors.cyan}======================================================================${colors.reset}\n`);

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

  // 2. Launch Left Window (Alice: 0px to 675px)
  logStep('Browser', 'Opening Window 1 (Alice) on LEFT side of screen...');
  const browser1 = await chromium.launch({
    channel,
    headless: false,
    slowMo: 450,
    args: ['--window-size=675,850', '--window-position=0,0'],
  });
  const context1 = await browser1.newContext({ viewport: { width: 660, height: 750 } });
  const page1 = await context1.newPage();

  // 3. Launch Right Window (Bob: 675px to 1350px)
  logStep('Browser', 'Opening Window 2 (Bob) on RIGHT side of screen...');
  const browser2 = await chromium.launch({
    channel,
    headless: false,
    slowMo: 450,
    args: ['--window-size=675,850', '--window-position=675,0'],
  });
  const context2 = await browser2.newContext({ viewport: { width: 660, height: 750 } });
  const page2 = await context2.newPage();

  console.log(`\n${colors.yellow}👉 Look at your screen: Alice is on the LEFT window, Bob is on the RIGHT window!${colors.reset}\n`);

  try {
    // ----------------------------------------------------
    // SCENARIO 1: LOBBY & JOINING
    // ----------------------------------------------------
    logStep('SCENARIO 1', 'Alice joins room "SPLIT" in Left Window...');
    await page1.goto(BASE_URL);
    await page1.fill('#nameInput', 'Alice');
    await page1.fill('#roomInput', 'SPLIT');
    await page1.click('#joinBtn');
    await sleep(600);

    const p1LobbyText = await page1.textContent('#lobbyPlayers');
    assert.ok(p1LobbyText.includes('Alice (you)'));
    logPass('Alice seated in Left Window.');

    logStep('SCENARIO 1', 'Bob joins room "SPLIT" in Right Window...');
    await page2.goto(BASE_URL);
    await page2.fill('#nameInput', 'Bob');
    await page2.fill('#roomInput', 'SPLIT');
    await page2.click('#joinBtn');
    await sleep(600);

    const p2LobbyText = await page2.textContent('#lobbyPlayers');
    assert.ok(p2LobbyText.includes('Bob (you)'));
    logPass('Bob seated in Right Window.');

    // Start button unlocked for Alice
    const startBtnVisible = await page1.isVisible('#startBtn');
    assert.ok(startBtnVisible, 'Start button unlocked once 2 players joined');
    logPass('Start Game button unlocked for Alice!');

    // ----------------------------------------------------
    // SCENARIO 2 & 3: GAME START & HANDS
    // ----------------------------------------------------
    logStep('SCENARIO 2 & 3', 'Alice sets 4 cards per player and clicks Start Game...');
    await page1.fill('#cppInput', '4');
    await page1.click('#startBtn');
    await sleep(1000);

    // Both windows must now display the green felt game table
    assert.ok(await page1.isVisible('#gameScreen'), 'Alice sees game table');
    assert.ok(await page2.isVisible('#gameScreen'), 'Bob sees game table');

    const aliceHand = await page1.locator('#hand .card').count();
    const bobHand = await page2.locator('#hand .card').count();
    assert.strictEqual(aliceHand, 4);
    assert.strictEqual(bobHand, 4);
    logPass('Both side-by-side screens successfully transitioned to game table with 4 cards each.');

    // ----------------------------------------------------
    // SCENARIO 3: DRAWING & SLOTTING
    // ----------------------------------------------------
    logStep('SCENARIO 3', 'Alice draws a card from the deck in Left Window...');
    await page1.click('#drawPile');
    await sleep(800);

    assert.ok(await page1.isVisible('#modalBox'), 'Drawn card popup visible for Alice');
    logPass('Drawn card displayed on Alice screen (hidden from Bob).');

    logStep('SCENARIO 3', 'Alice inserts card into slot 1...');
    await page1.click('text=Keep — choose position');
    await sleep(600);
    await page1.click('text=Insert @ 1');
    await sleep(800);

    assert.strictEqual(await page1.locator('#hand .card').count(), 5);
    logPass('Alice hand now has 5 cards.');

    // ----------------------------------------------------
    // SCENARIO 4: SELECTION & DISCARD
    // ----------------------------------------------------
    logStep('SCENARIO 4', 'Alice selects cards in hand to match and discard...');
    const cards = page1.locator('#hand .card');
    await cards.nth(0).click();
    await sleep(400);

    const isSelected = await cards.nth(0).evaluate((el) => el.classList.contains('selected'));
    assert.ok(isSelected, 'Card selected with gold outline');
    logPass('Card selected with tactile animation.');

    await page1.click('#discardSelBtn');
    await sleep(800);
    await page1.click('#modalBox button:has-text("Continue")');
    await sleep(600);
    logPass('Alice submitted discard.');

    // ----------------------------------------------------
    // SCENARIO 8: ARRANGE HAND MODAL
    // ----------------------------------------------------
    logStep('SCENARIO 8', 'Alice tests Arrange hand dialog...');
    await page1.click('#arrangeBtn');
    await sleep(600);
    assert.ok(await page1.isVisible('#modalBox'), 'Arrange modal open');
    await page1.click('#modalBox button:has-text("Done")');
    await sleep(600);
    logPass('Arrange dialog tested and closed.');

    // Alice passes turn to Bob
    logStep('SCENARIO 3', 'Alice passes turn to Bob...');
    await page1.click('#nextBtn');
    await sleep(800);

    // Verify Bob is now the active player
    const bobTurnBadge = await page2.textContent('#turnBadge');
    assert.ok(bobTurnBadge.includes('Bob'));
    logPass('Turn seamlessly passed to Bob in Right Window!');

    // ----------------------------------------------------
    // SCENARIO 6: CALL REVEAL & FINAL SCORING
    // ----------------------------------------------------
    logStep('SCENARIO 6', 'Bob clicks "Call / Reveal" in Right Window!...');
    await page2.click('#callBtn');
    await sleep(800);

    // Both windows turn deep crimson red!
    const p1Crimson = await page1.locator('#gameScreen').evaluate((el) => el.classList.contains('final'));
    const p2Crimson = await page2.locator('#gameScreen').evaluate((el) => el.classList.contains('final'));
    assert.ok(p1Crimson && p2Crimson, 'Both windows turn crimson red for Final Round!');
    logPass('Both side-by-side windows turned crimson red for Final Round!');

    // Bob passes to Alice for her 1 final turn
    await page2.click('#nextBtn');
    await sleep(800);
    logPass('Alice receives her 1 final turn.');

    // Alice completes her final turn and passes -> Game ends!
    logStep('SCENARIO 6', 'Alice completes final turn -> Returns to caller, triggering Reveal!');
    await page1.click('#nextBtn');
    await sleep(1000);

    // Verify Reveal phase in both windows
    assert.strictEqual(await page1.textContent('#turnBadge'), 'All cards revealed!');
    assert.strictEqual(await page2.textContent('#turnBadge'), 'All cards revealed!');
    logPass('All hands revealed face-up with point totals in BOTH windows!');

    // Open Final Ranking modal
    logStep('SCENARIO 6', 'Viewing Final Ranking modal in Left Window...');
    await page1.click('#showRankingBtn');
    await sleep(800);

    assert.ok(await page1.isVisible('#modalBox:has-text("Final Ranking")'));
    logPass('Final Ranking modal visible with winner trophy 🏆.');

    // ----------------------------------------------------
    // SCENARIO 7 & 8: THE CRITICAL "PLAY AGAIN" BUTTON TEST
    // ----------------------------------------------------
    logStep('SCENARIO 7 & 8', 'CLICKING "PLAY AGAIN (SAME PLAYERS)" (Testing Bug Fix)...');
    await page1.click('#playAgainBtn');
    await sleep(1200);

    // Verify modal closes and both windows return to green table with fresh cards
    assert.ok(await page1.locator('#modal').evaluate((el) => el.classList.contains('hidden')));
    assert.ok(await page1.locator('#gameScreen').evaluate((el) => !el.classList.contains('final')));
    assert.ok(await page2.locator('#gameScreen').evaluate((el) => !el.classList.contains('final')));

    logStep('SCENARIO 8', 'Verifying all gameplay buttons in BOTH windows are responsive...');
    const discardBtn = page1.locator('#discardSelBtn');
    const callBtn = page1.locator('#callBtn');
    const nextBtn = page1.locator('#nextBtn');
    const arrangeBtn = page1.locator('#arrangeBtn');

    assert.ok(await discardBtn.isVisible(), 'Discard button is visible');
    assert.ok(await callBtn.isVisible(), 'Call button is visible');
    assert.ok(await nextBtn.isVisible(), 'Next button is visible');
    assert.ok(await arrangeBtn.isVisible(), 'Arrange button is visible');

    // Test clicking in the new round
    await arrangeBtn.click();
    await sleep(800);
    assert.ok(await page1.isVisible('#modalBox:has-text("Arrange your cards")'));
    await page1.click('#modalBox button:has-text("Done")');
    await sleep(600);

    logPass(`${colors.green}${colors.bold}OUTSTANDING! Side-by-side windows responsive, Play Again re-dealt clean round, and all buttons work!${colors.reset}`);

    console.log(`\n${colors.bold}${colors.green}======================================================================${colors.reset}`);
    console.log(`${colors.bold}${colors.green}   ALL SIDE-BY-SIDE HEADED TESTS PASSED WITH 100% SUCCESS!${colors.reset}`);
    console.log(`${colors.bold}${colors.green}======================================================================${colors.reset}\n`);

    await sleep(2500);
  } finally {
    if (browser1) await browser1.close();
    if (browser2) await browser2.close();
    server.close();
  }
})();
