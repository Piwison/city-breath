// 場景座標的唯一投影（AD-12）：經緯度只經 project() 轉場景座標，真實高程只經 elevation() 轉場景高度。
// 原點與比例固定：以 21 個有車站的行政區（districts.json 2026-09）外框的中心為原點，外框最大邊長＝100 單位，
// 和 2.1 原型（天光）相同，所以原型的鏡頭距離、底座尺寸可以直接沿用。換月份時外框不變，常數也不變。
// 座標軸：x 向東、z 向南（北是 −z）、y 向上。

/** 21 區外框 [西, 南, 東, 北]（度）；projection.test.ts 以 districts.json 驗證。 */
export const DISTRICT_BBOX = [121.39265, 24.86175, 121.66586, 25.24438] as const;
/** 場景原點的經緯度（外框中心）。 */
export const LON0 = (DISTRICT_BBOX[0] + DISTRICT_BBOX[2]) / 2;
export const LAT0 = (DISTRICT_BBOX[1] + DISTRICT_BBOX[3]) / 2;
/** 經度在原點緯度的縮短比例（等距圓柱投影）。 */
const KX = Math.cos((LAT0 * Math.PI) / 180);
/** 外框最大邊長的長度單位 */
export const EXTENT = 100;
/** 每一度緯度是幾個場景單位。 */
export const SCALE = EXTENT / Math.max((DISTRICT_BBOX[2] - DISTRICT_BBOX[0]) * KX, DISTRICT_BBOX[3] - DISTRICT_BBOX[1]);

/** 原點緯度上一度緯度的長度（公尺，WGS84 子午線弧長近似）。 */
const METERS_PER_DEG_LAT =
  111132.954 - 559.822 * Math.cos((2 * LAT0 * Math.PI) / 180) + 1.175 * Math.cos((4 * LAT0 * Math.PI) / 180);
/** 一個場景單位是幾公尺（水平）。 */
export const METERS_PER_UNIT = METERS_PER_DEG_LAT / SCALE;

/** 地形的垂直誇張倍數（DESIGN.md「場景的層」：真實，垂直約誇張 1.5 倍；Piwi 2026-11-11 定案）。 */
export const TERRAIN_EXAGGERATION = 1.5;

export type XZ = [number, number];

/** 經緯度 → 場景 [x, z]。 */
export function project(lon: number, lat: number): XZ {
  return [(lon - LON0) * KX * SCALE, -(lat - LAT0) * SCALE];
}

/** 場景 [x, z] → 經緯度；點選回推只用這個（AD-12）。 */
export function unproject(x: number, z: number): [number, number] {
  return [x / (KX * SCALE) + LON0, -z / SCALE + LAT0];
}

/**
 * 真實高程（公尺）→ 場景高度。唯一把高程換成高度的函式；
 * 站柱、建築、緞帶等由人數決定的高度不是高程，不經這裡，只有它們的基座取 elevation()。
 */
export function elevation(meters: number): number {
  return (meters * TERRAIN_EXAGGERATION) / METERS_PER_UNIT;
}

/** basemap.json 的高程等級格網（形狀見 docs/data-contract.md）。 */
export interface LevelGrid {
  lon0: number;
  lat0: number;
  step: number;
  nx: number;
  ny: number;
  rows: string[];
}

/** 該點的地形等級 0–6（高程 ≥ 幾層台地）；格網外為 0。 */
export function terrainLevelAt(lon: number, lat: number, grid: LevelGrid): number {
  const i = Math.round((lon - grid.lon0) / grid.step);
  const j = Math.round((grid.lat0 - lat) / grid.step);
  if (j < 0 || j >= grid.ny || i < 0 || i >= grid.nx) return 0;
  const v = Number(grid.rows[j][i]);
  return Number.isFinite(v) ? v : 0;
}

/** 等級 L（1–6）台地頂面的場景高度；0 為地面。 */
export function levelHeight(level: number, levels: readonly number[]): number {
  return level > 0 ? elevation(levels[level - 1]) : 0;
}
