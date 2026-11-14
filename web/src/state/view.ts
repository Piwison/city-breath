// 畫面狀態的唯一一份（AD-16）。時刻、播放、速度、靜態模式、日型、圖層開關（2.3、3.5、3.3）；
// 選中的行政區、站、卡片範圍與聚焦的流向（3.6）；通勤的起站（3.12 車站卡寫、4.1 接手）。
// hour、dayType 由 state/url.ts 的 syncUrl() 寫回網址（3.3）；district、station 由 3.15 加進網址，之後再加 month、date、commute。
// 播放用的連續時間 t 是非 React 欄位（time.t），由 clock.ts 推進；場景在 useFrame 讀它，React 只訂閱整數 hour。
import { useSyncExternalStore } from "react";
import type { DayType } from "../data/types";
import type { DistrictRange } from "../data/views";

export type Speed = 1 | 2;

export type LayerKey = "flow" | "water" | "green" | "rail" | "station" | "building" | "train" | "cloud" | "label";

export interface ViewState {
  /** 進站時段 0–23（AD-15），由 t 取整 */
  hour: number;
  playing: boolean;
  /** 播放速度：1x＝一天 48 秒，2x＝24 秒 */
  speed: Speed;
  /** 靜態模式：不播放、光點換成光帶、鏡頭不飛（減少動態時開場就開；不保存，AD-22） */
  still: boolean;
  /** 平日／假日（AD-4） */
  dayType: DayType;
  /** 圖層開關；不保存（AD-16、AD-22） */
  layers: Record<LayerKey, boolean>;
  /** 選中的行政區（8 碼代碼，AD-9）；null＝全城（3.6）。3.15 才寫進網址 */
  district: string | null;
  /** 選中的站（站 ID，AD-2：不用跨月份不通用的索引）；null＝沒有選站 */
  station: string | null;
  /** 行政區卡的範圍：這一小時／整天 */
  range: DistrictRange;
  /** 聚焦的流向（views.ts flowKey「起區>迄區」，選站時是「起站 ID>迄站 ID」）：這條照常、其他變淡；null＝不聚焦 */
  focus: string | null;
  /**
   * 通勤（AD-16 的 commute）：3.12 車站卡「從這站找通勤」先寫起站 o（站 ID，AD-2），通勤入口打開並帶入；
   * 4.1 的「找車站／通勤」入口接手，再加迄站與時段。null＝沒有在找通勤。
   */
  commute: { o: string } | null;
}

/** 連續時間（0–24 時）：非 React 欄位，每格由 clock 改寫。 */
export const time = { t: 8 };

let state: ViewState = {
  hour: 8,
  playing: false,
  speed: 1,
  still: false,
  dayType: "weekday",
  layers: { flow: true, water: true, green: true, rail: true, station: true, building: true, train: true, cloud: true, label: true },
  district: null,
  station: null,
  range: "hour",
  focus: null,
  commute: null,
};
const listeners = new Set<() => void>();

export function getView(): ViewState {
  return state;
}

export function subscribeView(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch: Partial<ViewState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}

/** 訂閱畫面狀態的一部分；選出的值不變時不重繪。 */
export function useView<T>(select: (s: ViewState) => T): T {
  return useSyncExternalStore(subscribeView, () => select(state), () => select(state));
}

/** 寫入連續時間；整數 hour 變了才通知 React。只由 clock.ts 呼叫。 */
export function writeTime(t: number) {
  time.t = t;
  const hour = Math.floor(t) % 24;
  if (hour !== state.hour) set({ hour });
}

export function setPlaying(playing: boolean) {
  if (playing !== state.playing) set({ playing });
}

export function setSpeed(speed: Speed) {
  if (speed !== state.speed) set({ speed });
}

/** 只改旗標；「停止播放、跳到 8 點」由 clock.ts 的 setStillMode() 負責。 */
export function setStill(still: boolean) {
  if (still !== state.still) set({ still });
}

export function setDayType(dayType: DayType) {
  if (dayType !== state.dayType) set({ dayType });
}

export function setLayer(key: LayerKey, on: boolean) {
  if (state.layers[key] !== on) set({ layers: { ...state.layers, [key]: on } });
}

// ── 選取（3.6）：行政區、站、聚焦的流向。小卡由選取決定開哪一張；暫停交給共用卡框（cardOpened）。 ──

/** 選一區（null＝回到全城）：換區時清掉選站與聚焦；整天／這一小時的選擇保留。 */
export function selectDistrict(district: string | null) {
  if (district === state.district && state.station === null && state.focus === null) return;
  set({ district, station: null, focus: null });
}

/** 選一站（站 ID）；行政區維持，回到行政區卡＝selectStation(null)。 */
export function selectStation(station: string | null) {
  if (station !== state.station || state.focus !== null) set({ station, focus: null });
}

export function setRange(range: DistrictRange) {
  if (range !== state.range) set({ range });
}

/** 聚焦一條流向（再點同一條或 null 取消）。 */
export function setFocus(focus: string | null) {
  if (focus !== state.focus) set({ focus });
}

/** 關掉小卡：回到全城、不選站不聚焦；播放維持暫停（走查 F1）。 */
export function closeCard() {
  if (state.district !== null || state.station !== null || state.focus !== null) set({ district: null, station: null, focus: null });
}

/** 從某站找通勤（3.12 車站卡）：寫起站，通勤入口打開並帶入（4.1 接手）。每次按都是新物件，讓入口再打開一次。 */
export function startCommute(o: string) {
  set({ commute: { o } });
}

/** 收起通勤（入口關掉時）。 */
export function clearCommute() {
  if (state.commute !== null) set({ commute: null });
}

/** 任何小卡打開就暫停播放（共用卡框掛上時呼叫；走查 2026-11-11 F1）。關卡不恢復播放。 */
export function cardOpened() {
  setPlaying(false);
}
