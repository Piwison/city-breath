// 雲（3.14，純裝飾，AD-23）：佈局與淡出是純函式，Clouds.tsx 每格呼叫。
// 原型 1176–1182、2065–2069：幾朵低多邊形雲在沙盤上空由西往東飄，白天投影；入夜與放大看細節時淡出。
import { sunAt } from "./daylight";
import type { PlinthBox } from "./Plinth";

/** 一朵雲幾團、每團相對雲心的位置與大小（原型）。 */
const PUFFS = 4;
/** 雲飄出底座多遠才從另一邊回來（場景單位）。 */
export const CLOUD_MARGIN = 14;
/** 雲的高度（場景單位，原型 21／24）。 */
export const CLOUD_Y = 21;
/** 雲的最大不透明度（原型 0.85）。 */
export const CLOUD_OPACITY = 0.85;
/** 鏡頭距離在這兩個值之間時淡出（原型 smooth(95, 150, distance)；手機開場約 208）。 */
export const FADE_NEAR = 95;
export const FADE_FAR = 150;

export interface Cloud {
  x: number;
  y: number;
  z: number;
  /** 飄的速度（單位／秒，1x 播放） */
  v: number;
}

export interface Puff {
  /** 屬於哪一朵 */
  cloud: number;
  dx: number;
  dy: number;
  dz: number;
  scale: number;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** n 朵雲的起點（決定性）：沿東西向平均排開、南北錯開，高度兩層。 */
export function cloudLayout(box: PlinthBox, n: number): { clouds: Cloud[]; puffs: Puff[] } {
  const clouds: Cloud[] = [];
  const puffs: Puff[] = [];
  for (let k = 0; k < n; k++) {
    clouds.push({
      x: box.cx - box.w / 2 + ((k + 0.3) * box.w) / n,
      y: CLOUD_Y + (k % 2) * 3,
      z: box.cz - box.d / 2 + (((k * 37) % 100) / 100) * box.d,
      v: 0.9 + (k % 3) * 0.35,
    });
    for (let i = 0; i < PUFFS; i++)
      puffs.push({ cloud: k, dx: (i - 1.5) * 1.3, dy: Math.sin(i * 2.1) * 0.35, dz: Math.cos(i * 1.7) * 0.6, scale: 1 + ((i * 7) % 3) * 0.35 });
  }
  return { clouds, puffs };
}

/** 往東飄 dx 後的 x：飄出底座東緣 CLOUD_MARGIN 外就從西緣外面回來。 */
export function driftX(x: number, dx: number, box: PlinthBox): number {
  const west = box.cx - box.w / 2 - CLOUD_MARGIN;
  const span = box.w + 2 * CLOUD_MARGIN;
  return west + ((((x + dx - west) % span) + span) % span);
}

/** 時刻 h、鏡頭距離 distance 時雲的不透明度：白天（含曙暮光的一部分）才有、放大看細節時淡出。 */
export function cloudFade(h: number, distance: number): number {
  const s = sunAt(h);
  const lit = Math.max(s.day, s.twilight * 0.62);
  return CLOUD_OPACITY * smooth(0.05, 0.6, lit) * smooth(FADE_NEAR, FADE_FAR, distance);
}
