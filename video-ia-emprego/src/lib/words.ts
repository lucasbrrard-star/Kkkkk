// Tempos por palavra da narração (s), já com a pausa após "você." encurtada em 0,17 s.
export type Word = {w: string; s: number; e: number};
export const WORDS: Word[] = [
  {w: 'Imagina', s: 0.0, e: 0.56},
  {w: 'acordar', s: 0.58, e: 1.04},
  {w: 'amanhã', s: 1.09, e: 1.58},
  {w: 'e', s: 1.62, e: 1.73},
  {w: 'descobrir', s: 1.79, e: 2.28},
  {w: 'que', s: 2.32, e: 2.39},
  {w: 'uma', s: 2.42, e: 2.52},
  {w: 'inteligência', s: 2.54, e: 3.26},
  {w: 'artificial', s: 3.29, e: 3.99},
  {w: 'faz', s: 4.26, e: 4.47},
  {w: 'seu', s: 4.49, e: 4.62},
  {w: 'trabalho', s: 4.66, e: 5.07},
  {w: 'melhor', s: 5.14, e: 5.5},
  {w: 'que', s: 5.54, e: 5.61},
  {w: 'você.', s: 5.65, e: 6.14},
  {w: 'Parece', s: 6.42, e: 6.77},
  {w: 'ficção', s: 6.83, e: 7.24},
  {w: 'científica,', s: 7.26, e: 8.06},
];

// Páginas de legenda (índices de WORDS). As frases-chave viram tipografia cinética.
export const CAPTION_PAGES: {idx: number[]; accent?: number[]; warm?: number[]}[] = [
  {idx: [0, 1, 2], accent: [2]},
  {idx: [3, 4, 5, 6], accent: [4]},
  {idx: [7, 8], accent: [7, 8]},
  {idx: [9, 10, 11], warm: [10, 11]},
];
