// 檢視模型（AD-19）：場景圖層不 import 契約型別，只吃這裡產生的形狀。
// 2.3 先放底圖：basemap.json＋districts.json → BaseView。流向、車站的 frame 由之後的票加在這裡。
import type { BasemapFile, DistrictsFile, LineId, LonLat, MultiPolygonCoords } from "./types";

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
