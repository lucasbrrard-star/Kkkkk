// Testes end-to-end com Playwright (desktop + celular).
// Uso: npm run dev (em outro terminal) e depois: npm run test:e2e
// Variáveis: URL (padrão http://localhost:5173/), SHOTS (pasta para capturas).
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL = process.env.URL || 'http://localhost:5173/';
const SHOTS = process.env.SHOTS || 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? '✔' : '✘'} ${name}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function open(ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.player, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}
const st = (page) => page.evaluate(() => {
  const g = window.__game, p = g.player, cam = g.cameras.main;
  return { x: p.x, y: p.y, z: p.z, state: p.state, speed: p.speed, anim: g.pview.anim.anim, frame: g.pview.anim.frameInAnim, facing: p.shownFacing,
    camX: cam.midPoint.x, camY: cam.midPoint.y, focus: g.inter.current && g.inter.current.id };
});
const tp = (page, x, y, f = 0) => page.evaluate(([x, y, f]) => { const g = window.__game; const p = g.player; p.x = x; p.y = y; p.vx = p.vy = 0; p.facing = p.shownFacing = f; g.camCtl.snapTo(p); }, [x, y, f]);

// ------------------------------------------------------------------ DESKTOP
{
  const { ctx, page, errors } = await open({ viewport: { width: 1280, height: 720 } });
  const info = await page.evaluate(() => {
    const g = window.__game;
    const layers = Object.keys(g.world.layers);
    const tiles = layers.reduce((s, k) => s + g.world.layers[k].layer.data.flat().filter((t) => t && t.index >= 0).length, 0);
    return { layers, tiles, objects: g.world.sprites.length, player: !!g.pview.sprite.visible };
  });
  check('Jogo inicia e o mapa carrega (tilemap em camadas)', info.layers.length >= 6 && info.tiles > 3000, `${info.layers.join(', ')} · ${info.tiles} tiles · ${info.objects} objetos`);
  check('Personagem aparece', info.player);
  await page.screenshot({ path: `${SHOTS}/desktop-inicio.png` });

  // caminhada
  await tp(page, 39.3, 20.6, 0);
  let a = await st(page);
  await page.keyboard.down('KeyD'); await page.waitForTimeout(700);
  let b = await st(page);
  check('Caminhada (teclado D)', b.anim === 'walk' && Math.hypot(b.x - a.x, b.y - a.y) > 0.3, `anim=${b.anim} desloc=${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} dir=${b.facing}`);
  await page.screenshot({ path: `${SHOTS}/desktop-caminhada.png` });
  // corrida
  await page.keyboard.down('ShiftLeft'); await page.waitForTimeout(900);
  b = await st(page);
  check('Corrida (Shift)', b.anim === 'run' && b.speed > 3.5, `anim=${b.anim} vel=${b.speed.toFixed(2)} tiles/s`);
  await page.screenshot({ path: `${SHOTS}/desktop-corrida.png` });
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyD');
  await page.waitForTimeout(500);
  b = await st(page);
  check('Parar → idle', b.state === 'idle' && b.anim === 'idle', `state=${b.state}`);
  // câmera
  const cs = await page.evaluate(() => { const g = window.__game; const p = g.player; const s = { x: (p.x - p.y) * 16, y: (p.x + p.y) * 8 }; const c = g.cameras.main.midPoint; return Math.hypot(s.x - c.x, s.y - c.y); });
  check('Câmera acompanha o personagem', cs < 60, `distância ao centro=${cs.toFixed(1)}px`);

  // pulo
  await tp(page, 38.9, 22.0, 0);
  await page.keyboard.press('Space');
  const seen = new Set(); let maxZ = 0;
  for (let i = 0; i < 30; i++) { const s = await st(page); if (s.anim === 'jump') seen.add(s.frame); maxZ = Math.max(maxZ, s.z); if (i === 6) await page.screenshot({ path: `${SHOTS}/desktop-pulo.png` }); await page.waitForTimeout(30); }
  check('Pulo (Espaço) com altura visual separada', maxZ > 0.5, `altura máx=${maxZ.toFixed(2)} · quadros de pulo vistos=${[...seen].sort().join(',')}`);
  await page.waitForTimeout(500);
  b = await st(page);
  check('Aterrissa e volta ao chão', b.z === 0 && b.state === 'idle', `z=${b.z} state=${b.state}`);

  // colisão com a casa 1 (parede +y em y=35.4): andar para "cima" na tela a partir do jardim
  await tp(page, 19.5, 36.4, 4);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1500); await page.keyboard.up('KeyW');
  b = await st(page);
  check('Colisão com casa (não atravessa parede)', b.y > 35.4 + 0.15, `y=${b.y.toFixed(2)} (parede em 35.40)`);
  // colisão com o mar
  await tp(page, 47, 30, 0);
  await page.keyboard.down('KeyD'); await page.keyboard.down('KeyS'); await page.waitForTimeout(2500); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyS');
  b = await st(page);
  const onWater = await page.evaluate(([x, y]) => window.__game.world.terrainAt(x, y) === 0, [b.x, b.y]);
  check('Colisão com o mar / limites', !onWater, `pos=(${b.x.toFixed(1)}, ${b.y.toFixed(1)})`);
  // pulo sobre obstáculo baixo (banco da praça, altura 0.65)
  await tp(page, 28.6, 16.0, 0);
  await page.keyboard.down('KeyS'); await page.keyboard.down('KeyD');
  await page.waitForTimeout(150); await page.keyboard.press('Space');
  await page.waitForTimeout(900); await page.keyboard.up('KeyS'); await page.keyboard.up('KeyD');
  b = await st(page);
  check('Pulo sobre obstáculo baixo (banco)', b.x + b.y > 28.6 + 16.0 + 1.5, `pos=(${b.x.toFixed(2)}, ${b.y.toFixed(2)})`);

  // interações
  await tp(page, 19.5, 24.0, 0); await page.waitForTimeout(200);
  b = await st(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  let panel = await page.evaluate(() => { const p = document.getElementById('panel'); return { vis: !p.classList.contains('hidden'), text: p.innerText }; });
  check('Interação com terreno vazio', b.focus === 'lot1' && panel.vis && /Disponível/.test(panel.text) && /Em breve/.test(panel.text), `foco=${b.focus}`);
  await page.screenshot({ path: `${SHOTS}/desktop-terreno.png` });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(150);

  await tp(page, 19.1, 36.4, 0); await page.waitForTimeout(250);
  b = await st(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  panel = await page.evaluate(() => { const p = document.getElementById('panel'); return { vis: !p.classList.contains('hidden'), text: p.innerText }; });
  check('Interação com casa', b.focus === 'casa1' && panel.vis && /Casa 1/.test(panel.text), `foco=${b.focus}`);
  await page.screenshot({ path: `${SHOTS}/desktop-casa.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);

  await tp(page, 38.6, 27.6, 6); await page.waitForTimeout(250);
  b = await st(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  panel = await page.evaluate(() => { const p = document.getElementById('panel'); return { vis: !p.classList.contains('hidden'), text: p.innerText }; });
  check('Ponto de ônibus (nome + painel informativo)', b.focus === 'ponto' && panel.vis && /Parada Orla Central/.test(panel.text) && /Próximo ônibus/.test(panel.text), `foco=${b.focus}`);
  await page.screenshot({ path: `${SHOTS}/desktop-ponto-onibus.png` });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(150);

  const npcPos = await page.evaluate(() => { const n = window.__game.npc.actor; return { x: n.x, y: n.y }; });
  await tp(page, npcPos.x - 0.9, npcPos.y, 0); await page.waitForTimeout(250);
  b = await st(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(1200);
  const dlg = await page.evaluate(() => { const d = document.getElementById('dialog'); return { vis: !d.classList.contains('hidden'), text: d.innerText }; });
  check('NPC fala ao interagir', b.focus === 'npc' && dlg.vis && dlg.text.length > 20, dlg.text.split('\n')[1] || '');
  await page.screenshot({ path: `${SHOTS}/desktop-npc.png` });
  await page.keyboard.press('KeyE'); await page.waitForTimeout(150);

  // ônibus em movimento
  const bus1 = await page.evaluate(() => window.__game.bus.s);
  await page.waitForTimeout(1200);
  const bus2 = await page.evaluate(() => window.__game.bus.s);
  check('Ônibus circula pela rota', bus1 !== bus2, `s: ${bus1.toFixed(1)} → ${bus2.toFixed(1)}`);

  // menu
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  let menuVis = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  check('Esc abre o menu de pausa', menuVis);
  await page.screenshot({ path: `${SHOTS}/desktop-menu.png` });
  await page.click('[data-act=settings]');
  await page.click('#s-name'); await page.keyboard.press('Control+A');
  const before = await st(page);
  await page.keyboard.type('Lucas WASD');
  const after = await st(page);
  const nm = await page.evaluate(() => document.getElementById('pname').textContent);
  check('Digitar no campo de texto não move o personagem', nm === 'Lucas WASD' && before.x === after.x && before.y === after.y, `nome="${nm}"`);
  await page.screenshot({ path: `${SHOTS}/desktop-config.png` });
  await page.click('#menu-settings [data-act=back]');
  await page.click('[data-act=controls]');
  const ctlVis = await page.evaluate(() => !document.getElementById('menu-controls').classList.contains('hidden'));
  await page.click('#menu-controls [data-act=back]');
  await tp(page, 20, 20, 3);
  await page.click('[data-act=restart]'); await page.waitForTimeout(200);
  b = await st(page);
  menuVis = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  check('Menu: Configurações, Controles e Reiniciar funcionam', ctlVis && !menuVis && Math.abs(b.x - 39.3) < 0.01, `pos após reiniciar=(${b.x.toFixed(1)}, ${b.y.toFixed(1)})`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.click('[data-act=resume]');
  menuVis = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  check('Continuar fecha o menu', !menuVis);

  // desempenho medido (headless com GPU emulada por software — subestima o real)
  const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); }; requestAnimationFrame(f); }));
  check('FPS medido (renderização por software, headless)', fps > 10, `${fps.toFixed(0)} FPS`);
  check('Sem erros críticos no console (desktop)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

// ------------------------------------------------------------------ CELULAR (toque)
{
  const { ctx, page, errors } = await open({ ...devices['Pixel 7'] });
  await page.screenshot({ path: `${SHOTS}/mobile-inicio.png` });
  const touchVis = await page.evaluate(() => !document.getElementById('touch').classList.contains('hidden'));
  check('Controles de toque visíveis no celular', touchVis);
  const cdp = await ctx.newCDPSession(page);
  const joy = await page.locator('#joy').boundingBox();
  const run = await page.locator('#b-run').boundingBox();
  const jc = { x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 };
  const rc = { x: run.x + run.width / 2, y: run.y + run.height / 2 };
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i })) });

  await tp(page, 39.3, 20.6, 0);
  let a = await st(page);
  // inclinação parcial (≈40%) → caminhada proporcional
  await touch('touchStart', [{ ...jc, id: 1 }]);
  await touch('touchMove', [{ x: jc.x - joy.width * 0.2, y: jc.y, id: 1 }]);
  await page.waitForTimeout(1600);
  let b = await st(page);
  const partial = b.speed;
  check('Joystick responde ao toque (movimento proporcional)', Math.hypot(b.x - a.x, b.y - a.y) > 0.15 && b.anim === 'walk' && partial < 2.6, `vel=${partial.toFixed(2)} anim=${b.anim} desloc=${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)}`);
  // inclinação total + segurar Correr (multitoque)
  await touch('touchMove', [{ x: jc.x - joy.width * 0.45, y: jc.y + joy.width * 0.05, id: 1 }]);
  await touch('touchStart', [{ x: jc.x - joy.width * 0.45, y: jc.y + joy.width * 0.05, id: 1 }, { ...rc, id: 2 }]);
  await page.waitForTimeout(900);
  b = await st(page);
  check('Multitoque: joystick + botão Correr', b.anim === 'run' && b.speed > 3.5, `vel=${b.speed.toFixed(2)} anim=${b.anim}`);
  await page.screenshot({ path: `${SHOTS}/mobile-corrida.png` });
  await touch('touchEnd', [{ x: jc.x + joy.width * 0.45, y: jc.y, id: 1 }]);
  await touch('touchEnd', []);
  await page.waitForTimeout(500);
  b = await st(page);
  const knob = await page.evaluate(() => getComputedStyle(document.getElementById('knob')).transform);
  check('Joystick retorna ao centro ao soltar', b.state === 'idle' && (knob === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(knob)), `transform=${knob}`);

  // botão pular
  await page.locator('#b-jump').tap();
  let maxZ = 0; for (let i = 0; i < 12; i++) { maxZ = Math.max(maxZ, (await st(page)).z); await page.waitForTimeout(30); }
  check('Botão Pular funciona', maxZ > 0.4, `altura máx=${maxZ.toFixed(2)}`);
  await page.waitForTimeout(500);
  // botão interagir
  await tp(page, 19.5, 24.0, 0); await page.waitForTimeout(300);
  const enabled = await page.evaluate(() => !document.getElementById('b-interact').classList.contains('disabled'));
  await page.locator('#b-interact').tap(); await page.waitForTimeout(300);
  const pv = await page.evaluate(() => !document.getElementById('panel').classList.contains('hidden'));
  check('Botão Interagir habilita perto de objeto e abre painel', enabled && pv);
  await page.screenshot({ path: `${SHOTS}/mobile-interacao.png` });
  // botão de menu (engrenagem)
  await page.locator('#panel-x').tap();
  await page.locator('#btn-menu').tap(); await page.waitForTimeout(200);
  const mv = await page.evaluate(() => !document.getElementById('menu').classList.contains('hidden'));
  check('Botão de configurações abre o menu (toque)', mv);
  await page.screenshot({ path: `${SHOTS}/mobile-menu.png` });
  await page.locator('[data-act=resume]').tap();
  // HUD não bloqueia a área de jogo: verifica cobertura da tela
  const cover = await page.evaluate(() => {
    const W = innerWidth, H = innerHeight; let area = 0;
    for (const id of ['joy', 'b-interact', 'b-jump', 'b-run']) { const r = document.getElementById(id).getBoundingClientRect(); area += r.width * r.height; }
    for (const el of document.querySelectorAll('.hud-top .card, .icon-btn')) { const r = el.getBoundingClientRect(); area += r.width * r.height; }
    return area / (W * H);
  });
  check('Interface ocupa pouco da tela', cover < 0.2, `${(cover * 100).toFixed(1)}% da tela`);
  // paisagem
  await page.setViewportSize({ width: 915, height: 412 }); await page.waitForTimeout(600);
  await tp(page, 30, 27.5, 0); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/mobile-paisagem.png` });
  check('Sem erros críticos no console (celular)', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações aprovadas`);
fs.writeFileSync(`${SHOTS}/../test-results.json`, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
