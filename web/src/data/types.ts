// 資料契約 v4 的型別。來源：pipeline/src/city_breath_pipeline/export.py
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
  /** 車站類型 id，對到 StationsFile.types[id]，所有月份同一個 id 是同一型（AD-27）；出站未計或當月平日沒有進出的站為 null */
  type: number | null;
  weekday: Profile;
  holiday: Profile;
  /** 全日最常去的 10 站（v3 起由 5 擴成 10，C5），依全日人次排序；avg 為 null 表示少於 10 人或次要隱藏（AD-3） */
  topDestinations: Record<DayType, StationCount[]>;
}

/** 一個起站或迄站與它的平均人次；avg 為 null 表示少於 10 人或次要隱藏（AD-3），前端不得反推。 */
export interface StationCount {
  /** stations.json 的陣列索引（同月份） */
  station: number;
  avg: number | null;
}

/** 固定的車站類型（AD-27）：id、名稱、一句話所有月份相同；size、examples 是當月。 */
export interface StationType {
  /** 0 臥室站、1 住商站、2 人氣站、3 辦公站；等於在 types[] 中的索引 */
  id: number;
  label: string;
  description: string;
  /** true 表示名稱尚未人工確認（目前一律 false） */
  draft: boolean;
  /** 當月歸到這型的站數 */
  size: number;
  /** 當月這型平日進站最多的 5 站（正規站名） */
  examples: string[];
}

