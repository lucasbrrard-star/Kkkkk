// End-to-end test: runs the production build in headless Chromium and checks
// movement, jump, shooting, damage, zombie chase/pathing/attack, death/restart,
// pause and multi-touch mobile controls. Usage: npm run build && npm test
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT, 'screenshots');
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await sleep(150); }
  return false;
}

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  await sleep(2500);
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    // ---------------- desktop ----------------
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto('http://localhost:4173/?q=low');
    const booted = await waitFor(page, () => !!window.__game && window.__game.state === 'menu');
    check('Boot: game loads and shows the start menu', booted);
    await sleep(1500);
    await page.screenshot({ path: path.join(SHOTS, 'menu.png') });

    await page.click('#playBtn');
    check('Menu: JOGAR starts the game', await waitFor(page, () => window.__game.state === 'playing'));
    await page.evaluate(() => { window.__game.clearZombies(); });

    // movement
    const p0 = await page.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z }));
    await page.keyboard.down('KeyW'); await page.evaluate(() => __game.step(1.5)); await page.keyboard.up('KeyW');
    const p1 = await page.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z }));
    const walked = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('Movement: W walks forward', walked > 0.8, `moved ${walked.toFixed(2)} m`);
    // run: compare max horizontal speed
    await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
    let vmax = 0; for (let i = 0; i < 10; i++) { await page.evaluate(() => __game.step(0.12)); vmax = Math.max(vmax, await page.evaluate(() => Math.hypot(__game.player.vel.x, __game.player.vel.z))); }
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    check('Movement: Shift runs (speed > walk speed 4.3)', vmax > 5.5, `max speed ${vmax.toFixed(2)} m/s`);
    // jump
    await page.evaluate(() => __game.step(0.5));
    await page.keyboard.press('Space');
    let ymax = 0; for (let i = 0; i < 12; i++) { await page.evaluate(() => __game.step(0.06)); ymax = Math.max(ymax, await page.evaluate(() => __game.player.pos.y)); }
    check('Jump: Space lifts the player', ymax > 0.3, `peak ${ymax.toFixed(2)} m`);
    await page.evaluate(() => __game.step(0.8));

    // collision: walk into a building wall (Q1 brick building spans x 9..18 at z 9.5..18.5)
    await page.evaluate(() => { __game.player.pos.set(6, 0, 14); __game.player.vel.set(0, 0, 0); __game.cam.yaw = -Math.PI / 2; __game.cam.pitch = 0; });
    await page.keyboard.down('KeyW'); await page.evaluate(() => __game.step(2.5)); await page.keyboard.up('KeyW');
    const wx = await page.evaluate(() => __game.player.pos.x);
    check('Collision: player cannot walk through a building', wx < 9, `x=${wx.toFixed(2)} (wall at x=9)`);

    // shooting + damage + kill
    await page.evaluate(() => { __game.player.pos.set(0, 0, 0); __game.player.vel.set(0, 0, 0); __game.cam.yaw = Math.PI; __game.cam.pitch = 0; });
    await sleep(400);
    await page.evaluate(() => { const z = __game.spawnZombie(0, 9, 'walker', false); z.speed = 0.01; });
    await sleep(300);
    const before = await page.evaluate(() => ({ mag: __game.player.mag, kills: __game.kills, hp: __game.zombies[0].hp }));
    await page.evaluate(() => { const z = __game.zombies[0]; __game.lookAt(z.pos.x, z.pos.y + 1.2, z.pos.z); });
    await page.mouse.move(480, 270);
    await page.mouse.down();
    for (let i = 0; i < 40; i++) {
      const dead = await page.evaluate(() => { const z = __game.zombies[0]; if (z.state === 'dead') return true; __game.lookAt(z.pos.x, z.pos.y + 1.2, z.pos.z); __game.step(0.1); return false; });
      if (dead) break;
    }
    await page.mouse.up();
    const after = await page.evaluate(() => ({ mag: __game.player.mag, kills: __game.kills, st: __game.zombies[0] && __game.zombies[0].state, hp: __game.zombies[0] && __game.zombies[0].hp }));
    check('Shooting: firing consumes ammo', after.mag < before.mag, `mag ${before.mag} -> ${after.mag}`);
    check('Damage: raycast hits reduce zombie HP and kill it', after.st === 'dead' && after.kills === before.kills + 1, `hp ${before.hp} -> ${after.hp}, kills ${before.kills} -> ${after.kills}`);
    await page.evaluate(() => __game.step(0.5)); await sleep(800);
    await page.screenshot({ path: path.join(SHOTS, 'kill.png') });

    // reload
    await page.keyboard.press('KeyR');
    await page.evaluate(() => __game.step(2.2));
    const reloaded = await page.evaluate(() => __game.player.mag === 30 && __game.player.reloading === 0);
    const ammo = await page.evaluate(() => ({ mag: __game.player.mag, res: __game.player.reserve }));
    check('Reload: R refills the magazine from reserve', reloaded, `mag ${ammo.mag}, reserve ${ammo.res}`);

    // chase
    await page.evaluate(() => __game.clearZombies());
    await page.evaluate(() => { __game.player.pos.set(0, 0, 0); __game.spawnZombie(0, 14, 'walker', false); });
    const d0 = await page.evaluate(() => Math.hypot(__game.zombies[0].pos.x, __game.zombies[0].pos.z));
    await page.evaluate(() => __game.step(3));
    const ch = await page.evaluate(() => ({ d: Math.hypot(__game.zombies[0].pos.x - __game.player.pos.x, __game.zombies[0].pos.z - __game.player.pos.z), st: __game.zombies[0].state }));
    check('AI: zombie detects player within radius and chases', (ch.st === 'chase' || ch.st === 'attack') && ch.d < d0 - 1, `state=${ch.st}, dist ${d0.toFixed(1)} -> ${ch.d.toFixed(1)}`);

    // pathfinding around the bus (spans z -35.7..-24.3 at x≈-3)
    await page.evaluate(() => { __game.clearZombies(); __game.player.pos.set(-3, 0, -21); const z = __game.spawnZombie(-3, -39, 'walker', true); z.speed = 2.3; });
    let reached = false, simT = 0;
    for (; simT < 40 && !reached; simT += 0.5) reached = await page.evaluate(() => { __game.step(0.5); const z = __game.zombies[0]; return Math.hypot(z.pos.x - __game.player.pos.x, z.pos.z - __game.player.pos.z) < 2.2; });
    const pz = await page.evaluate(() => ({ x: __game.zombies[0].pos.x, z: __game.zombies[0].pos.z }));
    check('AI: zombie paths around an obstacle (bus) to reach the player', reached, `reached in ${simT.toFixed(1)} s game time, zombie at (${pz.x.toFixed(1)}, ${pz.z.toFixed(1)})`);

    // attack -> player damage
    const hp0 = await page.evaluate(() => __game.player.hp);
    await page.evaluate(() => __game.step(3));
    const hurt = await page.evaluate((h) => __game.player.hp < h, hp0);
    const hp1 = await page.evaluate(() => __game.player.hp);
    check('AI: zombie attacks in melee range and damages the player', hurt, `hp ${hp0} -> ${hp1}`);

    // pause / resume
    await page.evaluate(() => __game.clearZombies());
    await page.keyboard.press('Escape');
    const paused = await waitFor(page, () => __game.state === 'paused', null, 3000);
    const vis = await page.isVisible('#pause');
    await page.click('#resumeBtn');
    const resumed = await waitFor(page, () => __game.state === 'playing', null, 3000);
    check('Pause: Esc pauses and CONTINUAR resumes', paused && vis && resumed);

    // death + restart
    await page.evaluate(() => { __game.clearZombies(); __game.player.hp = 5; const p = __game.player.pos; __game.spawnZombie(p.x + 1.2, p.z, 'walker', true); });
    await page.evaluate(() => __game.step(4));
    const died = await waitFor(page, () => __game.state === 'dead', null, 5000);
    const goVis = await page.isVisible('#gameover');
    check('Death: HP reaching 0 shows the defeat screen', died && goVis);
    await page.screenshot({ path: path.join(SHOTS, 'gameover.png') });
    await page.click('#restartBtn');
    const rs = await waitFor(page, () => __game.state === 'playing' && __game.player.hp === 100 && __game.kills === 0 && __game.zombies.length > 0, null, 5000);
    check('Restart: REINICIAR resets player, score and enemies', rs);
    const nz = await page.evaluate(() => __game.zombies.filter((z) => z.state !== 'dead').length);
    check('AI: at least 3 active zombies at start', nz >= 3, `${nz} zombies`);

    // HQ screenshot for the deliverable
    const hq = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    hq.on('pageerror', (e) => errors.push('pageerror(hq): ' + e.message));
    await hq.goto('http://localhost:4173/');
    await waitFor(hq, () => !!window.__game);
    await hq.evaluate(() => document.getElementById('playBtn').click());
    await waitFor(hq, () => __game.state === 'playing', null, 60000);
    await hq.evaluate(() => {
      __game.clearZombies(); __game.step(0.1);
      __game.player.pos.set(1.5, 0, 6); __game.cam.yaw = Math.PI - 0.12; __game.cam.pitch = -0.02;
      [[-1.5, 15, 'walker'], [3.5, 18, 'runner'], [0.5, 23, 'brute'], [-3.5, 27, 'walker'], [5, 13, 'walker']].forEach(([x, z, t]) => { const zz = __game.spawnZombie(x, z, t, true); zz.speed = 0.25; });
    });
    await hq.evaluate(() => __game.step(1.2));
    await hq.evaluate(() => { __game.player.lastShot = 0; });
    await hq.mouse.move(640, 360); await hq.mouse.down();
    await hq.evaluate(() => { __game.player.pos.set(1.5, 0, 6); __game.cam.yaw = Math.PI - 0.12; __game.cam.pitch = -0.02; __game.player.facing = __game.cam.yaw + Math.PI; __game.step(0.35); });
    const f0 = await hq.evaluate(() => __game.frames);
    await waitFor(hq, (f) => __game.frames >= f + 2, f0, 60000);
    await hq.screenshot({ path: path.join(SHOTS, 'gameplay-hq.png') });
    await hq.mouse.up();
    await hq.close();

    // ---------------- mobile (landscape, multi-touch) ----------------
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    const mp = await ctx.newPage();
    mp.on('pageerror', (e) => errors.push('pageerror(mobile): ' + e.message));
    await mp.goto('http://localhost:4173/?q=low');
    await waitFor(mp, () => !!window.__game);
    await mp.tap('#playBtn');
    await waitFor(mp, () => __game.state === 'playing');
    await mp.evaluate(() => { __game.clearZombies(); __game.player.pos.set(0, 0, 2); });
    check('Mobile: touch controls are shown', await mp.isVisible('#bFire') && await mp.isVisible('#moveZone'));
    const cdp = await ctx.newCDPSession(mp);
    const fire = await mp.locator('#bFire').boundingBox();
    const fx = fire.x + fire.width / 2, fy = fire.y + fire.height / 2;
    const m0 = await mp.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z, mag: __game.player.mag }));
    // finger 1 on joystick zone, finger 2 on fire button simultaneously
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 300, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 240, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 150, y: 240, id: 1 }, { x: fx, y: fy, id: 2 }] });
    for (let i = 0; i < 8; i++) { await mp.evaluate(() => __game.step(0.2)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150, y: 238 + (i % 2), id: 1 }, { x: fx, y: fy, id: 2 }] }); }
    await mp.screenshot({ path: path.join(SHOTS, 'mobile.png') });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const m1 = await mp.evaluate(() => ({ x: __game.player.pos.x, z: __game.player.pos.z, mag: __game.player.mag }));
    const mv = Math.hypot(m1.x - m0.x, m1.z - m0.z);
    check('Mobile: simultaneous joystick + fire touches (move and shoot)', mv > 0.5 && m1.mag < m0.mag, `moved ${mv.toFixed(2)} m, mag ${m0.mag} -> ${m1.mag}`);
    // camera drag on right side
    const yaw0 = await mp.evaluate(() => __game.cam.yaw);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 600, y: 150, id: 3 }] });
    for (let i = 1; i <= 5; i++) { await sleep(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 600 - i * 20, y: 150, id: 3 }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mp.evaluate(() => __game.step(0.1));
    const yaw1 = await mp.evaluate(() => __game.cam.yaw);
    check('Mobile: right-side drag rotates the camera', Math.abs(yaw1 - yaw0) > 0.2, `yaw ${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
    await ctx.close();

    check('No runtime errors in console', errors.length === 0, errors.slice(0, 5).join(' | '));
  } catch (e) {
    console.error(e); check('Test harness completed', false, e.message);
  } finally {
    await browser.close(); server.kill();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  }
})();
