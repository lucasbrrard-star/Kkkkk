// Laboratório visual: abre o jogo, roda trechos de código (JSON de cenas) e tira screenshots.
// Uso: node tests/lab.mjs <saida> <cenas.json>
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const DIST = path.resolve('dist');
const OUT = path.resolve(process.argv[2]); await mkdir(OUT, { recursive: true });
const scenes = JSON.parse(await readFile(process.argv[3], 'utf8'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(path.join(DIST, p)));
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForSelector('#screen-title:not([hidden])', { timeout: 240000 });
await page.tap('#btn-start');
await page.waitForTimeout(1500);
await page.evaluate(() => { const g = window.game; g.fx.fade = 0; g.subtitle('', '', false, 0); document.getElementById('subs').classList.remove('on'); g.timers.scare = 9999; g.timers.cry = 9999; g.timers.forced = 9999; g.forcedEvent = null; });
for (const s of scenes) {
  await page.evaluate(s.code);
  await page.waitForTimeout(s.wait ?? 2000);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log("ok", s.name, await page.evaluate(() => window.__info || "")); await page.evaluate(() => { window.__info = ""; });
}
await browser.close(); server.close();
