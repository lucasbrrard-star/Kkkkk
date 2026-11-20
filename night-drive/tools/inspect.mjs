import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { getBounds } from '@gltf-transform/core';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
console.log('extensions', root.listExtensionsUsed().map(e => e.extensionName));
const scene = root.listScenes()[0];
console.log('scene bounds', JSON.stringify(getBounds(scene)));
function walk(node, depth) {
  const m = node.getMesh();
  let info = '';
  if (m) {
    const prims = m.listPrimitives();
    let tris = 0;
    for (const p of prims) { const idx = p.getIndices(); tris += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3; }
    const b = getBounds(node);
    info = ` mesh=${m.getName()} prims=${prims.length} tris=${tris|0} mats=[${prims.map(p => p.getMaterial()?.getName()).join(',')}] min=${b.min.map(v=>v.toFixed(2))} max=${b.max.map(v=>v.toFixed(2))}`;
  }
  console.log(' '.repeat(depth * 2) + node.getName() + ` t=${node.getTranslation().map(v=>v.toFixed(2))} r=${node.getRotation().map(v=>v.toFixed(2))} s=${node.getScale().map(v=>v.toFixed(2))}` + info);
  for (const c of node.listChildren()) walk(c, depth + 1);
}
for (const n of scene.listChildren()) walk(n, 0);
for (const mat of root.listMaterials()) {
  console.log('MAT', mat.getName(), 'base', mat.getBaseColorFactor().map(v=>v.toFixed(2)), 'metal', mat.getMetallicFactor(), 'rough', mat.getRoughnessFactor(), 'tex', !!mat.getBaseColorTexture(), !!mat.getNormalTexture(), !!mat.getMetallicRoughnessTexture(), 'emis', mat.getEmissiveFactor(), 'alpha', mat.getAlphaMode(), mat.getAlpha());
}
for (const t of root.listTextures()) console.log('TEX', t.getName(), t.getMimeType(), t.getSize(), t.getImage()?.byteLength);
