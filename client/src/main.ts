// Cidade Viva — ponto de entrada do cliente.
// Fluxo: carregamento → construção da cidade → criação do personagem (vitrine 3D) →
// conexão (servidor real ou offline) → jogo em terceira pessoa.
import './ui/style.css';
import * as THREE from 'three';
import { CURB, LOTS, Lot, groundHeight } from '../../shared/city';
import type { AnimState, Appearance, AvatarId, LotState, Profile, S2C } from '../../shared/protocol';
import { Ambience } from './audio';
import { Assets } from './core/assets';
import { Engine } from './core/engine';
import type { QualitySetting } from './core/quality';
import { beaconMaterial } from './gfx/materials';
import { Net } from './net/net';
import { Remotes } from './net/remotes';
import { Avatar } from './player/avatar';
import { ThirdPersonCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { Input } from './player/input';
import { isTouch, prefs } from './ui/dom';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Settings, brokerSheet, guideSheet, lotSheet, mapSheet, serviceSheet, settingsSheet, wardrobeSheet } from './ui/panels';
import { Loading, loginScreen } from './ui/screens';
import { Tags } from './ui/tags';
import { City, Interactable } from './world/city';

declare global { interface Window { __game?: Record<string, unknown> } }

const LIA = { x: -3.2, z: 18.2 };

