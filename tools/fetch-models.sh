#!/usr/bin/env bash
# Baixa os modelos gratuitos listados em tools/models.json (não versionados).
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, subprocess, os
for key, q, pref in json.load(open('tools/models.json')):
    out = f'tools/models/{key}.glb'
    if os.path.exists(out): continue
    try:
        subprocess.run(['python3', 'tools/bk-download.py', q, pref, out], check=True)
    except Exception as e:
        print('FALHOU', key, e)
PY
