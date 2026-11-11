// 檢視模型（AD-19）：場景圖層不 import 契約型別，只吃這裡產生的形狀。
// 2.3 底圖：basemap.json＋districts.json → BaseView；3.5 流向：district-flows.json → FlowFrame。車站的 frame 由之後的票加在這裡。
import type { BasemapFile, DayType, DistrictFlowsFile, DistrictsFile, LineId, LonLat, MultiPolygonCoords } from "./types";

export interface BaseDistrictView {
  /** 8 碼行政區代碼（AD-9） */
  id: string;
  /** 顯示用短名（去掉「區」） */
  label: string;
  centroid: LonLat;
  /** 行政區薄片（districts.json 的簡化界線） */
  polygon: MultiPolygonCoords;
  water: MultiPolygonCoords;
  green: MultiPolygonCoords;
  /** 六層台地，第 k 層是高程 ≥ levels[k] 的面 */
  terrain: MultiPolygonCoords[];
  /** 區內車站數（區名標籤的優先順序） */
  stationCount: number;
}

export interface TrackView {
  /** 路線色 token（AD-21：--line- 加小寫、去連字號的路線 ID） */
  token: string;
  coords: LonLat[];
  /** 每個頂點所在的 districts[] 索引，−1＝不在有車站的區 */
  di: number[];
  approx: boolean;
}

export interface BaseView {
  /** 底座範圍 [西, 南, 東, 北] */
  bbox: [number, number, number, number];
  /** 台地門檻（公尺） */
  levels: number[];
  grid: BasemapFile["grid"];
  districts: BaseDistrictView[];
  outsideTerrain: MultiPolygonCoords[];
  sea: MultiPolygonCoords;
  outsideWater: MultiPolygonCoords;
  tracks: TrackView[];
}

/** 路線 ID → 顏色 token 名（`R-3` → `--line-r3`）。 */
export function lineToken(id: LineId): string {
  return `--line-${id.toLowerCase().replace(/-/g, "")}`;
}

/** 底圖檢視模型：basemap 的 21 區依 id 對上 districts.json 的界線與名稱；對不上就丟錯（不默默少畫一區）。 */
export function baseView(basemap: BasemapFile, districts: DistrictsFile): BaseView {
  const byId = new Map(districts.districts.map((d) => [d.id, d]));
  return {
    bbox: basemap.bbox,
    levels: basemap.levels,
    grid: basemap.grid,
    districts: basemap.districts.map((b) => {
      const d = byId.get(b.id);
      if (!d) throw new Error(`basemap.json 的行政區 ${b.id} 不在 ${districts.month} 的 districts.json`);
      return {
        id: b.id,
        label: d.name.replace(/區$/, ""),
        centroid: d.centroid,
        polygon: d.polygon,
        water: b.water,
        green: b.green,
        terrain: [...b.terrain],
        stationCount: d.stations.length,
      };
    }),
    outsideTerrain: [...basemap.outside.terrain],
    sea: basemap.sea,
    outsideWater: basemap.outsideWater,
    tracks: basemap.tracks.map((t) => ({ token: lineToken(t.line), coords: t.coords, di: t.di, approx: t.approx })),
  };
}

// ── 行政區流向（3.5）：首頁、行政區展開、活動日共用同一種 frame、同一個線寬與光點換算（AD-19） ──

/** 一條流向：from、to 為 8 碼行政區代碼（AD-9）；value 為該小時平均人次，null＝少於 10 人（AD-3）。 */
export interface FlowFrame {
  from: string;
  to: string;
  value: number | null;
}

/** 線寬（場景單位）：最細與最粗（原型 W_MIN、W_MAX）。人數決定的寬度不是高程，不經 elevation()（AD-12）。 */
export const W_MIN = 0.28;
export const W_MAX = 2.9;
/** 全市只畫前幾大（DESIGN.md 流向「數量要少」）。 */
export const TOP_FLOWS = 12;
/** 一顆光點預設代表幾人；總數超過上限就加倍（diorama-game-juice「光點」）。 */
export const PEOPLE_PER_DOT = 50;
/** 同時光點上限（AD-6 ≤ 3,000）。 */
export const DOT_CAP = 2600;

/**
 * 當月最大流向：兩種日型、所有小時、跨區（from ≠ to）的最大平均人次。null 與停止營運不算。
 * 區內移動不畫成緞帶，所以也不參與比例。沒有任何流向時回傳 1（避免除以 0）。
 */
