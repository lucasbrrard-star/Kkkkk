# Busca personagens humanos gratuitos no BlenderKit com GLB e monta folha de referência numerada.
import json, sys, urllib.parse, subprocess, io
from PIL import Image, ImageDraw
out = sys.argv[1]; qs = sys.argv[2:]
seen, cells = set(), []
for q in qs:
    for page in (1, 2):
        url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": 20, "page": page})
        d = json.loads(subprocess.run(["curl", "-s", "--max-time", "40", url], capture_output=True).stdout or b'{}')
        for r in d.get("results", []):
            if r["assetBaseId"] in seen: continue
            if not any(f["fileType"] == "gltf" for f in r.get("files", [])): continue
            p = r.get("dictParameters") or {}
            if r.get("category") not in ("man", "woman", "characters", "human", "people", "child", "fantasy-characters", "boy", "girl", "humanoid") and "human" not in (r.get("tags") or []): continue
            seen.add(r["assetBaseId"])
            cells.append(r)
cells.sort(key=lambda r: (not (r.get("dictParameters") or {}).get("rig"), -(r.get("ratingsSum") or {}).get("score", 0) if r.get("ratingsSum") else 0))
cells = cells[:int(sys.argv[0] and 48)]
meta = []
sheet_cells = []
for i, r in enumerate(cells):
    t = r.get("thumbnailMiddleUrl") or r.get("thumbnailSmallUrl")
    b = subprocess.run(["curl", "-s", "--max-time", "30", t], capture_output=True).stdout
    try: im = Image.open(io.BytesIO(b)).convert("RGB").resize((200, 200))
    except Exception: continue
    p = r.get("dictParameters") or {}
    n = len(sheet_cells) + 1
    lab = f'#{n} {"RIG" if p.get("rig") else "sem rig"} {"ANIM" if p.get("animated") else ""} {"CC0" if r.get("license")=="cc_zero" else "RF"}'
    sheet_cells.append((im, lab, r["name"][:26]))
    meta.append({"n": n, "id": r["assetBaseId"], "name": r["name"], "rig": p.get("rig"), "animated": p.get("animated"), "faces": p.get("faceCount"), "license": r.get("license"), "category": r.get("category"), "style": p.get("modelStyle"), "url": f'https://www.blenderkit.com/get-blenderkit/{r["assetBaseId"]}/'})
cols = 8; rows = (len(sheet_cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 210, rows * 244), (24, 26, 34)); dr = ImageDraw.Draw(sheet)
for i, (im, lab, nm) in enumerate(sheet_cells):
    x, y = (i % cols) * 210 + 5, (i // cols) * 244 + 5
    sheet.paste(im, (x, y)); dr.text((x, y + 204), lab, fill=(255, 214, 120)); dr.text((x, y + 220), nm, fill=(235, 235, 235))
sheet.save(out)
json.dump(meta, open(out + ".json", "w"), ensure_ascii=False, indent=1)
print(len(sheet_cells))
