import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  doc.setLogger(new Logger(Logger.Verbosity.ERROR));
  let tris = 0, prims = 0; const mats = new Set<string>();
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION')!.getCount()) / 3; mats.add(`${p.getMaterial()?.getName()}(${p.getMaterial()?.getAlphaMode()},m${p.getMaterial()?.getMetallicFactor()},r${p.getMaterial()?.getRoughnessFactor()})`); }
  const meta = (() => { try { return JSON.parse(require('fs').readFileSync(f + '.json', 'utf8')); } catch { return {}; } })();
  console.log(f.split('/').pop(), 'tris', tris | 0, 'prims', prims, 'textures', doc.getRoot().listTextures().length, '|', meta.name ?? '', '|', [...mats].slice(0, 6).join(' '));
}
