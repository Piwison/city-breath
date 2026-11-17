// 小卡兩段高度的手勢數學（3.22，決定 10）：純函式，CardFrame 拿來決定放開手指後停在哪。
// 卡片固定高 SHEET_FULL_VH（完整），摘要時整張往下推 (FULL−PEEK)，畫面上只露出 SHEET_PEEK_VH。
// 位置一律是「往下推了幾 px」：0＝完整，peekOffset＝摘要，再往下＝關閉。
// 落點照 apple-design：放開時用速度投射（像捲動減速），再取最近的停點；從完整往下只回到摘要，從摘要再往下才關閉。
import type { SheetDetent } from "../state/view";

/** 完整高度（佔畫面高的 %）；card.css 的 --sheet-full 同值（測試比對）。 */
export const SHEET_FULL_VH = 70;
/** 摘要露出的高度（%）；card.css 的 --sheet-peek 同值。DESIGN.md 版面：小卡摘要約三分之一、HUD ≤ 35%。 */
export const SHEET_PEEK_VH = 34;

/** 手指移動超過幾 px 才算拖曳（之前仍是點按）。 */
export const DRAG_SLOP = 8;
/** 減少動態時，放開後往同方向移動超過幾 px 才切換（不跟手，只看方向）。 */
export const REDUCED_SWIPE = 40;

/** 摘要時往下推的 px：卡片高 × (FULL−PEEK)/FULL。 */
export function peekOffset(cardHeight: number): number {
  return (cardHeight * (SHEET_FULL_VH - SHEET_PEEK_VH)) / SHEET_FULL_VH;
}

/** 速度（px/ms）投射到停下的位置（Apple Designing Fluid Interfaces 的減速公式，rate 0.995 比捲動乾脆）。 */
export function project(velocity: number, rate = 0.995): number {
  return (velocity * rate) / (1 - rate);
}

/** 超過邊界（完整再往上拉）時的阻尼：越拉越緊，不會硬停。 */
export function rubberband(overshoot: number, dimension: number, c = 0.55): number {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}

export type SheetTarget = SheetDetent | "close";

/**
 * 放開手指後的目標。from＝開始拖時的段；offset＝放開時往下推了幾 px；velocity＝往下為正（px/ms）；
 * peek＝摘要的 offset。從摘要往下投射超過露出高度的 35% 就關閉；其餘取 0 與 peek 中較近的。
 */
export function sheetTarget(from: SheetDetent, offset: number, velocity: number, peek: number, cardHeight: number): SheetTarget {
  const landing = offset + project(velocity);
  if (from === "peek" && landing > peek + (cardHeight - peek) * 0.35) return "close";
  return Math.abs(landing) < Math.abs(landing - peek) ? "full" : "peek";
}

/** 減少動態：不跟手、不投射，只看放開時的位移方向（超過 REDUCED_SWIPE）。 */
export function reducedTarget(from: SheetDetent, dy: number): SheetTarget {
  if (dy <= -REDUCED_SWIPE) return "full";
  if (dy >= REDUCED_SWIPE) return from === "full" ? "peek" : "close";
  return from;
}
