// Otimiza os assets para celular e gera client/public/assets:
//  models/*.glb  — malhas simplificadas, texturas WebP redimensionadas, compressão meshopt,
//                  escala em metros, base no chão; avatares com animações transferidas
//  textures/*    — PBR (Poly Haven) em WebP
//  manifest.json — limites (para colisão/posicionamento) e lista de clipes
// Uso: npm run assets  (após npm run assets:fetch)

import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO, Node as GNode, Primitive, Animation, Accessor, Material, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, meshopt, reorder, quantize, getBounds, flatten, join, resample, compactPrimitive, cloneDocument } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { MODELS, TEXTURES, CLIPS, ModelSpec } from './manifest';
import { retargetClips } from './retarget';
import { MeshoptSimplifier as Sloppy } from 'meshopt-sloppy';

const CACHE = path.resolve('tools/cache');
const OUT = path.resolve('client/public/assets');
fs.mkdirSync(path.join(OUT, 'models'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'textures'), { recursive: true });
const only = process.argv[2];
const t0 = Date.now();
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

await MeshoptEncoder.ready; await MeshoptSimplifier.ready; await Sloppy.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder,
});

const manifestPath = path.join(OUT, 'manifest.json');
const manifest: { models: Record<string, unknown>; textures: string[]; clips: string[] } = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { models: {}, textures: [], clips: [] };

function applyMaterialFix(doc: Document, spec: ModelSpec) {
  for (const m of doc.getRoot().listMaterials()) {
    const fix = spec.materialFix?.[m.getName()] ?? spec.materialFix?.['*'];
    if (fix?.hide) {
      for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() === m) mesh.removePrimitive(p);
      continue;
    }
    if (fix) {
      if (fix.dropTexture) m.setBaseColorTexture(null);
      if (fix.color) m.setBaseColorFactor([...fix.color, 1]);
      if (fix.emissive) m.setEmissiveFactor(fix.emissive);
      if (fix.roughness !== undefined) m.setRoughnessFactor(fix.roughness);
      if (fix.metalness !== undefined) m.setMetallicFactor(fix.metalness);
    }
    // vidro com "transmission" (passe extra caro no celular) → transparência simples
    if (m.getExtension('KHR_materials_transmission')) {
      const c = m.getBaseColorFactor();
      m.setBaseColorFactor([c[0], c[1], c[2], 0.35]).setAlphaMode('BLEND').setRoughnessFactor(0.08).setMetallicFactor(0);
    }
    for (const ext of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_clearcoat', 'KHR_materials_sheen', 'KHR_materials_iridescence', 'KHR_materials_anisotropy', 'KHR_materials_dispersion']) m.setExtension(ext, null);
    // materiais com transparência "BLEND" em folhas → MASK (mais barato e ordena sem erros)
    if (m.getAlphaMode() === 'BLEND' && m.getBaseColorTexture()) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.45); }
    m.setDoubleSided(m.getAlphaMode() === 'MASK');
  }
}

async function recolorTextures(doc: Document, spec: ModelSpec) {
  if (!spec.hue && !spec.tint) return;
  const seen = new Set<unknown>();
  for (const m of doc.getRoot().listMaterials()) {
    const t = m.getBaseColorTexture();
    if (!t || seen.has(t)) continue;
    if (spec.recolorMat && !new RegExp(spec.recolorMat, 'i').test(m.getName())) continue;
    seen.add(t);
    let s = sharp(Buffer.from(t.getImage()!));
    if (spec.hue) s = s.modulate({ hue: spec.hue, saturation: spec.sat ?? 1 });
    if (spec.tint) s = s.linear(spec.tint, [0, 0, 0]);
    t.setImage(new Uint8Array(await s.png().toBuffer())).setMimeType('image/png');
  }
}

/** Envolve a cena em um nó raiz com escala/rotação/translação: metros, centrado, apoiado no chão. */
function normalize(doc: Document, spec: ModelSpec) {
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

/** Avatares: normaliza pela altura do esqueleto (pés → topo da cabeça). */
function normalizeAvatar(doc: Document, spec: ModelSpec) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const root = doc.createNode('root');
  for (const c of scene.listChildren()) { scene.removeChild(c); root.addChild(c); }
  scene.addChild(root);
  const joints = doc.getRoot().listSkins()[0].listJoints();
  const ys = () => joints.map((j) => j.getWorldTranslation()[1]);
  const head = () => { const h = joints.find((j) => /HeadTop_End$/.test(j.getName())) ?? joints.find((j) => /Head$/.test(j.getName()))!; return h.getWorldTranslation()[1] + (/HeadTop/.test(h.getName()) ? 0 : 0.16); };
  const h0 = head() - Math.min(...ys());
  const s = (spec.fit?.height ?? 1.75) / h0;
  root.setScale([s, s, s]);
  const hips = joints.find((j) => /Hips$/.test(j.getName()))!.getWorldTranslation();
  const toe = Math.min(...ys()) - 0.02 * s;
  root.setTranslation([-hips[0], -toe, -hips[2]]);
  return { min: [-0.3, 0, -0.3], max: [0.3, +(head() + 0.02).toFixed(3), 0.3] };
}

/** Simplificação progressiva: aumenta a tolerância até caber no teto de triângulos.
 *  Quando a malha não deixa (não-manifold, peças soltas), usa a versão "sloppy". */
