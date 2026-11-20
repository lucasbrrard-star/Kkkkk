// Lista de assets de produção: origem, licença e como normalizar/otimizar cada um.
// As fontes são gratuitas (BlenderKit Royalty Free/CC0, Poly Haven CC0, exemplos do three.js).

export interface ModelSpec {
  key: string;                       // nome do arquivo de saída (client/public/assets/models/<key>.glb)
  source: { bk?: string; query?: string; url?: string; cacheFile?: string };
  fit?: { height?: number; width?: number };   // metros
  rotY?: number;                     // graus
  simplify?: number;                 // fração de triângulos a manter (0..1)
  texSize?: number;                  // tamanho máximo das texturas
  hue?: number;                      // rotação de matiz nas texturas (recolorir árvores etc.)
  sat?: number;                      // multiplicador de saturação junto com o matiz
  recolorMat?: string;               // só recolore materiais cujo nome casa com esta regex
  tint?: [number, number, number];   // multiplicador de cor base
  materialFix?: Record<string, { color?: [number, number, number]; dropTexture?: boolean; emissive?: [number, number, number]; hide?: boolean; roughness?: number; metalness?: number }>;
  category: 'prop' | 'tree' | 'building' | 'avatar' | 'anim';
  keepNormals?: boolean;             // mantém normal maps (padrão: só prédios)
  error?: number;                    // tolerância da simplificação
  budget?: number;                   // teto de triângulos (simplificação progressiva até caber)
  far?: number;                      // gera <key>_far.glb com este teto (LOD de distância)
  credit?: string;
}

const BK = (id: string, query: string) => ({ bk: id, query });

