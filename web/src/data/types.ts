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

export interface MonthsFile {
  v: number;
  months: string[];
  latest: string;
}
