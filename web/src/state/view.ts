// 畫面狀態的唯一一份（AD-16）。時刻、播放、速度、靜態模式、日型、圖層開關（2.3、3.5、3.3）；
// 選中的行政區、站、卡片範圍與聚焦的流向（3.6）；通勤的起站、迄站與時段（3.12 車站卡帶入起站，4.1 的通勤面板）。
// month、hour、dayType、district、station 與起訖都選好的 commute 由 state/url.ts 的 syncUrl() 寫回網址（3.3、3.15、4.2），之後再加 date。
// 播放用的連續時間 t 是非 React 欄位（time.t），由 clock.ts 推進；場景在 useFrame 讀它，React 只訂閱整數 hour。
import { useSyncExternalStore } from "react";
import type { DayType } from "../data/types";
import type { DistrictRange } from "../data/views";
import { track } from "../track";

export type Speed = 1 | 2;

export type LayerKey = "flow" | "water" | "green" | "rail" | "station" | "building" | "train" | "cloud" | "label";

export interface ViewState {
  /** 正在看的資料月份（YYYY-MM，資料載入後寫；這一版不做月份切換，決定 28）；null＝還沒載入 */
  month: string | null;
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
  /** 選中的行政區（8 碼代碼，AD-9）；null＝全城（3.6）。3.15 起寫進網址 */
  district: string | null;
  /** 選中的站（站 ID，AD-2：不用跨月份不通用的索引）；null＝沒有選站 */
  station: string | null;
  /** 行政區卡的範圍：這一小時／整天 */
  range: DistrictRange;
  /** 聚焦的流向（views.ts flowKey「起區>迄區」，選站時是「起站 ID>迄站 ID」）：這條照常、其他變淡；null＝不聚焦 */
  focus: string | null;
  /**
   * 通勤（AD-16 的 commute）：起站 o、迄站 d（站 ID，AD-2；還沒選是 null）與出發時段 h（進站時段，AD-15）。
   * 非 null＝通勤面板開著（4.1）；車站卡「從這站找通勤」（3.12）帶入起站。起訖都選好且不同站（commuteReady）＝通勤卡（4.2），
   * 起訖與時段寫進網址。時段只有一份：通勤開著時 h 跟著 hour（writeTime），卡內時間列與「早晚一小時」都經 clock 換時段。
   */
  commute: Commute | null;
  /**
   * 小卡的高度（3.22，決定 10）：peek＝摘要（約三分之一），full＝完整（約七成）。不進網址、不保存；
   * 開卡從摘要開始，行政區卡與車站卡之間切換時維持，關卡回到摘要。
   */
  sheet: SheetDetent;
}

export type SheetDetent = "peek" | "full";

export interface Commute {
  o: string | null;
  d: string | null;
  h: number;
}

/** 連續時間（0–24 時）：非 React 欄位，每格由 clock 改寫。 */
export const time = { t: 8 };

let state: ViewState = {
  month: null,
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
  sheet: "peek",
};
const listeners = new Set<() => void>();
/** 已送過 commute_result_shown 的起訖組（「起站>迄站」）；換起訖、收起通勤時重設。 */
let shownCommute: string | null = null;

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
  if (hour === state.hour) return;
  // 通勤的時段跟著畫面的時刻（4.2）：卡內時間列、早晚一小時、網址的 hour 與 at 一致
  const c = state.commute;
  set(c && c.h !== hour ? { hour, commute: { ...c, h: hour } } : { hour });
}

export function setMonth(month: string | null) {
  if (month !== state.month) set({ month });
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
  const opened = district !== null && district !== state.district;
  // 在地圖上點了別的區：通勤卡（蓋在最上面）收起，露出那張行政區卡
  set(opened ? { district, station: null, focus: null, ...noCommute() } : { district, station: null, focus: null });
  // 計數（AD-20）：打開一張行政區卡；不帶是哪一區
  if (opened) track("district_opened");
}

/** 選一站（站 ID）；行政區維持，回到行政區卡＝selectStation(null)。 */
export function selectStation(station: string | null) {
  if (station === state.station && state.focus === null) return;
  const opened = station !== null && station !== state.station;
  set(opened ? { station, focus: null, ...noCommute() } : { station, focus: null });
  // 計數（AD-20）：打開一張車站卡；不帶是哪一站
  if (opened) track("station_opened");
}

