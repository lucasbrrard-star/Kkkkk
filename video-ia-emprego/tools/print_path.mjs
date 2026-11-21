import {camZ, camV, bumps, camXY} from '../src/lib/cameraCore.js';
console.log(bumps.map(b=>({c:b.c, area:+b.area.toFixed(3)})));
for (let t = 0; t <= 8.5; t += 0.25) console.log(t.toFixed(2), camZ(t).toFixed(3), camV(t).toFixed(2), JSON.stringify(camXY(t), (k,v)=> typeof v==='number'? +v.toFixed(1):v));
