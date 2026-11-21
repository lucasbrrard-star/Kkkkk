// Otimiza os modelos de origem (tools/cache) para celular e grava em public/assets:
//   models/*.glb  — malhas simplificadas até um teto de triângulos, texturas WebP redimensionadas,
//                   compressão meshopt, escala em metros e base no chão (+ versão _far para distância)
//   textures/*    — texturas PBR do chão (Poly Haven) em WebP
//   manifest.json — limites, triângulos e clipes de cada modelo
// Uso: npm run assets [chave]
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, Primitive, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, meshopt, reorder, quantize, getBounds, flatten, join, resample, compactPrimitive, cloneDocument } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { MeshoptSimplifier as Sloppy } from 'meshopt-sloppy';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CACHE = path.join(ROOT, 'tools/cache');
const OUT = path.join(ROOT, 'public/assets');
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'textures'), { recursive: true });
const only = process.argv[2];
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

interface Spec {
  src: string;                       // arquivo em tools/cache
  fit?: { height?: number; width?: number };
  rotY?: number;
  budget?: number;                   // teto de triângulos
  far?: number;                      // gera <key>_far com este teto
  tex?: number;                      // lado máximo das texturas
  normals?: boolean;                 // mantém normal maps
  skinned?: boolean;                 // não achata a hierarquia (personagens)
  drop?: string[];                   // remove malhas cujo nome casa com estes trechos
  keepOnly?: string[];               // mantém só malhas com estes trechos no nome
}

const S: Record<string, Spec> = {
  // ---------------- criaturas
  skywalker: { src: '../out/skywalker_raw.glb', skinned: true, tex: 1024, normals: true },
  deer: { src: 'deer.glb', skinned: true, fit: { height: 2.05 }, tex: 256 },
  // ---------------- árvores (instanciadas)
  tree_evergreen: { src: 'tree_evergreen.glb', fit: { height: 15 }, budget: 7000, far: 1400, tex: 1024 },
  tree_pine: { src: 'tree_pine.glb', fit: { height: 21 }, budget: 7000, far: 1200, tex: 1024 },
  tree_dead_bare: { src: 'tree_dead_bare.glb', fit: { height: 15 }, budget: 5000, far: 900, tex: 512 },
  tree_dead_twisted: { src: 'tree_dead_twisted.glb', fit: { height: 7.5 }, budget: 3000, far: 600, tex: 1024, normals: false },
  tree_half_dead: { src: 'tree_half_dead.glb', fit: { height: 8 }, budget: 3000, far: 600, tex: 1024 },
  // ---------------- chão da floresta
  stump_scan: { src: 'stump_scan.glb', fit: { height: 1.6 }, budget: 2500, tex: 1024, normals: true },
  stump: { src: 'ph/stump/stump.gltf', fit: { width: 1.5 }, budget: 2500, tex: 512, normals: true },
  dead_trunk: { src: 'ph/dead_trunk/dead_trunk.gltf', fit: { width: 6 }, budget: 3000, tex: 1024, normals: true },
  rock_moss_1: { src: 'ph/rock_moss_1/rock_moss_1.gltf', budget: 6000, tex: 1024, normals: true },
  rock_moss_2: { src: 'ph/rock_moss_2/rock_moss_2.gltf', budget: 5000, tex: 1024, normals: true },
  boulder: { src: 'ph/boulder/boulder.gltf', fit: { width: 2.6 }, budget: 3000, tex: 1024, normals: true },
  fern: { src: 'ph/fern/fern.gltf', budget: 2500, tex: 512 },
  branches: { src: 'ph/branches/branches.gltf', fit: { width: 1.6 }, budget: 1500, tex: 512 },
  roots: { src: 'ph/roots/roots.gltf', budget: 3000, tex: 512, normals: true },
  // ---------------- lugares
  cabin: { src: 'cabin.glb', fit: { width: 6.8 }, budget: 16000, tex: 1024 },
  campfire: { src: 'campfire.glb', fit: { width: 1.7 }, budget: 2500, tex: 1024 },
  bone_pile: { src: 'bone_pile.glb', fit: { width: 0.75 }, budget: 4000, tex: 512 },
  human_skull: { src: 'human_skull.glb', fit: { height: 0.16 }, budget: 1500, tex: 512 },
  deer_skull: { src: 'deer_skull.glb', fit: { height: 0.45 }, budget: 4000, tex: 512 },
  // ---------------- pistas do filho
  kids_shoe: { src: 'kids_shoe.glb', fit: { width: 0.19 }, budget: 2500, tex: 512 },
  teddy: { src: 'teddy.glb', fit: { height: 0.38 }, budget: 3000, tex: 512 },
  toy_car: { src: 'toy_car.glb', fit: { width: 0.24 }, budget: 2000, tex: 512 },
  walkie: { src: 'walkie.glb', fit: { height: 0.17 }, budget: 2000, tex: 512 },
  // ---------------- mãos do investigador
  revolver: { src: 'revolver.glb', fit: { width: 0.3 }, tex: 1024, normals: true, drop: ['bullet'] },
  flashlight_hand: { src: 'flashlight_hand.glb', fit: { width: 0.24 }, budget: 2500, tex: 512, normals: true },
};

