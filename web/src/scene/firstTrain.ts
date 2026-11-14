// 第一班車的波紋（3.14）：播放中走過第一班車的整點（state/service.ts firstTrainCrossed，和 3.4「約 6 點第一班車」同一份班距），
// 各站的站珠從台北車站往外，依距離延遲彈一下、亮一下（原型 2026–2031：1 → 1.8 → 1，elastic）。
// 這是畫面動畫，不是畫面狀態（AD-16）：Trains 觸發（triggerWave），Stations 每格讀 waveAt()。
// 減少動態或靜態模式不觸發：站珠照 3.1 直接亮（停駛結束時站燈本來就會亮）。
import gsap from "gsap";

/** 每離圓心一個場景單位晚多久（秒）；全城約 1.5 秒內傳完（原型 0.03）。 */
export const WAVE_DELAY = 0.03;
/** 彈到多大、彈起與回落各多久（秒）。 */
export const WAVE_PEAK = 1.8;
export const WAVE_RISE = 0.18;
export const WAVE_SETTLE = 0.5;
/** 站珠在高點時往站燈色推多少。 */
export const WAVE_GLOW = 0.6;
/** 圓心的站（stations.json 的 name）；找不到就用底座中心。 */
export const WAVE_ORIGIN = "台北車站";

const settle = gsap.parseEase("elastic.out(1.2, 0.4)");
const rise = gsap.parseEase("power2.out");

/** 最近一次觸發的時間（R3F clock 的秒數）；−∞＝沒有。 */
export const wave = { start: Number.NEGATIVE_INFINITY };

export function triggerWave(now: number) {
  wave.start = now;
}

/** 站珠在觸發後 elapsed 秒（已扣掉距離延遲）的縮放倍數；之前與之後都是 1。 */
export function wavePulse(elapsed: number): number {
  if (!(elapsed > 0) || elapsed >= WAVE_RISE + WAVE_SETTLE) return 1;
  if (elapsed < WAVE_RISE) return 1 + (WAVE_PEAK - 1) * rise(elapsed / WAVE_RISE);
  return WAVE_PEAK + (1 - WAVE_PEAK) * settle((elapsed - WAVE_RISE) / WAVE_SETTLE);
}

/** 離圓心 dist 單位的站此刻的縮放倍數。 */
export function waveAt(now: number, dist: number): number {
  return wavePulse(now - wave.start - dist * WAVE_DELAY);
}

/** 波紋還在傳（最遠的站還沒回到 1）。 */
export function waveRunning(now: number, maxDist: number): boolean {
  const e = now - wave.start;
  return e >= 0 && e < maxDist * WAVE_DELAY + WAVE_RISE + WAVE_SETTLE;
}

/** 縮放倍數 → 往站燈色推多少（0–WAVE_GLOW）。 */
export function waveGlow(pulse: number): number {
  return WAVE_GLOW * Math.min(1, Math.max(0, (pulse - 1) / (WAVE_PEAK - 1)));
}
