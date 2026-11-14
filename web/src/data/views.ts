// 檢視模型（AD-19）：場景圖層不 import 契約型別，只吃這裡產生的形狀。
// 2.3 底圖：basemap.json＋districts.json → BaseView；3.5 流向：district-flows.json → FlowFrame；
// 3.6 選區：去哪／誰來（FlowFrame.kind）、卡片排名（DistrictRanks）、展開的站（StationFrame）。
// 3.12 選站：od 分片的前 5 目的地、去哪幾區、站對站的 FlowFrame（from/to 是站 ID）。
import { stationVolume } from "./traits";
import type {
  BasemapFile,
  DayType,
  DistrictFlowsFile,
  DistrictsFile,
  LineId,
  LonLat,
  MultiPolygonCoords,
  OdShard,
  Station,
  StationsFile,
} from "./types";

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
  /** 路線 ID（列車查班距用，3.14） */
  line: LineId;
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
    tracks: basemap.tracks.map((t) => ({ line: t.line, token: lineToken(t.line), coords: t.coords, di: t.di, approx: t.approx })),
  };
}

// ── 行政區流向（3.5）：首頁、行政區展開、活動日共用同一種 frame、同一個線寬與光點換算（AD-19） ──

/** 流向的種類：選了區時，out＝這區的人去哪（藍）、in＝誰來這裡（橘紅）；沒有＝全城（橘）。 */
export type FlowKind = "out" | "in";

/**
 * 一條流向：from、to 為 8 碼行政區代碼（AD-9），選站時（3.12）為站 ID（AD-2）；
 * value 為該小時平均人次，null＝少於 10 人（AD-3）。
 */
export interface FlowFrame {
  from: string;
  to: string;
  value: number | null;
  /** 選區模式的去哪／誰來（3.6）；全城模式不設 */
  kind?: FlowKind;
}

/** 一條流向的鍵（聚焦用）：「起區>迄區」。 */
export const flowKey = (f: Pick<FlowFrame, "from" | "to">) => `${f.from}>${f.to}`;

/**
 * 雙向車道（Piwi 2026-11-12）：同時要畫 A→B 與 B→A 的流向鍵。這些緞帶各往自己前進方向的右側偏移，
 * 不再疊在一起；只有單向的不偏移。null 不畫，所以也不算。
 */
export function twoWay(frames: readonly FlowFrame[]): Set<string> {
  const drawn = new Set(frames.filter((f) => f.value !== null && f.from !== f.to).map(flowKey));
  return new Set([...drawn].filter((k) => drawn.has(k.split(">").reverse().join(">"))));
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

/** 最粗的緞帶在螢幕上最多幾像素（Piwi 2026-11-11：放大後緞帶不能粗到蓋住街區；2026-11-12 由 18 改 24）。 */
export const RIBBON_MAX_PX = 24;

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
  /** 這個小時有沒有營運（整格 null＝停止營運，AD-5） */
  operating(dayType: DayType, hour: number): boolean;
  /** 選了某區時要畫的流向：這區前 5 去哪＋前 5 誰來（3.6）；光點換算與全城同一個函式 */
  district(dayType: DayType, hour: number, id: string): FlowHour;
  /** 一對區某小時的人數（聚焦的那條不在前 5 時補畫用）；null＝少於 10 人或停止營運 */
  pair(dayType: DayType, hour: number, from: string, to: string): number | null;
}

export function flowSource(file: DistrictFlowsFile): FlowSource {
  const max = flowMax(file);
  const cache = new Map<string, FlowHour>();
  return {
    month: file.month,
    max,
    legend: legendValues(max),
    operating(dayType, hour) {
      return file[dayType][((Math.floor(hour) % 24) + 24) % 24] !== null;
    },
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
    district(dayType, hour, id) {
      const key = `${dayType}:${hour}:${id}`;
      let v = cache.get(key);
      if (!v) {
        const flows = districtFlows(file, dayType, hour, id);
        v = flows ? { flows, ...dotScale(flows) } : { flows: null, perDot: PEOPLE_PER_DOT, counts: [] };
        cache.set(key, v);
      }
      return v;
    },
    pair(dayType, hour, from, to) {
      const i = file.districts.indexOf(from);
      const j = file.districts.indexOf(to);
      return i < 0 || j < 0 ? null : (file[dayType][hour]?.[i][j] ?? null);
    },
  };
}

