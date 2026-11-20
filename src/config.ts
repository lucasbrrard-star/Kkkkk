// Configurações reutilizáveis de jogabilidade (velocidades, colisão, animação, câmera).
// Unidade do mundo: 1 tile (64×32 px) ≈ 1 metro.
export const CONFIG = {
  iso: { tileW: 64, tileH: 32, heightPx: 39.2 },
  player: {
    radius: 0.3,           // raio de colisão (tiles)
    walkSpeed: 2.2,        // tiles/s
    runSpeed: 4.8,
    accel: 14,
    airAccel: 3.5,
    decel: 16,
    jumpVelocity: 7.6,     // unidades de altura/s (ápice ≈ 1 m)
    gravity: 28,
    jumpPrep: 0.07,
    landTime: 0.11,
    turnStep: 0.035,       // s por octante ao virar
  },
  anim: {
    idleFps: 5,
    walkCycleTiles: 1.45,  // distância por ciclo de caminhada (8 quadros)
    runCycleTiles: 2.6,
  },
  camera: { targetShortSide: 820, lerp: 7, lookAhead: 0.35 },
  interaction: { radius: 1.6 },
  economy: { startCoins: 30000, startGems: 500, population: 12480, energy: 100 },
  bus: { speed: 4.6, dwell: 3.5 },
};
