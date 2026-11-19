// 網址是畫面狀態的序列化，只在這裡讀寫（AD-16）。
// 4.3 放了分享卡用的寫出函式；3.5 開場讀回 hour 與 day；3.3 把 hour、dayType 寫回網址（syncUrl）。
// 3.15 加月份、行政區、站（打開連結回到同一張卡），以及 parseQuery（哪些鍵不合法，ScenePage 退回全景並說明）。
// 4.2 加通勤（from、to、at：起站、迄站的站 ID 與出發時段；通勤卡開著時才寫，打開連結回到同一張通勤卡）。
// 擴充（7.4 的日期）：在 UrlState、KEYS、parseQuery、toQuery 加鍵，
// 再在 urlStateOf() 從畫面狀態取值；writeQuery 會保留這裡不認得的鍵，所以先後上線的票不會互相洗掉網址。
// 車站在網址裡用站 ID（AD-2），不用陣列索引；索引跨月份不通用。
import type { DayType } from "../data/types";
import { commuteReady, getView, subscribeView, type ViewState } from "./view";

export interface UrlState {
  month?: string;
  dayType?: DayType;
  /** 進站時段 0–23（AD-15） */
  hour?: number;
  /** 選中的行政區（8 碼代碼，AD-9） */
  district?: string;
  /** 選中的站（站 ID，AD-2） */
  station?: string;
  /** 通勤：起站、迄站的站 ID 與出發時段 */
  commute?: { o: string; d: string; h: number };
}

/** 這裡管的 query 鍵（固定順序）；其他鍵原樣保留在後面。 */
const KEYS = ["month", "day", "hour", "district", "station", "from", "to", "at"] as const;

