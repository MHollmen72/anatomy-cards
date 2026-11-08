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

    // ---------- One screen on iPhones: main button visible without scrolling ----------
    for (const name of ['iPhone SE', 'iPhone 13', 'iPhone 15 Pro Max']) {
      const ctx = await browser.newContext({ ...devices[name] });
      const pg = await ctx.newPage();
      await pg.goto(URL);
      await pg.waitForSelector('#card-title');
      // check the first few cards, question side and answer side
      for (let i = 0; i < 4; i++) {
        await test(`${name}: card ${i + 1} — Reveal button on screen without scrolling`, async () => {
          const box = await pg.locator('#reveal').boundingBox();
          const vh = pg.viewportSize().height;
          assert.ok(box && box.y + box.height <= vh, `button bottom ${box && box.y + box.height} > ${vh}`);
          const imgBottom = await pg.evaluate(() => { const i = document.querySelector('.img-wrap'); return i ? i.getBoundingClientRect().bottom : 0; });
          assert.ok(imgBottom <= vh, 'image extends below the screen');
          assert.equal(await pg.evaluate(() => window.scrollY), 0);
        });
        await pg.click('#reveal');
        await test(`${name}: card ${i + 1} — grade buttons on screen without scrolling`, async () => {
          for (const id of ['#btn-pass', '#btn-fail']) {
            const box = await pg.locator(id).boundingBox();
            assert.ok(box && box.y >= 0 && box.y + box.height <= pg.viewportSize().height, `${id} off screen`);
          }
        });
        await pg.click('#btn-pass');
        await pg.waitForSelector('#reveal');
      }
      if (name === 'iPhone 13') await pg.screenshot({ path: 'test-results/iphone13-question.png' });
      if (name === 'iPhone SE') { await pg.screenshot({ path: 'test-results/iphoneSE-question.png' }); await pg.click('#reveal'); await pg.screenshot({ path: 'test-results/iphoneSE-answer.png' }); }
      await ctx.close();
    }

    // ---------- Mastery ----------
    const m = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mp = await m.newPage();
    await mp.goto(URL);
    await mp.waitForSelector('#card-title');
    await test('Mastery bar shows 0 mastered of all cards at the start', async () => {
      assert.equal(await mp.textContent('#mastered-count'), '0');
      assert.ok(Number(await mp.textContent('#total-count')) > 0);
      assert.equal(await mp.textContent('#mastered-pct'), '0 %');
      assert.equal(await mp.getAttribute('#mastery-bar', 'role'), 'progressbar');
    });
    await test('A card answered "I knew this" for the 7th time becomes mastered and leaves the deck', async () => {
      // Answer one card, then give every stored card 6 earlier successes and make it due again.
      await mp.click('#reveal');
      await mp.click('#btn-pass');
      await mp.evaluate(async () => {
        const db = await new Promise((r) => { const q = indexedDB.open('anatomy-cards'); q.onsuccess = () => r(q.result); });
        const tx = db.transaction('progress', 'readwrite');
        const store = tx.objectStore('progress');
        const all = await new Promise((r) => { const q = store.getAll(); q.onsuccess = () => r(q.result); });
        for (const p of all) { p.knewCount = 6; p.fsrs.due = new Date(0).toISOString(); store.put(p); }
        await new Promise((r) => (tx.oncomplete = r));
      });
      await mp.reload();
      await mp.waitForSelector('#card-title');
      const left = (await counters(mp)).left;
      // play through the deck answering "I knew this" until the mastered count moves
      for (let i = 0; i < left && (await mp.textContent('#mastered-count')) === '0'; i++) {
        await mp.click('#reveal');
        await mp.click('#btn-pass');
        await mp.waitForSelector('#card-title');
      }
      assert.equal(await mp.textContent('#mastered-count'), '1');
      const total = Number(await mp.textContent('#total-count'));
      assert.equal(await mp.textContent('#mastered-pct'), `${Math.floor(100 / total)} %`);
      // after a reload the mastered card is not in today's deck any more
      await mp.reload();
      await mp.waitForSelector('#card-title');
      assert.equal(await mp.textContent('#mastered-count'), '1');
    });
    await mp.screenshot({ path: 'test-results/mastery.png' });
    await m.close();

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
