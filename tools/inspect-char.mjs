import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]); const root = doc.getRoot();
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  for (const p of m.listPrimitives()) {
    const mat = p.getMaterial();
    console.log('MESH', n.getName(), '| skin', !!n.getSkin(), '| tris', (p.getIndices()?.getCount() ?? 0) / 3, '| mat', mat?.getName(), mat?.getAlphaMode(), 'tex', !!mat?.getBaseColorTexture(), 'bc', mat?.getBaseColorFactor().map((v) => v.toFixed(2)).join(' '), '|', p.listSemantics().join(','), '| targets', p.listTargets().length);
  }
}
const skin = root.listSkins()[0];
const def = skin.listJoints().filter((j) => /^DEF|Hips|Leg|Arm|Spine|Head|Foot/i.test(j.getName()));
console.log('joints', skin.listJoints().length, 'DEF', def.length);
for (const j of def.slice(0, 80)) {
  const p = j.getParentNode();
  console.log(' ', j.getName(), '<-', p?.getName(), 'T', j.getWorldTranslation().map((v) => v.toFixed(2)).join(','));
}
console.log('anims', root.listAnimations().map((a) => a.getName()));
