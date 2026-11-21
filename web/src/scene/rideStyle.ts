// 搭乘中近看的造型（8.7「搭乘畫面打磨」第一階段）：同一段路、同一個時刻對照兩個版本給 Piwi 挑。
// 全景（沒搭乘）一律不看這裡，畫面和改之前相同；只有 v.ride 不是 null 時各圖層才套用。
// base＝8.6 原樣；a「細軌」＝路線收成一條細軌、站的底座縮成貼地的薄板、站珠縮小並抬到視線上方、近物更早淡出；
// b「月台」＝板南線下面墊一條微微隆起的窄道床、路線色只剩中間一條、每站兩側各一塊長方形月台與一根不寫字的站牌柱，
// 行進中不畫站珠，只有停靠的那站在軌道上方亮一顆小站珠。
// 版本由網址 `?ridestyle=` 選（state/url.ts rideStyleDebug，暫時的）；選定後只留一組數字、拿掉切換。
import { rideStyleDebug, type RideStyle } from "../state/url";

export interface RideLook {
  style: RideStyle;
  /** 路線線寬（世界單位）的倍數：全景是 1 */
  railWidth: number;
  /** 底座（廣場）縮成幾倍：[水平, 高度]；null＝照原樣 */
  plaza: [number, number] | null;
  /** 板南線上的站的底座要不要藏起來（b：換成月台） */
  hideRoutePlaza: boolean;
  /** 站珠大小倍數；0＝行進中不畫 */
  bead: number;
  /** 停靠那站的站珠大小倍數（b）；null＝和其他站一樣 */
  beadDocked: number | null;
  /** 站珠離地多高（場景單位）；null＝原本的位置（廣場上方 0.28） */
  beadY: number | null;
  /** 站珠離鏡頭多近開始縮小、多近時不見 */
  beadNear: [number, number];
  /** 列車離鏡頭多近開始縮小、多近時不見 */
  trainNear: [number, number];
  /** 道床與月台（b） */
  bed: boolean;
}

const LOOKS: Record<RideStyle, RideLook> = {
  base: {
    style: "base",
    railWidth: 0.5,
    plaza: null,
    hideRoutePlaza: false,
    bead: 0.45,
    beadDocked: null,
    beadY: null,
    beadNear: [1.3, 0.6],
    trainNear: [4.0, 2.0],
    bed: false,
  },
  a: {
    style: "a",
    // 0.3 × 0.14 ≈ 0.042（約 18 公尺）：一條細軌，看得到兩旁的地面
    railWidth: 0.14,
    // 半徑 0.5 → 0.17、厚 0.08 → 0.024：貼地的薄板，只標出站在哪
    plaza: [0.34, 0.3],
    hideRoutePlaza: false,
    // 半徑 0.27 → 0.065，抬到鏡頭（約 0.75）上方一點：遠處的站像一盞盞站燈，經過時從頭上過去、不擋前方
    bead: 0.24,
    beadDocked: null,
    beadY: 0.95,
    beadNear: [2.4, 1.5],
    trainNear: [6.0, 3.5],
    bed: false,
  },
  b: {
    style: "b",
    // 中線 0.3 × 0.12 ≈ 0.036，壓在道床中間
    railWidth: 0.12,
    plaza: [0.34, 0.3],
    hideRoutePlaza: true,
    bead: 0,
    beadDocked: 0.3,
    beadY: 0.95,
    beadNear: [0.6, 0.3],
    trainNear: [6.0, 3.5],
    bed: true,
  },
};

/** 這次開頁選的造型（網址讀一次；切換要重新整理）。 */
export const RIDE_LOOK: RideLook = LOOKS[rideStyleDebug()];

export function rideLook(style: RideStyle): RideLook {
  return LOOKS[style];
}
