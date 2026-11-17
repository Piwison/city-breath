// 這一小時地圖上要畫的流向與線寬比例（3.21）：緞帶（Flows）與時間軸下的圖例（FlowLegend）共用同一份，
// 圖例寫的「最粗 N 人」一定是畫面上最粗的那條（產品計畫 v2 決定 7）。
// 全城＝前 12 大；選了區＝這區前 5 去哪＋前 5 誰來；選了站（3.12）＝這站前 5 目的地（od 分片，load.ts 快取，車站卡共用）。
import { useMemo } from "react";
import { useOdShard } from "../data/useOdShard";
import {
  flowScale,
  PEOPLE_PER_DOT,
  stationDestinations,
  stationFlows,
  type FlowHour,
  type FlowMode,
  type FlowScale,
  type FlowSource,
  type StationIndex,
} from "../data/views";
import { useView } from "../state/view";

/** 選了站、分片還沒到（或載入失敗）時：不畫緞帶（不是停止營運）。 */
const NO_FLOWS: FlowHour = { flows: [], perDot: PEOPLE_PER_DOT, counts: [] };

export interface FlowNow {
  mode: FlowMode;
  now: FlowHour;
  scale: FlowScale;
  /** 選站時 od 分片到了沒有（換情境的判斷用） */
  shardReady: boolean;
  /** 選站時起站在 stations.json 的索引 */
  origin: number | undefined;
}

export function useFlowNow(source: FlowSource | undefined, stations: StationIndex | undefined): FlowNow | null {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const od = useOdShard(stations?.month ?? "", stations ? station : null);
  const origin = station === null || !stations ? undefined : stations.byId.get(station);
  return useMemo(() => {
    if (!source) return null;
    let mode: FlowMode = district === null ? "city" : "district";
    let now: FlowHour;
    if (origin !== undefined && stations) {
      mode = "station";
      now = od.status === "ok" ? stationFlows(stationDestinations(od.shard, origin, dayType, hour), origin, stations.stations) : NO_FLOWS;
    } else now = district === null ? source.at(dayType, hour) : source.district(dayType, hour, district);
    return { mode, now, scale: flowScale(mode, now.flows, source.max, source.legend), shardReady: od.status === "ok", origin };
  }, [source, stations, origin, od, district, dayType, hour]);
}
