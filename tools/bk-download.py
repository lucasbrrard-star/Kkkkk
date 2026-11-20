# Baixa o GLB de um modelo gratuito do BlenderKit pelo assetBaseId (prefixo) ou consulta.
# Uso: python3 tools/bk-download.py "<consulta>" <prefixo-id> <saida.glb>
import json, sys, urllib.request, urllib.parse, os, subprocess
q, pref, out = sys.argv[1], sys.argv[2], sys.argv[3]
url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": 40})
d = json.load(urllib.request.urlopen(url, timeout=30))
r = next(r for r in d["results"] if r["assetBaseId"].startswith(pref))
f = next(f for f in r["files"] if f["fileType"] == "gltf")
info = json.load(urllib.request.urlopen(f["downloadUrl"] + "?scene_uuid=00000000-0000-0000-0000-000000000000", timeout=30))
os.makedirs(os.path.dirname(out), exist_ok=True)
subprocess.run(["curl", "-s", "--fail", "--max-time", "180", "-o", out, info["filePath"]], check=True)
meta = {"name": r["name"], "assetBaseId": r["assetBaseId"], "license": r.get("license"), "author": (r.get("author") or {}).get("fullName"), "url": f'https://www.blenderkit.com/get-blenderkit/{r["assetBaseId"]}/'}
json.dump(meta, open(out + ".json", "w"), ensure_ascii=False, indent=1)
print(out, os.path.getsize(out), meta)
