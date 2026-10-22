const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'vista-v4-qa-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '..', 'vista_v4.html')).href);
    await page.waitForFunction(() => typeof tchart !== 'undefined' && tchart);
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('[data-formula]').count(), 30);
    const baseline = await page.evaluate(() => calc(yr).totEbitda);
    const positions = await page.evaluate(() => {
      const a = document.querySelector('.settings-panel').getBoundingClientRect();
      const b = document.querySelector('.results-panel').getBoundingClientRect();
      return { left: a.x, right: b.x, topGap: Math.abs(a.top - b.top) };
    });
    assert.ok(positions.right > positions.left && positions.topGap < 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await page.evaluate(() => {
      const canvas = document.getElementById('traj');
      return Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).some((v, i) => i % 4 === 3 && v > 0);
    }), 'Chart canvas has painted pixels');
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    await page.locator('.formula-panel > summary').click();
    const med = page.locator('#formula-subMed');
    await med.fill('medActive * feeMed * 0.5');
    assert.notEqual(await page.evaluate(() => calc(yr).totEbitda), baseline);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'formula-subMed');
    await med.press('End');
    await med.pressSequentially(' +');
    assert.equal(await med.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.evaluate(() => calc(yr).totEbitda), baseline);
    await med.pressSequentially(' 1');
    assert.equal(await med.getAttribute('aria-invalid'), 'false');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'formula-subMed');
    await med.fill('<img src=x onerror=alert(1)>');
    assert.equal(await med.getAttribute('aria-invalid'), 'true');
    assert.equal(await page.locator('.formula-item img').count(), 0);
    await page.locator('[data-restore="subMed"]').click();
    assert.equal(await med.getAttribute('aria-invalid'), 'false');
    assert.equal(await page.evaluate(() => calc(yr).totEbitda), baseline);
    await page.locator('#formula-ramp').fill('start');
    await page.locator('#formula-opex').fill('rev * opexRate * 0.5');
    await page.locator('#restore-formulas').click();
    assert.equal(await page.evaluate(() => calc(yr).totEbitda), baseline);
    await page.locator('[data-y="0"]').click();
    assert.ok((await page.locator('#formula-status').textContent()).includes('Y1'));
    await page.locator('[data-tog="p1"]').click();
    await page.locator('#formula-p1').fill('commBuyers * coachFee * 12');
    await page.locator('[data-y="4"]').click();
    assert.equal(await page.evaluate(() => calc(4).p1), await page.evaluate(() => calc(4).commBuyers * D.coachFee * 12));
    await page.locator('#restore-formulas').click();
    await page.locator('#formula-subMed').scrollIntoViewIfNeeded();
    await page.locator('#trace-subMed summary').click();
    await page.screenshot({ path: path.join(output, 'editor.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const mobile = await page.evaluate(() => {
      const a = document.querySelector('.settings-panel').getBoundingClientRect();
      const b = document.querySelector('.results-panel').getBoundingClientRect();
      return b.top >= a.bottom;
    });
    assert.ok(mobile, 'Mobile uses one column');
    await page.locator('#formula-subMed').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-editor.png') });
    await page.locator('.formula-panel > summary').click();
    await page.locator('[data-panel="drivers"] > summary').click();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'mobile.png') });
    assert.deepEqual(errors, []);
    console.log('Desktop/mobile layout, chart paint, live edits, focus, fallback, restoration, and year/toggle checks passed.');
    console.log('Screenshots:', output);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