// ── 選了一區（3.6）：地圖畫這區前 5 去哪、前 5 誰來；卡片列去哪、誰來前 3（這一小時或整天） ──

/** 選區時地圖上每個方向畫幾條（diorama-game-juice「數量要少」）。 */
export const DISTRICT_FLOWS = 5;

/**
 * 某區某小時要畫的流向：去哪（from＝這區）前 n、誰來（to＝這區）前 n，跨區才畫（區內沒有緞帶）。
 * null 不排名、不當 0；停止營運回傳 null（AD-5）；這區不在矩陣裡回傳空陣列。
 */
export function districtFlows(
  file: DistrictFlowsFile,
  dayType: DayType,
  hour: number,
  id: string,
  n: number = DISTRICT_FLOWS,
): FlowFrame[] | null {
  const m = file[dayType][hour];
  if (!m) return null;
  const i = file.districts.indexOf(id);
  if (i < 0) return [];
  const ids = file.districts;
  const pick = (kind: FlowKind) =>
    ids
      .map((other, j) => ({ j, other, value: kind === "out" ? m[i][j] : m[j][i] }))
      .filter((x): x is { j: number; other: string; value: number } => x.j !== i && x.value !== null && x.value > 0)
      .sort((a, b) => b.value - a.value || a.other.localeCompare(b.other))
      .slice(0, n)
      .map(({ other, value }): FlowFrame =>
        kind === "out" ? { from: id, to: other, value, kind } : { from: other, to: id, value, kind },
      );
  return [...pick("out"), ...pick("in")];
}

// ── 選了一站（3.12）：這一小時從這站出發最常去的前 5 站（od 分片）、這 5 站在哪幾區、地圖上的站對站緞帶 ──

/** 車站卡與地圖上列幾個目的地。 */
export const STATION_DESTINATIONS = 5;

/** 一個目的地：迄站（stations.json 索引）與這一小時的平均人次（一定是公開的數字）。 */
export interface Destination {
  index: number;
  value: number;
}

export interface StationDestinations {
  /** 這一小時有營運（od 分片該小時整格不是 null，AD-5） */
  operating: boolean;
  /** 由多到少；排除同站進出與少於 10 人（null，不排名、不當 0，AD-3） */
  top: Destination[];
}

/**
 * 起站 origin 在某日型某小時的前 n 個目的地（od 分片 weekday[hour][迄站]）。
 * 同人數依索引排序以求穩定。只排公開的格子，前端不反推被隱藏的格（AD-3）。
 */
export function stationDestinations(
  shard: Pick<OdShard, "weekday" | "holiday">,
  origin: number,
  dayType: DayType,
  hour: number,
  n: number = STATION_DESTINATIONS,
): StationDestinations {
  const row = shard[dayType][((Math.floor(hour) % 24) + 24) % 24];
  if (!row) return { operating: false, top: [] };
  const all: Destination[] = [];
  row.forEach((v, j) => {
    if (j !== origin && v !== null && v > 0) all.push({ index: j, value: v });
  });
  all.sort((a, b) => b.value - a.value || a.index - b.index);
  return { operating: true, top: all.slice(0, n) };
}

/** 「去哪幾區」的一列：行政區（AD-9）、這幾站加起來的人數與站數。 */
export interface DestinationDistrict {
  id: string;
  value: number;
  stations: number;
}

/**
 * 去哪幾區（票面：前 5 目的地依迄站的行政區加總）：只加畫面上列出的那幾站，數字和上面的列表加得起來；
 * 不是區對區的平均（那在 district-flows.json），也不把其他站的格子加進來。由多到少，同人數依代碼。
 */
