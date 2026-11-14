// 列車（3.14，示意）：官方班距 → 同線相鄰兩車的間隔，以及營運時段。純函式，場景（scene/Trains.tsx）每格呼叫。
// 班距只讀 basemap.json 的 headway（AD-1、AD-21）：每格是該小時公告的發車間隔 [最短, 最長]（分鐘），
// 營運外為 null（AD-5）；環狀線不在資料裡，沒有列車（AD-23）。
//
// 間隔「真實的比例」、位置示意：相鄰兩車的距離＝代表班距 × GAP_PER_MIN；車在畫面上跑多快是示意。
import type { Headway } from "./periods";
import type { DayType, HeadwayHours, LineId } from "./types";

/** 每分鐘班距換成幾個場景單位（1.6 單位約 680 公尺，約 41 km/h，接近捷運表定速度；原型同值）。 */
export const GAP_PER_MIN = 1.6;
/** 播放中，班距在整點前多久開始換成下一小時的（小時）。 */
export const GAP_BLEND = 0.25;
/** 播放中，首班車長出與收班縮小的時間（小時）。 */
export const SERVICE_RAMP = 0.1;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const wrap = (h: number) => ((h % 24) + 24) % 24;

/** 一小時的代表班距（分鐘）：公告區間的中點。跨兩個時段的小時（例如 19 點 [6, 10]）兩端各代表一部分。null 或不合理的值 → null。 */
export function headwayMinutes(h: readonly [number, number] | null | undefined): number | null {
  if (!h) return null;
  const m = (h[0] + h[1]) / 2;
  return Number.isFinite(m) && m > 0 ? m : null;
}

/** 有班距、要畫列車的路線（環狀線沒有鍵，不畫）。 */
export function trainLines(headway: Headway | undefined): Set<LineId> {
  return new Set(Object.keys(headway ?? {}).filter((k) => headway?.[k as LineId]) as LineId[]);
}

export interface TrainGap {
  /** 同線同向相鄰兩車的距離（場景單位）；沒有列車時 0 */
  gap: number;
  /** 0–1：列車縮放（首班長出、收班縮小）；0＝這一刻沒有列車 */
  presence: number;
}

/**
 * 時刻 t 的列車間隔與出現程度。smooth＝播放中：整點前 GAP_BLEND 小時平滑換間隔，首班與收班前後 SERVICE_RAMP 小時縮放；
 * 否則（暫停、減少動態）直接用 t 所在整點的值。
 */
export function trainGap(hours: HeadwayHours | undefined, t: number, smooth_: boolean, out: TrainGap = { gap: 0, presence: 0 }): TrainGap {
  const x = wrap(t);
  const h0 = Math.floor(x) % 24;
  const m0 = headwayMinutes(hours?.[h0]);
  if (m0 === null) {
    out.gap = 0;
    out.presence = 0;
    return out;
  }
  if (!smooth_) {
    out.gap = m0 * GAP_PER_MIN;
    out.presence = 1;
    return out;
  }
  const f = x - Math.floor(x);
  const prev = headwayMinutes(hours?.[(h0 + 23) % 24]);
  const next = headwayMinutes(hours?.[(h0 + 1) % 24]);
  const m = next === null ? m0 : m0 + (next - m0) * smooth(1 - GAP_BLEND, 1, f);
  out.gap = m * GAP_PER_MIN;
  out.presence = (prev === null ? smooth(0, SERVICE_RAMP, f) : 1) * (next === null ? 1 - smooth(1 - SERVICE_RAMP, 1, f) : 1);
  return out;
}

/** 一段軌道上（長 len）同一方向的列車位置：從段頭起每 gap 一班，相位 phase（只取小數）讓整串往前流。回傳班數。 */
export function trainSlots(len: number, gap: number, phase: number, out: number[]): number {
  out.length = 0;
  if (!(gap > 0) || !(len > 0)) return 0;
  const f = phase - Math.floor(phase);
  // 上限防呆：間隔極小時不無限迴圈
  for (let k = 0; k < 512; k++) {
    const s = gap * (k + f);
    if (s >= len) break;
    out.push(s);
  }
  return out.length;
}

/** 該日型該小時有沒有任何一線在營運（班距不為 null）。 */
export function anyTrainAt(headway: Headway | undefined, dayType: DayType, hour: number): boolean {
  const h = wrap(Math.floor(hour)) % 24;
  return Object.values(headway ?? {}).some((d) => headwayMinutes(d?.[dayType]?.[h]) !== null);
}

/**
 * 播放中從 prevT 走到 t，有沒有跨過「第一班車」的整點：該整點有任一線班距、前一小時全部沒有。
 * 往回走或一次跳超過半小時（拖時間軸、換時段）不算；23→0 點的換日照常判斷。
 */
export function serviceStartCrossed(headway: Headway | undefined, dayType: DayType, prevT: number, t: number): boolean {
  let to = t;
  if (to < prevT && prevT - to > 12) to += 24;
  if (!(to > prevT) || to - prevT > 0.5) return false;
  for (let H = Math.floor(prevT) + 1; H <= to; H++) {
    if (anyTrainAt(headway, dayType, H) && !anyTrainAt(headway, dayType, H - 1)) return true;
  }
  return false;
}
