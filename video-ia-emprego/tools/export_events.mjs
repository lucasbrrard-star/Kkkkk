// Exporta os tempos de eventos visuais para o script de áudio
import {camZ, camV} from '../src/lib/cameraCore.js';
import fs from 'node:fs';
const cross = (Z) => { for (let t = 0; t < 9; t += 0.001) if (camZ(t) >= Z) return +t.toFixed(3); return null; };
const ev = {
  glass: cross(10),
  orbPass: cross(11),
  pathCards: [11.7, 12.4, 13.2, 14.0, 14.9, 15.7, 16.4].map(cross),
  textPass: cross(21),
  wallPass: cross(23.6),
  portal: cross(30),
  speed: Array.from({length: 256}, (_, f) => +camV(f / 30).toFixed(3)),
};
fs.writeFileSync('assets/events.json', JSON.stringify(ev));
console.log(JSON.stringify({...ev, speed: undefined}));