/** 固定順序的 query 鍵，讓同一個狀態永遠產生同一個網址。 */
export function toQuery(s: UrlState): string {
  const q = new URLSearchParams();
  if (s.month) q.set("month", s.month);
  if (s.dayType) q.set("day", s.dayType);
  if (s.hour !== undefined) q.set("hour", String(s.hour));
  if (s.district) q.set("district", s.district);
  if (s.station) q.set("station", s.station);
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

/** 這張票還原畫面用的鍵（網址裡的名字）；值不合法時列進 ParsedQuery.invalid。 */
export type ViewKey = "month" | "day" | "hour" | "district" | "station" | "commute";

export interface ParsedQuery {
  state: UrlState;
  /** 有出現但值不合法的鍵（格式錯；區或站存不存在要等資料載入後由呼叫端再查） */
  invalid: ViewKey[];
}

const DISTRICT = /^\d{8}$/;
const STATION = /^[A-Za-z0-9_-]{1,32}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 讀網址 query 並記下不合法的鍵（AD-16：網址只在這裡讀寫）。不丟錯。 */
export function parseQuery(search: string): ParsedQuery {
  const q = new URLSearchParams(search);
  const state: UrlState = {};
  const invalid: ViewKey[] = [];
  const check = <T>(key: ViewKey, raw: string | null, ok: (v: string) => T | undefined, put: (v: T) => void) => {
    if (raw === null) return;
    const v = ok(raw);
    if (v === undefined) invalid.push(key);
    else put(v);
  };
  check("month", q.get("month"), (v) => (MONTH.test(v) ? v : undefined), (v) => (state.month = v));
  check("day", q.get("day"), (v) => (v === "weekday" || v === "holiday" ? (v as DayType) : undefined), (v) => (state.dayType = v));
  check("hour", q.get("hour"), hourOf, (v) => (state.hour = v));
  check("district", q.get("district"), (v) => (DISTRICT.test(v) ? v : undefined), (v) => (state.district = v));
  check("station", q.get("station"), (v) => (STATION.test(v) ? v : undefined), (v) => (state.station = v));
  // 通勤（4.2）：三個鍵要一起出現且格式對；只出現一部分或格式錯都算不合法
  const o = q.get("from");
  const d = q.get("to");
  const atRaw = q.get("at");
  if (o !== null || d !== null || atRaw !== null) {
    const at = hourOf(atRaw);
    if (o !== null && d !== null && STATION.test(o) && STATION.test(d) && at !== undefined) state.commute = { o, d, h: at };
    else invalid.push("commute");
  }
  return { state, invalid };
}

/** 讀網址 query（不合法的值忽略，不丟錯）。 */
export function readQuery(search: string): UrlState {
  return parseQuery(search).state;
}

/**
 * 6.4 真機實測：`?debug=perf` 時載入效能面板。只有這個值算數，其他值當作沒有。
 * debug 不是畫面狀態：不在 UrlState、不進 toQuery，所以分享網址（shareUrl、shareLink）不會帶它；
 * writeQuery 保留不認得的鍵，所以網址列上的 debug 在操作後還留著（重新整理仍有面板）。
 */
export function perfDebug(search: string = typeof location === "undefined" ? "" : location.search): boolean {
  return new URLSearchParams(search).get("debug") === "perf";
}

/** 打開連結後要做的事（ScenePage 在資料載入後依這個還原或退回全景）。 */
export type LinkPlan =
  | { kind: "none" }
  | { kind: "fallback"; invalid: ViewKey[] }
  | {
      kind: "restore";
      district: string | null;
      station: string | null;
      /** 通勤卡（4.2）：起訖與時段 */
      commute: { o: string; d: string; h: number } | null;
      /** 連結的月份不是網站顯示的最新月份（這一版不做月份切換，決定 28）：照樣還原，另外說明 */
      staleMonth: string | null;
    };

/**
 * 對照資料檢查連結（3.15）：格式不合法、月份不在 months.json、區或站不存在 → 退回全景；
 * 月份合法但不是最新 → 照樣還原並註明。沒有區、站與通勤的連結（只有時刻、日型）＝none（開場已經停在那一刻）。
 * 通勤（4.2）：起訖都要在資料裡、迄站要有出站紀錄（canBeDest；環狀線不能當迄站）、起訖不同站，否則退回全景。
 */
export function planLink(
  parsed: ParsedQuery,
  data: {
    months: readonly string[];
    latest: string;
    hasDistrict: (id: string) => boolean;
    hasStation: (id: string) => boolean;
    canBeDest?: (id: string) => boolean;
  },
): LinkPlan {
  const invalid = [...parsed.invalid];
  const { month, district, station, commute } = parsed.state;
  const canBeDest = data.canBeDest ?? data.hasStation;
  if (month !== undefined && !data.months.includes(month)) invalid.push("month");
  if (district !== undefined && !data.hasDistrict(district)) invalid.push("district");
  if (station !== undefined && !data.hasStation(station)) invalid.push("station");
  if (commute !== undefined && (commute.o === commute.d || !data.hasStation(commute.o) || !data.hasStation(commute.d) || !canBeDest(commute.d)))
    invalid.push("commute");
  if (invalid.length) return { kind: "fallback", invalid };
  const staleMonth = month !== undefined && month !== data.latest ? month : null;
  if (district === undefined && station === undefined && commute === undefined && staleMonth === null) return { kind: "none" };
  return { kind: "restore", district: district ?? null, station: station ?? null, commute: commute ?? null, staleMonth };
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
 * 畫面狀態中要進網址的部分：月份、日型、時刻、行政區、站（3.3、3.15）與通勤卡的起訖、時段（4.2）。播放中不記 hour 與 month
 * （Piwi 2026-11-12：網址不要一直變；播放中重新整理照原本從清晨自動播放），停下來才記。
 * 分享連結（shareLink）用同一個函式，所以網址列與複製出去的連結一致。
 */
export function urlStateOf(
  v: Pick<ViewState, "hour" | "dayType"> & Partial<Pick<ViewState, "month" | "district" | "station" | "commute">> & { playing?: boolean },
): UrlState {
  const out: UrlState = { dayType: v.dayType };
  if (!v.playing) {
    if (v.month) out.month = v.month;
    out.hour = v.hour;
  }
  if (v.district) out.district = v.district;
  if (v.station) out.station = v.station;
  // 通勤卡開著（起訖都選好）才寫；還在選的通勤面板不進網址
  const c = v.commute ?? null;
  if (commuteReady(c)) out.commute = { o: c.o, d: c.d, h: c.h };
  return out;
}

/** 畫面狀態 → 要從網址拿掉的鍵（沒選區、沒選站、沒開通勤卡、播放中的時刻）。 */
function dropsOf(v: Pick<ViewState, "playing" | "district" | "station" | "commute">): (keyof UrlState)[] {
  const drop: (keyof UrlState)[] = [];
  if (v.playing) drop.push("hour");
  if (!v.district) drop.push("district");
  if (!v.station) drop.push("station");
  if (!commuteReady(v.commute)) drop.push("commute");
  return drop;
}

/** 目前畫面的分享連結（分享面板「複製連結」、分享這一刻）：暫停中的那一刻，與網址列一致。 */
export function shareLink(v: ViewState = getView(), base: string = siteBase()): string {
  return shareUrl(urlStateOf({ ...v, playing: false }), base);
}

/**
 * 打開的連結不合法時（ScenePage 退回全景）：把這裡管的畫面鍵（含通勤）從網址拿掉，不認得的鍵留著。
 * write 可替換（測試用）。
 */
export function clearViewQuery(
  search: string = typeof location === "undefined" ? "" : location.search,
  write: (search: string) => void = replaceSearch,
): void {
  // 通勤的三個鍵一起拿掉（含格式錯、只出現一部分的）
  const kept = new URLSearchParams(search.replace(/^\?/, ""));
  for (const k of ["from", "to", "at"]) kept.delete(k);
  const next = writeQuery(kept.toString(), {}, ["month", "dayType", "hour", "district", "station", "commute"]);
  if (next !== search.replace(/^\?/, "")) write(next);
}

function replaceSearch(search: string) {
  try {
    const url = `${location.pathname}${search ? `?${search}` : ""}${location.hash}`;
    history.replaceState(history.state, "", url);
  } catch {
    // 瀏覽器拒絕（例如次數上限）：網址晚一點再對上，畫面照常
  }
}

/** 寫網址的間隔：拖時間軸時不每小時寫一次（Safari 限制 replaceState 次數）。 */
export const URL_WRITE_MS = 300;

/**
 * 畫面狀態 → 網址（Piwi 2026-11-12）：只在使用者操作後寫——暫停（含拖時間軸、打開小卡）寫 month＋day＋hour、
 * 選區／選站寫 district、station（3.15），通勤卡寫 from、to、at（4.2），
 * 切日型寫 day、按播放把 hour 拿掉；播放中整點變了不寫。都等 URL_WRITE_MS 再用 replaceState 寫一次
 * （不進瀏覽紀錄）。開場自動播放時不寫。回傳取消訂閱的函式。write 可替換（測試用）。
 */
export function syncUrl(
  write: (search: string) => void = replaceSearch,
  read: () => string = () => location.search,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    const current = read().replace(/^\?/, "");
    const v = getView();
    const next = writeQuery(current, urlStateOf(v), dropsOf(v));
    if (next !== current) write(next);
  };
  // 播放中 hour 不算進鍵：整點變了不觸發寫入
  const keyOf = () => {
    const v = getView();
    const c = commuteReady(v.commute) ? `${v.commute.o}>${v.commute.d}@${v.commute.h}` : "";
    return `${v.dayType}:${v.playing ? "play" : `${v.hour}:${v.month}`}:${v.district}:${v.station}:${c}`;
  };
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
