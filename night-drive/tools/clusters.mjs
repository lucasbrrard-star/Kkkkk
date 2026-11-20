import { readRaw, extractNodes, sample } from './carlib.mjs';
const doc = await readRaw(process.argv[2]);
for (const nd of await extractNodes(doc)) {
  const hist = new Map(); const n = nd.pos.length / 3;
  for (let i = 0; i < n; i++) {
    const c = sample(nd.clr, nd.uv[i * 2], nd.uv[i * 2 + 1]);
    const o = sample(nd.orm, nd.uv[i * 2], nd.uv[i * 2 + 1]);
    const key = c.slice(0, 3).map(v => Math.round(v / 40) * 40).join(',') + ' r' + Math.round(o[1] / 64) + ' a' + Math.round(o[0] / 64);
    hist.set(key, (hist.get(key) || 0) + 1);
  }
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${Math.round(100 * v / n)}%`);
  console.log(nd.name.padEnd(34), String(n).padStart(6), top.join('  '));
}
