# Busca modelos gratuitos no BlenderKit (CC0 / royalty free) e lista metadados.
import json, sys, urllib.request, urllib.parse
q = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 8
url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": n})
d = json.load(urllib.request.urlopen(url, timeout=30))
for r in d["results"]:
    p = r.get("dictParameters", {})
    gl = [f for f in r.get("files", []) if f["fileType"] == "gltf"]
    print(f'{r["assetBaseId"][:8]} | {r["name"][:40]:40} | {r.get("license")} | faces={p.get("faceCount")} | glb={"y" if gl else "n"} | {r.get("thumbnailMiddleUrl","")}')
