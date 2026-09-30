const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assets = path.resolve(__dirname, '../app/src/main/assets');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const file = path.join(assets, name === '/' ? 'index.html' : path.basename(name));
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(fs.readFileSync(file));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    fs.mkdirSync('test-results', { recursive: true });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#ls-start').waitFor();
    await page.screenshot({ path: 'test-results/home-en.png', fullPage: true });
    await page.locator('#ls-start').click();
    assert.equal(await page.locator('#ls-next').isDisabled(), true);
    await page.locator('#ls-options button').nth(0).click();
    await page.locator('#ls-hint').click();
    assert.equal(await page.locator('#ls-hint').isDisabled(), true);
    await page.locator('#ls-options button').nth(2).click();
    assert.equal(await page.locator('#ls-score').textContent(), 'Score 50');
    await page.locator('#ls-lang').click();
    assert.equal(await page.locator('#ls-play').getAttribute('dir'), 'rtl');
    await page.reload();
    assert.equal(await page.locator('#ls-play').getAttribute('dir'), 'rtl');
    await page.locator('#ls-start').click();
    assert.equal(await page.locator('#ls-options button').nth(2).isDisabled(), true);
    assert.equal(await page.locator('#ls-score').textContent(), 'النقاط 50');
    await page.screenshot({ path: 'test-results/puzzle-ar.png', fullPage: true });
    await page.locator('#ls-lang').click();
    await page.locator('#ls-next').click();
    await page.locator('#ls-options button').nth(1).click();
    await page.locator('#ls-next').click();
    for (const letter of ['B', 'A', 'C']) await page.locator('.ls-order button').filter({ hasText: letter }).click();
    await page.getByRole('button', { name: 'Check order', exact: true }).click();
    await page.locator('#ls-next').click();
    await page.locator('#ls-options button').nth(2).click();
    await page.locator('#ls-next').click();
    await page.locator('#ls-options button').nth(0).click();
    await page.locator('#ls-next').click();
    await page.locator('.ls-pad button[aria-label="down"]').click();
    assert.equal(await page.locator('#ls-feedback').textContent(), 'That way is blocked.');
    for (const d of ['right', 'down']) await page.locator(`.ls-pad button[aria-label="${d}"]`).click();
    await page.reload();
    await page.locator('#ls-start').click();
    assert.equal(await page.locator('.ls-maze div').nth(5).textContent(), '●');
    for (const d of ['down', 'right', 'right', 'down']) await page.locator(`.ls-pad button[aria-label="${d}"]`).click();
    await page.locator('#ls-next').click();
    for (const choice of [2, 2, 1, 1]) {
      await page.locator('#ls-options button').nth(choice).click();
      await page.locator('#ls-next').click();
    }
    assert.equal(await page.locator('#ls-total').textContent(), '950 / 1000');
    await page.reload();
    await page.locator('#ls-start').click();
    assert.equal(await page.locator('#ls-result').isVisible(), true);
    await page.locator('#ls-replay').click();
    assert.equal(await page.locator('#ls-score').textContent(), 'Score 0');
    for (const width of [320, 390, 736]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `overflow at ${width}px`);
      await page.locator('#ls-lang').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Arabic overflow at ${width}px`);
      await page.locator('#ls-lang').click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/puzzle-en.png', fullPage: true });
    assert.equal(await page.evaluate(() => window.LogicSpark.back()), true);
    assert.equal(await page.locator('#ls-home').isVisible(), true);
    assert.equal(await page.evaluate(() => window.LogicSpark.back()), false);
    await page.evaluate(() => localStorage.setItem('logicspark.progress.v1', '{invalid'));
    await page.reload();
    await page.locator('#ls-start').click();
    assert.equal(await page.locator('#ls-score').textContent(), 'Score 0');
    assert.deepEqual(errors, []);
    console.log('PASS: all 10 puzzles; score, hint, resume, maze, Arabic, replay, back navigation, corrupt save, 320/390/736 widths.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