/** 打開分享連結時還原選取（3.15）：行政區與站一起寫（從行政區卡進的車站卡，回上一層到那一區）。 */
export function restoreSelection(district: string | null, station: string | null) {
  set({ district, station, focus: null });
  // 從分享連結打開的卡也算打開（AD-20）：連結還原出車站卡就是車站卡，否則有區就是行政區卡
  if (station !== null) track("station_opened");
  else if (district !== null) track("district_opened");
}

export function setRange(range: DistrictRange) {
  if (range !== state.range) set({ range });
}

/** 聚焦一條流向（再點同一條或 null 取消）。 */
export function setFocus(focus: string | null) {
  if (focus !== state.focus) set({ focus });
}

/** 關掉小卡：回到全城、不選站不聚焦、收起通勤；播放維持暫停（走查 F1）。 */
export function closeCard() {
  if (state.district !== null || state.station !== null || state.focus !== null || state.sheet !== "peek" || state.commute !== null)
    set({ district: null, station: null, focus: null, sheet: "peek", ...noCommute() });
}

/** 小卡切到摘要或完整（把手、上下滑、鍵盤；3.22）。 */
export function setSheet(sheet: SheetDetent) {
  if (sheet !== state.sheet) set({ sheet });
}

/**
 * 打開通勤面板（4.1）：起訖預設留空，已選了一站就帶入當起站（不放無關的預設站）；時段先用畫面上的整點。
 * 每次都是新物件，讓面板再打開一次。打開就暫停（和開卡一樣，4.2）：通勤的時段跟著時刻，不能跟著播放跑。
 */
export function openCommute(o: string | null = state.station) {
  shownCommute = null;
  set({ commute: { o, d: null, h: state.hour }, playing: false });
}

/** 打開分享連結時還原通勤卡（4.2）：起訖與時段一起寫；時刻由呼叫端 seek 到 h（url.ts planLink 已檢查站）。 */
export function restoreCommute(c: { o: string; d: string; h: number }) {
  shownCommute = null;
  set({ commute: { ...c }, playing: false });
}

/** 起訖都選好、不同站＝通勤卡（4.2）；否則是通勤面板（還在選）或沒開。 */
export function commuteReady(c: Commute | null): c is { o: string; d: string; h: number } {
  return c !== null && c.o !== null && c.d !== null && c.o !== c.d;
}

/** 從某站找通勤（3.12 車站卡）：起站＝這站，打開通勤面板。 */
export function startCommute(o: string) {
  openCommute(o);
}

/** 改通勤的起站、迄站或時段（面板沒開時不做事）。 */
export function setCommute(patch: Partial<Commute>) {
  const c = state.commute;
  if (!c) return;
  const next = { ...c, ...patch };
  if (next.o === c.o && next.d === c.d && next.h === c.h) return;
  // 換了起訖：下一次看到結果再算一次
  if (next.o !== c.o || next.d !== c.d) shownCommute = null;
  set({ commute: next });
}

/** 收起通勤（面板或通勤卡關掉時）。 */
export function clearCommute() {
  if (state.commute !== null) set(noCommute());
}

/** 收起通勤的 patch（並重設「看過結果」）。 */
function noCommute(): Pick<ViewState, "commute"> {
  shownCommute = null;
  return { commute: null };
}

/**
 * 通勤卡上出現結果（od 分片載好）時呼叫（AD-20）：同一組起訖只送一次 commute_result_shown，
 * 換時段、換平日假日不重送；換了起訖或收起後再開再送。不帶 props（不送站名）。
 */
export function commuteResultShown(o: string, d: string) {
  const key = `${o}>${d}`;
  if (key === shownCommute) return;
  shownCommute = key;
  track("commute_result_shown");
}

/** 任何小卡打開就暫停播放（共用卡框掛上時呼叫；走查 2026-11-11 F1）。關卡不恢復播放。 */
export function cardOpened() {
  setPlaying(false);
}
