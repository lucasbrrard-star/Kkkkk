# Zombie Outbreak — 3D (navegador)

Jogo de sobrevivência em terceira pessoa contra zumbis, feito do zero com **three.js + Vite**.
Todos os modelos, texturas, animações e sons são **procedurais** (gerados por código), sem assets externos.

## Executar
```bash
cd zombie-outbreak
npm install
npm run dev        # desenvolvimento (http://localhost:5173)
npm run build      # build de produção em dist/
npm run preview    # serve o build (http://localhost:4173)
npm test           # teste E2E com Playwright (requer build antes)
```
`?q=low` na URL desativa bloom, sombras e MSAA (útil em máquinas fracas).

## Controles
Desktop: WASD mover · Shift correr · Espaço pular · Mouse câmera · Clique esq. atirar · Clique dir. mirar · R recarregar · Esc pausar.
Mobile (horizontal): analógico flutuante à esquerda · arrastar à direita = câmera · FOGO (também gira a câmera ao arrastar) · MIRA · R · PULO · CORRER. Suporta vários toques ao mesmo tempo.

## Estrutura
- `src/world.js`: cidade (ruas, calçadas, prédios com fachadas procedurais, casas, parque, checkpoint militar, carros, ônibus, postes, carro em chamas, colisores)
- `src/humanoid.js`: rig humanoide articulado + IK de dois ossos para os braços
- `src/main.js`: jogador, câmera, combate por raycast, IA dos zumbis (patrulha/perseguição/ataque/morte + flow field), ondas, HUD e input
- `src/audio.js`: efeitos sonoros sintetizados com WebAudio
- `tests/e2e.cjs`: teste ponta a ponta
