// Gera dist/artifact.html: a mesma página do build, sem <html>/<head>/<body> (o Artifact
// do claude.ai envolve a página num esqueleto próprio) e com o CSS embutido.
// Uso: npm run build && node tools/artifact.mjs
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve('dist');
const html = await readFile(path.join(DIST, 'index.html'), 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = [...html.matchAll(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g)].map((m) => m[0]).join('\n');
const cssHref = html.match(/<link rel="stylesheet"[^>]*href="(\.\/assets\/[^"]+\.css)"/)[1];
const css = await readFile(path.join(DIST, cssHref), 'utf8');
const script = html.match(/<script type="module"[^>]*><\/script>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script type="module"[^>]*><\/script>/, '').trim();
const page = `${title}\n<meta name="theme-color" content="#040507">\n${fonts}\n<style>\n${css}\n</style>\n${body}\n${script}\n`;
await writeFile(path.join(DIST, 'artifact.html'), page);
// lista de arquivos a publicar junto
const files = {};
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else {
      const rel = path.relative(DIST, p).split(path.sep).join('/');
      if (rel === 'index.html' || rel === 'artifact.html' || rel.endsWith('.css') || rel === 'manifest.webmanifest' || rel === 'files.json') continue;
      files[rel] = path.relative(path.resolve('..'), p).split(path.sep).join('/');
    }
  }
}
await walk(DIST);
await writeFile(path.join(DIST, 'files.json'), JSON.stringify(files, null, 1));
console.log('artifact.html', (page.length / 1024).toFixed(0), 'KB ·', Object.keys(files).length, 'arquivos');
