/**
 * @file highlight_browser.test.js
 * @description Headed/Headless Playwright test verifying real-time card highlight rendering:
 * - Inserted card highlighted with golden glow (.highlight-gold)
 * - Disposed card highlighted with red glow (.highlight-red)
 * - Arrange move shows source in red and destination in gold
 * Verified from opponents' perspective across multi-player windows.
 */

const { chromium } = require('playwright-core');
const { createApp } = require('../src/app');
const { findRoom } = require('../src/sockets/socketHandlers');
const { createCard } = require('../src/models/Card');
const assert = require('node:assert');
const test = require('node:test');

const TEST_PORT = 3060;
const BASE_URL = `http://localhost:${TEST_PORT}`;

test('Multi-player Browser Highlights - Draw & Dispose and Arrange', async () => {
  const { server } = createApp();
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));

  let channel = 'msedge';
  try {
    const testB = await chromium.launch({ channel: 'msedge', headless: true });
    await testB.close();
  } catch (e) {
    channel = 'chrome';
  }

  const browser1 = await chromium.launch({ channel, headless: true });
  const browser2 = await chromium.launch({ channel, headless: true });

  const page1 = await browser1.newPage();
  const page2 = await browser2.newPage();

  try {
    const ROOM = 'HL_UI_TEST';

    // Alice joins in Window 1
    await page1.goto(BASE_URL);
    await page1.fill('#nameInput', 'Alice');
    await page1.fill('#roomInput', ROOM);
    await page1.click('#joinBtn');

    // Bob joins in Window 2
    await page2.goto(BASE_URL);
    await page2.fill('#nameInput', 'Bob');
    await page2.fill('#roomInput', ROOM);
    await page2.click('#joinBtn');

    await page1.waitForSelector('#startBtn:not(.hidden)');
    await page1.click('#startBtn');
    await page1.waitForSelector('#hand .card');
    await page2.waitForSelector('#hand .card');

    // --- TEST 1: Alice arranges card from 0 to 2 ---
    // Alice arranges cards:
    await page1.click('#arrangeBtn');
    await page1.waitForSelector('#modalBox .card');
    // Click card 1 (slot 0)
    await page1.locator('#modalBox .card').nth(0).click();
    await page1.waitForSelector('#modalBox .card.selected');

    // Click card 3 (slot 2)
    await page1.locator('#modalBox .card').nth(2).click();
    await page1.waitForFunction(() => Store.arrangeSelected === null);
    await page1.click('text=Done');

    // In Bob's window (page2), locate Alice's player container and wait for highlights
    const aliceBoxInBobView = page2.locator('.player:has-text("Alice")');
    await page2.waitForSelector('.player:has-text("Alice") .miniCard.highlight-red');
    await page2.waitForSelector('.player:has-text("Alice") .miniCard.highlight-gold');

    // Alice's slot 0 should have highlight-red (source/disposed from)
    const redCard = aliceBoxInBobView.locator('.miniCard.highlight-red');
    assert.strictEqual(await redCard.count(), 1, 'Bob sees Alice slot 0 highlighted in RED');

    // Alice's slot 2 should have highlight-gold (destination/inserted to)
    const goldCard = aliceBoxInBobView.locator('.miniCard.highlight-gold');
    assert.strictEqual(await goldCard.count(), 1, 'Bob sees Alice slot 2 highlighted in GOLD');

    // Verify action pill in Bob's view
    const pillText = await aliceBoxInBobView.locator('.actionPill').textContent();
    assert.ok(pillText.includes('From #1') && pillText.includes('To #3'), `Action pill displays move: ${pillText}`);

    // --- TEST 2: Alice draws and disposes ---
    // Setup deck to avoid empty draw
    const room = findRoom(ROOM);
    room.deck.push(createCard('9', 9, '♠', 'black'));

    // Alice draws
    await page1.click('#drawPile');
    await page1.waitForSelector('text=Keep — choose position');
    await page1.click('text=Keep — choose position');
    await page1.waitForSelector('text=Insert @ 2');
    await page1.click('text=Insert @ 2'); // Insert at slot 2 (index 1)

    // Check that Bob immediately sees the newly inserted card highlighted in gold
    await page2.waitForSelector('.player:has-text("Alice") .miniCard.highlight-gold');
    const goldInsert = aliceBoxInBobView.locator('.miniCard.highlight-gold');
    assert.ok(await goldInsert.count() >= 1, 'Bob sees inserted card in GOLD');

    // Alice disposes card at slot 1
    await page1.locator('#hand .card').nth(0).click();
    await page1.click('#discardSelBtn');

    // Bob's window: Verify Alice's disposed card in RED and inserted card in GOLD
    await page2.waitForSelector('.player:has-text("Alice") .miniCard.highlight-red');
    const redDisposed = aliceBoxInBobView.locator('.miniCard.highlight-red');
    assert.ok(await redDisposed.count() >= 1, 'Bob sees disposed card highlighted in RED');

    const goldInsertedAfter = aliceBoxInBobView.locator('.miniCard.highlight-gold');
    assert.ok(await goldInsertedAfter.count() >= 1, 'Bob sees inserted card highlighted in GOLD');

    const drawDisposePill = await aliceBoxInBobView.locator('.actionPill').textContent();
    assert.ok(drawDisposePill.includes('Disposed') && drawDisposePill.includes('Inserted'), `Pill shows: ${drawDisposePill}`);

  } finally {
    await browser1.close();
    await browser2.close();
    server.close();
  }
});
