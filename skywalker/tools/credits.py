# Gera public/assets/credits.json a partir dos metadados baixados em tools/cache.
import json, os, glob
HERE = os.path.dirname(os.path.abspath(__file__))
C = os.path.join(HERE, "cache")
A = json.load(open(os.path.join(HERE, "assets.json")))
MODELS = os.path.join(HERE, "..", "public", "assets", "models")
used = {m["key"] for m in A["models"] if os.path.exists(os.path.join(MODELS, m["key"] + ".glb"))} | {"creature_body", "antler_trophy", "treemonster"}
out = []
for p in sorted(glob.glob(os.path.join(C, "*.glb.json")) + glob.glob(os.path.join(C, "anim", "*.json")) + glob.glob(os.path.join(C, "ph", "*", "*.gltf.json")) + glob.glob(os.path.join(C, "tex", "*", "source.json"))):
    key = os.path.basename(p).split(".")[0]
    if "tex" not in p and key not in used and key != "source": continue
    m = json.load(open(p))
    lic = {"royalty_free": "BlenderKit Royalty Free", "cc_zero": "CC0"}.get(m.get("license"), m.get("license", ""))
    out.append({"name": m.get("name"), "author": m.get("author") or m.get("credit") or "", "license": lic, "source": "BlenderKit" if "blenderkit" in m.get("url", "") else "Poly Haven" if "polyhaven" in m.get("url", "") else m.get("source", ""), "url": m.get("url", "")})
for a in A["anims"]:
    if "url" in a:
        out.append({"name": a["key"] + " (animações)", "author": "Mixamo (Adobe), via exemplos do three.js", "license": "uso livre nos exemplos do three.js", "source": "three.js", "url": "https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf"})
out.append({"name": "Sons e vozes", "author": "gerados com ElevenLabs (efeitos sonoros + voz Brian/Jessica)", "license": "ElevenLabs", "source": "ElevenLabs", "url": "https://elevenlabs.io"})
os.makedirs(os.path.join(HERE, "..", "public", "assets"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "..", "public", "assets", "credits.json"), "w"), ensure_ascii=False, indent=1)
print(len(out), "créditos")
