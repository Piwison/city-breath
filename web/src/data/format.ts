// 顯示人數的唯一出處（3.22）：任何給使用者看的人數（畫面文字、aria-label、title）都經過這裡。
// CLAUDE.md「少於 10 人不顯示數字」：小於 10 一律寫「少於 10 人」，不寫 0–9；null 依情境是「少於 10 人」（起訖格，AD-3）
// 或「停止營運」（站的整小時，AD-5），由呼叫端給字。只改顯示，不改資料、不反推被隱藏的格。

/** 少於這個人數不顯示數字（AD-3） */
export const SUPPRESS_BELOW = 10;

/** 「少於 10 人」 */
export const UNDER = `少於 ${SUPPRESS_BELOW} 人`;

/** 數字本身（千分位、四捨五入到整數）；小於 10 寫「少於 10」；null 寫 nullText。給「數字＋另外寫單位」的欄位。 */
export function formatNumber(n: number | null, nullText = `少於 ${SUPPRESS_BELOW}`): string {
  if (n === null || !Number.isFinite(n)) return nullText;
  if (n < SUPPRESS_BELOW) return `少於 ${SUPPRESS_BELOW}`;
  return Math.round(n).toLocaleString("zh-TW");
}

/** 「1,234 人」；小於 10 寫「少於 10 人」；null 寫 nullText（預設「少於 10 人」，站的停止營運傳「停止營運」）。 */
export function formatCount(n: number | null, nullText = UNDER): string {
  if (n === null || !Number.isFinite(n)) return nullText;
  if (n < SUPPRESS_BELOW) return UNDER;
  return `${Math.round(n).toLocaleString("zh-TW")} 人`;
}
