"""Baixa ativos gratuitos do BlenderKit (gltf ou blend) e grava metadados de licença."""
import json, sys, urllib.parse, subprocess, os
OUT = os.path.join(os.path.dirname(__file__), '..', 'cache', 'bk')
def curl(url, out=None):
    args = ['curl', '-s', '--fail', '--max-time', '600', '-A', 'Mozilla/5.0']
    if out: args += ['-o', out]
    return subprocess.check_output(args + [url])
def get(query, prefix, atype='model', ftype='gltf'):
    url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({'query': f'{query} asset_type:{atype} is_free:true', 'page_size': '60'})
    res = json.loads(curl(url))
    r = next((x for x in res['results'] if x['assetBaseId'].startswith(prefix)), None)
    if not r: raise SystemExit(f'not found {prefix}')
    f = next((x for x in r['files'] if x['fileType'] == ftype), None)
    if not f: raise SystemExit(f'no {ftype} for {prefix}: {[x["fileType"] for x in r["files"]]}')
    info = json.loads(curl(f['downloadUrl'] + '?scene_uuid=00000000-0000-0000-0000-000000000000'))
    ext = os.path.splitext(urllib.parse.urlparse(info['filePath']).path)[1]
    out = os.path.join(OUT, f'{prefix}{ext}')
    curl(info['filePath'], out)
    meta = {'name': r['name'], 'assetBaseId': r['assetBaseId'], 'license': r['license'], 'author': (r.get('author') or {}).get('fullName'),
            'page': f"https://www.blenderkit.com/get-blenderkit/{r['assetBaseId']}/", 'file': os.path.basename(out), 'fileType': ftype}
    json.dump(meta, open(out + '.json', 'w'), indent=1)
    print('ok', prefix, r['name'], os.path.getsize(out), out)
if __name__ == '__main__':
    a = sys.argv
    get(a[1], a[2], a[3] if len(a) > 3 else 'model', a[4] if len(a) > 4 else 'gltf')
