# V8 — Engenharia em Movimento (prévia de 30 s)

Vídeo vertical 9:16 de 30 s, a 30 fps (900 quadros), que mostra o funcionamento de um V8 a gasolina de quatro tempos.
Pipeline: **Blender 5.3 (Cycles)** → quadros PNG → **Remotion 4.0.540** (motion graphics, tipografia e áudio) → MP4 H.264 + AAC, conferido com **FFmpeg**.

## Configuração mecânica (documentada e verificada em `blender/v8kin.py`)

| Item | Valor |
|---|---|
| Arquitetura | V8 a 90°, duas bancadas de 4 cilindros |
| Virabrequim | cross-plane: moentes a 0° / 90° / 270° / 180° |
| Numeração | ímpares (1-3-5-7) na bancada +X, pares (2-4-6-8) na bancada −X; par dianteiro 1/2 |
| Ordem de ignição | **1-8-4-3-6-5-7-2** (uma combustão a cada 90° de virabrequim) |
| Diâmetro × curso | 92 × 92,7 mm; biela de 150,7 mm; altura de compressão de 30 mm |
| Comando | DOHC por bancada, 1 válvula de admissão + 1 de escape por cilindro (simplificação didática) |
| Acionamento | corrente do virabrequim (28 dentes) até a engrenagem do comando de admissão (56 dentes), ou seja, 2:1; o comando de escape é tocado por engrenagens 1:1 a partir do de admissão |
| Cames | círculo de base de 18 mm + nariz de 9 mm, levantamento de 9 mm e 240° de duração |
| Fases | AA 10° antes do PMS, FA 50° depois do PMI, AE 50° antes do PMI, FE 10° depois do PMS |
| Ignição | 15° antes do PMS de compressão |

O deslocamento de cada pistão vem da cinemática biela-manivela, `s = r·cosα + √(L² − r²·sin²α)`, aplicada ao ângulo do virabrequim. As bielas ficam presas ao pino do pistão e ao moente, e o levantamento de cada válvula é a função de suporte exata do came sobre um tucho plano. Assim, came e tucho se tocam sem atravessar um ao outro. Todas as peças são animadas a partir de um único ângulo θ(t) do virabrequim. O ciclo completo leva 720°.

`python3 blender/v8kin.py` roda a autoverificação: o PMS de cada cilindro coincide com sua posição na ordem de ignição, as válvulas ficam fechadas na compressão e na expansão, e os picos de abertura caem nos ângulos corretos.

## Ativos gratuitos efetivamente usados

**BlenderKit** (licença Royalty Free, baixados pela API pública de ativos gratuitos):

