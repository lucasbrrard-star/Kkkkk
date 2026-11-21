import {continueRender, delayRender, staticFile} from 'remotion';
import fonts from './data/fonts.json';

// fontes locais (OFL) — o navegador headless não acessa o CDN de fontes através do proxy
export const COND = 'Barlow Condensed';
export const MONO = 'JetBrains Mono';

const handle = delayRender('fonts');
Promise.all(
  (fonts as {family: string; weight: string; file: string; range: string}[]).map((f) => {
    const face = new FontFace(f.family, `url(${staticFile('fonts/' + f.file)}) format('woff2')`, {weight: f.weight, unicodeRange: f.range});
    return face.load().then((ff) => {
      (document.fonts as unknown as {add: (x: FontFace) => void}).add(ff);
    });
  }),
)
  .then(() => continueRender(handle))
  .catch((e) => {
    console.error(e);
    continueRender(handle);
  });
