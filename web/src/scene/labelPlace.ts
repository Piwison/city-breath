// 流向標籤的擺放（純函式，可測）：從弧頂往上下找不重疊的位置，整個標籤要落在安全區內——
// 左右離畫面邊緣 EDGE 像素、上方 HUD 之下、下方時間軸之上（Piwi 2026-11-11）。

/** 已佔用的矩形：中心 x、中心 y、寬、高（螢幕像素）。 */
export type Rect = [number, number, number, number];

export interface SafeArea {
  width: number;
  height: number;
  /** 上方 HUD 的下緣 */
  top: number;
  /** 時間軸的上緣 */
  bottom: number;
}

/** 標籤離畫面左右下緣至少幾像素。 */
export const EDGE = 8;

/**
 * 標籤的錨點（弧頂的螢幕座標）ax、ay，大小 w×h，標籤畫在錨點正上方（底邊中點對著錨點）。
 * 回傳標籤底邊中點的位置與佔用的矩形；錨點在畫面外，或安全區內找不到不重疊的位置，回傳 null。
 */
export function placeLabel(
  ax: number,
  ay: number,
  w: number,
  h: number,
  area: SafeArea,
  taken: readonly Rect[],
): { x: number; y: number; rect: Rect } | null {
  if (!(ax >= 0 && ax <= area.width && ay >= 0 && ay <= area.height)) return null;
  const x = Math.min(Math.max(ax, EDGE + w / 2), area.width - EDGE - w / 2);
  const minY = area.top + h;
  const maxY = Math.min(area.bottom, area.height - EDGE);
  if (minY > maxY) return null;
  const step = h + 4;
  const clamped = Math.min(Math.max(ay, minY), maxY);
  for (const y of [ay, ay - step, ay + step, ay - 2 * step, ay + 2 * step, clamped]) {
    if (y < minY || y > maxY) continue;
    const rect: Rect = [x, y - h / 2, w, h];
    const hit = taken.some(([qx, qy, qw, qh]) => Math.abs(qx - x) < (qw + w) / 2 && Math.abs(qy - rect[1]) < (qh + h) / 2);
    if (!hit) return { x, y, rect };
  }
  return null;
}
