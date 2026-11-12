// 時段（3.3，原型 hourTitle 移植）：時間軸副標與播放中浮出的時段名、拖曳條上的停止營運區段。
// 有沒有營運只看資料（該小時整格 null＝停止營運，AD-5），這裡不寫死 2–4 點；5 點是第一班車前後。
import type { BasemapFile, DayType } from "./types";

export const CLOSED = "停止營運";

/** 某個小時的時段名。operating＝該日型該小時有資料（不是整格 null）。 */
export function periodName(hour: number, dayType: DayType, operating: boolean): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h === 5) return "第一班車前後";
  if (!operating) return CLOSED;
  if (h === 6) return "城市醒來";
  if (h >= 7 && h < 10) return dayType === "weekday" ? "早晨通勤尖峰" : "假日早晨";
  if (h >= 10 && h < 12) return "上午";
  if (h >= 12 && h < 14) return "午間";
  if (h >= 14 && h < 17) return "下午";
  if (h >= 17 && h < 20) return dayType === "weekday" ? "傍晚下班尖峰" : "假日傍晚";
  if (h >= 20 && h < 23) return "夜晚";
  return "末班車時段";
}

/** 浮出時的副標（原型 TOAST_SUB）：只描述畫面會看到的變化，不帶數字。 */
const HINTS: Record<string, string> = {
  早晨通勤尖峰: "線條變粗、光點變快",
  傍晚下班尖峰: "人潮往回流",
  城市醒來: "第一波人潮出門",
  末班車時段: "列車漸漸收班",
};

export function periodHint(name: string): string | undefined {
  return HINTS[name];
}

/**
 * 要不要浮出時段名：播放中、時段名換了，而且不是開場第一次（prev 為 null）。
 * 停止營運不浮出：那段時間由常駐的睡覺提示（SleepHint，3.4）說明，兩個不疊在同一個位置。
 */
export function shouldToast(prev: string | null, next: string, playing: boolean): boolean {
  return playing && prev !== null && prev !== next && next !== CLOSED;
}

/**
 * 小卡標題列上「正在看的時段與日型」（3.6 共用卡框；走查 2026-11-11 F1）：
 * 「平日 8 點」「假日整天」；停止營運的小時加「・停止營運」。車站、通勤、活動卡共用。
 */
export function whenLabel(dayType: DayType, hour: number | "day", operating = true): string {
  const day = dayType === "weekday" ? "平日" : "假日";
  if (hour === "day") return `${day}整天`;
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  return `${day} ${h} 點${operating ? "" : `・${CLOSED}`}`;
}

/** 停止營運的區段（半開區間 [起, 迄)，小時），給拖曳條標示；全天營運回傳空陣列。 */
export function closedRanges(isOpen: (hour: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let h = 0; h <= 24; h++) {
    const closed = h < 24 && !isOpen(h);
    if (closed && start < 0) start = h;
    if (!closed && start >= 0) {
      out.push([start, h]);
      start = -1;
    }
  }
  return out;
}

// ── 城市睡覺（3.4）：停駛時的提示文字、第一班車、場景入睡程度 ──

export type Headway = BasemapFile["headway"];

/**
 * 第一班車約幾點：從 hour（含）往後找，該日型第一個「任一線公告班距不為 null」的整點（basemap.json headway，
 * 臺北捷運公告的發車間隔）。往後 24 小時都沒有就回傳 null（不推、不寫時間）。
 */
export function firstTrainHour(headway: Headway | undefined, dayType: DayType, hour: number): number | null {
  if (!headway) return null;
  const lines = Object.values(headway).map((h) => h?.[dayType]);
  const h0 = ((Math.floor(hour) % 24) + 24) % 24;
  for (let k = 0; k < 24; k++) {
    const h = (h0 + k) % 24;
    if (lines.some((arr) => arr?.[h] != null)) return h;
  }
  return null;
}

export const SLEEP_TITLE = "捷運停駛中";

/** 睡覺提示：標題固定；第一班車推得出才加「約 6 點第一班車」。 */
export function sleepHint(first: number | null): { title: string; sub: string | null } {
  return { title: SLEEP_TITLE, sub: first === null ? null : `約 ${first} 點第一班車` };
}

/** 停駛前的過渡（小時）：停駛前這段由 0 升到 1。1x 播放約 0.5 秒。 */
export const SLEEP_RAMP = 0.25;

/**
 * 時刻 t（0–24 連續）的入睡程度 0–1：停駛區段內 1；區段開始前 ramp 小時線性升（流向在停駛前淡出）；
 * 區段一結束就回到 0（醒來由 5 點的時段名浮出與 3.14 的第一班車接手）。ramp＝0（減少動態）就是階梯。
 * 跨午夜也照時鐘距離算。是時刻的純函式，不是另開的動畫。
 */
export function sleepLevel(t: number, ranges: readonly [number, number][], ramp: number = SLEEP_RAMP): number {
  const x = ((t % 24) + 24) % 24;
  let s = 0;
  for (const [a, b] of ranges) {
    if (x >= a && x < b) return 1;
    if (ramp <= 0) continue;
    const before = (((a - x) % 24) + 24) % 24; // 離停駛開始還有多久
    if (before > 0 && before <= ramp) s = Math.max(s, 1 - before / ramp);
  }
  return s;
}
