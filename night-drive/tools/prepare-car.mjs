// Converts the BlenderKit "Chevrolet Corvette C8 2025" model (tools/raw/c8.glb: 93 baked textures,
// ~95 materials, ~260 meshes) into a lean game-ready GLB (public/models/car.glb):
//  - baked textures are sampled into per-vertex color + roughness/metalness (no textures at runtime)
//  - meshes are regrouped by material role (paint, trim, glass, lights...) => ~13 draw calls
//  - wheel pairs are split left/right and re-centred on their own pivot so they can spin and steer
//  - brake discs travel with their wheel; geometry is welded, reordered and meshopt-compressed
// Usage: node tools/prepare-car.mjs   (expects tools/raw/c8.glb, see tools/fetch-car.sh)
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, reorder, quantize, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { readRaw, extractNodes, sample, srgbToLinear } from './carlib.mjs';
import fs from 'node:fs';

const RAW = 'tools/raw/c8.glb';
const OUT = 'public/models/car.glb';

// Nodes identified visually (tools/viewer, highlight mode)
const NODE_ROLE = {
  'Plane.029': 'light_tail', // LED chevrons of the tail lights
  'Rear Damper.003': 'tail_lens', // tinted tail light lens/housing
};
// Manufacturer emblems (same 1072-tri mesh, nose + engine cover) are removed: the game car is unbadged.
const DROP = new Set(['Plane.077', 'Plane.078']);
const WHEEL_NODES = new Set(['Circle.004', 'Circle.014', 'Circle.008', 'Circle.009']); // rims+tyres, brake discs
const MAT_ROLE = [
  [/^DayLight/, 'light_drl'],
  [/^Glass Windows/, 'glass'],
  [/^Headlight_Glass/, 'clear'],
  [/^Lens/, 'light_head'],
];

const groups = {};
const group = (name) => (groups[name] ??= { pos: [], nrm: [], col: [], mat: [], idx: [] });

const doc = await readRaw(RAW);
const nodes = await extractNodes(doc);
const stats = {};

for (const nd of nodes) {
  if (DROP.has(nd.name)) continue;
  const n = nd.pos.length / 3;
  const C = new Float32Array(n * 3), M = new Float32Array(n * 2);
  const paintV = new Uint8Array(n);
  let role = NODE_ROLE[nd.name] ?? null;
  if (!role) for (const [re, r] of MAT_ROLE) if (re.test(nd.matName)) { role = r; break; }
  const isWheel = WHEEL_NODES.has(nd.name);
  for (let i = 0; i < n; i++) {
    const c = nd.clr ? sample(nd.clr, nd.uv[i * 2], nd.uv[i * 2 + 1]) : [255, 255, 255];
    const o = nd.orm ? sample(nd.orm, nd.uv[i * 2], nd.uv[i * 2 + 1]) : [255, 255, 255];
    const lin = [0, 1, 2].map((k) => srgbToLinear(c[k] / 255) * nd.baseColor[k]);
    const rough = Math.min(1, Math.max(0.03, (o[1] / 255) * nd.roughness));
    const metal = Math.min(1, (o[2] / 255) * nd.metalness);
    C.set(lin, i * 3); M[i * 2] = rough; M[i * 2 + 1] = metal;
    // The original yellow metallic paint: saturated warm colour with high metalness in the bake.
    if (!role && !isWheel && nd.clr && metal > 0.35 && c[0] > 110 && c[0] - c[2] > 60) paintV[i] = 1;
  }
  for (let t = 0; t < nd.idx.length; t += 3) {
    const a = nd.idx[t], b = nd.idx[t + 1], c = nd.idx[t + 2];
    let gname;
    if (isWheel) {
      const cx = (nd.pos[a * 3] + nd.pos[b * 3] + nd.pos[c * 3]) / 3, cz = (nd.pos[a * 3 + 2] + nd.pos[b * 3 + 2] + nd.pos[c * 3 + 2]) / 3;
      gname = 'wheel_' + (cz > 0 ? 'F' : 'R') + (cx > 0 ? 'L' : 'R');
    } else if (role) gname = role;
    else gname = paintV[a] + paintV[b] + paintV[c] >= 2 ? 'paint' : 'trim';
    const g = group(gname);
    for (const v of [a, b, c]) {
      g.idx.push(g.pos.length / 3);
      g.pos.push(nd.pos[v * 3], nd.pos[v * 3 + 1], nd.pos[v * 3 + 2]);
      g.nrm.push(nd.nrm[v * 3], nd.nrm[v * 3 + 1], nd.nrm[v * 3 + 2]);
      g.col.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
      g.mat.push(M[v * 2], M[v * 2 + 1]);
    }
    stats[gname] = (stats[gname] ?? 0) + 1;
  }
}

const out = new Document();
const buf = out.createBuffer();
const scene = out.createScene('car');
const root = out.createNode('car');
scene.addChild(root);
const info = { wheels: {} };
let bmin = [1e9, 1e9, 1e9], bmax = [-1e9, -1e9, -1e9];
for (const [name, g] of Object.entries(groups)) {
  let center = [0, 0, 0];
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], g.pos[i + k]); mx[k] = Math.max(mx[k], g.pos[i + k]); }
  for (let k = 0; k < 3; k++) { bmin[k] = Math.min(bmin[k], mn[k]); bmax[k] = Math.max(bmax[k], mx[k]); }
  if (name.startsWith('wheel_')) {
    center = mn.map((v, k) => (v + mx[k]) / 2);
    for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) g.pos[i + k] -= center[k];
    info.wheels[name] = { center, radius: (mx[1] - mn[1]) / 2, width: mx[0] - mn[0] };
  }
  const acc = (type, arr) => out.createAccessor().setType(type).setArray(arr).setBuffer(buf);
  const prim = out.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(g.pos)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(g.nrm)))
    .setAttribute('COLOR_0', acc('VEC3', new Float32Array(g.col)))
    .setAttribute('_MAT', acc('VEC2', new Float32Array(g.mat)))
    .setIndices(acc('SCALAR', new Uint32Array(g.idx)))
    .setMaterial(out.createMaterial(name));
  root.addChild(out.createNode(name).setMesh(out.createMesh(name).addPrimitive(prim)).setTranslation(center));
}
info.bounds = { min: bmin, max: bmax };

await MeshoptEncoder.ready;
await out.transform(
  weld(),
  reorder({ encoder: MeshoptEncoder }),
  quantize({ pattern: /^(POSITION|NORMAL|COLOR_0)$/, quantizePosition: 14, quantizeNormal: 10, quantizeColor: 8 }),
  prune(),
);
out.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
fs.mkdirSync('public/models', { recursive: true });
await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).write(OUT, out);
fs.writeFileSync('public/models/car.json', JSON.stringify(info, null, 1));
console.log('triangles per role', stats);
console.log('wrote', OUT, fs.statSync(OUT).size, 'bytes');
console.log(JSON.stringify(info));
