// Gera dist/artifact.html: a mesma página do build, sem <html>/<head>/<body> (o Artifact
// do claude.ai envolve a página num esqueleto próprio) e com o CSS embutido.
// Uso: npm run build && node tools/artifact.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const DIST = path.resolve('dist');
const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]).join('\n');
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+\.css)"/)[1];
const css = await readFile(path.join(DIST, cssHref), 'utf8');
const script = html.match(/<script type="module"[^>]*><\/script>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/, '').trim();
const page = `${title}\n<meta name="theme-color" content="#040507">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>window.__SW_MODEL_EXT = 'json'; try { window.createImageBitmap = undefined; } catch (e) {}</script>\n${script}\n`;

// O visualizador do Artifact bloqueia fetch(data:) e WebAssembly (CSP). Então cada modelo vira
// um .json com o GLB em base64, já sem compressão meshopt (que precisaria de WebAssembly).
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const MD = path.join(DIST, 'assets', 'models');
for (const f of await readdir(MD)) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(path.join(MD, f));
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
  const glb = await io.writeBinary(doc);
  await writeFile(path.join(MD, f.replace(/\.glb$/, '.json')), JSON.stringify({ glb: Buffer.from(glb).toString('base64') }));
}
await writeFile(path.join(DIST, 'artifact.html'), page);
// lista de arquivos a publicar junto
const files = {};
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else {
      const rel = path.relative(DIST, p).split(path.sep).join('/');
      if (rel === 'index.html' || rel === 'artifact.html' || rel.endsWith('.css') || rel.endsWith('.glb') || rel.startsWith('assets/textures/bark') || rel === 'manifest.webmanifest' || rel === 'files.json') continue;
      files[rel] = path.relative(path.resolve('..'), p).split(path.sep).join('/');
    }
  }
}
await walk(DIST);
await writeFile(path.join(DIST, 'files.json'), JSON.stringify(files, null, 1));
console.log('artifact.html', (page.length / 1024).toFixed(0), 'KB ·', Object.keys(files).length, 'arquivos');
