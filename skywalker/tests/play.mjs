// Teste de fumaça no Chromium: celular na horizontal, toque, screenshots das telas e de cenas
// encenadas (cervo disfarçado, revelação, criatura na lanterna). Uso: node tests/play.mjs [saida]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const OUT = path.resolve(process.argv[2] ?? 'test-results');
await mkdir(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const data = await readFile(path.join(DIST, p));
    res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const t0 = Date.now();
await page.goto(`http://localhost:${port}/`);
await page.waitForSelector('#screen-title:not([hidden])', { timeout: 240000 });
console.log('carregou em', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-titulo.png` });
await page.tap('#btn-start');
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/02-inicio.png` });
const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps (swiftshader):', fps);
const stage = async (name, fn, wait = 2500) => { await page.evaluate(fn); await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${name}.png` }); };
// anda pela trilha
await stage('03-trilha', () => { const g = window.game; g.player.spawn(-3, 30, 0.2); g.tension = 0; });
// cervo de verdade
await stage('04-cervo', () => { const g = window.game; g.player.spawn(0, 10, 0); g.realDeer.place(0.5, -4, Math.PI * 0.6); g.realDeer.mode = 'alert'; g.world.scene.add(g.realDeer.root); });
// cervo disfarçado
await stage('05-disfarce', () => { const g = window.game; g.realDeer.root.removeFromParent(); g.player.spawn(5, -20, 0); g.fakeDeer.place(5.5, -31, Math.PI); g.fakeDeer.mode = 'still'; g.world.scene.add(g.fakeDeer.root); g.standoffT = -99; g.lookAwayT = 0; });
await stage('06-revelado', () => { const g = window.game; g.reveal(g.fakeDeer); });
await stage('07-perto', () => { const g = window.game; g.sky.hide(); g.player.spawn(3, -40, 0); g.sky.appear(3.5, -46.5, Math.PI, 'watch'); g.timers.skyCool = 999; g.sky.litTime = -99; }, 1500);
await stage('08-covil', () => { const g = window.game; g.sky.hide(); g.player.spawn(2, -82, 0); }, 2500);
await stage('09-pista', () => { const g = window.game; const it = g.world.items.find((i) => i.kind === 'clue' && i.index === 0); g.player.spawn(it.pos.x + 0.6, it.pos.z + 1.4, 0.4); g.player.pitch = -0.6; }, 2000);
await page.evaluate(() => { const g = window.game; const it = g.world.items.find((i) => i.kind === 'clue' && i.index === 0); g.takeItem(it); });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/10-evidencia.png` });
await page.evaluate(() => window.game.pause());
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/11-pausa.png` });
console.log('erros/avisos:', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e.slice(0, 300));
await browser.close(); server.close();
