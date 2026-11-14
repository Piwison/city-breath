// 營運時段（3.4 城市睡覺）：這個日型、這個小時有沒有停駛，第一班車約幾點，場景此刻入睡多少。
// 停駛只看資料（district-flows.json 整小時 null，AD-5），不寫死 2–4 點；第一班車只看 basemap.json 的官方班距。
// 資料載入後由 ScenePage 呼叫 setService()；還沒載入時一律當作營運中（不顯示睡覺狀態）。
//
// 給其他場景元件的接口（例如 3.1 車站柱）：
// - React：`useClosed()`，只在整點或換日型時變。
// - useFrame：`sleepAt(time.t, getView().dayType, reduced)`，0–1，停駛前淡入、停駛中 1；reduced 時是階梯。
// - useFrame：`firstTrainCrossed(dayType, prevT, t)`，播放中走過第一班車的整點（3.14 列車與第一班車波紋）。
import { useSyncExternalStore } from "react";
import { closedRanges, firstTrainHour, SLEEP_RAMP, sleepLevel, type Headway } from "../data/periods";
import { serviceStartCrossed } from "../data/trains";
import type { DayType } from "../data/types";
import { useView } from "./view";

export interface Service {
  /** 該日型該小時有營運（FlowSource.operating） */
  isOpen(dayType: DayType, hour: number): boolean;
  /** 官方班距（basemap.json headway）；沒有就不推第一班車 */
  headway?: Headway;
}

let service: Service | null = null;
let ranges: Partial<Record<DayType, [number, number][]>> = {};
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const read = () => service;

/** 資料載入後設定；null＝清掉（卸載）。 */
export function setService(next: Service | null) {
  if (next === service) return;
  service = next;
  ranges = {};
  for (const fn of listeners) fn();
}

/** 該日型的停駛區段（快取，每格呼叫也不重算）。 */
export function closedRangesOf(dayType: DayType): [number, number][] {
  if (!service) return [];
  const s = service;
  return (ranges[dayType] ??= closedRanges((h) => s.isOpen(dayType, h)));
}

export function closedAt(dayType: DayType, hour: number): boolean {
  return service ? !service.isOpen(dayType, hour) : false;
}

/** 第一班車約幾點（整點）；停駛中才有意義，推不出回傳 null。 */
export function firstTrainAt(dayType: DayType, hour: number): number | null {
  return service ? firstTrainHour(service.headway, dayType, hour) : null;
}

/** 播放中從 prevT 走到 t 有沒有跨過第一班車的整點（和 firstTrainAt 同一份班距；3.14 波紋）。 */
export function firstTrainCrossed(dayType: DayType, prevT: number, t: number): boolean {
  return service ? serviceStartCrossed(service.headway, dayType, prevT, t) : false;
}

/** 時刻 t 的入睡程度 0–1（useFrame 用）；reduced＝減少動態，直接切換。 */
export function sleepAt(t: number, dayType: DayType, reduced = false): number {
  return sleepLevel(t, closedRangesOf(dayType), reduced ? 0 : SLEEP_RAMP);
}

/** React：現在的小時是否停駛。 */
export function useClosed(): boolean {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const svc = useSyncExternalStore(subscribe, read, read);
  return svc ? !svc.isOpen(dayType, hour) : false;
}
