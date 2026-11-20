// Captura rápida: node tests/shot.mjs <out.png> [w] [h] [script-json]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [out, w = '1280', h = '720', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 30000 });
await page.waitForTimeout(800);
for (const a of JSON.parse(actions)) {
  if (a.down) await page.keyboard.down(a.down);
  if (a.up) await page.keyboard.up(a.up);
  if (a.press) await page.keyboard.press(a.press);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.eval) console.log('eval:', JSON.stringify(await page.evaluate(a.eval)));
}
await page.screenshot({ path: out });
console.log(errors.join('\n') || 'no console errors');
await browser.close();