/** Texturas PBR do chão (Poly Haven, CC0). */
const TEX: { key: string; size: number }[] = [
  { key: 'ground', size: 1024 },
  { key: 'ground2', size: 1024 },
  { key: 'bark', size: 512 },
];

await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await Sloppy.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptEncoder,
});

const manifestPath = path.join(OUT, 'manifest.json');
const manifest: { models: Record<string, unknown>; textures: string[] } = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { models: {}, textures: [] };

function fixMaterials(doc: Document, spec: Spec) {
  for (const m of doc.getRoot().listMaterials()) {
    for (const ext of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_materials_dispersion', 'KHR_materials_specular', 'KHR_materials_ior', 'KHR_materials_emissive_strength']) m.setExtension(ext, null);
    if (m.getAlphaMode() === 'BLEND' && m.getBaseColorTexture()) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.42); }
    m.setDoubleSided(m.getAlphaMode() === 'MASK');
    if (!spec.normals) m.setNormalTexture(null);
    m.setOcclusionTexture(null);
  }
  const drop = spec.drop ?? [], keep = spec.keepOnly;
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const name = (n.getName() + ' ' + mesh.getName()).toLowerCase();
    if (drop.some((d) => name.includes(d)) || (keep && !keep.some((k) => name.includes(k)))) n.setMesh(null);
  }
}

/** Envolve a cena em um nó raiz com escala: metros, centrado, apoiado no chão. */
function normalize(doc: Document, spec: Spec) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const root = doc.createNode('root');
  for (const c of scene.listChildren()) { scene.removeChild(c); root.addChild(c); }
  scene.addChild(root);
  let b = getBounds(scene);
  const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  let s = 1;
  if (spec.fit?.height) s = spec.fit.height / size[1];
  else if (spec.fit?.width) s = spec.fit.width / Math.max(size[0], size[2]);
  const a = ((spec.rotY ?? 0) * Math.PI) / 180;
  root.setScale([s, s, s]).setRotation([0, Math.sin(a / 2), 0, Math.cos(a / 2)]);
  b = getBounds(scene);
  root.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  b = getBounds(scene);
  return { min: b.min.map((v) => +v.toFixed(3)), max: b.max.map((v) => +v.toFixed(3)) };
}

/** Simplificação progressiva até caber no teto: cartões com alfa (folhas) perdem cartões
 *  inteiros (as folhas restantes crescem para manter a densidade); superfícies opacas usam
 *  o simplificador do meshoptimizer, com a versão "sloppy" de reserva. */
function simplifyToBudget(doc: Document, budget: number) {
  const cards = (p: Primitive) => p.getMaterial()?.getAlphaMode() === 'MASK';
  let cardTris = 0, solidTris = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const n = (p.getIndices()?.getCount() ?? 0) / 3;
    if (cards(p)) cardTris += n; else solidTris += n;
  }
  if (cardTris + solidTris <= budget) return;
  const solidBudget = Math.min(solidTris, Math.max(budget * 0.35, budget - cardTris));
  const cardBudget = Math.max(0, budget - solidBudget);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    if (!idx || !pos || p.getMode() !== Primitive.Mode.TRIANGLES) continue;
    const src = new Uint32Array(idx.getArray()!);
    const positions = new Float32Array(pos.getArray()!);
    const isCard = cards(p);
    const share = isCard ? cardBudget / Math.max(1, cardTris) : solidBudget / Math.max(1, solidTris);
    if (share >= 1) continue;
    const target = Math.max(3, Math.floor((src.length * share) / 3) * 3);
    if (isCard) {
      const foliage = thinFoliage(src, positions, target);
      if (foliage) {
        (pos.getArray() as Float32Array).set(foliage.positions);
        idx.setArray(pos.getCount() > 65535 ? foliage.indices : new Uint16Array(foliage.indices));
        compactPrimitive(p);
        continue;
      }
    }
    let out = src;
    for (const err of [0.01, 0.03, 0.08, 0.2, 0.5, 1.0]) {
      [out] = MeshoptSimplifier.simplify(src, positions, 3, target, err, []);
      if (out.length <= target * 1.15) break;
    }
    if (out.length > target * 1.15) {
      for (const err of [0.005, 0.01, 0.02, 0.04, 0.08, 0.2]) {
        [out] = Sloppy.simplifySloppy(src, positions, 3, null, target, err);
        if (out.length <= target * 1.15) break;
      }
    }
    if (out.length < 3) { mesh.removePrimitive(p); continue; }
    idx.setArray(pos.getCount() > 65535 ? out : new Uint16Array(out));
    compactPrimitive(p);
  }
}

