// Câmera 2.5D zenital (de cima para baixo) do quarto.
// Camadas são desenhadas em px como vistas da altura H0 e recebem escala/paralaxe
// conforme a altura h (m) da superfície: objetos mais altos se aproximam mais rápido.
import {clamp, inOutCubic, inOutSine, lerp, outCubic, prog} from '../lib/ease';

export const H0 = 2.4;
export const PHONE = {x: 880, y: 565, rot: -14, h: 0.6, w: 136, hgt: 280};

const rotV = (x: number, y: number, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return {x: x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r)};
};
export const toWorld = (x: number, y: number, h: number) => ({
  X: 540 + ((x - 540) * (H0 - h)) / H0,
  Y: 960 + ((y - 960) * (H0 - h)) / H0,
});

// ponto do cartão de notificação (no layout do celular: 0,-44 a partir do centro)
const notifAuth = (() => {
  const v = rotV(0, -40, PHONE.rot);
  return {x: PHONE.x + v.x, y: PHONE.y + v.y};
})();
const NOTIF_W = toWorld(notifAuth.x, notifAuth.y, PHONE.h);
const MID = toWorld(640, 640, 0.6);

// escala do celular ao longo do tempo (log), alvo da câmera e rolagem
export const camAt = (t: number) => {
  const ph1 = inOutSine(prog(t, 0.0, 1.35));
  const ph2 = inOutCubic(prog(t, 1.25, 1.9));
  const ph3 = outCubic(prog(t, 1.85, 2.6));
  const L = Math.log(1.32) * ph1 + Math.log(7.4 / 1.32) * ph2 + Math.log(8.4 / 7.4) * ph3;
  const a = Math.exp(L);
  const H = PHONE.h + (H0 - PHONE.h) / a;
  // centro: deriva leve para entre rosto e celular, depois mergulha na notificação
  const cx1 = lerp(540, MID.X, ph1);
  const cy1 = lerp(960, MID.Y, ph1);
  const k = clamp(ph2 * 0.85 + ph3 * 0.15);
  const Cx = lerp(cx1, NOTIF_W.X, k) + 4 * Math.sin(t * 1.7) * (1 - k);
  const Cy = lerp(cy1, NOTIF_W.Y, k) + 3 * Math.cos(t * 1.3) * (1 - k);
  const roll = -PHONE.rot * inOutCubic(prog(t, 1.2, 2.1));
  return {Cx, Cy, H, roll, a};
};

export const layerT = (h: number, t: number) => {
  const {Cx, Cy, H} = camAt(t);
  const d = H - h;
  const a = (H0 - h) / d;
  const k = H0 / d;
  const bx = 540 - 540 * a + (540 - Cx) * k;
  const by = 960 - 960 * a + (960 - Cy) * k;
  return {a, bx, by, d};
};

// posição de tela de um ponto desenhado (x,y) na camada h, já com a rolagem
export const screenOf = (x: number, y: number, h: number, t: number) => {
  const {a, bx, by} = layerT(h, t);
  const {roll} = camAt(t);
  const sx = x * a + bx - 540;
  const sy = y * a + by - 960;
  const v = rotV(sx, sy, roll);
  return {x: 540 + v.x, y: 960 + v.y, a};
};
