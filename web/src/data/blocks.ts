// 街廓與樹（3.13）的檢視模型：示意層（AD-23），疏密與高度只由 stations.json 的人數決定（AD-1），不顯示任何數字。
// 屬於 views.ts 的檢視模型家族（AD-19）：場景只吃這裡的形狀，不 import 契約型別。和 3.6 並行時為了少衝突放在獨立檔，
// 3.7 refactor 可併回 views.ts。人數決定的高度不是高程，不經 elevation()，比例都在這裡（AD-12）。
import type { BasemapFile, DayType, Hourly, StationsFile } from "./types";

/** 一個車站對街廓疏密的貢獻：位置（經緯度，場景端經 project()）與權重 √(全日進出 ÷ 當月最大)。 */
export interface BlockStation {
  lon: number;
  lat: number;
  /** 0–1 */
  weight: number;
}

/** 周圍不蓋街廓的地標：位置與半徑（場景單位）。 */
export interface BlockClear {
  lon: number;
  lat: number;
  r: number;
}

export interface BlockSource {
  stations: BlockStation[];
  clears: BlockClear[];
  /** 行政區 ID，順序同 BaseView.districts（場景的 aDistrict 索引） */
  districts: string[];
  /** 每日型、每小時、每區的進出合計（null 當 0）；[dayType][hour][district] */
  activity: Record<DayType, number[][]>;
  /** 兩種日型、所有小時、所有區的最大進出（至少 1） */
  max: number;
}

/** 一個時段陣列的合計；null（停止營運或缺）不算（AD-5）。 */
export function sumHourly(h: Hourly | null | undefined): number {
  if (!h) return 0;
  let s = 0;
  for (const v of h) if (v !== null && Number.isFinite(v)) s += v;
  return s;
}

/** 某站「全日人數」：平日各時段進站＋出站（環狀線沒有出站紀錄，只算進站）。 */
export function stationDayTotal(s: StationsFile["stations"][number]): number {
  return sumHourly(s.weekday.entries) + (s.exitsRecorded ? sumHourly(s.weekday.exits) : 0);
}

/**
 * 地標周圍不蓋街廓的半徑（場景單位），依造型種類（原型 LANDMARKS 的 clear）。
 * 位置來自 basemap.json 的 landmarks（AD-25）；造型由 3.8 做，這裡只空出地。
 */
export const LANDMARK_CLEAR: Record<string, number> = {
  station: 2.0,
  expo: 2.0,
  market: 2.2,
  airport: 3.4,
  wheel: 1.9,
};
export const LANDMARK_CLEAR_DEFAULT = 1.5;

/** stations.json＋basemap.json → 街廓的檢視模型。districtIds 是場景行政區的順序。 */
export function blockSource(
  stations: Pick<StationsFile, "stations">,
  basemap: Pick<BasemapFile, "landmarks">,
  districtIds: readonly string[],
): BlockSource {
  const totals = stations.stations.map(stationDayTotal);
  const maxDay = Math.max(1, ...totals);
  const index = new Map(districtIds.map((id, i) => [id, i]));
  const activity = { weekday: [] as number[][], holiday: [] as number[][] };
  let max = 1;
  for (const day of ["weekday", "holiday"] as const) {
    for (let h = 0; h < 24; h++) {
      const row = new Array<number>(districtIds.length).fill(0);
      for (const s of stations.stations) {
        const k = index.get(s.district);
        if (k === undefined) continue;
        row[k] += (s[day].entries[h] ?? 0) + (s.exitsRecorded ? (s[day].exits[h] ?? 0) : 0);
      }
      for (const v of row) if (v > max) max = v;
      activity[day].push(row);
    }
  }
  return {
    stations: stations.stations.map((s, i) => ({ lon: s.lon, lat: s.lat, weight: Math.sqrt(totals[i] / maxDay) })),
    clears: basemap.landmarks.map((l) => ({ lon: l.lon, lat: l.lat, r: LANDMARK_CLEAR[l.kind] ?? LANDMARK_CLEAR_DEFAULT })),
    districts: [...districtIds],
    activity,
    max,
  };
}

/** 建築高度（場景單位）：矮胖的積木，最高約 1.8（原型）；score 是附近車站權重的 gaussian 和，r 是 0–1 的亂數。 */
export function buildingHeight(score: number, r: number): number {
  return 0.28 + 1.3 * Math.pow(Math.min(1, Math.max(0, score)), 0.8) * (0.75 + 0.5 * r);
}

/** 整區的高度倍數：0.7 + 0.5·√(此刻進出 ÷ 當月最大)；停止營運（0）是 0.7。 */
export function breathScale(a: number, max: number): number {
  return 0.7 + 0.5 * Math.sqrt(Math.min(1, Math.max(0, a) / Math.max(1, max)));
}

/** 時刻 t（0–24 連續）各區的進出：相鄰兩個整點線性內插（23 點接回 0 點）。寫進 out 並回傳。 */
export function activityAt(src: BlockSource, dayType: DayType, t: number, out: number[] = []): number[] {
  const x = ((t % 24) + 24) % 24;
  const h0 = Math.floor(x);
  const h1 = (h0 + 1) % 24;
  const f = x - h0;
  const a = src.activity[dayType][h0];
  const b = src.activity[dayType][h1];
  for (let k = 0; k < src.districts.length; k++) out[k] = a[k] * (1 - f) + b[k] * f;
  out.length = src.districts.length;
  return out;
}
