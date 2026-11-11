// 畫面狀態的唯一一份（AD-16）。目前有時刻、播放、速度、靜態模式、日型、圖層開關（2.3、3.5、3.3）；
// hour、dayType 由 state/url.ts 的 syncUrl() 寫回網址（3.3），之後的票再加 month、district、station、date、commute。
// 播放用的連續時間 t 是非 React 欄位（time.t），由 clock.ts 推進；場景在 useFrame 讀它，React 只訂閱整數 hour。
import { useSyncExternalStore } from "react";
import type { DayType } from "../data/types";

export type Speed = 1 | 2;

export type LayerKey = "flow" | "water" | "green" | "rail" | "building" | "label";

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
}

/** 連續時間（0–24 時）：非 React 欄位，每格由 clock 改寫。 */
export const time = { t: 8 };

let state: ViewState = {
  hour: 8,
  playing: false,
  speed: 1,
  still: false,
  dayType: "weekday",
  layers: { flow: true, water: true, green: true, rail: true, building: true, label: true },
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
