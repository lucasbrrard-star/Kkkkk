# Baixa os assets de origem (gratuitos) para tools/cache — não versionado.
#   BlenderKit (modelos gratuitos, Royalty Free / CC0) · Poly Haven (CC0) · exemplos do three.js
# Uso: python3 tools/fetch.py [chave]
import json, os, subprocess, sys, urllib.parse
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
A = json.load(open(os.path.join(HERE, "assets.json")))
only = sys.argv[1] if len(sys.argv) > 1 else None

def curl(url, out=None):
    args = ["curl", "-s", "--fail", "--max-time", "900", "-A", "Mozilla/5.0", "--retry", "3"]
    if out: args += ["-o", out]
    return subprocess.run(args + [url], capture_output=True, check=True).stdout

def bk(m):
    out = os.path.join(CACHE, m["key"] + ".glb")
    if os.path.exists(out): return "cache"
    s = lambda q: json.loads(curl("https://www.blenderkit.com/api/v1/search/?" + urllib.parse.urlencode(q)))["results"]
    rs = s({"query": f'{m["q"]} asset_type:model is_free:true', "page_size": 40})
    r = next((r for r in rs if r["assetBaseId"].startswith(m["bk"])), None) or s({"query": f'asset_base_id:{m["bk"]}'})[0]
    f = next(f for f in r["files"] if f["fileType"] == "gltf")
    info = json.loads(curl(f["downloadUrl"] + "?scene_uuid=00000000-0000-0000-0000-000000000000"))
    curl(info["filePath"], out + ".part"); os.replace(out + ".part", out)
    json.dump({"name": r["name"], "license": r.get("license"), "author": (r.get("author") or {}).get("fullName"),
               "source": "BlenderKit", "url": f'https://www.blenderkit.com/get-blenderkit/{r["assetBaseId"]}/'},
              open(out + ".json", "w"), ensure_ascii=False, indent=1)
    return r["name"]

def ph_model(m):
    d = os.path.join(CACHE, "ph", m["key"]); gl = os.path.join(d, m["key"] + ".gltf")
    if os.path.exists(gl): return "cache"
    os.makedirs(d, exist_ok=True)
    files = json.loads(curl("https://api.polyhaven.com/files/" + m["ph"]))
    g = files["gltf"]["1k"]["gltf"]
    for rel, inc in g.get("include", {}).items():
        p = os.path.join(d, rel); os.makedirs(os.path.dirname(p), exist_ok=True); curl(inc["url"], p)
    curl(g["url"], gl)
    json.dump({"name": m["ph"], "license": "CC0", "author": "Poly Haven", "source": "Poly Haven",
               "url": "https://polyhaven.com/a/" + m["ph"]}, open(gl + ".json", "w"), indent=1)
    return m["ph"]

def ph_tex(t):
    d = os.path.join(CACHE, "tex", t["key"])
    if os.path.exists(os.path.join(d, "diff.jpg")): return "cache"
    os.makedirs(d, exist_ok=True)
    files = json.loads(curl("https://api.polyhaven.com/files/" + t["ph"]))
    for k, name in [("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough"), ("AO", "ao")]:
        if k in files: curl(files[k]["2k"]["jpg"]["url"], os.path.join(d, name + ".jpg"))
    json.dump({"name": t["ph"], "license": "CC0", "source": "Poly Haven", "url": "https://polyhaven.com/a/" + t["ph"]},
              open(os.path.join(d, "source.json"), "w"), indent=1)
    return t["ph"]

def anim(a):
    out = os.path.join(CACHE, "anim", a["key"] + ".glb")
    if os.path.exists(out): return "cache"
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if "bk" in a: return bk(dict(a, key=os.path.join("anim", a["key"])))
    curl(a["url"], out); return a["key"]

jobs = [(bk if "bk" in m else ph_model, m) for m in A["models"]] + [(ph_tex, t) for t in A["textures"]] + [(anim, a) for a in A["anims"]]
jobs = [j for j in jobs if not only or j[1]["key"] == only]
os.makedirs(CACHE, exist_ok=True)
def run(j):
    fn, m = j
    try: return f'ok     {m["key"]:20} {fn(m)}'
    except Exception as e: return f'FALHOU {m["key"]:20} {str(e)[:150]}'
with ThreadPoolExecutor(6) as ex:
    for line in ex.map(run, jobs): print(line, flush=True)
