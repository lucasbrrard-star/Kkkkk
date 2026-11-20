import json, sys, urllib.parse, subprocess
seen=set()
for q in sys.argv[2:]:
  for page in (1,2):
    url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": 40, "page": page})
    d = json.loads(subprocess.run(["curl", "-s", "--max-time", "40", url], capture_output=True).stdout or b'{}')
    for r in d.get("results", []):
        p = r.get("dictParameters") or {}
        if r["assetBaseId"] in seen or not p.get("rig"): continue
        if not any(f["fileType"] == "gltf" for f in r.get("files", [])): continue
        if r.get("category") not in ("man","woman","characters","human","people","boy","girl","child","humanoid"): continue
        seen.add(r["assetBaseId"])
        print(r["assetBaseId"][:8], '|', r["name"][:40], '|', p.get("modelStyle"), '| faces', p.get("faceCount"), '|', r.get("thumbnailMiddleUrl"))