export function destinationDistricts(top: readonly Destination[], stations: readonly Station[]): DestinationDistrict[] {
  const by = new Map<string, DestinationDistrict>();
  for (const d of top) {
    const id = stations[d.index]?.district;
    if (!id) continue;
    const row = by.get(id) ?? { id, value: 0, stations: 0 };
    row.value += d.value;
    row.stations += 1;
    by.set(id, row);
  }
  return [...by.values()].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

/**
 * 地圖上的站對站緞帶（AD-19：與行政區流向同一種 FlowFrame、同一個光點換算）：from、to 是站 ID（AD-2），
 * kind＝out（藍，從這站出發去哪）。停止營運回傳 flows null。
 */
export function stationFlows(dest: StationDestinations, origin: number, stations: readonly Station[]): FlowHour {
  if (!dest.operating) return { flows: null, perDot: PEOPLE_PER_DOT, counts: [] };
  const from = stations[origin].id;
  const flows: FlowFrame[] = dest.top.map((d) => ({ from, to: stations[d.index].id, value: d.value, kind: "out" }));
  return { flows, ...dotScale(flows) };
}

/** 卡片的範圍：這一小時，或整天（各小時平均人次加總）。 */
export type DistrictRange = "hour" | "day";

/** 卡片上的一列：另一區（可能就是這區自己＝區內）與人數。 */
export interface DistrictRank {
  id: string;
  value: number;
  /** 區內移動（起訖都在這區） */
  self: boolean;
}

export interface DistrictRanks {
  /** 這一小時停止營運（整天模式永遠 true） */
  operating: boolean;
  /** 這區的人去哪（含區內），由大到小；少於 10 人（null）不列 */
  out: DistrictRank[];
  /** 誰來這裡（含區內），由大到小 */
  in: DistrictRank[];
}

/**
 * 去哪／誰來的排名（卡片用）。這一小時：直接讀矩陣；整天：每格只加有公開人數的小時（null 不當 0，
 * 停止營運的小時跳過），全部小時都是 null 的格才算「少於 10 人」、不列。區內（大安→大安）也列，
 * 因為「我住的區的人去哪」包含留在區內的人（3.6 verify：大安假日整天前三是中正、大安、信義）。
 */
export function districtRanks(file: DistrictFlowsFile, dayType: DayType, range: DistrictRange, hour: number, id: string): DistrictRanks {
  const ids = file.districts;
  const i = ids.indexOf(id);
  const hours = range === "day" ? file[dayType].map((_, h) => h) : [((Math.floor(hour) % 24) + 24) % 24];
  const out = new Map<number, number>();
  const inn = new Map<number, number>();
  let operating = range === "day";
  if (i >= 0)
    for (const h of hours) {
      const m = file[dayType][h];
      if (!m) continue;
      operating = true;
      for (let j = 0; j < ids.length; j++) {
        const a = m[i][j];
        const b = m[j][i];
        if (a !== null) out.set(j, (out.get(j) ?? 0) + a);
        if (b !== null) inn.set(j, (inn.get(j) ?? 0) + b);
      }
    }
  const ranked = (map: Map<number, number>) =>
    [...map.entries()]
      .filter(([, v]) => v > 0)
      .map(([j, value]) => ({ id: ids[j], value, self: j === i }))
      .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  return { operating, out: ranked(out), in: ranked(inn) };
}

/** 圖例的三個人數：當月最大取首位數（例 6,582 → 6,000），再取約 1/6、1/2，進位到百人。 */
export function legendValues(max: number): [number, number, number] {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, max))));
  const top = Math.max(1, Math.floor(max / p) * p);
  return [Math.round(top / 6 / 100) * 100 || 100, Math.round(top / 2 / 100) * 100 || 100, top];
}

// ── 靜態模式的光帶（3.3）：光點換成依人數分級粗細的靜態光帶（diorama-game-juice「減少動態」） ──

/** 光帶三級的寬（場景單位）；索引 0 不用（null 不畫）。 */
export const BAND_W = [0, 0.2, 0.45, 0.75] as const;
/** 光帶不超過緞帶寬的幾成：兩側留著緞帶色，圖例「橘＝全城流向」仍成立。 */
export const BAND_MAX_OF_RIBBON = 0.55;

