import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(process.argv[2]);
async function stats(tex) {
  if (!tex) return null;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(64, 64).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels; let s = [0, 0, 0]; const n = data.length / c;
  let mn=[255,255,255], mx=[0,0,0];
  for (let i = 0; i < data.length; i += c) for (let k = 0; k < 3; k++) { s[k] += data[i + k]; mn[k]=Math.min(mn[k],data[i+k]); mx[k]=Math.max(mx[k],data[i+k]); }
  return s.map(v => Math.round(v / n)).join(',') + ` [${mn}]-[${mx}]`;
}
for (const m of doc.getRoot().listMaterials()) {
  console.log(m.getName().padEnd(40), 'clr', await stats(m.getBaseColorTexture()), '| orm', await stats(m.getMetallicRoughnessTexture()), '| emis', !!m.getEmissiveTexture());
}
