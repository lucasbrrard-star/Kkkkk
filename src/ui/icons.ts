// Ícones ilustrados (SVG com gradientes) no estilo de jogos mobile.
let uid = 0;
const g = (stops: string[], dir = '0 0 0 1') => {
  const id = `g${uid++}`;
  const [x1, y1, x2, y2] = dir.split(' ');
  return { id, def: `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>` };
};
const svg = (defs: string, body: string, vb = '0 0 48 48') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>${body}</svg>`;

const coinG = g(['#ffe27a', '#f6b21b', '#c97a06']);
const gemG = g(['#9be7ff', '#2f9cf0', '#1c5fd0']);
const leafG = g(['#a8f06a', '#3fb23a', '#1f7a2a']);
const houseR = g(['#ff9a5a', '#e2552e']);
const houseW = g(['#fff6e0', '#e9d7b4']);
const mapG = g(['#fff2b8', '#f2c94c']);
const boxG = g(['#ffd27a', '#e59a2c']);
const cartG = g(['#ffcf6a', '#f08a2b']);
const mailG = g(['#ffe9a8', '#f2b632']);
const ham = g(['#c99a6a', '#7a4a28']);
const steel = g(['#e8edf3', '#9aa6b5']);
const skyG = g(['#ffd36e', '#ff9f43']);
const cloudG = g(['#ffffff', '#cfd8e6']);
const handG = g(['#ffe1c4', '#f2b48c']);

export const ICON = {
  coin: svg(coinG.def, `<circle cx="24" cy="24" r="20" fill="url(#${coinG.id})" stroke="#9a5a06" stroke-width="3"/><circle cx="24" cy="24" r="13" fill="none" stroke="#fff3b0" stroke-width="2.5" opacity=".7"/><text x="24" y="31" text-anchor="middle" font-size="20" font-weight="900" fill="#9a5a06" font-family="system-ui">$</text>`),
  gem: svg(gemG.def, `<path d="M12 18 18 9h12l6 9-12 22z" fill="url(#${gemG.id})" stroke="#0f3f9a" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 18h24M18 9l6 9 6-9M24 18v22" stroke="#cdf3ff" stroke-width="1.6" fill="none" opacity=".8"/>`),
  people: svg('', `<circle cx="17" cy="16" r="7" fill="#7cc4ff" stroke="#1f5fa8" stroke-width="2.5"/><path d="M5 38c1-8 6-12 12-12s11 4 12 12z" fill="#7cc4ff" stroke="#1f5fa8" stroke-width="2.5"/><circle cx="32" cy="18" r="6" fill="#bfe3ff" stroke="#1f5fa8" stroke-width="2.5"/><path d="M24 38c1-7 4-10 9-10s9 3 10 10z" fill="#bfe3ff" stroke="#1f5fa8" stroke-width="2.5"/>`),
  leaf: svg(leafG.def, `<path d="M8 40C8 20 22 8 42 8c0 20-12 32-32 32z" fill="url(#${leafG.id})" stroke="#195e22" stroke-width="2.5"/><path d="M10 38 32 16" stroke="#d8ffb0" stroke-width="2.5"/>`),
  weather: svg(skyG.def + cloudG.def, `<circle cx="19" cy="19" r="10" fill="url(#${skyG.id})"/><g stroke="#ffb347" stroke-width="2.5" stroke-linecap="round"><path d="M19 3v4M19 31v4M3 19h4M5 7l3 3M30 8l-3 3"/></g><path d="M16 38h22a7 7 0 0 0 0-14 9 9 0 0 0-17 3 6 6 0 0 0-5 11z" fill="url(#${cloudG.id})" stroke="#8fa0b8" stroke-width="2"/>`),
  gear: svg('', `<path d="M24 4l4 5 6-2 1 6 6 2-2 6 5 4-5 4 2 6-6 2-1 6-6-2-4 5-4-5-6 2-1-6-6-2 2-6-5-4 5-4-2-6 6-2 1-6 6 2z" fill="#e9edf3" stroke="#56627a" stroke-width="2.5" stroke-linejoin="round"/><circle cx="24" cy="24" r="7" fill="#56627a"/>`),
  pin: svg('', `<path d="M24 4c-8 0-14 6-14 14 0 10 14 26 14 26s14-16 14-26c0-8-6-14-14-14z" fill="#ff7a4c" stroke="#a83a1c" stroke-width="2.5"/><circle cx="24" cy="18" r="5" fill="#fff"/>`),
  map: svg(mapG.def, `<path d="M6 12l11-5 14 5 11-5v29l-11 5-14-5-11 5z" fill="url(#${mapG.id})" stroke="#8a6410" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 7v29M31 12v29" stroke="#8a6410" stroke-width="2"/><path d="M10 26c4-6 8 2 12-4s8 2 12-2" stroke="#3fb23a" stroke-width="3" fill="none"/><circle cx="35" cy="20" r="3" fill="#e2453c"/>`),
  build: svg(houseR.def + ham.def + steel.def, `<path d="M6 24 22 10l16 14" fill="none" stroke="#a8401c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><rect x="10" y="22" width="24" height="18" rx="2" fill="#fff1d6" stroke="#a8401c" stroke-width="2.5"/><rect x="18" y="29" width="8" height="11" fill="url(#${houseR.id})"/><rect x="30" y="4" width="6" height="22" rx="2" transform="rotate(35 33 15)" fill="url(#${ham.id})" stroke="#4a2a12" stroke-width="2"/><rect x="31" y="2" width="14" height="8" rx="2" transform="rotate(35 38 6)" fill="url(#${steel.id})" stroke="#4a5568" stroke-width="2"/>`),
  decor: svg(boxG.def, `<rect x="8" y="20" width="32" height="20" rx="3" fill="url(#${boxG.id})" stroke="#8a4a10" stroke-width="2.5"/><rect x="6" y="14" width="36" height="8" rx="2" fill="#ffe08a" stroke="#8a4a10" stroke-width="2.5"/><path d="M24 14v26" stroke="#e2453c" stroke-width="4"/><path d="M24 14c-6-10-14-4-8 0M24 14c6-10 14-4 8 0" fill="none" stroke="#e2453c" stroke-width="3"/>`),
  shop: svg(cartG.def, `<path d="M4 8h7l5 22h22l4-15H14" fill="none" stroke="#7a3a10" stroke-width="3" stroke-linejoin="round"/><path d="M14 15h28l-4 15H16z" fill="url(#${cartG.id})"/><circle cx="19" cy="38" r="4" fill="#4a5568"/><circle cx="35" cy="38" r="4" fill="#4a5568"/>`),
  mail: svg(mailG.def, `<rect x="6" y="11" width="36" height="26" rx="3" fill="url(#${mailG.id})" stroke="#8a5a06" stroke-width="2.5"/><path d="M6 13l18 14 18-14" fill="none" stroke="#8a5a06" stroke-width="2.5"/>`),
  hood: svg(houseR.def + houseW.def, `<path d="M3 24 16 13l13 11" fill="url(#${houseR.id})" stroke="#8a3a12" stroke-width="2.5" stroke-linejoin="round"/><rect x="6" y="23" width="20" height="17" fill="url(#${houseW.id})" stroke="#8a3a12" stroke-width="2.5"/><path d="M21 20 33 9l13 11" fill="url(#${houseR.id})" stroke="#8a3a12" stroke-width="2.5" stroke-linejoin="round"/><rect x="25" y="19" width="18" height="21" fill="url(#${houseW.id})" stroke="#8a3a12" stroke-width="2.5"/><rect x="31" y="29" width="6" height="11" fill="#5ab0e8"/><rect x="12" y="30" width="7" height="10" fill="#7a4a28"/>`),
  house: svg(houseR.def + houseW.def, `<path d="M6 22 24 7l18 15" fill="url(#${houseR.id})" stroke="#1f6b3a" stroke-width="3" stroke-linejoin="round"/><rect x="11" y="21" width="26" height="19" fill="url(#${houseW.id})" stroke="#1f6b3a" stroke-width="3"/><rect x="21" y="28" width="7" height="12" fill="#2bb673"/>`),
  flower: svg('', `<g fill="#ff7ab0" stroke="#a8205a" stroke-width="2"><circle cx="24" cy="12" r="7"/><circle cx="35" cy="20" r="7"/><circle cx="31" cy="33" r="7"/><circle cx="17" cy="33" r="7"/><circle cx="13" cy="20" r="7"/></g><circle cx="24" cy="23" r="6" fill="#ffd36e" stroke="#a86a06" stroke-width="2"/>`),
  tree: svg(leafG.def, `<rect x="21" y="28" width="6" height="14" fill="#8a5634"/><circle cx="24" cy="20" r="14" fill="url(#${leafG.id})" stroke="#195e22" stroke-width="2.5"/>`),
  bench: svg('', `<rect x="6" y="16" width="36" height="6" rx="2" fill="#c08a55" stroke="#5a3a1c" stroke-width="2"/><rect x="6" y="25" width="36" height="6" rx="2" fill="#c08a55" stroke="#5a3a1c" stroke-width="2"/><path d="M10 31v9M38 31v9" stroke="#3a3d48" stroke-width="4"/>`),
  ball: svg('', `<circle cx="24" cy="24" r="17" fill="#fff" stroke="#2b2c33" stroke-width="3"/><path d="M24 15l7 5-3 8h-8l-3-8z" fill="#2b2c33"/>`),
  run: svg('', `<circle cx="30" cy="8" r="5" fill="#fff"/><path d="M21 16l-7 4-3 8 4 1 2-5 4-2-3 12-8 8 3 3 9-8 3-5 5 5v12h4V37l-5-6 2-7 2 4 8 2 1-4-6-2-3-6c-1-3-4-4-7-3z" fill="#fff"/>`),
  chat: svg('', `<path d="M8 10h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H22l-9 8v-8H8a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" fill="#fff"/><circle cx="16" cy="22" r="2.5" fill="#56627a"/><circle cx="24" cy="22" r="2.5" fill="#56627a"/><circle cx="32" cy="22" r="2.5" fill="#56627a"/>`),
  jump: svg('', `<path d="M24 38V12M12 22l12-12 12 12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
  hand: svg(handG.def, `<path d="M17 24V10a3 3 0 0 1 6 0v12V7a3 3 0 0 1 6 0v15V10a3 3 0 0 1 6 0v18c0 9-6 15-13 15-5 0-8-2-11-6l-6-8a3 3 0 0 1 5-4l3 4z" fill="url(#${handG.id})" stroke="#7a4a28" stroke-width="2.5" stroke-linejoin="round"/>`),
  close: svg('', `<path d="M12 12l24 24M36 12 12 36" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`),
};
