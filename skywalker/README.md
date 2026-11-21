# SKYWALKER

Jogo de terror em primeira pessoa para celular na horizontal. Você é o investigador que entra
na floresta, à noite, atrás da criatura que levou o seu filho, o Theo. O Skywalker é alto, tem
um crânio de cervo com duas galhadas enormes e se disfarça de bicho da floresta para atacar
quando você menos espera.

Roda no navegador (Three.js + WebGL 2), em tela cheia, com controles de toque. No computador
também dá para jogar com teclado e mouse.

## Como jogar

| Ação | Celular | Computador |
|---|---|---|
| Andar | arraste o polegar esquerdo | WASD / setas |
| Olhar | arraste o polegar direito (ou o próprio gatilho) | mouse |
| Atirar | botão do revólver | clique |
| Correr | botão do corredor (liga/desliga) | Shift |
| Lanterna | botão da lanterna | F |
| Recarregar | botão do tambor | R |
| Pegar | botão "PEGAR" que aparece perto do item | E |

- Siga o **choro**: ele vem da próxima pista. A marca no topo da tela mostra a direção do som.
- São **5 pistas** do Theo (tênis, ursinho, carrinho, rádio e um desenho). Depois disso, o choro
  leva ao **covil**, onde acontece o confronto final.
- **Cervo de verdade foge.** Se um cervo fica parado, não respira, gira a cabeça demais e os
  olhos brilham **vermelho** na lanterna (os de verdade refletem verde), é o Skywalker. Não dê
  as costas para ele.
- A lanterna forte atrasa a criatura. Dois tiros a espantam; só no covil dá para matá-la.
- Pilhas e caixas de munição .38 estão espalhadas pelo caminho.

## Rodar

```bash
npm install
npm run dev          # servidor local (abra no celular pela rede, na horizontal)
npm run build        # gera dist/ — basta hospedar essa pasta (GitHub Pages, Netlify…)
npm run test         # build + teste de fumaça no Chromium (celular na horizontal, toque)
```

Os assets prontos já estão em `public/assets/` (modelos otimizados, texturas e sons), então
`npm run dev` funciona sem baixar nada.

## Como os assets foram feitos

Tudo sai de catálogos gratuitos e é reprocessado para celular:

1. `npm run assets:fetch` — baixa os modelos gratuitos do **BlenderKit** e do **Poly Haven**
   (CC0) e as texturas PBR do chão para `tools/cache/` (lista em `tools/assets.json`).
2. `npm run skywalker` — no **Blender**, monta a criatura: o corpo do "Skeletal Humanoid
   Creature" ganha a cabeça do "Deer antler trophy" (crânio + galhadas). O rig Auto-Rig Pro é
   reconstruído como um esqueleto limpo, e as animações são transferidas do "Tree Monster
   Rigged Animated" (parado, andar, ataques, golpe, morte) e do X Bot do three.js (corrida),
   com correção de pose de repouso (`tools/blender/build_skywalker.py`).
3. `npm run assets` — simplifica as malhas até um teto de triângulos (com versão de longe para
   as árvores), converte texturas para WebP, aplica compressão meshopt e grava em
   `public/assets/models/` (`tools/build.ts`).
4. `npm run audio` — gera efeitos sonoros e a narração em português com a API do
   **ElevenLabs** (`tools/audio.py`).
5. `npm run credits` — gera a lista de créditos mostrada no jogo.

O cervo do BlenderKit não tem textura nem animação: a pelagem é pintada num shader a partir da
posição de cada vértice e o movimento (pastar, alerta, galope, cabeça girando) é procedural.

## Estrutura

```
src/
  main.ts       telas, HUD, diretor da história (pistas, sustos, cervos, chefe) e laço
  world.ts      terreno, floresta instanciada com LOD, névoa, cabana, covil, itens, colisões
  player.ts     investigador: movimento, lanterna com sombras e bateria, revólver, mãos
  skywalker.ts  criatura: animações e estados (observar, perseguir, atacar, recuar…)
  deer.ts       cervo de verdade e cervo-disfarce (pelagem em shader, animação procedural)
  post.ts       render HDR, tone mapping, granulação, vinheta, sangue, resolução dinâmica
  audio.ts      Web Audio 3D, passos, batimento cardíaco e estática sintetizados
  input.ts      toque (joystick + olhar + botões) e teclado/mouse
  map.ts        relevo, trilha e posições da história
tools/          pipeline de assets (download, Blender, otimização, áudio, créditos)
tests/          testes no Chromium (fumaça, toque, laboratório de cenas)
```

## Licenças dos assets

Modelos do BlenderKit sob a licença *BlenderKit Royalty Free* (uso em produtos, inclusive
comerciais, sem revender o modelo isolado) ou CC0; modelos e texturas do Poly Haven em CC0;
animação de corrida do X Bot (Mixamo) vinda dos exemplos do three.js; sons e vozes gerados com
ElevenLabs. A lista completa, com autor e link de cada modelo, fica em
`public/assets/credits.json` e na tela de créditos do jogo.
