// Baixa os assets de origem para tools/cache (não versionado).
// Uso: npm run assets:fetch
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MODELS, TEXTURES } from './manifest';

const CACHE = path.resolve('tools/cache');
fs.mkdirSync(path.join(CACHE, 'anim'), { recursive: true });
fs.mkdirSync(path.join(CACHE, 'tex'), { recursive: true });

const curl = (url: string, out?: string) => execFileSync('curl', ['-s', '--fail', '--max-time', '300', '-A', 'Mozilla/5.0', ...(out ? ['-o', out] : []), url], { maxBuffer: 1 << 28 });

function bkDownload(id: string, query: string, out: string) {
  const search = 'https://www.blenderkit.com/api/v1/search/?' + new URLSearchParams({ query: `${query} asset_type:model is_free:true`, page_size: '40' });
  const res = JSON.parse(curl(search).toString());
  let r = res.results.find((x: { assetBaseId: string }) => x.assetBaseId.startsWith(id));
  if (!r) {
    // busca direta pelo id
    const s2 = 'https://www.blenderkit.com/api/v1/search/?' + new URLSearchParams({ query: `asset_base_id:${id}` });
    r = JSON.parse(curl(s2).toString()).results?.[0];
  }
  if (!r) throw new Error(`não encontrado no BlenderKit: ${id}`);
  const f = r.files.find((x: { fileType: string }) => x.fileType === 'gltf');
  const info = JSON.parse(curl(f.downloadUrl + '?scene_uuid=00000000-0000-0000-0000-000000000000').toString());
  curl(info.filePath, out);
  fs.writeFileSync(out + '.json', JSON.stringify({ name: r.name, assetBaseId: r.assetBaseId, license: r.license, author: r.author?.fullName, url: `https://www.blenderkit.com/get-blenderkit/${r.assetBaseId}/` }, null, 1));
}

for (const m of MODELS) {
  const out = path.join(CACHE, m.source.cacheFile ?? `${m.key}.glb`);
  if (fs.existsSync(out)) continue;
  try {
    if (m.source.bk) bkDownload(m.source.bk, m.source.query ?? '', out);
    else if (m.source.url) { curl(m.source.url, out); fs.writeFileSync(out + '.json', JSON.stringify({ name: m.key, url: m.source.url, credit: m.credit }, null, 1)); }
    console.log('ok   ', m.key);
  } catch (e) { console.log('FALHOU', m.key, (e as Error).message.slice(0, 120)); }
}

for (const t of TEXTURES) {
  const dir = path.join(CACHE, 'tex', t.key);
  if (fs.existsSync(path.join(dir, 'diff.jpg'))) continue;
  fs.mkdirSync(dir, { recursive: true });
  try {
    const files = JSON.parse(curl(`https://api.polyhaven.com/files/${t.ph}`).toString());
    const pick = (k: string) => files[k]?.['1k']?.jpg?.url ?? files[k]?.['1k']?.png?.url;
    curl(pick('Diffuse'), path.join(dir, 'diff.jpg'));
    curl(pick('nor_gl'), path.join(dir, 'nor.jpg'));
    curl(pick('Rough'), path.join(dir, 'rough.jpg'));
    fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify({ name: t.ph, license: 'CC0', url: `https://polyhaven.com/a/${t.ph}` }));
    console.log('ok   ', 'tex', t.key);
  } catch (e) { console.log('FALHOU', 'tex', t.key, (e as Error).message.slice(0, 120)); }
}
