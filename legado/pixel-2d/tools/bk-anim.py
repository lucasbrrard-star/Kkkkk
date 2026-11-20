import json, sys, urllib.parse, subprocess
for q in sys.argv[1:]:
    url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": 30})
    d = json.loads(subprocess.run(["curl", "-s", "--max-time", "40", url], capture_output=True).stdout or b'{}')
    for r in d.get("results", []):
        p = r.get("dictParameters") or {}
        if not p.get("animated"): continue
        if not any(f["fileType"] == "gltf" for f in r.get("files", [])): continue
        print(q, '|', r["assetBaseId"][:8], '|', r["name"][:40], '|', r.get("license"), '| rig', p.get("rig"), '| faces', p.get("faceCount"), '| style', p.get("modelStyle"))
