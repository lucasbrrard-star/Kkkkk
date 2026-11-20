// Renders preview screenshots of the car integrated in the city (development aid).
// Usage: node tests/preview.mjs [url] [outDir] [width] [height]
import { chromium, GL_ARGS } from './pw.mjs';
const url = process.argv[2] || 'http://localhost:5199/?quality=high';
const out = process.argv[3] || 'docs/screenshots';
const w = Number(process.argv[4] || 1280), h = Number(process.argv[5] || 720);
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(url);
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 240000 });
const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const hideUi = (v) => page.evaluate((v) => { document.getElementById('ui').style.display = v ? 'none' : ''; }, v);
await frames(4);
await page.screenshot({ path: `${out}/title.png` });

// --- reference composition: spawn, a few metres of driving, NIGHT DRIVE sign on the left
await page.evaluate(() => { window.__game.game.start(); window.__game.place(-4.6, -98, 0); });
await page.evaluate(() => window.__game.simulate(2.2, { throttle: 1 }));
await page.evaluate(() => window.__game.release());
await page.keyboard.down('KeyW');
await frames(8);
await page.screenshot({ path: `${out}/chase_reference.png` });
await page.keyboard.up('KeyW');
await page.evaluate(() => window.__game.place(-5, -76, 0));
// --- chase cam while driving
console.log('sim', await page.evaluate(() => JSON.stringify(window.__game.simulate(4.0, { throttle: 1 }))));
await page.evaluate(() => window.__game.release());
await page.keyboard.down('KeyW');
await frames(6);
await page.screenshot({ path: `${out}/chase_driving.png` });
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
await frames(3);
await page.screenshot({ path: `${out}/chase_braking.png` });
await page.keyboard.up('KeyS');
console.log('info', await page.evaluate(() => JSON.stringify(window.__game.info())), 'fps', await page.evaluate(() => window.__game.fps.toFixed(1)));

// --- hero shots of the stopped car (UI hidden)
await page.evaluate(() => { window.__game.place(-5, -40, 0); });
await hideUi(true);
const car = async (dx, dy, dz, tx, ty, tz, fov) => {
  // camera offsets in the car frame: dx = left, dz = forward
  await page.evaluate(([dx, dy, dz, tx, ty, tz, fov]) => {
    const p = window.__game.physics;
    const s = Math.sin(p.heading), c = Math.cos(p.heading);
    const W = (l, f) => [p.x + c * l + s * f, p.z - s * l + c * f];
    const [px, pz] = W(dx, dz), [qx, qz] = W(tx, tz);
    window.__game.shot(px, p.y + dy, pz, qx, p.y + ty, qz, fov);
  }, [dx, dy, dz, tx, ty, tz, fov]);
  await frames(4);
};
await car(-3.2, 0.95, 5.6, 0, 0.55, 0, 38); await page.screenshot({ path: `${out}/car_front34.png` });
await car(3.4, 1.3, -5.2, 0, 0.6, 0.2, 40); await page.screenshot({ path: `${out}/car_rear34.png` });
await car(2.5, 0.45, 1.6, 0.8, 0.34, 1.2, 40); await page.screenshot({ path: `${out}/car_wheel.png` });
await car(-1.6, 1.85, 1.0, 0, 0.75, -0.2, 50); await page.screenshot({ path: `${out}/car_interior.png` });
await car(-1.2, 0.35, -9.5, 0.2, 1.4, 12, 55); await page.screenshot({ path: `${out}/car_lowrear.png` });
await hideUi(false);
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