export interface StationsFile {
  v: number;
  month: string;
  stations: Station[];
  types: StationType[];
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

/** inbound 分片一個日型的內容（1.13）。小時是進站時段（AD-15）；停止營運的小時為 null（AD-5）。 */
export interface InboundDay {
  /** top[hour]：該小時到此站人次最多的 5 個起站（不含同站進出），值與 od 分片相同、一律是公開的數字 */
  top: (StationCount[] | null)[];
  /**
   * districts[hour][i]：從 InboundShard.districts[i] 這區的車站在 hour 點進站、在此站出站的平均人次
   * （含同站進出，各區之和＝stations.json 的 exits[hour]）；null＝少於 10 人或次要隱藏，前端不得用 exits 反推。
   */
  districts: ((number | null)[] | null)[];
  /** 全日人次前 10 的起站（不含同站進出）；avg 與起站那邊 topDestinations 的同一格相同 */
  allDay: StationCount[];
}

/**
 * 迄站分片 inbound/{stationId}.json（1.13，AD-6、AD-10）：打開車站卡的「誰來」才載入。
 * 環狀線站（exitsRecorded=false）沒有這個分片。
 */
export interface InboundShard {
  v: number;
  month: string;
  /** 迄站的站 ID */
  dest: string;
  /** 來源行政區的 8 碼代碼，與 district-flows.json 的 districts 相同順序；名稱從 districts.json 查（AD-9） */
  districts: string[];
  weekday: InboundDay;
  holiday: InboundDay;
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
  /**
   * 區總量（v4，3.20）：區內車站每小時的平均進站、出站人次。照 AD-7 由各站整數總人次先加總再除天數，
   * 區排名只讀這裡，不把 stations.json 的站平均相加。停止營運為 null（AD-5）。exits 只算出站有紀錄的站，
   * inflowPartial 的區少算（要附說明）。沒有車站的區為 null。
   */
  weekday: Profile | null;
  holiday: Profile | null;
}

export interface DistrictsFile {
  v: number;
  month: string;
  districts: District[];
}

/**
 * 行政區起訖矩陣：matrix[起區索引][迄區索引] 為平均人次；null 表示少於 10 人或次要隱藏（AD-3），
 * 前端顯示「少於 10 人」，不得用總量反推。索引對到 DistrictFlowsFile.districts。
 */
export type DistrictMatrix = (number | null)[][];

/** district-flows.json（1.9；AD-7、AD-10） */
export interface DistrictFlowsFile {
  v: number;
  month: string;
  /** 列／欄索引：有車站的行政區 8 碼代碼，依代碼排序；名稱與界線從 districts.json 取 */
  districts: string[];
  /** 長度 24，索引是進站小時（AD-15）；停止營運的小時整格為 null（AD-5） */
  weekday: (DistrictMatrix | null)[];
  holiday: (DistrictMatrix | null)[];
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

/**
 * events.json 的 events[]：場館檔期（auto，7.2）與人工活動（manual，7.3）。
 * auto 只收配到至少一筆異常的檔期；起訖是租用期（含進場拆台），演出日＝eventIds 指向它的異常日。
 * manual 來自 pipeline/config/events.csv，每筆都有來源網址，沒配到異常也會列出。
 */
export interface EventRecord {
  id: string;
  /** YYYY-MM-DD，含首尾；小巨蛋、花博為租用期 */
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
  /** 判定門檻（站級：倍數、多出人數、modified z-score 三條同時滿足）；7.2 起 provisional=false */
  thresholds: { city: number; stationRatio: number; stationExtra: number; stationZ: number; provisional: boolean };
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

// ── basemap.json（1.12；AD-12、AD-21、AD-25）──────────────────────────────

/** 路線 ID（AD-21）；顏色 token＝`--line-` 加小寫、去連字號的 ID（`R-3` → `--line-r3`），JSON 不放色碼 */
export type LineId = "BR" | "R" | "R-3" | "G" | "G-3" | "O" | "BL" | "Y";

/** GeoJSON MultiPolygon 座標（經緯度）：[面][環][點]，第一個環是外框、其餘是洞；經 project() 轉場景座標（AD-12） */
export type MultiPolygonCoords = LonLat[][][];

/** 六層台地，索引 0–5 對到 levels（40／120／250／400／600／850 公尺）；第 k 層是「高程 ≥ levels[k]」的面 */
export type TerrainLevels = [
  MultiPolygonCoords,
  MultiPolygonCoords,
  MultiPolygonCoords,
  MultiPolygonCoords,
  MultiPolygonCoords,
  MultiPolygonCoords,
];

export interface BasemapDistrict {
  /** 有車站的行政區 8 碼代碼（AD-9），依代碼排序；切區用 districts.json 的簡化界線 */
  id: string;
  water: MultiPolygonCoords;
  /** 公園與河濱高灘地；只有臺北市資料 */
  green: MultiPolygonCoords;
  /** 已扣掉水面 */
  terrain: TerrainLevels;
}

export interface BasemapTrack {
  line: LineId;
  coords: LonLat[];
  /** 每個頂點在 basemap 的 districts[] 哪一區（索引），-1＝不在有車站的區 */
  di: number[];
  /** 路網圖缺段，以直線從同線軌道端點補到車站 */
  approx: boolean;
}

/** 每格是該小時內公告的發車間隔區間 [最短, 最長]（分鐘）；停駛或不在營運時段為 null（AD-5） */
export type HeadwayHours = ([number, number] | null)[];

export interface Landmark {
  id: string;
  name: string;
  /** 示意造型的種類（AD-23），前端只拿它對造型 */
  kind: string;
  lon: number;
  lat: number;
  /** 連到的車站：站 ID（AD-2 的例外）；用目前月份的 stations.json 換成索引，當月沒有就略過 */
  station: string;
  /** 所屬行政區 8 碼代碼，由管線用 AD-9 同一套界線判定（AD-25） */
  district: string;
  /** venues.csv 的 venue_id，沒有為 null */
  venue: string | null;
}

export interface BasemapSource extends DataSource {
  /** true＝選用來源缺檔，這一版沒有用到（sha256、retrieved 為空字串） */
  missing?: boolean;
  note?: string;
}

/** web/public/data/basemap.json：不分月份的底圖（AD-21） */
export interface BasemapFile {
  v: number;
  /** 只換內容（新的 DEM、河道）就加一；改形狀才升 v（AD-18） */
  basemapRevision: number;
  /** 站與路線以這個月份的車站產生（最新月份） */
  stationsMonth: string;
  /** 底座範圍 [西, 南, 東, 北] */
  bbox: [number, number, number, number];
  /** 台地高度（公尺）；場景高度只經 projection.ts 的 elevation()（AD-12） */
  levels: number[];
  lines: { id: LineId; name: string }[];
  districts: BasemapDistrict[];
  /** 底座上、21 區以外的台地 */
  outside: { terrain: TerrainLevels };
  sea: MultiPolygonCoords;
  /** 底座上、21 區以外的河 */
  outsideWater: MultiPolygonCoords;
  /** 高程等級格網：rows[j][i] 是 (lon0 + i·step, lat0 − j·step) 的等級 0–6（≥ 幾層），給 terrainLevelAt() 用 */
  grid: { lon0: number; lat0: number; step: number; nx: number; ny: number; rows: string[] };
  tracks: BasemapTrack[];
  /** 站 ID → 路線（LineId 順序）；環狀線站為 ["Y"] */
  stationLines: Record<string, LineId[]>;
  /** 有班距資料的路線（環狀線沒有）→ 平日／假日各 24 格 */
  headway: Partial<Record<LineId, Record<DayType, HeadwayHours>>>;
  landmarks: Landmark[];
  sources: BasemapSource[];
  notes: string[];
}
