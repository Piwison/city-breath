// 車站的點擊與名牌規則（3.1，純函式、可測）：什麼時候點得到站、標哪些站名。
// 原型：放大到看得見站名、或站所在的區已選取時才點得到（全城視角點下去是選區）；站名只標重要的，避免一片字。
import { EDGE, type Rect, type SafeArea } from "./labelPlace";

/**
 * 「放大了」：鏡頭看著的那一點，一個場景單位至少幾像素（ScaleProbe 量的 px）。
 * 手機全景約 6 px、桌機全景約 8 px；原型以鏡頭距離 110 為界，在 390×844 上約 11 px。
 */
export const ZOOM_PX = 11;

export const isZoomed = (pxPerUnit: number) => pxPerUnit >= ZOOM_PX;

/** 放大但沒選區時，最多標幾個一般站名。 */
export const GENERAL_LABELS = 10;

/**
 * 這一站點不點得到：車站圖層關著一律不行；放大了、站在選中的區、或已經選了一站（鏡頭已飛近）時可以。
 * 全城沒放大時點不到站，那時手指點的是行政區。
 */
export function stationPickable(o: {
  layer: boolean;
  zoomed: boolean;
  district: string | null;
  station: string | null;
  stationDistrict: string;
}): boolean {
  if (!o.layer) return false;
  return o.zoomed || o.station !== null || (o.district !== null && o.stationDistrict === o.district);
}

/**
 * 名牌的等級：0＝選中的站（一定標）、1＝選中的區裡的站（全部試著標）、2＝一般（只在放大且沒選區時，取前 GENERAL_LABELS 個）；
 * null＝不標。
 */
export function labelTier(o: {
  id: string;
  stationDistrict: string;
  zoomed: boolean;
  district: string | null;
  station: string | null;
}): 0 | 1 | 2 | null {
  if (o.id === o.station) return 0;
  if (o.district !== null) return o.stationDistrict === o.district ? 1 : null;
  return o.zoomed ? 2 : null;
}

export interface LabelCandidate {
  id: string;
  /** 名牌底邊中點（螢幕像素） */
  x: number;
  y: number;
  w: number;
  h: number;
  tier: 0 | 1 | 2;
  /** 重要性：同一等級裡大的先放（這個日型的全日進出） */
  rank: number;
  /** 在鏡頭前（投影 z ≤ 1） */
  front: boolean;
}

export interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  rect: Rect;
}

/**
 * 挑出要標的站名並避開重疊（原型 updateLabels 的站名部分）：
 * 依等級、再依重要性排序；名牌整個要在安全區（上方 HUD 之下、時間軸或小卡之上、左右不出畫面）。
 * 選中的站一定標：先試著上下挪開（每次 4px，最多 NUDGE_PX）避開流向標籤與別的名牌，挪不開才壓在上面；
 * 其餘和已佔用的矩形（流向標籤、先放的站名）重疊就略過；一般站名最多 cap 個。
 */
export function chooseStationLabels(
  cands: readonly LabelCandidate[],
  area: SafeArea,
  taken: readonly Rect[],
  cap: number = GENERAL_LABELS,
): PlacedLabel[] {
  const order = [...cands].sort((a, b) => a.tier - b.tier || b.rank - a.rank || (a.id < b.id ? -1 : 1));
  const placed: PlacedLabel[] = [];
  const rects: Rect[] = [...taken];
  let general = 0;
  for (const c of order) {
    if (c.tier === 2 && general >= cap) continue;
    if (!c.front) continue;
    if (c.tier === 0) {
      const moved = nudge(c, area, rects);
      if (moved) {
        rects.push(moved.rect);
        placed.push({ id: c.id, ...moved });
        continue;
      }
    }
    const inside = c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= area.width && c.y - c.h >= area.top && c.y <= area.bottom;
    if (!inside) continue;
    const rect: Rect = [c.x, c.y - c.h / 2, c.w, c.h];
    if (c.tier !== 0 && overlaps(rect, rects)) continue;
    rects.push(rect);
    placed.push({ id: c.id, x: c.x, y: c.y, rect });
    if (c.tier === 2) general++;
  }
  return placed;
}

/** 選中的站名最多上下挪多遠（px）。 */
export const NUDGE_PX = 64;

const overlaps = (r: Rect, rects: readonly Rect[]) =>
  rects.some(([qx, qy, qw, qh]) => Math.abs(qx - r[0]) < (qw + r[2]) / 2 && Math.abs(qy - r[1]) < (qh + r[3]) / 2);

/** 從原位開始上下交替找最近的空位（左右夾在畫面內）；找不到回傳 null。 */
function nudge(c: LabelCandidate, area: SafeArea, rects: readonly Rect[]): { x: number; y: number; rect: Rect } | null {
  if (!(c.x >= 0 && c.x <= area.width)) return null;
  const x = Math.min(Math.max(c.x, EDGE + c.w / 2), area.width - EDGE - c.w / 2);
  for (let d = 0; d <= NUDGE_PX; d += 4)
    for (const y of d ? [c.y - d, c.y + d] : [c.y]) {
      if (y - c.h < area.top || y > area.bottom) continue;
      const rect: Rect = [x, y - c.h / 2, c.w, c.h];
      if (!overlaps(rect, rects)) return { x, y, rect };
    }
  return null;
}
