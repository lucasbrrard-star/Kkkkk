// Renderiza quadros-chave como PNG para revisão: node tools/stills.mjs 0 30 60 ...
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const frames = process.argv.slice(2).map(Number);
const scale = Number(process.env.SCALE || 0.5);
const outDir = process.env.OUT || 'out/stills';
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browser = await openBrowser('chrome', {browserExecutable, chromiumOptions: {gl: 'swangle'}});
const composition = await selectComposition({serveUrl, id: 'Preview', puppeteerInstance: browser});
for (const f of frames) {
  const t0 = Date.now();
  await renderStill({composition, serveUrl, frame: f, output: `${outDir}/f${String(f).padStart(3, '0')}.png`, scale, puppeteerInstance: browser, chromiumOptions: {gl: 'swangle'}});
  console.log('frame', f, Date.now() - t0, 'ms');
}
await browser.close({silent: true});
