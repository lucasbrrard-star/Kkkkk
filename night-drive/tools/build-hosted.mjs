// Builds a self-contained hosted version of the game (used for the shareable test link):
//  - game.js: the game's own code, unminified; three.js and postprocessing come from jsDelivr
//    through an import map (pinned versions), so only our code ships with the page
//  - index.html: page with inline CSS, models/ and textures/ beside it
//  - the car uses the non-meshopt GLB so no WebAssembly is needed in sandboxed frames
// Usage: node tools/build-hosted.mjs <outDir>
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = path.resolve(process.argv[2] || 'dist-hosted');
const THREE_V = '0.187.0', PP_V = '6.39.6';
await build({
  configFile: false,
  base: './',
  publicDir: false,
  logLevel: 'warn',
  define: { 'import.meta.env.VITE_CAR_URL': JSON.stringify('models/car-glb.json') },
  build: {
    outDir: out, emptyOutDir: true, target: 'es2020', minify: false, cssCodeSplit: false, modulePreload: false,
    rollupOptions: {
      input: path.resolve('src/main.ts'),
      external: (id) => id === 'three' || id.startsWith('three/') || id === 'postprocessing',
      output: { format: 'es', entryFileNames: 'game.js', assetFileNames: '[name][extname]', inlineDynamicImports: true },
    },
  },
});
const cssFile = fs.readdirSync(out).find((f) => f.endsWith('.css'));
const css = cssFile ? fs.readFileSync(path.join(out, cssFile), 'utf8') : '';
if (cssFile) fs.rmSync(path.join(out, cssFile));
const importmap = {
  imports: {
    three: `https://cdn.jsdelivr.net/npm/three@${THREE_V}/build/three.module.js`,
    'three/examples/jsm/': `https://cdn.jsdelivr.net/npm/three@${THREE_V}/examples/jsm/`,
    postprocessing: `https://cdn.jsdelivr.net/npm/postprocessing@${PP_V}/build/index.js`,
  },
};
const page = `<title>Night Drive Neon City</title>
<meta name="description" content="NIGHT DRIVE — Neon City: corrida arcade 3D noturna no navegador.">
<meta name="theme-color" content="#07060c">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Rajdhani:wght@500;600;700&display=swap" rel="stylesheet">
<style>
:root { color-scheme: dark; }
${css}
</style>
<script type="importmap">${JSON.stringify(importmap)}</script>
<div id="app"></div>
<div id="ui"></div>
<script type="module" src="./game.js"></script>
`;
fs.writeFileSync(path.join(out, 'index.html'), page);
fs.mkdirSync(path.join(out, 'models'), { recursive: true });
fs.cpSync('public/textures', path.join(out, 'textures'), { recursive: true });
fs.copyFileSync('public/models/car.json', path.join(out, 'models/car.json'));
// artifact hosts do not serve .glb: ship the (non-meshopt) GLB as base64 inside JSON
const tmpGlb = path.join(out, 'models/car.tmp.glb');
execFileSync('node', ['tools/plain-car.mjs', tmpGlb], { stdio: 'inherit' });
fs.writeFileSync(path.join(out, 'models/car-glb.json'), JSON.stringify({ glb: fs.readFileSync(tmpGlb).toString('base64') }));
fs.rmSync(tmpGlb);
for (const f of fs.readdirSync(out, { recursive: true })) console.log(f, fs.statSync(path.join(out, String(f))).size);
