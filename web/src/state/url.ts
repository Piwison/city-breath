// 網址是畫面狀態的序列化，只在這裡讀寫（AD-16）。
// 4.3 放了分享卡用的寫出函式；3.5 開場讀回 hour 與 day；3.3 把 hour、dayType 寫回網址（syncUrl）。
// 擴充（3.15 的月份、行政區、站，4.2 的通勤，7.4 的日期）：在 UrlState、KEYS、readQuery、toQuery 加鍵，
// 再在 urlStateOf() 從畫面狀態取值；writeQuery 會保留這裡不認得的鍵，所以先後上線的票不會互相洗掉網址。
// 車站在網址裡用站 ID（AD-2），不用陣列索引；索引跨月份不通用。
import type { DayType } from "../data/types";
import { getView, subscribeView, type ViewState } from "./view";

export interface UrlState {
  month?: string;
  dayType?: DayType;
  /** 進站時段 0–23（AD-15） */
  hour?: number;
  /** 通勤：起站、迄站的站 ID 與出發時段 */
  commute?: { o: string; d: string; h: number };
}

/** 這裡管的 query 鍵（固定順序）；其他鍵原樣保留在後面。 */
const KEYS = ["month", "day", "hour", "from", "to", "at"] as const;

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

const hourOf = (v: string | null): number | undefined =>
  v !== null && /^\d{1,2}$/.test(v) && Number(v) <= 23 ? Number(v) : undefined;

/** 讀網址 query（AD-16：網址只在這裡讀寫）。不合法的值忽略，不丟錯。 */
export function readQuery(search: string): UrlState {
  const q = new URLSearchParams(search);
  const out: UrlState = {};
  const month = q.get("month");
  if (month !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) out.month = month;
  const day = q.get("day");
  if (day === "weekday" || day === "holiday") out.dayType = day;
  const hour = hourOf(q.get("hour"));
  if (hour !== undefined) out.hour = hour;
  const o = q.get("from");
  const d = q.get("to");
  const at = hourOf(q.get("at"));
  if (o && d && at !== undefined) out.commute = { o, d, h: at };
  return out;
}

/**
 * 把 patch 合進現有的 query：這裡管的鍵依固定順序重寫（patch 裡 undefined 的鍵沿用原值），
 * 不認得的鍵（之後的票、外部追蹤參數）原樣留在後面。
 */
export function writeQuery(search: string, patch: UrlState, drop: readonly (keyof UrlState)[] = []): string {
  const merged: UrlState = { ...readQuery(search) };
  for (const [k, v] of Object.entries(patch) as [keyof UrlState, UrlState[keyof UrlState]][]) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v;
  }
  for (const k of drop) delete merged[k];
  const out = new URLSearchParams(toQuery(merged));
  new URLSearchParams(search).forEach((v, k) => {
    if (!(KEYS as readonly string[]).includes(k)) out.append(k, v);
  });
  return out.toString();
}

/**
 * 畫面狀態中要進網址的部分（3.3：時刻與日型）。播放中不記 hour（Piwi 2026-11-12：網址不要一直變；
 * 播放中重新整理照原本從清晨自動播放），停下來才記。
 */
export function urlStateOf(v: Pick<ViewState, "hour" | "dayType"> & { playing?: boolean }): UrlState {
  return v.playing ? { dayType: v.dayType } : { dayType: v.dayType, hour: v.hour };
}

/** 寫網址的間隔：拖時間軸時不每小時寫一次（Safari 限制 replaceState 次數）。 */
export const URL_WRITE_MS = 300;

/**
 * 畫面狀態 → 網址（Piwi 2026-11-12）：只在使用者操作後寫——暫停（含拖時間軸、打開小卡）寫 day＋hour、
 * 切日型寫 day、按播放把 hour 拿掉；播放中整點變了不寫。都等 URL_WRITE_MS 再用 replaceState 寫一次
 * （不進瀏覽紀錄）。開場自動播放時不寫。回傳取消訂閱的函式。write 可替換（測試用）。
 */
export function syncUrl(
  write: (search: string) => void = (search) => {
    try {
      const url = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
      history.replaceState(history.state, "", url);
    } catch {
      // 瀏覽器拒絕（例如次數上限）：網址晚一點再對上，畫面照常
    }
  },
  read: () => string = () => location.search,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const current = read().replace(/^\?/, "");
    const v = getView();
    const next = writeQuery(current, urlStateOf(v), v.playing ? ["hour"] : []);
    if (next !== current) write(next);
  };
  // 播放中 hour 不算進鍵：整點變了不觸發寫入
  const keyOf = () => `${getView().dayType}:${getView().playing ? "play" : getView().hour}`;
  let key = keyOf();
  // 開場停著（網址有 hour、減少動態）先對一次（例如網址只有 hour，補上 day）；自動播放時不寫
  if (!getView().playing) timer = setTimeout(flush, URL_WRITE_MS);
  const unsub = subscribeView(() => {
    const k = keyOf();
    if (k === key) return;
    key = k;
    if (timer === undefined) timer = setTimeout(flush, URL_WRITE_MS);
  });
  return () => {
    unsub();
    if (timer !== undefined) clearTimeout(timer);
  };
}

/** 印在圖上的短網址：去掉協定、query 與結尾斜線（圖上的長 query 讀不了也點不了）。 */
export function siteLabel(url: string): string {
  const u = new URL(url);
  return `${u.host}${u.pathname}`.replace(/\/+$/, "");
}
