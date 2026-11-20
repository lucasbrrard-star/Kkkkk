# Créditos e licenças

## Modelos 3D (BlenderKit, gratuitos)

Usados **somente como base de produção**: cada modelo é posado e renderizado em pixel art pelo
pipeline `art/` (o jogo não distribui os arquivos 3D). Para baixar novamente: `./tools/fetch-models.sh`
(cenário) e `python3 tools/bk-download.py` (personagens, ver `tools/models.json` e `art/chars3d.ts`).

| Chave | Modelo | Autor | Licença | Página |
|---|---|---|---|---|
| `bench` | Park Bench | Dal Roron | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/0e35aec5-21cf-4e03-883e-008756e7d8bf/ |
| `busstop` | Mexican Bus Stop (Parabus) lowpoly | Orlando Ibarra | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/ecbd44e3-81ae-4351-abfb-51d483ab63c8/ |
| `char_23` | Oscar Character Rigged | Rex Mun | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/cb6c4200-fe88-4d95-99f9-fac4a5c2d3bb/ |
| `char_25` | Victoria Character Rigged | Rex Mun | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/1fcc4446-1992-48ec-a160-9cd73ee35158/ |
| `char_28` | Male character | diaverx miky | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/7ab6ddaa-65dc-423f-83aa-a7328a202e74/ |
| `char_29` | Jose Character Rigged | Rex Mun | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/961b214c-e97c-4e8f-9ae8-ef578e3976b7/ |
| `char_3` | Tebogo | Introspective Mnisi | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/e72a7d03-7e0f-45cc-81a1-2376255e7166/ |
| `char_30` | Anna Character Rigged | Rex Mun | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/34090c8f-130d-41ca-9e74-ae58783c361f/ |
| `char_37` | Tomas Rigged | Rex Mun | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/bb69bad1-70cf-45f0-9a37-29baa471bf29/ |
| `flowers_pink` | Stonecrop bouquet | Alexander Novgorodtsev | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/6a21dd58-9d40-43a7-b876-91bd69e1fa12/ |
| `fountain` | Old concrete fountain | mDav давыдова | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/8c47c7c1-0f47-4493-aa8a-ec9a390bf8b4/ |
| `lamp_single` | Old Street Lamp | Dal Roron | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/c65a81d5-bcfb-4ea9-8c9b-b2c3f7c588e4/ |
| `lighthouse` | Lighthouse | Robert Restu Pambudi | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/432b2f07-e812-4d6e-b465-06f647c95d28/ |
| `lounger` | Sun lounger for pool | jhon maycon | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/cf4de778-cd40-4674-bdfb-eb8f9bb24a28/ |
| `palm_b` | Palm Tree | Jan Hecl | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/b549671d-9836-4f62-a269-1a3a85902247/ |
| `sailboat` | Ship miniature | Dovydas Alytas | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/b829e72b-846f-443a-8985-353b56ccd24f/ |
| `tree_blue` | Blue flowered-dark purple leaved tree | Sharif Miah | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/a9e48b46-9029-4bc5-8894-717b13d5fc7a/ |
| `tree_gold` | Yellow flowered-light green leaved tree | Sharif Miah | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/1e40b507-595e-4562-ae5e-ac842c2e3092/ |
| `umbrella` | Round Beach Umbrella | Jesús Snz | BlenderKit Royalty Free | https://www.blenderkit.com/get-blenderkit/9c5eedc2-2142-4742-8a67-86ef1f10d84d/ |

A licença *BlenderKit Royalty Free* permite uso comercial em produtos derivados (como sprites
renderizados em um jogo), sem redistribuir o modelo original. CC0 é domínio público.

## Arte original

Casas, café, roda-gigante, píer, ilhas, ônibus, tiles do mapa, ícones do HUD e efeitos foram
criados proceduralmente neste projeto (`art/env.ts`, `art/tiles.ts`, `art/objects.ts`, `src/ui/icons.ts`).

## Software e fontes

- Phaser 3.80.1 (MIT) · glTF-Transform (MIT) · draco3d (Apache-2.0) · sharp (Apache-2.0) · pngjs (MIT)
- Fonte da interface: Baloo 2 (Google Fonts, SIL Open Font License)
