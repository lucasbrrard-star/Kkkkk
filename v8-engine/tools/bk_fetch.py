"""Download free BlenderKit assets (models/materials) by assetBaseId prefix.
Usage: python3 bk_fetch.py <type> <id-prefix> <query> [resolution]
Writes cache/bk/<id>.blend + <id>.json (name, author, license, url)."""
import json, sys, os, urllib.request, urllib.parse
CACHE = os.path.join(os.path.dirname(__file__), '..', 'cache', 'bk')
UA = {'User-Agent': 'Mozilla/5.0'}
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read()
def search(q):
    u = 'https://www.blenderkit.com/api/v1/search/?' + urllib.parse.urlencode({'query': q, 'page_size': 40})
    return json.loads(get(u))['results']
atype, pid, query = sys.argv[1], sys.argv[2], sys.argv[3]
res = sys.argv[4] if len(sys.argv) > 4 else None
out = os.path.join(CACHE, pid + '.blend')
if os.path.exists(out):
    print('cached', pid); sys.exit(0)
r = next((x for x in search(f'{query} asset_type:{atype} is_free:true') if x['assetBaseId'].startswith(pid)), None)
if r is None:
    raise SystemExit(f'not found {pid}')
assert r.get('isFree'), 'not free'
files = {f['fileType']: f for f in r['files']}
f = files.get(res) if res and res in files else files['blend']
info = json.loads(get(f['downloadUrl'] + '?scene_uuid=00000000-0000-0000-0000-000000000000'))
data = get(info['filePath'])
open(out, 'wb').write(data)
meta = {'name': r['name'], 'assetBaseId': r['assetBaseId'], 'type': atype, 'license': r.get('license'),
        'author': (r.get('author') or {}).get('fullName'), 'file': f['fileType'],
        'url': f"https://www.blenderkit.com/get-blenderkit/{r['assetBaseId']}/", 'bytes': len(data)}
json.dump(meta, open(out[:-6] + '.json', 'w'), indent=1)
print('ok', pid, r['name'], len(data) // 1024, 'KB', f['fileType'])
