// 資料契約 v2 的型別。來源：pipeline/src/city_breath_pipeline/export.py
// 契約說明：docs/data-contract.md。改這裡就要一起改 pipeline（AD-1）。

export type DayType = "weekday" | "holiday";

/** 長度 24，索引是小時；停止營運的時段為 null（AD-5）。 */
export type Hourly = (number | null)[];

export interface Profile {
  entries: Hourly;
  exits: Hourly;
}

export interface Station {
  id: string;
  name: string;
  display: string;
  lon: number;
  lat: number;
  /** 環狀線車站出站人次不在本資料中 */
  exitsRecorded: boolean;
  /** 所屬行政區的 8 碼代碼（國土測繪中心），對到 districts.json 的 id；前端不得自行推算（AD-9） */
  district: string;
  /** 車站個性分群；出站未計的站為 null */
  type: number | null;
  weekday: Profile;
  holiday: Profile;
  topDestinations: Record<DayType, { station: number; avg: number }[]>;
}

export interface StationType {
  id: number;
  label: string;
  description: string;
  /** true 表示標籤是自動草稿，尚未人工定名 */
  draft: boolean;
  size: number;
  examples: string[];
}

export interface StationsFile {
  v: number;
  month: string;
  stations: Station[];
  types: StationType[];
}

/** [起站索引, 迄站索引, 平均人次] */
export type Arc = [number, number, number];

export interface FlowsFile {
  v: number;
  month: string;
  top: number;
  weekday: Arc[][];
  holiday: Arc[][];
}

/**
 * 起站分片。weekday[hour][destIndex]：平均人次；null 表示少於 10 人（AD-3）。
 * 整個小時為 null 表示停止營運。
 */
export interface OdShard {
  v: number;
  origin: string;
  month: string;
  weekday: ((number | null)[] | null)[];
  holiday: ((number | null)[] | null)[];
  weekdayDepartures: (number | null)[];
  holidayDepartures: (number | null)[];
}

/** [lon, lat] */
export type LonLat = [number, number];

export interface District {
  /** 國土測繪中心鄉鎮市區 8 碼代碼，例如 "63000050" */
  id: string;
  /** 例：中正區 */
  name: string;
  /** 臺北市／新北市 */
  city: string;
  /** 原始界線的幾何中心 */
  centroid: LonLat;
  /** 區內車站：stations.json 的陣列索引 */
  stations: number[];
  /** 區內有出站未入檔的環狀線站；顯示「誰來」時要附說明 */
  inflowPartial: boolean;
  /** 簡化後的界線，GeoJSON MultiPolygon 座標（經緯度）；經 project() 轉場景座標（AD-12） */
  polygon: LonLat[][][];
}

export interface DistrictsFile {
  v: number;
  month: string;
  districts: District[];
}

export interface DataSource {
  name: string;
  publisher: string;
  url: string;
  license: string;
  retrieved: string;
  sha256: string;
  dataset?: string;
}

export interface MetaFile {
  v: number;
  month: string;
  generatedAt: string;
  source: { name: string; publisher: string; url: string; license: string; coordinates: string };
  /** 每個輸入資料集（AD-1）；資料來源頁只從這裡產生 */
  sources: DataSource[];
  dayCounts: Record<DayType, number>;
  serviceHours: number[];
  stationCount: number;
  suppressBelow: number;
  notes: string[];
}

/**
 * 場館站當天的到站來源（daily/{date}.json 的 venues[]）。
 * arrivals[i][hour]：從 origins[i] 這個行政區在 hour 點進站、到這個場館站出站的人次（AD-15）；
 * null 表示少於 10 人或次要隱藏（AD-3），整個小時停止營運也是 null。
 * 沒列在 origins 的行政區＝整天都是 null；前端不得用 exits 反推。
 */
export interface VenueArrivals {
  /** 場館站：stations.json 的陣列索引 */
  station: number;
  /** pipeline/config/venues.csv 的 venue_id（同站可能有多個場館） */
  venueIds: string[];
  /** 來源行政區 8 碼代碼（AD-9），依代碼排序 */
  origins: string[];
  arrivals: Hourly[];
}

/**
 * 逐日檔 daily/{YYYY-MM-DD}.json：進入某一天才載入（AD-6）。
 * entries／exits 以 stations.json 的陣列索引排列，每站 24 小時；站層級總量不隱藏（AD-3）。
 * 當日全市沒有人次的小時為 null（停止營運，AD-5）。
 */
export interface DailyFile {
  v: number;
  month: string;
  /** YYYY-MM-DD */
  date: string;
  dayType: DayType;
  entries: Hourly[];
  /** 出站；exitsRecorded=false 的站（環狀線）整列為 null */
  exits: (Hourly | null)[];
  venues: VenueArrivals[];
}

/** events.json 的 days[]：每天一筆，依日期排序（7.1，AD-14）。 */
export interface EventDay {
  /** YYYY-MM-DD */
  date: string;
  dayType: DayType;
  /** 當日全市進站總量 */
  cityEntries: number;
  /** 對「平常」（同月同星期幾、排除當日的中位數）的倍數；同月沒有其他同星期幾時為 null */
  cityRatio: number | null;
}

/**
 * events.json 的 anomalies[]：管線判定的異常（AD-14），前端只查表、不自己套門檻。
 * station 為 null＝全市級（全市進站與平常差 ≥ 15%）；否則是站級，值為同月 stations.json 的陣列索引（AD-2）。
 */
export interface Anomaly {
  date: string;
  station: number | null;
  /** ratio 與 baseline 指的是進站還是出站；全市級固定 "entries" */
  measure: "entries" | "exits";
  /** 當日 ÷ 平常，3 位小數 */
  ratio: number;
  /** 平常（排除當日的同星期幾中位數），四捨五入成整數 */
  baseline: number;
  /** 對到 events[] 的 id；空陣列＝顯示「原因未查證」 */
  eventIds: string[];
}

/** events.json 的 events[]：場館檔期（auto，7.2）與人工活動（manual，7.3）。7.1 起為空陣列。 */
export interface EventRecord {
  id: string;
  /** YYYY-MM-DD，含首尾 */
  startDate: string;
  endDate: string;
  /** pipeline/config/venues.csv 的 venue_id */
  venue: string;
  /** stations.json 的陣列索引 */
  stations: number[];
  name: string;
  source: "auto" | "manual";
  url: string;
  verified: boolean;
}

/** events.json：每月一檔（AD-10、AD-14）。 */
export interface EventsFile {
  v: number;
  month: string;
  /** 判定門檻；provisional=true 表示站級門檻是暫定值（7.2 定案） */
  thresholds: { city: number; stationRatio: number; stationExtra: number; provisional: boolean };
  days: EventDay[];
  /** 依日期、再依站索引排序（全市級在前） */
  anomalies: Anomaly[];
  events: EventRecord[];
}

export interface MonthsFile {
  v: number;
  months: string[];
  latest: string;
}