async function boot() {
  const loading = new Loading();
  const app = document.getElementById('app')!;
  const ui = document.getElementById('ui')!;
  let engine: Engine;
  try { engine = new Engine(app, { antialias: prefs.get<string>('quality', 'auto') !== 'baixa' }); } catch (e) {
    loading.error('Não foi possível iniciar o WebGL neste navegador/aparelho.');
    console.error(e);
    return;
  }
  const settings: Settings = { quality: prefs.get<QualitySetting>('quality', 'auto'), volume: 0.7, sensitivity: 1, fps: false, names: true, ...prefs.get<Partial<Settings>>('settings', {}) };
  const forcedQ = new URLSearchParams(location.search).get('q') as QualitySetting | null; // ?q=alta (testes)
  if (forcedQ && ['auto', 'baixa', 'media', 'alta'].includes(forcedQ)) { settings.quality = forcedQ; prefs.set('quality', forcedQ); }
  if (settings.quality !== 'auto') engine.setQuality(settings.quality);
  const assets = new Assets();
  assets.anisotropy = engine.preset.anisotropy;
  assets.onProgress = (f) => loading.progress(0.05 + f * 0.85);
  try { await assets.init(); } catch { loading.error('Falha ao baixar os arquivos do jogo. Verifique a conexão.'); return; }
  const city = new City(engine, assets);
  await city.build((s) => loading.text(s));
  loading.text('Chamando os moradores…');
  await Promise.all([assets.model('avatar_m'), assets.model('avatar_f')]);

  // guia Lia (NPC fixo do pórtico)
  const lia = await Avatar.create(assets, { avatar: 'avatar_f', outfit: 4 });
  lia.root.position.set(LIA.x, CURB, LIA.z);
  lia.root.rotation.y = Math.atan2(-LIA.x, -LIA.z);
  engine.scene.add(lia.root);
  city.colliders.push({ kind: 'circle', x: LIA.x, z: LIA.z, r: 0.35, h: 2 });
  city.interactables.push({ id: 'lia', kind: 'npc', x: LIA.x, z: LIA.z, r: 2.8, title: 'Guia Lia' });

  // vitrine do login: personagem em frente ao chafariz
  const show = { x: 0, z: 12.6 };
  let preview: Avatar | null = null;
  let previewKey = '';
  let previewYaw = 0.35;
  const setPreview = async (avatar: AvatarId, outfit: number) => {
    const key = `${avatar}:${outfit}`;
    if (key === previewKey) return;
    previewKey = key;
    const a = await Avatar.create(assets, { avatar, outfit });
    if (previewKey !== key) { a.dispose(); return; }
    preview?.dispose();
    preview = a;
    a.root.position.set(show.x, CURB, show.z);
    engine.scene.add(a.root);
    a.setState('idle');
  };

  loading.text('Preparando gráficos…');
  await setPreview(prefs.get<AvatarId>('avatar', 'avatar_m'), prefs.get('outfit', 0));
  try { await engine.renderer.compileAsync(engine.scene, engine.camera); } catch { /* opcional */ }
  loading.progress(1);
  loading.done();

  // ---------------------------------------------------------------- vitrine (antes de entrar)
  let mode: 'login' | 'game' = 'login';
  const frameShowcase = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const portrait = h > w && w < 760;
    const cam = engine.camera;
    cam.position.set(show.x + 0.2, CURB + 1.35, show.z + (portrait ? 4.2 : 3.6));
    cam.lookAt(show.x, CURB + 0.95, show.z);
    if (portrait) cam.setViewOffset(w, h, 0, h * 0.2, w, h);
    else if (w > 760) cam.setViewOffset(w, h, w * 0.17, 0, w, h);
    else cam.setViewOffset(w, h, w * 0.2, 0, w, h);
  };
  let drag: { x: number } | null = null;
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX }; };
  const onMove = (e: PointerEvent) => { if (drag) { previewYaw += (e.clientX - drag.x) * 0.012; drag.x = e.clientX; } };
  const onUp = () => { drag = null; };
  app.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  engine.focus.set(show.x, 0, show.z);
  engine.onTick((dt, t) => {
    city.update(t);
    city.updateLod(engine.camera.position);
    if (lia.root.visible) lia.update(dt);
    if (mode !== 'login') return;
    frameShowcase();
    if (preview) { if (!drag) previewYaw += dt * 0.25; preview.root.rotation.y = previewYaw; preview.update(dt); }
  });

  const login = await loginScreen(ui, settings.quality, (a, o) => void setPreview(a, o));
  app.removeEventListener('pointerdown', onDown); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
  engine.camera.clearViewOffset();
  settings.quality = login.quality;
  prefs.set('settings', settings);
  engine.setQuality(login.quality);
  const audio = new Ambience();
  audio.volume = settings.volume;
  audio.start();

  // ---------------------------------------------------------------- jogo
  const input = new Input();
  const hud = new Hud(ui, input);
  const tags = new Tags(hud.tagsLayer);
  tags.showNames = settings.names;
  const minimap = new Minimap(hud.minimapCanvas, assets.manifest.models);
  const net = new Net();
  const remotes = new Remotes(assets, engine.scene);
  let look: Appearance = { avatar: login.avatar, outfit: login.outfit };
  const pv = preview as Avatar | null;
  let player = pv && previewKey === `${look.avatar}:${look.outfit}` ? pv : await Avatar.create(assets, look);
  if (pv && player !== pv) pv.dispose();
  preview = null;
  engine.scene.add(player.root);
  const controller = new PlayerController(player, city, input);
  const cam = new ThirdPersonCamera(engine.camera, engine.renderer.domElement, () => city.colliders);
  cam.sensitivity = settings.sensitivity;
  const lots = new Map<string, LotState>();
  let profile: Profile = { token: '', name: login.name, coins: 0, gems: 0, level: 1, lots: [] };
  let myId = '';
  let ready = false;
  let waypoint: { lot: Lot; mesh: THREE.Mesh } | null = null;
  const beaconMat = beaconMaterial(new THREE.Color(0xff4f9a));
  const beaconGeo = new THREE.CylinderGeometry(0.9, 0.9, 40, 20, 1, true);
  beaconGeo.translate(0, 20, 0);

  controller.onStep = (run) => audio.step(run);
  tags.add('lia', 'Guia Lia', () => lia.root.position, 'npc', 1.95);
  tags.add('me', login.name, () => controller.pos, 'me', 2.0);
  const questLia = () => tags.mark('lia', !prefs.get<string[]>('quests', []).includes('lia'));
  questLia();
  hud.setOnline(1, 'conectando…', 'online');
  hud.addChat('', 'Conectando ao servidor da Cidade Viva…', 'sys');

  const setWaypoint = (lot: Lot | null) => {
    if (waypoint) { waypoint.mesh.removeFromParent(); waypoint = null; minimap.waypoint = null; }
    if (!lot) return;
    const mesh = new THREE.Mesh(beaconGeo, beaconMat);
    mesh.position.set(lot.x, CURB, lot.z);
    mesh.renderOrder = 3;
    engine.scene.add(mesh);
    waypoint = { lot, mesh };
    minimap.waypoint = { x: lot.x, z: lot.z, label: lot.id };
    hud.toast(`Destino marcado: terreno ${lot.id}. Siga o feixe rosa!`, 'info');
  };

  const changeLook = async (avatar: AvatarId, outfit: number) => {
    look = { avatar, outfit };
    prefs.set('avatar', avatar); prefs.set('outfit', outfit);
    const fresh = await Avatar.create(assets, look);
    player.dispose();
    player = fresh;
    controller.avatar = fresh;
    engine.scene.add(fresh.root);
    net.send({ t: 'look', look });
    hud.toast('Visual atualizado!', 'success');
    audio.ui('ok');
  };

  // ---------------------------------------------------------------- mensagens do servidor
  net.on((m: S2C) => {
    switch (m.t) {
      case 'welcome': {
        myId = m.you;
        profile = m.profile;
        if (net.mode === 'online') prefs.set('token', m.profile.token);
        controller.teleport(m.me.x, m.me.z, m.me.ry);
        cam.snap(controller.pos, controller.ry);
        hud.setProfile(profile);
        hud.setOnline(m.online, m.room, net.mode);
        for (const l of m.lots) { lots.set(l.id, l); city.setLotState(l); }
        minimap.setLots(m.lots);
        for (const p of m.players) addRemote(p);
        ready = true;
        hud.banner('BEM-VINDO(A) À', 'Cidade Viva');
        hud.addChat('', net.mode === 'online' ? `Você entrou em ${m.room}. Diga oi! 👋` : 'Modo offline: sem servidor por perto, moradores simulados para você explorar.', 'sys');
        setTimeout(() => { if (!prefs.get<string[]>('quests', []).includes('lia')) hud.toast('A Guia Lia está esperando você no pórtico ao sul da praça!', 'info'); }, 4500);
        break;
      }
      case 'join': addRemote(m.p); hud.addChat('', `${m.p.name} chegou na cidade.`, 'sys'); break;
      case 'leave': { const r = remotes.map.get(m.id); if (r) hud.addChat('', `${r.info.name} saiu.`, 'sys'); remotes.remove(m.id); tags.remove(m.id); break; }
      case 'snap': remotes.snapshot(m.p); break;
      case 'chat': {
        const me = m.id === myId;
        hud.addChat(m.name, m.text, me ? 'me' : 'other');
        tags.say(me ? 'me' : m.id, m.text);
        if (!me) audio.ui('msg');
        break;
      }
      case 'emote': remotes.emote(m.id, m.anim); break;
      case 'look': void remotes.setLook(m.id, m.look); break;
      case 'correct': controller.teleport(m.x, m.z, controller.ry); break;
      case 'lot': {
        lots.set(m.lot.id, m.lot);
        city.setLotState(m.lot);
        minimap.setLot(m.lot);
        if (m.lot.owner && m.lot.ownerName !== profile.name) hud.addChat('', `${m.lot.ownerName} comprou o terreno ${m.lot.id}!`, 'sys');
        if (waypoint?.lot.id === m.lot.id && m.lot.owner) setWaypoint(null);
        break;
      }
      case 'profile': profile = m.profile; hud.setProfile(profile); break;
      case 'notice': hud.toast(m.text, m.level); if (m.level === 'success') audio.ui('ok'); break;
      case 'online': hud.setOnline(m.count, m.room, net.mode); break;
      case 'pong': break;
    }
  });

  function addRemote(p: { id: string; name: string; look: Appearance; x: number; y: number; z: number; ry: number; anim: AnimState }) {
    void remotes.add(p);
    tags.add(p.id, p.name, () => { const r = remotes.map.get(p.id); return r?.avatar ? r.pos : null; }, 'player', p.look.avatar === 'avatar_f' ? 1.95 : 2.05);
  }

  // ---------------------------------------------------------------- ações da HUD
  hud.on.chat = (text) => {
    net.send({ t: 'chat', text });
    if (/\b(oi|ol[aá]|eae|e a[ií]|bom dia|boa tarde|boa noite)\b/i.test(text)) hud.quest('oi');
  };
  hud.on.emote = (a) => {
    if (controller.seat) controller.standUp();
    controller.emote(a);
    net.send({ t: 'emote', anim: a });
    hud.quest('emote');
  };
  let current: Interactable | null = null;
  hud.on.interact = () => {
    if (controller.seat) { controller.standUp(); return; }
    const it = current;
    if (!it) return;
    audio.ui();
    switch (it.kind) {
      case 'lot': { const lot = it.data as Lot; lotSheet(hud, lot, lots.get(lot.id), profile, (id) => net.send({ t: 'buyLot', id })); hud.quest('lote'); break; }
      case 'bench': controller.sit(city.seats[it.data as number]); hud.quest('sentar'); break;
      case 'npc': guideSheet(hud, profile.name, () => { hud.quest('lia'); questLia(); }); break;
      case 'service':
        if (it.id === 'corretora') { brokerSheet(hud, lots, (l) => setWaypoint(l)); hud.quest('corretora'); }
        else if (it.id === 'loja') wardrobeSheet(hud, look, (a, o) => void changeLook(a, o));
        else serviceSheet(hud, it.id);
        break;
    }
  };
  hud.on.settings = () => settingsSheet(hud, settings, engine.level, (s) => {
    if (s.quality !== engine.setting) engine.setQuality(s.quality);
    audio.setVolume(s.volume);
    cam.sensitivity = s.sensitivity;
    tags.showNames = s.names;
    prefs.set('settings', s); prefs.set('quality', s.quality);
  }, { onWardrobe: () => wardrobeSheet(hud, look, (a, o) => void changeLook(a, o)), onLeave: () => location.reload(), mode: net.mode, ping: net.ping });
  hud.on.map = () => mapSheet(hud, minimap.base, controller.pos);

  const label = (it: Interactable): string => {
    if (it.kind === 'lot') { const s = lots.get(it.id); return s?.owner ? `Terreno ${it.id} · de ${s.ownerName}` : `Ver terreno ${it.id}`; }
    if (it.kind === 'bench') return 'Sentar';
    if (it.kind === 'npc') return 'Falar com a Lia';
    return ({ corretora: 'Falar com a corretora', loja: 'Abrir provador', prefeitura: 'Entrar na Prefeitura', cafe: 'Café & Lounge', galeria: 'Galeria Comercial' } as Record<string, string>)[it.id] ?? it.title;
  };
  const nearest = (): Interactable | null => {
    const p = controller.pos;
    let best: Interactable | null = null, bd = Infinity;
    for (const it of city.interactables) {
      let d: number;
      if (it.kind === 'lot') {
        const l = it.data as Lot;
        const ox = Math.max(0, Math.abs(p.x - l.x) - l.w / 2), oz = Math.max(0, Math.abs(p.z - l.z) - l.d / 2);
        d = Math.hypot(ox, oz);
        if (d > 1.2) continue;
        d += 1.5; // prioridade menor que bancos/NPC
      } else {
        d = Math.hypot(p.x - it.x, p.z - it.z);
        if (d > it.r) continue;
      }
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  };

  // ---------------------------------------------------------------- laço do jogo
  let sendAcc = 0, lastSent = '', keepAlive = 0, fpsAcc = 0;
  const lookAtTmp = new THREE.Vector3();
  engine.onTick((dt) => {
    if (mode !== 'game' || !ready) return;
    input.update();
    controller.update(dt, cam.yaw);
    cam.update(dt, controller.pos, controller.ry, controller.speed > 0.4 && !controller.seat, controller.seat ? 1.05 : 1.55);
    player.update(dt);
    engine.focus.copy(controller.pos);
    remotes.update(dt, engine.camera.position, engine.preset.remoteAnimDistance);
    // Lia olha para quem chega perto
    const dl = Math.hypot(controller.pos.x - LIA.x, controller.pos.z - LIA.z);
    const liaWant = dl < 7 ? Math.atan2(controller.pos.x - LIA.x, controller.pos.z - LIA.z) : Math.atan2(-LIA.x, -LIA.z);
    let dr = liaWant - lia.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    lia.root.rotation.y += dr * Math.min(1, dt * 3);
    lia.root.visible = engine.camera.position.distanceTo(lookAtTmp.set(LIA.x, 1, LIA.z)) < 90;
    // interação contextual
    current = hud.sheetOpen ? null : nearest();
    hud.setInteract(controller.seat ? 'Levantar' : current ? label(current) : null);
    if (current?.kind === 'lot' && !lots.get(current.id)?.owner && Math.hypot(Math.max(0, Math.abs(controller.pos.x - current.x) - (current.data as Lot).w / 2), Math.max(0, Math.abs(controller.pos.z - current.z) - (current.data as Lot).d / 2)) === 0) hud.quest('lote');
    // destino
    if (waypoint) {
      beaconMat.uniforms.uTime.value += dt;
      const l = waypoint.lot;
      if (Math.abs(controller.pos.x - l.x) < l.w / 2 && Math.abs(controller.pos.z - l.z) < l.d / 2) { hud.toast(`Você chegou ao terreno ${l.id}!`, 'success'); audio.ui('ok'); setWaypoint(null); }
    }
    // rede: 10 Hz quando muda, 1 Hz parado
    sendAcc += dt; keepAlive += dt;
    if (sendAcc >= 0.1) {
      sendAcc = 0;
      const p = controller.pos;
      const s = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${controller.ry.toFixed(2)},${controller.anim}`;
      if (s !== lastSent || keepAlive > 1) {
        lastSent = s; keepAlive = 0;
        net.send({ t: 'state', x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), ry: +controller.ry.toFixed(3), anim: controller.anim });
      }
    }
    tags.update(engine.camera, window.innerWidth, window.innerHeight);
    const others: { x: number; z: number }[] = [];
    for (const r of remotes.map.values()) others.push(r.pos);
    minimap.update(dt, { x: controller.pos.x, z: controller.pos.z, ry: controller.ry }, others, [LIA]);
    audio.update(dt, controller.pos.x, controller.pos.z);
    fpsAcc += dt;
    if (settings.fps && fpsAcc > 0.5) { fpsAcc = 0; const ri = engine.renderer.info.render; hud.setFps(true, engine.monitor.fps, `· ${engine.level} · ${(engine.monitor.scale * 100) | 0}% · ${ri.calls} draws · ${(ri.triangles / 1000) | 0}k tris`); }
    else if (!settings.fps) hud.setFps(false);
    input.endFrame();
  });

  mode = 'game';
  await net.connect(login.name, look, prefs.get<string | undefined>('token', undefined), { forceOffline: new URLSearchParams(location.search).has('offline') });

  // ganchos para testes automatizados e depuração
  window.__game = { engine, city, controller, cam, net, remotes, hud, lots, get profile() { return profile; }, input, LOTS, groundHeight, isTouch: isTouch() };
}

boot().catch((e) => { console.error(e); const el = document.querySelector('#loading .step'); if (el) el.textContent = 'Erro ao iniciar: ' + (e as Error).message; });
