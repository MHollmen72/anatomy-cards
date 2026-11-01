// Browser tests at iPhone and laptop sizes (run after `npm run build`: npm run test:e2e).
// Uses the Playwright library directly to avoid extra test-runner dependencies.
const { chromium, devices } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push(['ok', name]);
  } catch (e) {
    results.push(['FAIL', name, e]);
  }
}

async function noHorizontalScroll(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  assert.ok(sw <= iw, `page is ${sw}px wide in a ${iw}px viewport`);
}

async function counters(page) {
  return page.evaluate(() => ({
    newCount: Number(document.getElementById('count-new').textContent),
    reviews: Number(document.getElementById('count-reviews').textContent),
    left: Number(document.getElementById('count-left').textContent),
  }));
}

async function run() {
  const server = spawn(process.execPath, ['scripts/serve.mjs', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  try {
    // ---------- iPhone ----------
    const phone = await browser.newContext({ ...devices['iPhone 13'] });
    const p = await phone.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e));
    await p.goto(URL);
    await p.waitForSelector('#card-title');

    await test('iPhone: card shows Latin name, category and Reveal button', async () => {
      assert.match(await p.textContent('#card-title'), /^(Musculus|Ligamentum) /);
      assert.ok(await p.isVisible('.prompt .letter'));
      assert.ok(await p.isVisible('#reveal'));
    });
    await test('iPhone: grading is impossible before the reveal', async () => {
      assert.equal(await p.locator('#btn-pass').count(), 0);
      assert.equal(await p.locator('#btn-fail').count(), 0);
    });
    await test('iPhone: no horizontal scrolling', () => noHorizontalScroll(p));
    await test('iPhone: touch targets are at least 44 px', async () => {
      const small = await p.evaluate(() => [...document.querySelectorAll('button, .btn')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ t: b.textContent.trim() || b.getAttribute('aria-label'), h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width }))
        .filter((b) => b.h < 44 || b.w < 44));
      assert.deepEqual(small, []);
    });

    const before = await counters(p);
    await test('iPhone: one tap reveals the answer as separate facts', async () => {
      await p.tap('#reveal');
      await p.waitForSelector('.answer li');
      assert.ok((await p.locator('.answer li').count()) >= 1);
      assert.ok(await p.isVisible('#btn-pass'));
      await noHorizontalScroll(p);
    });
    await test('iPhone: "I didn\'t know this" counts a new card and keeps it in the session', async () => {
      await p.tap('#btn-fail');
      await p.waitForSelector('#reveal');
      const after = await counters(p);
      assert.equal(after.newCount, before.newCount + 1);
      assert.equal(after.left, before.left, 'failed card should stay in today\'s deck');
    });
    await test('iPhone: "I knew this" removes the card from the session', async () => {
      const b = await counters(p);
      await p.tap('#reveal');
      await p.tap('#btn-pass');
      await p.waitForSelector('#reveal');
      const a = await counters(p);
      assert.equal(a.left, b.left - 1);
    });
    await test('iPhone: progress survives a reload', async () => {
      const b = await counters(p);
      await p.reload();
      await p.waitForSelector('#card-title');
      const a = await counters(p);
      assert.equal(a.newCount, b.newCount);
      assert.equal(a.reviews, b.reviews);
    });
    await test('iPhone: no script errors', () => assert.deepEqual(errors.map(String), []));
    await p.screenshot({ path: 'test-results/iphone-question.png', fullPage: true });
    await p.tap('#reveal');
    await p.screenshot({ path: 'test-results/iphone-answer.png', fullPage: true });
    await phone.close();

    // ---------- Laptop, keyboard only ----------
    const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const l = await laptop.newPage();
    await l.goto(URL);
    await l.waitForSelector('#card-title');
    await test('Laptop: Space reveals, 2 grades "I knew this"', async () => {
      const b = await counters(l);
      await l.keyboard.press('Space');
      await l.waitForSelector('.answer');
      await l.keyboard.press('2');
      await l.waitForSelector('#reveal');
      const a = await counters(l);
      assert.equal(a.newCount, b.newCount + 1);
      assert.equal(a.left, b.left - 1);
    });
    await test('Laptop: keys 1/2 do nothing before the reveal', async () => {
      const b = await counters(l);
      await l.keyboard.press('2');
      await l.keyboard.press('1');
      assert.deepEqual(await counters(l), b);
    });
    await test('Laptop: no horizontal scrolling', () => noHorizontalScroll(l));
    await test('Laptop: focus is visible on the Reveal button', async () => {
      await l.keyboard.press('Tab');
      await l.keyboard.press('Shift+Tab');
      const outline = await l.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      assert.notEqual(outline, 'none');
    });
    await test('Laptop: export produces a progress file', async () => {
      await l.click('#open-menu');
      const [download] = await Promise.all([l.waitForEvent('download'), l.click('#export')]);
      assert.match(download.suggestedFilename(), /^anatomy-cards-progress-\d{4}-\d\d-\d\d\.json$/);
      await l.click('#close-menu');
    });
    await test('Laptop: flagged card leaves the deck and appears in the menu', async () => {
      const b = await counters(l);
      await l.click('#reveal');
      await l.click('text=Flag as wrong');
      await l.waitForSelector('#reveal');
      assert.equal((await counters(l)).left, b.left - 1);
      await l.click('#open-menu');
      assert.ok(await l.isVisible('#flagged-list button:has-text("Unflag")'));
      await l.click('#close-menu');
    });
    await l.screenshot({ path: 'test-results/laptop-question.png' });
    await laptop.close();

    // ---------- Broken images ----------
    const broken = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const bp = await broken.newPage();
    await bp.route('**/images/**', (route) => route.fulfill({ status: 404, body: '' }));
    await bp.goto(URL);
    await bp.waitForSelector('#card-title');
    await test('Broken image shows a placeholder and the card still works', async () => {
      await bp.waitForSelector('.placeholder');
      await bp.click('#reveal');
      assert.ok(await bp.isVisible('#btn-pass'));
    });
    await broken.close();

    // ---------- Accessibility basics ----------
    const a11y = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const ap = await a11y.newPage();
    await ap.goto(URL);
    await ap.waitForSelector('#card-title');
    await test('Accessibility: images have alt text, buttons have names, Latin is marked', async () => {
      const issues = await ap.evaluate(() => {
        const out = [];
        document.querySelectorAll('img').forEach((i) => { if (!i.alt) out.push('img without alt'); });
        document.querySelectorAll('button').forEach((b) => { if (!(b.textContent.trim() || b.getAttribute('aria-label'))) out.push('unnamed button'); });
        if (document.getElementById('card-title').lang !== 'la') out.push('title not lang=la');
        return out;
      });
      assert.deepEqual(issues, []);
    });
    await a11y.close();
  } finally {
    await browser.close();
    server.kill();
  }

  for (const [status, name, err] of results) console.log(`${status === 'ok' ? '✔' : '✘'} ${name}${err ? `\n    ${err.message}` : ''}`);
  const failed = results.filter((r) => r[0] !== 'ok').length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

require('node:fs').mkdirSync('test-results', { recursive: true });
run().catch((e) => { console.error(e); process.exit(1); });