function thinFoliage(indices: Uint32Array, positions: Float32Array, targetIndices: number) {
  const nv = positions.length / 3;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const byPos = new Map<string, number>();
  for (let v = 0; v < nv; v++) {
    const k = `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
    const o = byPos.get(k);
    if (o === undefined) byPos.set(k, v); else { const a = find(o), b = find(v); if (a !== b) parent[b] = a; }
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]);
    if (a !== b) parent[b] = a;
    const a2 = find(a), c = find(indices[t + 2]);
    if (a2 !== c) parent[c] = a2;
  }
  const comps = new Map<number, number[]>();
  for (let t = 0; t < indices.length; t += 3) {
    const r = find(indices[t]);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(t);
  }
  const list = [...comps.values()];
  if (list.length < 60 || indices.length / 3 / list.length > 80) return null;
  const keep = Math.min(1, targetIndices / indices.length);
  let seed = 1234567;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const n = Math.max(1, Math.round(list.length * keep));
  const grow = Math.min(1.7, Math.sqrt(1 / keep));
  const pos = new Float32Array(positions);
  const out: number[] = [];
  for (const tris of list.slice(0, n)) {
    const vs = new Set<number>();
    for (const t of tris) { vs.add(indices[t]); vs.add(indices[t + 1]); vs.add(indices[t + 2]); out.push(indices[t], indices[t + 1], indices[t + 2]); }
    let cx = 0, cy = 0, cz = 0;
    for (const v of vs) { cx += positions[v * 3]; cy += positions[v * 3 + 1]; cz += positions[v * 3 + 2]; }
    cx /= vs.size; cy /= vs.size; cz /= vs.size;
    for (const v of vs) {
      pos[v * 3] = cx + (positions[v * 3] - cx) * grow;
      pos[v * 3 + 1] = cy + (positions[v * 3 + 1] - cy) * grow;
      pos[v * 3 + 2] = cz + (positions[v * 3 + 2] - cz) * grow;
    }
  }
  return { indices: new Uint32Array(out), positions: pos };
}

function countTris(doc: Document) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
  return Math.round(n);
}

for (const [key, spec] of Object.entries(S)) {
  if (only && only !== key) continue;
  const src = path.join(CACHE, spec.src);
  if (!fs.existsSync(src)) { log(`ausente: ${key} (${spec.src})`); continue; }
  const doc = await io.read(src);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  const before = countTris(doc);
  fixMaterials(doc, spec);
  if (!spec.skinned) for (const a of doc.getRoot().listAnimations()) a.dispose();
  // remove nós auxiliares sem malha nem filhos (luzes, câmeras, "Icosphere" de prévia)
  for (const n of doc.getRoot().listNodes()) {
    if (/icosphere/i.test(n.getName())) n.dispose();
    n.setCamera(null);
  }
  await doc.transform(prune(), dedup());
  let bounds: { min: number[]; max: number[] };
  if (spec.skinned) {
    if (spec.fit) bounds = normalize(doc, spec);
    else { const b = getBounds(doc.getRoot().listScenes()[0]); bounds = { min: b.min.map((v) => +v.toFixed(3)), max: b.max.map((v) => +v.toFixed(3)) }; }
    await doc.transform(resample());
  } else {
    for (const mesh of doc.getRoot().listMeshes()) { for (const p of mesh.listPrimitives()) for (const t of p.listTargets()) p.removeTarget(t); mesh.setWeights([]); }
    await doc.transform(flatten(), join(), weld());
    bounds = normalize(doc, spec);
  }
  const variants: [string, Document, number | undefined, number][] = [[key, doc, spec.budget, spec.tex ?? 1024]];
  if (spec.far) variants.push([`${key}_far`, cloneDocument(doc), spec.far, Math.min(256, spec.tex ?? 1024)]);
  for (const [k, d, budget, tex] of variants) {
    if (budget) simplifyToBudget(d, budget);
    await d.transform(
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 78 }),
      reorder({ encoder: MeshoptEncoder }),
      ...(spec.skinned ? [] : [quantize()]),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const out = path.join(OUT, 'models', `${k}.glb`);
    await io.write(out, d);
    const tris = countTris(d);
    const clips = d.getRoot().listAnimations().map((a) => a.getName());
    manifest.models[k] = { bounds, tris, kb: Math.round(fs.statSync(out).size / 1024), ...(clips.length ? { clips } : {}) };
    log(`${k}: ${before} → ${tris} tri · ${(fs.statSync(out).size / 1024).toFixed(0)} KB${clips.length ? ' · ' + clips.join(',') : ''}`);
  }
}

if (!only || only === 'textures') {
  manifest.textures = [];
  for (const t of TEX) {
    const dir = path.join(CACHE, 'tex', t.key);
    if (!fs.existsSync(path.join(dir, 'diff.jpg'))) continue;
    for (const [k, q] of [['diff', 80], ['nor', 82], ['rough', 70]] as const) {
      if (!fs.existsSync(path.join(dir, `${k}.jpg`))) continue;
      await sharp(path.join(dir, `${k}.jpg`)).resize(t.size, t.size).webp({ quality: q }).toFile(path.join(OUT, 'textures', `${t.key}_${k}.webp`));
    }
    manifest.textures.push(t.key);
  }
  log(`texturas: ${manifest.textures.join(', ')}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
log('pronto');
