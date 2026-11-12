// 時段（3.3，原型 hourTitle 移植）：時間軸副標與播放中浮出的時段名、拖曳條上的停止營運區段。
// 有沒有營運只看資料（該小時整格 null＝停止營運，AD-5），這裡不寫死 2–4 點；5 點是第一班車前後。
import type { DayType } from "./types";

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
  [CLOSED]: "捷運休息中",
};

export function periodHint(name: string): string | undefined {
  return HINTS[name];
}

/** 要不要浮出時段名：播放中、時段名換了，而且不是開場第一次（prev 為 null）。 */
export function shouldToast(prev: string | null, next: string, playing: boolean): boolean {
  return playing && prev !== null && prev !== next;
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
