// 從 tokens.css 讀顏色（AD-8）。程式裡不寫色碼，一律經這裡讀 token。
// 日夜相位的關鍵時刻與依時刻內插只在 web/src/scene/daylight.ts（tokenAt、phaseAt）；這裡只放讀色與
// 線性 sRGB 內插（mixRgba，與 Three.js 色彩管理下的 Color.lerp 一致）。
// 場景的 useTokenColor('--token')（scene/useTokenColor.ts）用 tokenRgb() 取值，再以 setRGB(…, SRGBColorSpace) 轉成 THREE.Color。

/** sRGB 0–255 三色與 alpha 0–1。 */
export type Rgba = [number, number, number, number];
export type Rgb = [number, number, number];
export type Phase = "night" | "dawn" | "day" | "dusk";
export type TokenReader = (name: string) => string;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** 解析 3／4／6／8 碼 hex、rgb／rgba 函式寫法；其他格式（oklch 等）回 null，所以 tokens.css 只用 hex 與 rgb 寫法。 */
export function parseColor(raw: string): Rgba | null {
  const s = raw.trim().toLowerCase();
  // 建置時 CSS 壓縮會把 rgba() 改寫成 8 碼 hex（#rrggbbaa），所以 4／8 碼也要讀得懂
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const h = hex[1].length <= 4 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (fn) {
    const [r, g, b] = [fn[1], fn[2], fn[3]].map(Number);
    const a = fn[4] === undefined ? 1 : Number(fn[4]);
    if ([r, g, b].some((v) => v > 255) || a > 1) return null;
    return [r, g, b, a];
  }
  return null;
}

/** 從 :root 讀 token 的原始字串（瀏覽器中）。 */
export const readCssToken: TokenReader = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** 取出 tokens.css 原文某個選擇器區塊裡的 `--name: value`（去掉註解）。 */
function cssBlock(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return new Map();
  const body = css.slice(start + selector.length + 2, css.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

/**
 * 從 tokens.css 原文（`import css from "./tokens.css?raw"`）讀 token，不看目前頁面的 data-phase。
 * 分享卡依卡片自己的時段決定白天或夜晚 HUD 色，所以不能用 getComputedStyle（AD-17）。
 * `var(--x)` 會展開；夜晚以 `:root[data-phase="night"]` 覆寫 `:root`，與瀏覽器的層疊結果相同。
 */
export function cssTokenReader(css: string, phase: "day" | "night" = "day"): TokenReader {
  const vars = cssBlock(css, ":root");
  if (phase === "night") for (const [k, v] of cssBlock(css, ':root[data-phase="night"]')) vars.set(k, v);
  const read: TokenReader = (name) => {
    const raw = vars.get(name) ?? "";
    const ref = /^var\((--[\w-]+)\)$/.exec(raw);
    return ref && ref[1] !== name ? read(ref[1]) : raw;
  };
  return read;
}

/** Rgba 轉成 canvas 可用的色字串（#rrggbbaa）；只用在把 token 值交給 canvas，不是定義新顏色。 */
export function canvasColor([r, g, b, a]: Rgba): string {
  const hex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}${hex(a * 255)}`;
}

/** 讀一個全天 token；不存在或無法解析時丟錯，避免畫面默默用錯色。 */
export function tokenRgba(name: string, read: TokenReader = readCssToken): Rgba {
  const c = parseColor(read(name));
  if (!c) throw new Error(`token ${name} 未定義或不是可解析的顏色`);
  return c;
}

export function tokenRgb(name: string, read: TokenReader = readCssToken): Rgb {
  const [r, g, b] = tokenRgba(name, read);
  return [r, g, b];
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
};

/** 兩色在線性 sRGB 內插（t 0–1），回 sRGB；與 Three.js 色彩管理下的 Color.lerp 一致。alpha 線性內插。 */
export function mixRgba(c0: Rgba, c1: Rgba, t: number): Rgba {
  const rgb = [0, 1, 2].map((i) => toSrgb(toLinear(c0[i]) + (toLinear(c1[i]) - toLinear(c0[i])) * t));
  return [rgb[0], rgb[1], rgb[2], c0[3] + (c1[3] - c0[3]) * t];
}
