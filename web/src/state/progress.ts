// 唯一跨工作階段保存的狀態（AD-22）：localStorage 的同一個鍵，只在這裡讀寫。
// 4.1 建立這個模組並放「最近用過的站」；3.11（看過的提示）、3.23（我的站）、8.3（徽章進度）之後各加自己的欄位。
// 規則：每次寫入都讀出整個物件、只改自己那一欄再寫回，不認得的欄位原樣保留；某一欄壞了只把那一欄當空的。
// 每次讀寫都包在 try/catch：localStorage 不能用、讀到壞資料（整個不是 JSON 物件）或寫入失敗時退回記憶體，
// 畫面照常運作（只是不保存），而且不覆寫儲存裡看不懂的值。
// 這裡的東西不進網址（state/url.ts）、不進分享卡、不送 track()。
import { useSyncExternalStore } from "react";

export const PROGRESS_KEY = "city-breath:progress:v1";

/** 最近用過的站最多幾個。 */
export const RECENT_MAX = 5;

/** 站 ID 的格式（AD-2：s＋sha1 前 8 碼；和 state/url.ts 收的一樣寬鬆，不在這裡判定站存不存在）。 */
const STATION_ID = /^[A-Za-z0-9_-]{1,32}$/;

type Progress = Record<string, unknown>;

/** 記憶體裡的一份（儲存不能用時就只靠它）；null＝還沒讀過。 */
let memory: Progress | null = null;
/** 儲存還能不能用：讀寫丟錯或讀到壞資料後，這次造訪改用記憶體。 */
let storageOk = true;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function load(): Progress {
  if (storageOk) {
    try {
      const s = storage();
      if (!s) storageOk = false;
      else {
        const raw = s.getItem(PROGRESS_KEY);
        if (raw === null) return (memory = {});
        const v: unknown = JSON.parse(raw);
        if (v && typeof v === "object" && !Array.isArray(v)) return (memory = v as Progress);
        storageOk = false; // 整個不是物件：看不懂，不覆寫
      }
    } catch {
      storageOk = false;
    }
  }
  return (memory = memory ?? {});
}

function save(next: Progress) {
  memory = next;
  if (storageOk) {
    try {
      const s = storage();
      if (!s) storageOk = false;
      else s.setItem(PROGRESS_KEY, JSON.stringify(next));
    } catch {
      storageOk = false;
    }
  }
  cache = null;
  for (const fn of listeners) fn();
}

/** 一欄的值：只留站 ID 字串、去重、最多 RECENT_MAX 個；不是陣列就當空的。 */
function cleanIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && STATION_ID.test(x) && !out.includes(x)) out.push(x);
  return out.slice(0, RECENT_MAX);
}

let cache: string[] | null = null;

/** 最近用過的站（站 ID，新的在前）。還沒對照當月 stations.json；畫面用 data/stationSearch.ts 的 recentIn() 略過當月沒有的站。 */
export function recentStations(): string[] {
  return (cache ??= cleanIds(load().recentStations));
}

/** 在「找你的站」的搜尋選到一站（只看這站、通勤起站或迄站）：移到最前、去重、最多 5 個。 */
export function rememberStation(id: string) {
  if (!STATION_ID.test(id)) return;
  const all = load();
  const prev = cleanIds(all.recentStations);
  const next = [id, ...prev.filter((x) => x !== id)].slice(0, RECENT_MAX);
  if (next.length === prev.length && next.every((x, k) => x === prev[k]) && Array.isArray(all.recentStations)) return;
  save({ ...all, recentStations: next });
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React：最近用過的站，選了新的一站就重繪。 */
export function useRecentStations(): string[] {
  return useSyncExternalStore(subscribe, recentStations, recentStations);
}

/** 測試用：清掉記憶體與「儲存不能用」的旗標（不動儲存本身）。 */
export function resetProgressForTest() {
  memory = null;
  storageOk = true;
  cache = null;
}
