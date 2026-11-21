import {camAt, layerT, PHONE} from './overhead';
import {NOTIF, PH_H, PH_W} from './Phone';

const STAGE_SCALE = 1.06; // escala aplicada ao palco do quarto

const rot = (x: number, y: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return {x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r)};
};

// ponto do layout do celular (px base 680×1400) -> tela
export const phoneToScreen = (px: number, py: number, t: number) => {
  const s = PHONE.w / PH_W;
  const v = rot((px - PH_W / 2) * s, (py - PH_H / 2) * s, PHONE.rot);
  const lx = PHONE.x + v.x;
  const ly = PHONE.y + v.y;
  const L = layerT(PHONE.h, t);
  const sx = lx * L.a + L.bx - 540;
  const sy = ly * L.a + L.by - 960;
  const {roll} = camAt(t);
  const w = rot(sx * STAGE_SCALE, sy * STAGE_SCALE, roll);
  return {x: 540 + w.x, y: 960 + w.y, scale: s * L.a * STAGE_SCALE, rot: PHONE.rot + roll};
};

export const notifRect = (t: number) => {
  const c = phoneToScreen(NOTIF.x + NOTIF.w / 2, NOTIF.y + NOTIF.h / 2, t);
  return {cx: c.x, cy: c.y, w: NOTIF.w * c.scale, h: NOTIF.h * c.scale, r: NOTIF.r * c.scale, rot: c.rot, scale: c.scale};
};
