import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  try {
    const doc = await io.read(f); const root = doc.getRoot();
    const skins = root.listSkins(), anims = root.listAnimations();
    let tris = 0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    const joints = skins[0]?.listJoints().map((j) => j.getName()) ?? [];
    console.log(f.split('/').pop(), '| tris', Math.round(tris), '| skins', skins.length, '| ossos', joints.length, '| anims', anims.map((a) => a.getName()).slice(0, 6).join(',') || '-', '| ex:', joints.filter((n) => /arm|leg|thigh|spine|hips/i.test(n)).slice(0, 5).join(','));
  } catch (e) { console.log(f, 'ERRO', e.message.slice(0, 120)); }
}
