// 網站圖示（3.15）：天空色的方塊、一塊沙盤、一條全城流向色的弧線連起兩顆站珠（城市在呼吸、人在兩站之間來回）。
// 只是品牌圖形，不代表任何資料。顏色全部從 tokens.css 讀（AD-8）；favicon.svg、apple-touch-icon.png 與連結預覽圖上的
// 圖示都由這個函式產生（web/scripts/brand-assets.mjs），不手寫色碼。
import tokensCss from "../styles/tokens.css?raw";
import { canvasColor, cssTokenReader, tokenRgba } from "../styles/tokens";

export interface MarkColors {
  skyTop: string;
  skyHorizon: string;
  tile: string;
  tileSide: string;
  flow: string;
  station: string;
}

export function markColors(css: string = tokensCss): MarkColors {
  const read = cssTokenReader(css, "day");
  const c = (name: string) => canvasColor(tokenRgba(name, read));
  return {
    skyTop: c("--sky-top-day"),
    skyHorizon: c("--sky-horizon-dawn"),
    tile: c("--tile"),
    tileSide: c("--plinth-side"),
    flow: c("--flow-neutral"),
    station: c("--station"),
  };
}

/** 64×64 的 SVG。rounded＝圓角方塊（favicon）；apple-touch-icon 由系統自己裁圓角，給 false。 */
export function markSvg(colors: MarkColors = markColors(), { rounded = true }: { rounded?: boolean } = {}): string {
  const r = rounded ? 14 : 0;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">`,
    `<stop offset="0" stop-color="${colors.skyTop}"/><stop offset="1" stop-color="${colors.skyHorizon}"/>`,
    `</linearGradient></defs>`,
    `<rect width="64" height="64" rx="${r}" fill="url(#s)"/>`,
    // 沙盤：上面一層、側面一層
    `<rect x="7" y="44" width="50" height="11" rx="3" fill="${colors.tileSide}"/>`,
    `<rect x="7" y="40" width="50" height="10" rx="3" fill="${colors.tile}"/>`,
    // 流向弧線與兩顆站珠
    `<path d="M17 44 Q32 8 47 44" fill="none" stroke="${colors.flow}" stroke-width="6" stroke-linecap="round"/>`,
    `<circle cx="17" cy="44" r="5.5" fill="${colors.station}" stroke="${colors.flow}" stroke-width="3"/>`,
    `<circle cx="47" cy="44" r="5.5" fill="${colors.station}" stroke="${colors.flow}" stroke-width="3"/>`,
    `</svg>`,
  ].join("");
}
