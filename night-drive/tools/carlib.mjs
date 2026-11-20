// Shared helpers for reading the raw car model and sampling its baked textures per vertex.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

export async function readRaw(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  return io.read(path);
}

const texCache = new Map();
export async function decodeTex(tex) {
  if (!tex) return null;
  if (texCache.has(tex)) return texCache.get(tex);
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = { data, w: info.width, h: info.height };
  texCache.set(tex, t);
  return t;
}

export function sample(t, u, v) {
  // glTF UV origin is the top-left of the image; bilinear filtering with repeat wrapping.
  u = u - Math.floor(u); v = v - Math.floor(v);
  const x = u * t.w - 0.5, y = v * t.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = ((x0 + dx) % t.w + t.w) % t.w, py = ((y0 + dy) % t.h + t.h) % t.h;
    const i = (py * t.w + px) * 4;
    for (let k = 0; k < 4; k++) out[k] += t.data[i + k] * w;
  }
  return out;
}

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Extracts each mesh node as flat arrays in world space (raw model units). */
export async function extractNodes(doc) {
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const posA = prim.getAttribute('POSITION'), nrmA = prim.getAttribute('NORMAL'), uvA = prim.getAttribute('TEXCOORD_0');
      const n = posA.getCount();
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      const p = [0, 0, 0], q = [0, 0, 0], t = [0, 0];
      // normal matrix (inverse transpose of upper 3x3)
      const a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
      const det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7]) + a[6] * (a[1] * a[5] - a[2] * a[4]);
      const inv = [
        (a[4] * a[8] - a[5] * a[7]) / det, (a[2] * a[7] - a[1] * a[8]) / det, (a[1] * a[5] - a[2] * a[4]) / det,
        (a[5] * a[6] - a[3] * a[8]) / det, (a[0] * a[8] - a[2] * a[6]) / det, (a[2] * a[3] - a[0] * a[5]) / det,
        (a[3] * a[7] - a[4] * a[6]) / det, (a[1] * a[6] - a[0] * a[7]) / det, (a[0] * a[4] - a[1] * a[3]) / det,
      ];
      for (let i = 0; i < n; i++) {
        posA.getElement(i, p);
        pos[i * 3] = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
        pos[i * 3 + 1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
        pos[i * 3 + 2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
        nrmA.getElement(i, q);
        // transpose(inverse) applied: n' = inv^T * n  (inv is column-major 3x3)
        let nx = inv[0] * q[0] + inv[1] * q[1] + inv[2] * q[2];
        let ny = inv[3] * q[0] + inv[4] * q[1] + inv[5] * q[2];
        let nz = inv[6] * q[0] + inv[7] * q[1] + inv[8] * q[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[i * 3] = nx / l; nrm[i * 3 + 1] = ny / l; nrm[i * 3 + 2] = nz / l;
        if (uvA) { uvA.getElement(i, t); uv[i * 2] = t[0]; uv[i * 2 + 1] = t[1]; }
      }
      const idxA = prim.getIndices();
      const idx = idxA ? Uint32Array.from(idxA.getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      if (det < 0) for (let i = 0; i < idx.length; i += 3) { const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp; }
      const mat = prim.getMaterial();
      out.push({
        name: node.getName(), pos, nrm, uv, idx,
        matName: mat?.getName() ?? '',
        baseColor: mat ? mat.getBaseColorFactor() : [1, 1, 1, 1],
        roughness: mat ? mat.getRoughnessFactor() : 1,
        metalness: mat ? mat.getMetallicFactor() : 0,
        clr: await decodeTex(mat?.getBaseColorTexture()),
        orm: await decodeTex(mat?.getMetallicRoughnessTexture()),
      });
    }
  }
  return out;
}