function simplifyToBudget(doc: Document, budget: number) {
  // cartões com recorte alfa (folhas) → LOD de folhagem (remove cartões inteiros);
  // superfícies opacas → simplificação de malha (com "sloppy" de reserva)
  const cards = (p: Primitive) => p.getMaterial()?.getAlphaMode() !== 'OPAQUE';
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
    const run = (indices: Uint32Array) => {
      let out = indices;
      for (const err of [0.01, 0.03, 0.08, 0.2, 0.5, 1.0]) {
        [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, err, []);
        if (out.length <= target * 1.15) break;
      }
      return out;
    };
    let out = run(src);
    if (out.length > target * 1.15) {
      // geometria não-manifold/peças soltas: simplificação "sloppy" (agrupamento em grade),
      // que mantém os atributos (UV/normais) dos vértices originais
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

/** LOD de folhagem: se a malha tem centenas de componentes pequenos (folhas), mantém uma
 *  fração deles intactos e escala cada folha restante em torno do próprio centro para
 *  preservar a densidade visual da copa. Retorna null se a malha não for folhagem. */
function thinFoliage(indices: Uint32Array, positions: Float32Array, targetIndices: number): { indices: Uint32Array; positions: Float32Array } | null {
  const nv = positions.length / 3;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  // vértices na mesma posição (costuras de UV/normal) pertencem ao mesmo cartão
  const byPos = new Map<string, number>();
  for (let v = 0; v < nv; v++) {
    const k = `${Math.round(positions[v * 3] * 1e4)},${Math.round(positions[v * 3 + 1] * 1e4)},${Math.round(positions[v * 3 + 2] * 1e4)}`;
    const o = byPos.get(k);
    if (o === undefined) byPos.set(k, v); else { const a = find(o), b = find(v); if (a !== b) parent[b] = a; }
  }
  for (let t = 0; t < indices.length; t += 3) {
    const a = find(indices[t]), b = find(indices[t + 1]), c = find(indices[t + 2]);
    if (a !== b) parent[b] = a;
    const a2 = find(a);
    if (a2 !== c) parent[c] = a2;
  }
  const comps = new Map<number, number[]>();
  for (let t = 0; t < indices.length; t += 3) {
    const r = find(indices[t]);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r)!.push(t);
  }
  const list = [...comps.values()];
  const avgTris = indices.length / 3 / list.length;
  if (list.length < 60 || avgTris > 80) return null;
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

function stripMorphs(doc: Document) {
  for (const mesh of doc.getRoot().listMeshes()) { for (const p of mesh.listPrimitives()) for (const t of p.listTargets()) p.removeTarget(t); mesh.setWeights([]); }
}

function countTris(doc: Document) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3;
  return Math.round(n);
}

for (const spec of MODELS) {
  if (spec.category === 'anim') continue;
  if (only && only !== spec.key && only !== spec.category) continue;
  const src = path.join(CACHE, spec.source.cacheFile ?? `${spec.key}.glb`);
  if (!fs.existsSync(src)) { log(`ausente: ${spec.key}`); continue; }
  let doc: Document;
  try { doc = await io.read(src); } catch (e) { log(`ERRO lendo ${spec.key}: ${(e as Error).message}`); continue; }
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  const before = countTris(doc);
  // remove animações de origem (avatares recebem as transferidas)
  for (const a of doc.getRoot().listAnimations()) a.dispose();
  applyMaterialFix(doc, spec);
  await recolorTextures(doc, spec);
  await doc.transform(prune(), dedup());
  const bounds = spec.category === 'avatar' ? normalizeAvatar(doc, spec) : normalize(doc, spec);
  if (spec.category === 'avatar') {
    const clips = await retargetClips(io, doc, CLIPS.map(([name, file, clip]) => ({ name, file: path.join(CACHE, file), clip })));
    manifest.clips = clips;
    await doc.transform(resample());
  } else {
    stripMorphs(doc);
    await doc.transform(flatten(), join(), weld());
    if (spec.simplify && spec.simplify < 1 && !spec.budget) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: spec.simplify, error: spec.error ?? 0.01, lockBorder: false }));
    // normal maps só em prédios (economia de memória/banda no celular)
    if (!(spec.keepNormals ?? spec.category === 'building')) for (const m of doc.getRoot().listMaterials()) { m.setNormalTexture(null); m.setOcclusionTexture(null); }
  }
  const variants: [string, Document, number | undefined, number][] = [[spec.key, doc, spec.budget, spec.texSize ?? 1024]];
  if (spec.far) variants.push([`${spec.key}_far`, cloneDocument(doc), spec.far, Math.min(256, spec.texSize ?? 1024)]);
  for (const [key, d, budget, tex] of variants) {
    if (budget) simplifyToBudget(d, budget);
    await d.transform(
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 76 }),
      reorder({ encoder: MeshoptEncoder }),
      quantize(),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    const out = path.join(OUT, 'models', `${key}.glb`);
    await io.write(out, d);
    const tris = countTris(d);
    manifest.models[key] = { category: spec.category, bounds, tris, bytes: fs.statSync(out).size };
    log(`${key}: ${before} → ${tris} triângulos · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }
}
// ---------------- texturas PBR do chão
if (!only || only === 'textures') {
  manifest.textures = [];
  for (const t of TEXTURES) {
    const dir = path.join(CACHE, 'tex', t.key);
    if (!fs.existsSync(path.join(dir, 'diff.jpg'))) continue;
    for (const [k, q] of [['diff', 80], ['nor', 85], ['rough', 70]] as const) {
      await sharp(path.join(dir, `${k}.jpg`)).resize(t.size, t.size).webp({ quality: q }).toFile(path.join(OUT, 'textures', `${t.key}_${k}.webp`));
    }
    manifest.textures.push(t.key);
  }
  log(`texturas: ${manifest.textures.join(', ')}`);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
log('pronto');
void Primitive; void Animation; void Accessor; void Material; void GNode;
