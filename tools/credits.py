# Gera CREDITS.md a partir dos metadados dos modelos usados (tools/models/*.glb.json).
import json, glob, os, re
props = open('art/props.ts').read()
used = set(re.findall(r"model\('([a-z_]+)'\)", props)) | set(re.findall(r"'(tree_[a-z]+)'", props))
used |= set(re.findall(r"tools/models/(char_\d+)\.glb", open('art/chars3d.ts').read()))
rows = []
for f in sorted(glob.glob('tools/models/*.glb.json')):
    key = os.path.basename(f)[:-9]
    if key not in used: continue
    m = json.load(open(f))
    lic = {'cc_zero': 'CC0', 'royalty_free': 'BlenderKit Royalty Free'}.get(m.get('license'), m.get('license'))
    rows.append(f"| `{key}` | {m['name']} | {m.get('author') or '—'} | {lic} | {m['url']} |")
out = """# Créditos e licenças

## Modelos 3D (BlenderKit, gratuitos)

Usados **somente como base de produção**: cada modelo é posado e renderizado em pixel art pelo
pipeline `art/` (o jogo não distribui os arquivos 3D). Para baixar novamente: `./tools/fetch-models.sh`
(cenário) e `python3 tools/bk-download.py` (personagens, ver `tools/models.json` e `art/chars3d.ts`).

| Chave | Modelo | Autor | Licença | Página |
|---|---|---|---|---|
""" + "\n".join(rows) + """

A licença *BlenderKit Royalty Free* permite uso comercial em produtos derivados (como sprites
renderizados em um jogo), sem redistribuir o modelo original. CC0 é domínio público.

## Arte original

Casas, café, roda-gigante, píer, ilhas, ônibus, tiles do mapa, ícones do HUD e efeitos foram
criados proceduralmente neste projeto (`art/env.ts`, `art/tiles.ts`, `art/objects.ts`, `src/ui/icons.ts`).

## Software e fontes

- Phaser 3.80.1 (MIT) · glTF-Transform (MIT) · draco3d (Apache-2.0) · sharp (Apache-2.0) · pngjs (MIT)
- Fonte da interface: Baloo 2 (Google Fonts, SIL Open Font License)
"""
open('CREDITS.md', 'w').write(out)
print(len(rows), 'modelos')
