import { chromium, GL_ARGS } from '../tests/pw.mjs';
const [out, m, view, hl = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.goto(`http://localhost:5199/tools/viewer/index.html?m=/raw-models/${m}.glb&view=${view}&hl=${encodeURIComponent(hl)}`);
await page.waitForFunction(() => document.title === 'ready' || document.title.startsWith('error'), null, { timeout: 120000 });
await page.screenshot({ path: out });
await browser.close();
