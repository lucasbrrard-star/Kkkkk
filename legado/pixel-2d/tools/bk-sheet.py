# Gera uma folha de miniaturas para escolher modelos: python3 tools/bk-sheet.py out.png "q1" "q2" ...
import json, sys, urllib.parse, subprocess, io
from PIL import Image, ImageDraw
out = sys.argv[1]; qs = sys.argv[2:]
cells = []
for q in qs:
    url = "https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode({"query": f"{q} asset_type:model is_free:true", "page_size": 8})
    d = json.loads(subprocess.run(["curl", "-s", "--max-time", "30", url], capture_output=True).stdout)
    for r in d.get("results", []):
        if not any(f["fileType"] == "gltf" for f in r.get("files", [])): continue
        t = r.get("thumbnailSmallUrl") or r.get("thumbnailMiddleUrl")
        b = subprocess.run(["curl", "-s", "--max-time", "30", t], capture_output=True).stdout
        try: im = Image.open(io.BytesIO(b)).convert("RGB").resize((150, 150))
        except Exception: continue
        lic = "CC0" if r.get("license") == "cc_zero" else "RF"
        cells.append((im, f'{r["assetBaseId"][:8]} {lic} {(r.get("dictParameters") or {}).get("faceCount") or "?"}', q))
cols = 8; rows = (len(cells) + cols - 1) // cols
sheet = Image.new("RGB", (cols * 160, rows * 178), (30, 30, 36)); dr = ImageDraw.Draw(sheet)
for i, (im, lab, q) in enumerate(cells):
    x, y = (i % cols) * 160 + 5, (i // cols) * 178 + 5
    sheet.paste(im, (x, y)); dr.text((x, y + 152), lab, fill=(255, 220, 140)); dr.text((x + 2, y + 2), q[:22], fill=(255, 255, 255))
sheet.save(out); print(len(cells))
