// 車站卡的類型標籤（3.12，產品計畫 v2 決定 13，AD-27）：顯示這站整年最常見的那一型（station-types.json，
// 管線算好的），不是當月歸到的型；當月 stations.json 的 type 不同時多一行「這個月偏 X」。
// 前端只查表：不自己統計 12 個月、不自己分類。環狀線站與檔裡沒有的站不顯示標籤。
import { useEffect, useState } from "react";
import { loadStationTypes } from "./load";
import type { Station, StationType, StationTypesFile } from "./types";

export type StationTypesState =
  | { status: "loading" }
  | { status: "ok"; file: StationTypesFile }
  | { status: "error"; message: string };

export interface TypeLabel {
  id: number;
  label: string;
  description: string;
  /** 當月歸到的型與整年最常見的不同時，當月那一型的名稱；相同或當月沒有類型時為 null */
  monthly: string | null;
}

/** 這站的類型標籤；環狀線站（出站未入檔）、檔還沒到或檔裡沒有這站時為 null。名稱與一句話查當月 types[]。 */
export function stationTypeLabel(station: Station, types: readonly StationType[], yearly: StationTypesFile | null): TypeLabel | null {
  if (!station.exitsRecorded || !yearly) return null;
  const row = yearly.stations[station.id];
  const t = row ? types[row.type] : undefined;
  if (!t || t.id !== row.type) return null;
  const now = station.type === null ? undefined : types[station.type];
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    monthly: now && now.id !== t.id ? now.label : null,
  };
}

/** 「2025 年 10 月～2026 年 9 月」：類型擬合的月份範圍（卡底說明用）。 */
export function fitRangeLabel(file: StationTypesFile): string {
  const m = (s: string) => `${s.slice(0, 4)} 年 ${Number(s.slice(5))} 月`;
  const first = file.fitMonths[0];
  const last = file.fitMonths[file.fitMonths.length - 1];
  return first === last ? m(first) : `${m(first)}～${m(last)}`;
}

/** 打開車站卡才載 station-types.json（約 5 KB，AD-6）；load.ts 快取，只抓一次。 */
export function useStationTypes(): StationTypesState {
  const [state, setState] = useState<StationTypesState>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadStationTypes()
      .then((file) => alive && setState({ status: "ok", file }))
      .catch((e: Error) => alive && setState({ status: "error", message: e.message }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
