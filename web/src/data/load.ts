import type { DistrictsFile, FlowsFile, MetaFile, MonthsFile, OdShard, StationsFile } from "./types";
import type { DailyFile } from "./types";
import type { EventsFile } from "./types";

export const CONTRACT_VERSION = 2;
const BASE = `${import.meta.env.BASE_URL}data`;

const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${BASE}/${path}`).then(async (r) => {
      if (!r.ok) throw new Error(`載入 ${path} 失敗：${r.status}`);
      const body = (await r.json()) as T & { v?: number };
      if (body.v !== undefined && body.v !== CONTRACT_VERSION) {
        throw new Error(`${path} 的資料契約版本 ${body.v} 與網站 ${CONTRACT_VERSION} 不符`);
      }
      return body;
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p;
}

export const loadMonths = () => getJson<MonthsFile>("months.json");
export const loadMeta = (month: string) => getJson<MetaFile>(`${month}/meta.json`);
export const loadStations = (month: string) => getJson<StationsFile>(`${month}/stations.json`);
export const loadDistricts = (month: string) => getJson<DistrictsFile>(`${month}/districts.json`);
export const loadFlows = (month: string) => getJson<FlowsFile>(`${month}/flows.json`);
/**
 * 逐日檔：只有進入某一天才載入（約 40 KB，AD-6）。站索引只在同月有效，
 * 所以一併取得同月 stations.json 並檢查 month 與站數相同（AD-2）。
 */
export async function loadDaily(month: string, date: string): Promise<DailyFile> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${month}-`)) {
    throw new Error(`日期 ${date} 不屬於 ${month}`);
  }
  const [daily, stations] = await Promise.all([
    getJson<DailyFile>(`${month}/daily/${date}.json`),
    loadStations(month),
  ]);
  if (daily.month !== stations.month || daily.entries.length !== stations.stations.length) {
    throw new Error(`${date} 的逐日檔與 ${stations.month} 的 stations.json 對不上`);
  }
  return daily;
}
/**
 * 異常日與活動（events.json，約 4 KB）：異常與原因只來自這裡，前端只查表（AD-13、AD-14）。
 * 站級異常與活動的車站是同月 stations.json 的索引，所以一併取得並檢查 month 與索引範圍（AD-2）。
 */
export async function loadEvents(month: string): Promise<EventsFile> {
  const [events, stations] = await Promise.all([
    getJson<EventsFile>(`${month}/events.json`),
    loadStations(month),
  ]);
  const n = stations.stations.length;
  const isIndex = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  if (
    events.month !== stations.month ||
    !events.anomalies.every((a) => a.station === null || isIndex(a.station)) ||
    !events.events.every((e) => e.stations.every(isIndex))
  ) {
    throw new Error(`${month} 的 events.json 與 stations.json 對不上`);
  }
  return events;
}
/** 只有使用者選了起站才載入（約 25 KB） */
export const loadOdShard = (month: string, stationId: string) =>
  getJson<OdShard>(`${month}/od/${stationId}.json`);
