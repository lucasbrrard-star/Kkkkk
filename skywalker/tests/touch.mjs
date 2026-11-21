// Testa os controles de toque com eventos reais (CDP): joystick, olhar, gatilho, botões.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const DIST = path.resolve('dist'); const OUT = path.resolve(process.argv[2] ?? 'test-results'); await mkdir(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => { try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(await readFile(path.join(DIST, p))); } catch { res.writeHead(404); res.end(); } }).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })).newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForSelector('#screen-title:not([hidden])', { timeout: 240000 });
await page.tap('#btn-howto'); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/t1-como-jogar.png` });
await page.tap('#screen-howto .back'); await page.tap('#btn-credits'); await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/t2-creditos.png` });
await page.tap('#screen-credits .back'); await page.tap('#btn-start'); await page.waitForTimeout(1500);
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const st = () => page.evaluate(() => { const p = window.game.player; return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), ammo: p.ammo, light: p.lightOn, sprint: window.game.input.sprint }; });
const s0 = await st();
// joystick: polegar esquerdo empurra para cima por ~3 s
await touch('touchStart', [{ x: 120, y: 280, id: 1 }]);
for (let i = 1; i <= 6; i++) { await touch('touchMove', [{ x: 120, y: 280 - i * 8, id: 1 }]); await page.waitForTimeout(80); }
await page.waitForTimeout(3000);
// polegar direito arrasta para olhar enquanto anda
await touch('touchStart', [{ x: 120, y: 232, id: 1 }, { x: 560, y: 200, id: 2 }]);
for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: 120, y: 232, id: 1 }, { x: 560 - i * 15, y: 200 + i * 3, id: 2 }]); await page.waitForTimeout(40); }
await touch('touchEnd', [{ x: 120, y: 232, id: 1 }]); await touch('touchEnd', []);
await page.waitForTimeout(300);
const s1 = await st();
// botões
const tapEl = async (sel) => { const b = await page.$(sel); const r = await b.boundingBox(); await touch('touchStart', [{ x: r.x + r.width / 2, y: r.y + r.height / 2, id: 3 }]); await page.waitForTimeout(120); await touch('touchEnd', []); await page.waitForTimeout(400); };
await tapEl('#btn-fire'); await page.waitForTimeout(800);
await tapEl('#btn-light'); await tapEl('#btn-run');
const s2 = await st();
const info = await page.evaluate(() => { const r = window.game.pipe.renderer.info.render; return { calls: r.calls, tris: r.triangles, scale: window.game.pipe.scale, hdr: window.game.pipe.hdr, geoms: window.game.pipe.renderer.info.memory.geometries, tex: window.game.pipe.renderer.info.memory.textures, progs: window.game.pipe.renderer.info.programs.length }; });
await page.screenshot({ path: `${OUT}/t3-apos-toque.png` });
await page.evaluate(() => { const g = window.game; g.player.health = 5; g.onPlayerHit(40); });
await page.waitForTimeout(9000); await page.screenshot({ path: `${OUT}/t4-morte.png` });
console.log(JSON.stringify({ s0, s1, s2, info, errs }, null, 1));
await browser.close(); server.close();
