// 網址是畫面狀態的序列化，只在這裡讀寫（AD-16）。
// 4.3 先放分享卡要用的寫出函式；時間軸那張票（3.x）把畫面狀態 store 與讀回網址接上時擴充這裡，鍵名不變。
// 車站在網址裡用站 ID（AD-2），不用陣列索引；索引跨月份不通用。
import type { DayType } from "../data/types";

export interface UrlState {
  month?: string;
  dayType?: DayType;
  /** 進站時段 0–23（AD-15） */
  hour?: number;
  /** 通勤：起站、迄站的站 ID 與出發時段 */
  commute?: { o: string; d: string; h: number };
}

/** 固定順序的 query 鍵，讓同一個狀態永遠產生同一個網址。 */
export function toQuery(s: UrlState): string {
  const q = new URLSearchParams();
  if (s.month) q.set("month", s.month);
  if (s.dayType) q.set("day", s.dayType);
  if (s.hour !== undefined) q.set("hour", String(s.hour));
  if (s.commute) {
    q.set("from", s.commute.o);
    q.set("to", s.commute.d);
    q.set("at", String(s.commute.h));
  }
  return q.toString();
}

/** 目前網站的根網址（不含 query 與 hash）。 */
export function siteBase(): string {
  return `${location.origin}${location.pathname}`;
}

/** 這個狀態的分享網址：分享卡、Web Share 都用這個函式（AD-17）。 */
export function shareUrl(s: UrlState, base: string = siteBase()): string {
  const q = toQuery(s);
  const u = new URL(base);
  u.search = q;
  u.hash = "";
  return u.toString();
}

/** 印在圖上的短網址：去掉協定、query 與結尾斜線（圖上的長 query 讀不了也點不了）。 */
export function siteLabel(url: string): string {
  const u = new URL(url);
  return `${u.host}${u.pathname}`.replace(/\/+$/, "");
}
