import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
const site = resolve(root, 'guide-site/dist');
const htmlFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? htmlFiles(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : []);
let links = 0;
for (const file of htmlFiles(site)) for (const match of readFileSync(file, 'utf8').matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1]; if (/^(?:https?:|mailto:|#)/.test(href)) continue;
    assert.ok(existsSync(resolve(dirname(file), href.split('#')[0])), `Missing relative resource: ${href}`); links++;
}
const { chromium } = await import(pathToFileURL(resolve(root, 'publication/tools/browser/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
    assert.match(await page.title(), /DeepSeek/);
    await page.locator('.step').evaluateAll((nodes) => nodes.forEach((node) => { node.open = true; }));
    await page.locator('[data-step="unzip"]').check();
    assert.match(await page.locator('#progress-text').innerText(), /1 \/ 7/);
    await page.reload(); assert.ok(await page.locator('[data-step="unzip"]').isChecked());
    await page.locator('#reset-checklist').click(); assert.match(await page.locator('#progress-text').innerText(), /0 \/ 7/);
    await page.locator('#issue-search').fill('令牌'); assert.ok(await page.locator('.issue:visible').count() >= 1);
    assert.ok(await page.locator('.issue:visible').count() < await page.locator('.issue').count());
    await page.locator('#issue-search').fill('');
    await page.locator('[data-flow="local"]').click(); assert.match(await page.locator('#flow-detail').innerText(), /本地服务/);
    await page.screenshot({ path: resolve(root, 'publication/website-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto('http://127.0.0.1:4175/', { waitUntil: 'networkidle' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'Mobile layout must not overflow horizontally');
    await page.screenshot({ path: resolve(root, 'publication/website-mobile.png'), fullPage: true });
    await page.goto(pathToFileURL(resolve(site, 'index.html')).href);
    assert.ok(await page.locator('#offline-note').isVisible());
    assert.equal(await page.locator('[data-package]').first().getAttribute('href'), '#install');
    assert.deepEqual(errors, []);
    console.log(`Guide QA passed: ${links} relative resources, desktop/mobile layout, checklist persistence/reset, search, flow switching, offline entry; no page errors.`);
} finally { await browser.close(); }