export const MODELS: ModelSpec[] = [
  // ---------------- mobiliário urbano
  { key: 'bench', budget: 1800, source: BK('0e35aec5', 'park bench'), fit: { width: 1.9 }, texSize: 512, simplify: 0.3, error: 0.02, category: 'prop', materialFix: { '*': { metalness: 0.15 } } },
  { key: 'lamp', budget: 1400, far: 300, source: BK('c65a81d5', 'street lamp'), fit: { height: 4.4 }, texSize: 512, category: 'prop',
    materialFix: { 'Glass_Baked': { emissive: [1, 0.78, 0.45], dropTexture: true, color: [1, 0.9, 0.7] }, 'Old Street Lamp': { color: [0.16, 0.17, 0.2], dropTexture: true, roughness: 0.5, metalness: 0.6 } } },
  { key: 'fountain', budget: 6000, source: BK('8c47c7c1', 'fountain'), fit: { width: 7 }, texSize: 1024, category: 'prop' },
  { key: 'statue', budget: 3500, source: BK('a7d32bc0', 'statue'), fit: { height: 2.4 }, texSize: 512, category: 'prop' },
  { key: 'busstop', budget: 3500, source: BK('ecbd44e3', 'city bus'), fit: { width: 4.2 }, texSize: 512, simplify: 0.2, error: 0.03, category: 'prop',
    materialFix: { 'Architectural Glass': { color: [0.7, 0.85, 0.9] } } },
  { key: 'trafficlight', source: BK('d63f6895', 'traffic light'), fit: { height: 4.8 }, texSize: 512, category: 'prop' },
  { key: 'planter', budget: 1500, source: BK('95bbab32', 'planter'), fit: { width: 2.2 }, texSize: 512, simplify: 0.3, category: 'prop' },
  { key: 'lounger', budget: 900, source: BK('cf4de778', 'sun lounger'), fit: { width: 2.0 }, texSize: 256, simplify: 0.15, error: 0.05, category: 'prop',
    materialFix: { '*': { dropTexture: true, color: [0.93, 0.92, 0.88], roughness: 0.6 } } },
  // ---------------- vegetação (simplificada para instanciamento em celular)
  { key: 'palm', budget: 6000, far: 1200, source: { bk: 'f9c65ca8', query: 'palm tree', cacheFile: 'palm_a.glb' }, fit: { height: 7.8 }, texSize: 512, category: 'tree' },
  { key: 'tree_ipe', budget: 14000, far: 1500, source: { bk: '599b0e84', query: 'broadleaf tree', cacheFile: 'tree_broad.glb' }, fit: { height: 7 }, texSize: 512, hue: 205, sat: 1.35, recolorMat: 'Tree Leaf', category: 'tree', credit: 'Ipê-roxo: recoloração de Broadleaf Dense Tree Adult' },
  { key: 'tree_gold', budget: 14000, far: 1500, source: { bk: '599b0e84', query: 'broadleaf tree', cacheFile: 'tree_broad.glb' }, fit: { height: 6.5 }, texSize: 512, hue: -55, sat: 1.5, recolorMat: 'Tree Leaf', category: 'tree', credit: 'Ipê-amarelo: recoloração de Broadleaf Dense Tree Adult' },
  { key: 'tree_leafy', budget: 14000, far: 1500, source: { bk: '599b0e84', query: 'broadleaf tree', cacheFile: 'tree_broad.glb' }, fit: { height: 7.5 }, texSize: 512, category: 'tree' },
  // ---------------- edifícios
  { key: 'apartment', budget: 26000, source: BK('b3faf096', 'apartment building'), fit: { height: 14 }, texSize: 1024, simplify: 0.3, error: 0.02, category: 'building' },
  { key: 'colonial_a', budget: 24000, source: BK('a5bd4ce5', 'city building'), fit: { height: 9.5 }, texSize: 1024, category: 'building' },
  { key: 'colonial_b', budget: 20000, source: BK('770f61f9', 'city building'), fit: { height: 12 }, texSize: 1024, simplify: 0.6, category: 'building' },
  { key: 'shoprow', budget: 8000, source: BK('793f6c36', 'city building'), fit: { width: 34 }, texSize: 1024, category: 'building' },
  { key: 'modern', budget: 24000, source: BK('ffca571c', 'cafe building'), fit: { width: 22 }, texSize: 1024, simplify: 0.4, error: 0.02, category: 'building' },
  { key: 'tower_a', budget: 18000, source: BK('01a74804', 'apartment building'), fit: { height: 46 }, texSize: 1024, category: 'building' },
  { key: 'tower_b', budget: 18000, source: BK('4fad1459', 'city building'), fit: { height: 58 }, texSize: 1024, simplify: 0.4, error: 0.02, category: 'building' },
  { key: 'tower_c', budget: 22000, source: BK('27d361b4', 'city building'), fit: { height: 52 }, texSize: 1024, simplify: 0.3, error: 0.02, category: 'building' },
  { key: 'store', budget: 8000, source: BK('661c3dac', 'storefront'), fit: { width: 12 }, texSize: 1024, category: 'building' },
  // ---------------- avatares (esqueleto Mixamo) + biblioteca de animações
  { key: 'avatar_m', source: BK('76f81c44', 'LiL CreatioN'), fit: { height: 1.78 }, texSize: 1024, category: 'avatar' },
  { key: 'avatar_f', source: { url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Michelle.glb', cacheFile: 'anim/Michelle.glb' }, fit: { height: 1.68 }, texSize: 1024, category: 'avatar', credit: 'Michelle — Mixamo (Adobe), via exemplos do three.js' },
  { key: 'anim_xbot', source: { url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Xbot.glb', cacheFile: 'anim/Xbot.glb' }, category: 'anim', credit: 'X Bot — Mixamo (Adobe), via exemplos do three.js' },
  { key: 'anim_soldier', source: { url: 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Soldier.glb', cacheFile: 'anim/Soldier.glb' }, category: 'anim', credit: 'Soldier — Mixamo (Adobe), via exemplos do three.js' },
];

/** Texturas PBR (Poly Haven, CC0) para o chão da cidade. */
export const TEXTURES: { key: string; ph: string; size: number }[] = [
  { key: 'asphalt', ph: 'asphalt_02', size: 1024 },
  { key: 'pavers', ph: 'hexagonal_concrete_paving', size: 1024 },
  { key: 'grass', ph: 'leafy_grass', size: 1024 },
  { key: 'sand', ph: 'aerial_beach_01', size: 1024 },
  { key: 'plaza', ph: 'patio_tiles', size: 1024 },
  { key: 'concrete', ph: 'concrete_floor_worn_001', size: 512 },
];

/** Clipes a transferir para os avatares: [nome final, arquivo, clipe de origem] */
export const CLIPS: [string, string, string][] = [
  ['idle', 'anim/Xbot.glb', 'idle'],
  ['walk', 'anim/Xbot.glb', 'walk'],
  ['run', 'anim/Xbot.glb', 'run'],
  ['agree', 'anim/Xbot.glb', 'agree'],
  ['headShake', 'anim/Xbot.glb', 'headShake'],
  ['idle2', 'anim/Soldier.glb', 'Idle'],
  ['dance', 'anim/Michelle.glb', 'SambaDance'],
];
