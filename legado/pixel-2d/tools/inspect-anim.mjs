import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f); const r = doc.getRoot();
  const sk = r.listSkins()[0];
  const j = sk?.listJoints().map((n) => n.getName()) ?? [];
  let tris = 0; for (const m of r.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log(f.split('/').pop(), 'tris', tris, 'joints', j.length, j.slice(0, 8).join(','));
  for (const a of r.listAnimations()) console.log('   anim', a.getName(), 'chan', a.listChannels().length, 'dur', Math.max(...a.listSamplers().map((s) => { const i = s.getInput(); return i ? i.getMax([0])[0] : 0; })).toFixed(2));
  const hips = r.listNodes().find((n) => /Hips$/.test(n.getName()));
  if (hips) console.log('   hips world y', hips.getWorldTranslation()[1].toFixed(3), 'scale', r.listNodes()[0].getScale());
}
