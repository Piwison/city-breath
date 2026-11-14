import type {
  BasemapFile,
  DailyFile,
  DistrictFlowsFile,
  DistrictsFile,
  EventsFile,
  InboundShard,
  MetaFile,
  MonthsFile,
  OdShard,
  Profile,
  StationsFile,
  StationTypesFile,
} from "./types";

export const CONTRACT_VERSION = 4;
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
/**
 * 行政區界線與區總量（v4）。版本由 getJson 驗；另外檢查每個有車站的區都有 weekday／holiday 的
 * entries、exits 各 24 格，沒有車站的區為 null（區排名只讀這裡，AD-7）。
 */
export async function loadDistricts(month: string): Promise<DistrictsFile> {
  const body = await getJson<DistrictsFile>(`${month}/districts.json`);
  const profileOk = (p: Profile | null | undefined) =>
    !!p && p.entries?.length === 24 && p.exits?.length === 24;
  const ok =
    body.v === CONTRACT_VERSION &&
    body.month === month &&
    Array.isArray(body.districts) &&
    body.districts.every((d) =>
      d.stations?.length ? profileOk(d.weekday) && profileOk(d.holiday) : d.weekday === null && d.holiday === null,
    );
  if (!ok) throw new Error(`${month} 的 districts.json 的形狀與資料契約不符`);
  return body;
}
/** 行政區×行政區×小時×日型（約 72 KB），首頁與行政區展開用 */
export const loadDistrictFlows = (month: string) => getJson<DistrictFlowsFile>(`${month}/district-flows.json`);
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
/**
 * 只有使用者選了起站才載入（約 25 KB）。迄站是同月 stations.json 的索引，各月份站數可能不同
 * （例：2025-10 沒有廣慈/奉天宮），所以一併取得同月 stations.json 並檢查 month 與列長（AD-2）。
 */
export async function loadOdShard(month: string, stationId: string): Promise<OdShard> {
  const [shard, stations] = await Promise.all([
    getJson<OdShard>(`${month}/od/${stationId}.json`),
    loadStations(month),
  ]);
  const n = stations.stations.length;
  const rows = [...shard.weekday, ...shard.holiday].filter((r): r is (number | null)[] => r !== null);
  if (shard.month !== stations.month || shard.origin !== stationId || !rows.every((r) => r.length === n)) {
    throw new Error(`${month} 的起訖分片 ${stationId} 與 stations.json 對不上`);
  }
  return shard;
}
/**
 * 迄站分片（1.13）：打開車站卡的「誰來」才載入（約 9 KB，AD-6）。起站索引只在同月有效，來源區的順序
 * 與同月 district-flows.json 相同，所以一併取得兩者檢查 month、站與索引範圍（AD-2、AD-9）。
 * 環狀線站沒有出站紀錄，沒有這個分片。
 */
export async function loadInboundShard(month: string, stationId: string): Promise<InboundShard> {
  const [shard, stations, flows] = await Promise.all([
    getJson<InboundShard>(`${month}/inbound/${stationId}.json`),
    loadStations(month),
    loadDistrictFlows(month),
  ]);
  const n = stations.stations.length;
  const isIndex = (i: number) => Number.isInteger(i) && i >= 0 && i < n;
  const dest = stations.stations.find((s) => s.id === stationId);
  const sameDistricts =
    shard.districts?.length === flows.districts.length && shard.districts.every((c, i) => c === flows.districts[i]);
  const dayOk = (d: InboundShard["weekday"] | undefined) =>
    !!d &&
    d.top?.length === 24 &&
    d.districts?.length === 24 &&
    d.top.every((row) => row === null || row.every((x) => isIndex(x.station))) &&
    d.districts.every((row) => row === null || row.length === shard.districts.length) &&
    !!d.allDay?.every((x) => isIndex(x.station));
  if (
    shard.month !== stations.month ||
    shard.dest !== stationId ||
    !dest?.exitsRecorded ||
    !sameDistricts ||
    !dayOk(shard.weekday) ||
    !dayOk(shard.holiday)
  ) {
    throw new Error(`${month} 的迄站分片 ${stationId} 與 stations.json 或 district-flows.json 對不上`);
  }
  return shard;
}
/**
 * 不分月份的底圖（約 0.6 MB，AD-6、AD-21）。版本由 getJson 驗；另外檢查形狀，
 * 站 ID 換索引要用目前月份的 stations.json（AD-2 例外），當月沒有的站略過。
 */
export async function loadBasemap(): Promise<BasemapFile> {
  const b = await getJson<BasemapFile>("basemap.json");
  if (
    b.v !== CONTRACT_VERSION ||
    !Number.isInteger(b.basemapRevision) ||
    b.levels?.length !== 6 ||
    !b.districts?.every((d) => d.terrain?.length === 6) ||
    !b.tracks?.every((t) => t.di.length === t.coords.length) ||
    !Object.values(b.headway ?? {}).every((days) => days && days.weekday.length === 24 && days.holiday.length === 24) ||
    b.grid?.rows.length !== b.grid?.ny
  ) {
    throw new Error("basemap.json 的形狀與資料契約不符");
  }
  return b;
}
/**
 * 不分月份的 station-types.json（約 5 KB，3.12，AD-27）：每站整年最常見的類型，打開車站卡才載（AD-6）。
 * 版本由 getJson 驗；另外檢查形狀。站 ID 為鍵，跨月份通用（AD-2），當月沒有的站自然查不到。
 */
export async function loadStationTypes(): Promise<StationTypesFile> {
  const b = await getJson<StationTypesFile>("station-types.json");
  const ok =
    b.v === CONTRACT_VERSION &&
    Array.isArray(b.fitMonths) &&
    b.fitMonths.length > 0 &&
    !!b.stations &&
    typeof b.stations === "object" &&
    Object.values(b.stations).every(
      (r) => Number.isInteger(r?.type) && r.type >= 0 && Number.isInteger(r.votes) && r.votes >= 1 && r.votes <= r.months,
    );
  if (!ok) throw new Error("station-types.json 的形狀與資料契約不符");
  return b;
}
