import { chromium } from '../tests/pw.mjs';
const out = process.argv[2];
const models = process.argv.slice(3);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
for (const m of models) {
  for (const [vi, v] of [['a', '0.9,0.25,0.9'], ['b', '3.6,0.2,0.9']]) {
    await page.goto(`http://localhost:5199/tools/viewer/index.html?m=/raw-models/${m}.glb&view=${v}`);
    await page.waitForFunction(() => document.title === 'ready' || document.title.startsWith('error'), null, { timeout: 120000 });
    console.log(m, vi, await page.title());
    await page.screenshot({ path: `${out}/${m}_${vi}.png` });
  }
}
await browser.close();