| Ativo | Autor | Uso |
|---|---|---|
| [Ford Mustang GT (ready for rigging)](https://www.blenderkit.com/get-blenderkit/fdb71593-c737-444e-adbc-984e6279e1d5/) | Paweł Wałasiewicz | carro da abertura e do encerramento (pintura trocada para grafite; emblemas ocultos) |
| [Spark Plugs Titanium](https://www.blenderkit.com/get-blenderkit/52ec4957-7cfd-45c9-97d7-aba7fe138f32/) | Pierre-Louis Baril | as 8 velas de ignição |
| [V pulley Big](https://www.blenderkit.com/get-blenderkit/fb654486-1152-4504-b448-3d068f4c159e/) | Gabriel Dobrachinski | polias do amortecedor, da bomba d'água, do alternador e do tensor |
| [Cast Satin Aluminum](https://www.blenderkit.com/get-blenderkit/740f16c1-accd-4e85-a2b9-b939257a260c/) | KID | bloco, cárter e corpo de borboleta |
| [Cast Aluminum](https://www.blenderkit.com/get-blenderkit/d44d4d73-750f-4476-a96b-534b0e5b47e6/) | KID | cabeçotes, pistões e tampa frontal |
| [Cast Iron](https://www.blenderkit.com/get-blenderkit/840ba424-a250-452c-a499-c27cb1f0b976/) | KID | camisas, dutos e câmaras |
| [Steel](https://www.blenderkit.com/get-blenderkit/370bad42-e27b-419f-bda4-32a3969ed23f/) | Nikhil G Krishnan | virabrequim, bielas e comandos |
| [Satin Chrome](https://www.blenderkit.com/get-blenderkit/3f90bbae-32bd-44ad-b71b-34aa96d126d7/) | KID | munhões, hastes de válvula e pinos |
| [Brushed Stainless Steel](https://www.blenderkit.com/get-blenderkit/b867817a-1978-47cc-87f4-8566d2d9ef17/) | Julia | coletores de escape e flautas |
| [Black Anodized Aluminum](https://www.blenderkit.com/get-blenderkit/5f58eac5-0b16-4c55-80d2-098fe6cac0eb/) | Paco Salas | tampas de válvula e coletor de admissão |
| [Rubber Black](https://www.blenderkit.com/get-blenderkit/5753435b-0f59-4776-a46b-284b08e873e4/) | Arfat Ikhte Rohman | correia de acessórios |

**Poly Haven** (CC0): HDRI [studio_small_09](https://polyhaven.com/a/studio_small_09), usado só nos reflexos, e o mapa de rugosidade de [concrete_floor_painted](https://polyhaven.com/a/concrete_floor_painted), usado no piso do estúdio.

**Não foram usados**: Sketchfab (o download exige login ou token de API, indisponível aqui), Quaternius e qualquer ativo pago.

**Modelado proceduralmente** (porque não existe V8 gratuito com mecânica interna no BlenderKit; a busca só retornou carros e um cabeçote de 4 cilindros enferrujado): bloco em V, cárter, cabeçotes com câmaras pent-roof e dutos, pistões com anéis e pino, bielas em I, virabrequim cross-plane com contrapesos e volante, 4 comandos, 16 válvulas, molas e tuchos, correntes (Geometry Nodes), coletores de admissão e escape, bicos injetores e tampas.

## Áudio

- **Narração**: ElevenLabs, modelo `eleven_multilingual_v2`, voz *premade* "Adam", em português. O plano gratuito da conta bloqueia, pela API, as vozes brasileiras da biblioteca (erro 402), e restavam ~725 caracteres. Cada fala foi encaixada na sua janela de 5 s com o rubberband (ritmo de 1,00× a 1,13×).
- **Efeitos e trilha**: sintetizados em `tools/audio_synth.py`, sem amostras de terceiros. O ronco do V8 vem dos pulsos de escape por bancada (cross-plane), na ordem de ignição. Os cliques de válvula, o estalo da vela, o "boom" da combustão, o chiado da admissão e o sopro do escape são disparados pelos mesmos eventos cinemáticos da animação. A trilha instrumental é original, em ré menor a 96 BPM (2 compassos por cena), com ducking sob a voz. Mixagem final em −15 LUFS, com pico real de −1,5 dBTP.

## Como reproduzir

```bash
python3 tools/bk_fetch.py ...                       # ativos (ver cabeçalho do script)
blender -b --factory-startup -P blender/build_scene.py      # monta render/scene.blend + render/overlay.json
blender -b render/scene.blend -P blender/render_all.py -- 360 640 10   # quadros (retomável)
python3 tools/audio_synth.py                         # cache/audio/mix.wav
cd remotion && npx remotion render src/index.ts V8Preview out/V8_ENGINE_PREVIEW_30S.mp4 --browser-executable=<chrome-headless-shell>
```

## Limitações desta prévia

- O 3D foi renderizado em **360×640 com 10 amostras + OIDN**, em CPU (4 núcleos, sem GPU), e ampliado para 1080×1920. Os motion graphics e a tipografia estão em resolução nativa. A versão definitiva deve renderizar o 3D em 1080×1920 com mais amostras.
- O carro é um Mustang GT real, um V8 na vida real, com os emblemas ocultos. O motor mostrado é um V8 genérico com 2 válvulas por cilindro e a ordem de ignição convencional 1-8-4-3-6-5-7-2. O Coyote original tem 4 válvulas por cilindro e outra numeração.
- O modelo do carro não tem compartimento do motor. Por isso a revelação usa a carroceria em raio X em vez de abrir o capô.
- Os gases são uma visualização estilizada (superfícies emissivas translúcidas com frente de chama esférica), não uma simulação de fluidos (CFD).
- A câmera lenta é variável: o ângulo do virabrequim segue uma curva monotônica, θ(t), que desacelera nas cenas 3 a 5.