export function flowMax(file: Pick<DistrictFlowsFile, "weekday" | "holiday">): number {
  let max = 0;
  for (const day of [file.weekday, file.holiday]) {
    for (const m of day) {
      if (!m) continue;
      m.forEach((row, i) =>
        row.forEach((v, j) => {
          if (i !== j && v !== null && v > max) max = v;
        }),
      );
    }
  }
  return max || 1;
}

/** 最粗的緞帶在螢幕上最多幾像素（Piwi 2026-11-11：放大後緞帶不能粗到蓋住街區）。 */
export const RIBBON_MAX_PX = 18;

/**
 * 依鏡頭的縮放倍數 k（0–1]：一個場景單位在畫面上約 pxPerUnit 像素時，最粗的緞帶 W_MAX 不超過 maxPx 像素。
 * 所有緞帶、光點與圖例都乘同一個 k，彼此的比例不變（線寬仍與人數成正比）；拉遠時 k＝1，就是場景單位的線寬。
 */
export function ribbonScale(pxPerUnit: number, maxPx: number = RIBBON_MAX_PX): number {
  if (!(pxPerUnit > 0)) return 1;
  return Math.min(1, maxPx / (W_MAX * pxPerUnit));
}

/** 緞帶寬度：W_MIN + (W_MAX − W_MIN) × 人數 ÷ 當月最大流向；超出範圍夾住。圖例用同一個函式。 */
export function ribbonWidth(value: number, max: number): number {
  const r = Math.min(1, Math.max(0, value / max));
  return W_MIN + (W_MAX - W_MIN) * r;
}

/**
 * 某日型某小時人數最多的前 n 條跨區流向（由大到小，同人數依代碼排序以求穩定）。
 * null（少於 10 人或次要隱藏）不排名、不當 0；整小時 null＝停止營運，回傳 null（AD-5）。
 */
export function topFlows(file: DistrictFlowsFile, dayType: DayType, hour: number, n: number = TOP_FLOWS): FlowFrame[] | null {
  const m = file[dayType][hour];
  if (!m) return null;
  const ids = file.districts;
  const all: { from: string; to: string; value: number }[] = [];
  m.forEach((row, i) =>
    row.forEach((v, j) => {
      if (i !== j && v !== null && v > 0) all.push({ from: ids[i], to: ids[j], value: v });
    }),
  );
  all.sort((a, b) => b.value - a.value || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return all.slice(0, n);
}

/**
 * 光點換算：一顆＝perDot 人（預設 50）；畫面上的總數超過 cap×0.9 就加倍。每條有人數的流向至少 1 顆；
 * null 不畫光點（AD-19）。counts 與 frames 同序。
 */
export function dotScale(
  frames: readonly Pick<FlowFrame, "value">[],
  cap: number = DOT_CAP,
  perDot: number = PEOPLE_PER_DOT,
): { perDot: number; counts: number[] } {
  const total = frames.reduce((s, f) => s + (f.value ?? 0), 0);
  let p = perDot;
  while (total / p > cap * 0.9) p *= 2;
  return { perDot: p, counts: frames.map((f) => (f.value === null || f.value <= 0 ? 0 : Math.max(1, Math.round(f.value / p)))) };
}

/** 某日型某小時要畫的流向與光點換算；flows 為 null＝停止營運。 */
export interface FlowHour {
  flows: FlowFrame[] | null;
  perDot: number;
  /** 每條流向的光點數，與 flows 同序 */
  counts: number[];
}

/** 首頁流向的檢視模型：當月最大、圖例值與每小時的前 12 大（場景與圖例共用，不各自換算）。 */
export interface FlowSource {
  month: string;
  max: number;
  legend: [number, number, number];
  at(dayType: DayType, hour: number): FlowHour;
}

export function flowSource(file: DistrictFlowsFile): FlowSource {
  const max = flowMax(file);
  const cache = new Map<string, FlowHour>();
  return {
    month: file.month,
    max,
    legend: legendValues(max),
    at(dayType, hour) {
      const key = `${dayType}:${hour}`;
      let v = cache.get(key);
      if (!v) {
        const flows = topFlows(file, dayType, hour);
        v = flows ? { flows, ...dotScale(flows) } : { flows: null, perDot: PEOPLE_PER_DOT, counts: [] };
        cache.set(key, v);
      }
      return v;
    },
  };
}

/** 圖例的三個人數：當月最大取首位數（例 6,582 → 6,000），再取約 1/6、1/2，進位到百人。 */
export function legendValues(max: number): [number, number, number] {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, max))));
  const top = Math.max(1, Math.floor(max / p) * p);
  return [Math.round(top / 6 / 100) * 100 || 100, Math.round(top / 2 / 100) * 100 || 100, top];
}
