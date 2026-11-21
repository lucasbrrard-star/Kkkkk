# V8 ENGINE — Cinematic Motion Graphics (prévia de 30 s)

Vídeo vertical 1080×1920, 30 fps, 900 quadros, explicando o ciclo de quatro tempos de um V8 a gasolina.
Pipeline: **Blender 5.3 (Cycles, CPU)** → **Remotion 4** (motion graphics, tipografia, áudio) → **FFmpeg** (exportação/validação).

## Configuração mecânica adotada

| Item | Valor |
|---|---|
| Arquitetura | V8 90°, dois bancos de 4 cilindros, DOHC, 4 válvulas/cilindro (32 válvulas) |
| Virabrequim | *cross-plane*, moentes a 0° / 90° / 270° / 180°, duas bielas por moente |
| Numeração | Ford: banco direito 1-2-3-4 (à frente), banco esquerdo 5-6-7-8 |
| Ordem de ignição | **1-5-4-8-6-3-7-2** (uma combustão a cada 90° de virabrequim) |
| Diâmetro × curso | 93,0 × 92,7 mm; biela 150,7 mm; altura do bloco 227 mm (proporções do 5.0 "Coyote") |
| Taxa de compressão | 12:1 (volume da câmara usado na intensidade do gás comprimido) |
| Comando | 1/2 rotação do virabrequim (driver); correias dentadas 2:1 (~30 mm / ~60 mm) |
| Válvulas (graus do ciclo, 0 = PMS de combustão) | Admissão 350°→575°, escape 145°→370°, levantamento 10,5 / 10 mm |
| Ignição | 12° antes do PMS; combustão ~27° (função de Wiebe) |

Cinemática (`scripts/kin.py`): posição do pistão pela relação biela-manivela exata
`x = r·cos φ + √(L² − r²·sin² φ)`; cada cilindro recebe sua fase a partir do mesmo ângulo do virabrequim
(nenhum pistão é animado isoladamente). O ciclo completo ocupa 720°.

Rig no Blender (`scripts/build_scene.py`):
- virabrequim: rotação em keyframes (ângulo acumulado com velocidade variável — câmera lenta nos 4 tempos);
- bielas: *constraints* `Copy Location` (moente, filho do virabrequim) + `Damped Track` (pino do pistão);
- comandos: *driver* `r * 0.5` sobre a rotação do virabrequim; correias com *driver* no deslocamento dos dentes;
- lóbulos dos comandos **gerados a partir da curva de levantamento**; o deslocamento de cada válvula é a
  função-suporte do lóbulo na direção do tucho (contato came/tucho geometricamente coerente);
- molas escalonadas pelo levantamento; gases, frente de chama, centelhas e fluxos guiados pela fase de cada cilindro.

Validação numérica: `scripts/validate_mech.py` (resultado em `build/mech_validation.json`).

## Ativos gratuitos efetivamente usados

| Ativo | Fonte | Licença | Uso |
|---|---|---|---|
| Ford Mustang GT (ready for rigging) — Paweł Wałasiewicz | BlenderKit `fdb71593` | Royalty Free | carro (abertura/encerramento; capô articulado) |
| Spark Plugs Titanium — Pierre-Louis Baril | BlenderKit `52ec4957` | Royalty Free | 8 velas (instâncias de coleção) |
| V Pulley 23cm 2belts — Gabriel Dobrachinski | BlenderKit `e0fde828` | Royalty Free | polia/amortecedor do virabrequim |
| Cast Aluminum — KID | BlenderKit `d44d4d73` | Royalty Free | bloco, cabeçotes, cárter, tampa |
| Cast iron — Infeeq | BlenderKit `f494715c` | Royalty Free | camisas dos cilindros |
| Brushed Machined Steel Metal — Paco Salas | BlenderKit `b385c9fc` | Royalty Free | virabrequim, comandos, tuchos |
| Brushed Steel — Sebastian Joseph | BlenderKit `d49a5c9f` | Royalty Free | bielas |
| Brushed Steel — Abin Suresh | BlenderKit `4f016d1a` | Royalty Free | válvulas, borboleta |
| Polished Chrome Metal — Abin Suresh | BlenderKit `589e86f2` | Royalty Free | pinos, retentores |
| Black Plastic | BlenderKit `335d2f7f` | Royalty Free | coletor de admissão, bobinas, injetores |
| Heat Oxidized Brushed Titanium — Bad Pixel | BlenderKit `7891ca49` | Royalty Free | coletores de escape |
| Hexagon Light Automotive Studio HDRI — Nandu M | BlenderKit `65fe1eca` | Royalty Free | reflexos de estúdio |
| Barlow Condensed / JetBrains Mono | Google Fonts | SIL OFL 1.1 | tipografia |

Baixados mas não usados na versão final: Powder Coated Aluminium (`581002c0`), Studio Small 09 (`4b6bed11`, CC0).
Não existe no catálogo gratuito do BlenderKit um V8 com mecânica interna separada (pistões, bielas, virabrequim,
válvulas); por isso o motor foi **modelado proceduralmente** em Python (bloco com camisas e galerias de água,
cabeçotes com câmaras em telhado, dutos, guias e alojamentos, virabrequim com contrapesos, pistões com anéis e
pino, bielas em I com capa e parafusos, 32 válvulas com molas e tuchos, 4 comandos, correias, coletores).

## Áudio
- Narração: ElevenLabs, voz pré-definida masculina "Adam", modelo `eleven_multilingual_v2` (pt-BR).
  Os seis trechos já existiam no histórico da conta (gerados às 09:41 com o texto exato do roteiro); foram
  baixados do histórico sem novo consumo de créditos. Conferidos por transcrição automática (Whisper).
- Efeitos e trilha: **sintetizados por código** (`scripts/audio.py`), sincronizados com os eventos reais da
  animação (centelhas, abertura/fechamento das válvulas do cilindro 1, varreduras e movimentos de câmera).
  São sons ilustrativos — não gravações dos componentes.
- Mixagem: ducking sob a narração, normalização −16 LUFS / −1,5 dBTP.

## Reproduzir
```bash
python3 scripts/bk_download.py "<busca>" <id8> [model|material|hdr] [gltf|blend|resolution_1K]
blender -b --python scripts/build_scene.py -- --res 432x768 --spp 10   # cena + bake + âncoras 2D
scripts/render_all.sh                                                    # render retomável
<venv>/bin/python scripts/audio.py                                       # SFX + trilha + mixagem
scripts/upscale.sh && cd remotion && npx remotion render src/index.ts V8Preview ../V8_ENGINE_PREVIEW_30S.mp4
```
