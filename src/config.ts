// Configurações reutilizáveis de jogabilidade (velocidades, colisão, animação, câmera).
export const CONFIG = {
  map: { size: 48 },
  iso: { tileW: 32, tileH: 16, heightPx: 19.6 },
  player: {
    radius: 0.22,          // raio de colisão (tiles)
    walkSpeed: 2.7,        // tiles/s
    runSpeed: 5.2,
    accel: 14,             // resposta no chão
    airAccel: 3.5,
    decel: 16,
    jumpVelocity: 7.6,     // unidades de altura/s
    gravity: 31,
    jumpPrep: 0.07,        // s de antecipação
    landTime: 0.11,
    turnStep: 0.035,       // s por octante ao virar
  },
  anim: {
    idleFps: 5,
    walkCycleTiles: 1.55,  // distância percorrida por ciclo de caminhada (8 frames)
    runCycleTiles: 2.7,
  },
  camera: { targetShortSide: 330, lerp: 7, lookAhead: 0.35 },
  interaction: { radius: 1.5 },
  economy: { startCoins: 30000 },
  bus: { speed: 3.2, dwell: 3.5 },
};
