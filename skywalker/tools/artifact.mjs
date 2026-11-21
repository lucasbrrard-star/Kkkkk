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
const page = `${title}\n<meta name="theme-color" content="#040507">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>window.__SW_MODEL_EXT = 'json';</script>\n${script}\n`;

// .glb não é servido pelo Artifact: cada modelo vira glTF JSON com buffers e imagens em data: URI
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const MD = path.join(DIST, 'assets', 'models');
for (const f of await readdir(MD)) {
  if (!f.endsWith('.glb')) continue;
  const doc = await io.read(path.join(MD, f));
  const { json, resources } = await io.writeJSON(doc, { format: 'json' });
  const mime = (u) => u.endsWith('.png') ? 'image/png' : u.endsWith('.jpg') || u.endsWith('.jpeg') ? 'image/jpeg' : u.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
  for (const b of json.buffers ?? []) if (b.uri && resources[b.uri]) b.uri = `data:application/octet-stream;base64,${Buffer.from(resources[b.uri]).toString('base64')}`;
  for (const im of json.images ?? []) if (im.uri && resources[im.uri]) im.uri = `data:${im.mimeType ?? mime(im.uri)};base64,${Buffer.from(resources[im.uri]).toString('base64')}`;
  await writeFile(path.join(MD, f.replace(/\.glb$/, '.json')), JSON.stringify(json));
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
