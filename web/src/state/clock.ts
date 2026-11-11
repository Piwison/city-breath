// 唯一推進播放時間的 clock（AD-16）：場景每格呼叫 advance(dt)，時間軸拖動呼叫 seek(t)。
// 每次寫入時間都用 daylight.ts 的 phaseAt() 把 HUD 的日夜寫到 :root 的 data-phase（AD-8）。
import { phaseAt, wrapHour } from "../scene/daylight";
import { getView, setPlaying, setStill, time, writeTime } from "./view";

/** 一天播 48 秒（DESIGN.md「互動」）：每秒 0.5 小時。 */
export const HOURS_PER_SECOND = 24 / 48;
/** 自動播放從清晨開始，前幾秒就看到日出。 */
export const PLAY_FROM = 5.2;
/** 減少動態時停在早上 8 點（diorama-game-juice「減少動態」）。 */
export const STILL_AT = 8;

function writePhase(t: number) {
  if (typeof document === "undefined") return;
  const phase = phaseAt(t);
  if (document.documentElement.dataset.phase !== phase) document.documentElement.dataset.phase = phase;
}

/** 跳到時刻 t（0–24 時，超出繞回）。 */
export function seek(t: number) {
  const x = wrapHour(t);
  writeTime(x);
  writePhase(x);
}

/** 播放中把時間往前推 dt 秒（乘播放速度）；暫停或靜態模式時不動。 */
export function advance(dt: number) {
  const v = getView();
  if (!v.playing || v.still) return;
  seek(time.t + Math.min(dt, 0.1) * HOURS_PER_SECOND * v.speed);
}

/**
 * 靜態模式（走查小問題：按了要看得出差別）：開＝停止播放、停在 8 點；
 * 場景依 still 把光點換成光帶、鏡頭不飛。關＝只關旗標，維持暫停在原時刻。
 */
export function setStillMode(on: boolean) {
  setStill(on);
  if (on) {
    setPlaying(false);
    seek(STILL_AT);
  }
}

/** 播放鍵：靜態模式中按播放＝明確要看動態，先關靜態再播放。 */
export function togglePlay() {
  const v = getView();
  if (v.still) {
    setStill(false);
    setPlaying(true);
    return;
  }
  setPlaying(!v.playing);
}

/**
 * 開場：網址有 hour 就停在那個時刻；減少動態時開靜態模式、停在 8 點（網址有 hour 時停在網址的時刻）；
 * 否則從清晨自動播放。
 */
export function startClock({ hour, reducedMotion }: { hour?: number; reducedMotion: boolean }) {
  setStill(reducedMotion);
  if (hour !== undefined) {
    seek(hour);
    setPlaying(false);
  } else if (reducedMotion) {
    seek(STILL_AT);
    setPlaying(false);
  } else {
    seek(PLAY_FROM);
    setPlaying(true);
  }
}
