// 計數只有一個出口（AD-20，6.2）：所有事件都經這裡的 track(name, props)，送到 Vercel Web Analytics 的自訂事件
// （同網域的 /_vercel/insights，不載第三方腳本）。事件名與 props 只能是下面名單裡的；不在名單裡的丟掉不送。
// props 只放「哪一種」這類固定字串，不放站名、人數、時段或任何可識別個人的值。
//
// 只有在 Vercel 上建置時（VERCEL=1，vite.config 的 __VERCEL_ANALYTICS__）才送出；本機、測試與 CI 的建置一律不送。
// 各畫面在自己的票呼叫：開車站卡、開行政區卡、複製連結在 6.2 接上；通勤（4.1、4.2）、存成圖片（3.16、4.2、7.7）、
// 大日子（7.x）上線時呼叫同一個函式。北極星＝share_card_downloaded＋share_link_copied；
// 「找到自己」＝送過 station_opened 或 commute_result_shown 的訪客比例。
import { inject, track as send } from "@vercel/analytics";

/** 事件 → 允許的 props（鍵 → 允許的值）。空物件＝不帶 props。 */
export const EVENTS = {
  station_opened: {},
  district_opened: {},
  commute_input_started: {},
  commute_result_shown: {},
  share_card_downloaded: { kind: ["commute", "district", "event"] },
  share_link_copied: { kind: ["station", "district", "commute", "event", "home"] },
  event_day_opened: {},
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type TrackEvent = keyof typeof EVENTS;
type PropsOf<E extends TrackEvent> = { -readonly [K in keyof (typeof EVENTS)[E]]: (typeof EVENTS)[E][K] extends readonly (infer V)[] ? V : never };
type Args<E extends TrackEvent> = keyof (typeof EVENTS)[E] extends never ? [props?: Record<string, never>] : [props: PropsOf<E>];

/** 事件名與 props 是否都在名單裡（每個允許的鍵都要給、值要在名單內、不能多帶鍵）。 */
export function isAllowed(name: string, props: Record<string, unknown> = {}): boolean {
  if (!Object.hasOwn(EVENTS, name)) return false;
  const allowed = EVENTS[name as TrackEvent] as Record<string, readonly string[]>;
  const keys = Object.keys(props);
  if (keys.length !== Object.keys(allowed).length) return false;
  return keys.every((k) => Object.hasOwn(allowed, k) && allowed[k].includes(props[k] as string));
}

/** 這次建置會不會送出（只有 Vercel 上的建置）。 */
export const ENABLED: boolean = __VERCEL_ANALYTICS__;

/** 送一個事件。不在名單裡的丟掉；不在 Vercel 上建置時不送。 */
export function track<E extends TrackEvent>(name: E, ...[props]: Args<E>): void {
  const p = (props ?? {}) as Record<string, string>;
  if (!isAllowed(name, p)) {
    if (import.meta.env.DEV) console.warn(`[track] 不在 AD-20 名單裡，不送：${name}`, p);
    return;
  }
  if (!ENABLED) return;
  try {
    send(name, Object.keys(p).length ? p : undefined);
  } catch {
    // 計數失敗不影響畫面
  }
}

/**
 * 掛上 Vercel Web Analytics（main.tsx 呼叫一次）：頁面瀏覽的網址拿掉 query string 與 hash，
 * 網址裡的站與時段不進後台（站與通勤的起訖組合可能指向個人的家與公司）。
 */
export function startAnalytics(): void {
  if (!ENABLED) return;
  try {
    inject({
      mode: "production",
      framework: "vite",
      beforeSend: (event) => ({ ...event, url: event.url.split(/[?#]/)[0] }),
    });
  } catch {
    // 被擋（廣告攔截等）也照常顯示畫面
  }
}
