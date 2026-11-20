import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const mat = p.getMaterial();
    console.log(f.split('/').pop(), m.getName(), p.listSemantics().join(','), mat?.getName(), 'bc', mat?.getBaseColorFactor().map(v=>v.toFixed(2)).join(' '), 'tex', !!mat?.getBaseColorTexture(), 'em', mat?.getEmissiveFactor().join(' '), !!mat?.getEmissiveTexture());
  }
}