/** 光帶分級的兩個門檻：圖例三值相鄰兩個的中點（例 1 千／3 千／6 千 → 2 千、4.5 千），都由當月最大推得。 */
export function bandCuts(legend: readonly [number, number, number]): [number, number] {
  return [(legend[0] + legend[1]) / 2, (legend[1] + legend[2]) / 2];
}

/** 光帶等級：1／2／3；null（少於 10 人）與 0 不畫，回傳 0（AD-3、AD-19）。 */
export function bandTier(value: number | null, legend: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  if (value === null || value <= 0) return 0;
  const [a, b] = bandCuts(legend);
  return value >= b ? 3 : value >= a ? 2 : 1;
}

/** 某條流向的光帶寬（場景單位）：等級的寬，但不超過緞帶寬的 BAND_MAX_OF_RIBBON。 */
export function bandWidth(value: number | null, legend: readonly [number, number, number], max: number): number {
  const t = bandTier(value, legend);
  if (!t || value === null) return 0;
  return Math.min(BAND_W[t], ribbonWidth(value, max) * BAND_MAX_OF_RIBBON);
}

// ── 圖例的顏色說明（3.3；走查 F5）：文字跟著模式換。3.6 加選區模式（藍＝這區的人去哪、橘紅＝誰來這裡）。 ──

export type FlowMode = "city" | "district";

export const FLOW_KEYS: Record<FlowMode, { token: string; label: string }[]> = {
  city: [{ token: "--flow-neutral", label: "橘＝全城流向" }],
  district: [
    { token: "--flow-out", label: "藍＝這區的人去哪" },
    { token: "--flow-in", label: "橘紅＝誰來這裡" },
  ],
};

/** 緞帶、光點、標籤的顏色 token：去哪藍、誰來橘紅、全城橘（DESIGN.md 色票）。 */
export function flowToken(kind?: FlowKind): string {
  return kind === "out" ? "--flow-out" : kind === "in" ? "--flow-in" : "--flow-neutral";
}

// ── 車站（3.6 站珠、3.1 車站柱）：站的檢視模型（AD-19 的 StationFrame） ──

/** 一個要畫的站：站在 stations.json 的索引、位置、路線色 token 與這一小時的進出人數。 */
export interface StationFrame {
  index: number;
  id: string;
  /** 畫面上的短名（去掉括號裡的路線） */
  label: string;
  lon: number;
  lat: number;
  /** 所屬行政區（stations.json 的 district，AD-9） */
  district: string;
  /** 站珠：第一條路線的色 token（AD-21），沒有路線資料時用 --station */
  token: string;
  /** 廣場：最後一條路線的色 token（轉乘站看得到兩種顏色；單線站同 token） */
  plazaToken: string;
  /** 此刻進出人數（traits.ts stationVolume）；停止營運為 null */
  value: number | null;
  /** 這個日型的全日進出（停止營運的小時跳過；名牌挑「重要的站」用） */
  dayTotal: number;
  /** 出站未入檔（環狀線）：value 只算進站 */
  entriesOnly: boolean;
}

/** 畫面上的站名：去掉括號裡的路線（板橋（板南線）→ 板橋）；同名站靠位置與路線色分辨。 */
export const stationLabel = (display: string) => display.replace(/（.*）$/, "");

/** 首頁要用的車站索引：依行政區分組（stations.json 的 district，AD-9）、站 ID 對索引、每站的路線。 */
export interface StationIndex {
  month: string;
  stations: Station[];
  byDistrict: Map<string, number[]>;
  byId: Map<string, number>;
  /** 第一條路線的色 token；沒有路線資料時 --station */
  token(i: number): string;
  /** 每站的路線（basemap.json stationLines，AD-21） */
  lines(i: number): LineId[];
  /** 當月單一站單一小時的最大進出（兩種日型）；柱高的分母 */
  peak: number;
}

