// Writes public/models/car-plain.glb: same model without EXT_meshopt_compression (no WebAssembly
// needed to decode it). Used by the hosted build, whose sandbox may not allow compiling WASM.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read('public/models/car.glb');
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext.extensionName === EXTMeshoptCompression.EXTENSION_NAME) ext.dispose();
await io.write(process.argv[2] || 'public/models/car-plain.glb', doc);
console.log('ok');