export function stationIndex(file: StationsFile, stationLines: Record<string, LineId[]>): StationIndex {
  const byDistrict = new Map<string, number[]>();
  file.stations.forEach((s, i) => {
    const list = byDistrict.get(s.district);
    if (list) list.push(i);
    else byDistrict.set(s.district, [i]);
  });
  let peak = 1;
  for (const s of file.stations)
    for (const day of ["weekday", "holiday"] as const)
      for (let h = 0; h < 24; h++) peak = Math.max(peak, stationVolume(s, day, h).value ?? 0);
  return {
    peak,
    month: file.month,
    stations: file.stations,
    byDistrict,
    byId: new Map(file.stations.map((s, i) => [s.id, i])),
    lines: (i) => stationLines[file.stations[i]?.id] ?? [],
    token(i) {
      const l = stationLines[file.stations[i]?.id]?.[0];
      return l ? lineToken(l) : "--station";
    },
  };
}

/**
 * 站的 frame：district 給一區的站（3.6 行政區卡、展開），null 給全部的站（3.1 車站柱）。
 * 位置、路線色與此刻進出都從 stations.json＋basemap.json 的 stationLines 來（traits.ts，AD-26）。
 */
export function stationFrames(index: StationIndex, district: string | null, dayType: DayType, hour: number): StationFrame[] {
  const list = district === null ? index.stations.map((_, i) => i) : (index.byDistrict.get(district) ?? []);
  return list.map((i) => {
    const s = index.stations[i];
    const lines = index.lines(i);
    return {
      index: i,
      id: s.id,
      label: stationLabel(s.display),
      lon: s.lon,
      lat: s.lat,
      district: s.district,
      token: index.token(i),
      plazaToken: lines.length ? lineToken(lines[lines.length - 1]) : "--station",
      value: stationVolume(s, dayType, hour).value,
      dayTotal: stationVolume(s, dayType, "day").value ?? 0,
      entriesOnly: !s.exitsRecorded,
    };
  });
}

// ── 車站柱（3.1）：柱高＝此刻進出人數。人數決定的高度不是高程，不經 elevation()、不乘地形倍數（AD-12）。 ──

/** 0 人時的柱高（場景單位）：最矮但看得到，和停止營運（沒有柱）分得出來（AD-5）。 */
export const PILLAR_MIN = 0.35;
/** 單站單小時最大進出時，柱高再加多少（原型 0.35 + 2.1·√(a/max)）。 */
export const PILLAR_GAIN = 2.1;

/** 進出 value 人的柱高；平方根比例，讓郊區小站也看得到。停止營運（null）回傳 null，不當 0。 */
export function pillarHeight(value: number | null, peak: number): number | null {
  if (value === null) return null;
  return PILLAR_MIN + PILLAR_GAIN * Math.sqrt(Math.min(1, Math.max(0, value) / Math.max(1, peak)));
}

/** 畫面上的柱：高度（停止營運時 0，柱收進廣場）與營運程度 open（1＝有車、0＝停止營運；站珠依此熄燈）。 */
export interface PillarState {
  height: number;
  open: number;
}

/**
 * 某站在連續時間 t 的柱（stations.json 該日型的進出，traits.ts stationVolume）。
 * 播放中（smooth）在 h 與 h+1 點之間內插（和街廓同一種內插）；不播放、或減少動態時用整點的值（和小卡上的「平日 8 點」一致）。
 * h 點停止營運（null）時沒有柱、open 0；h+1 點才停駛時維持 h 點的高度，入睡的淡出交給 3.4 的 sleepAt()
 * （state/service.ts，和流向同一條入睡曲線），場景把高度乘上 1 − 入睡程度。
 */
export function pillarAt(index: StationIndex, i: number, dayType: DayType, t: number, smooth: boolean, out?: PillarState): PillarState {
  const o = out ?? { height: 0, open: 0 };
  const s = index.stations[i];
  const x = ((t % 24) + 24) % 24;
  const h0 = Math.floor(x);
  const a = pillarHeight(stationVolume(s, dayType, h0).value, index.peak);
  if (!smooth) {
    o.height = a ?? 0;
    o.open = a === null ? 0 : 1;
    return o;
  }
  const f = x - h0;
  const b = pillarHeight(stationVolume(s, dayType, (h0 + 1) % 24).value, index.peak);
  o.height = a === null ? 0 : b === null ? a : a * (1 - f) + b * f;
  o.open = a === null ? 0 : 1;
  return o;
}
