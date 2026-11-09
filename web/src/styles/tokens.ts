// 從 tokens.css 讀顏色，並依時刻內插日夜相位（AD-8）。程式裡不寫色碼，一律經這裡讀 token。
// 相位關鍵時刻與內插規則照 2.1 原型（design/prototypes/2.1-diorama 的 KEYS 與 at()）：
// 在線性 sRGB 內插，與 Three.js 色彩管理下的 Color.lerp 一致。
// 2.3 的 useTokenColor('--token') 用 tokenAt() 取值，再以 setRGB(r/255, g/255, b/255, SRGBColorSpace) 轉成 THREE.Color。

/** sRGB 0–255 三色與 alpha 0–1。 */
export type Rgba = [number, number, number, number];
export type Rgb = [number, number, number];
export type Phase = "night" | "dawn" | "day" | "dusk";
export type TokenReader = (name: string) => string;

/** 相位關鍵時刻（時）：兩個同相位的關鍵點之間維持該相位，相鄰不同相位之間線性內插。 */
export const PHASE_KEYS: readonly (readonly [number, Phase])[] = [
  [0, "night"],
  [4.8, "night"],
  [5.7, "dawn"],
  [6.6, "dawn"],
  [7.6, "day"],
  [16.6, "day"],
  [17.6, "dusk"],
  [18.4, "dusk"],
  [19.3, "night"],
  [24, "night"],
];

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// 0–24 內原值不動（避免 19.3 變成 19.299999…而落到前一段）
const wrapHour = (h: number) => (h >= 0 && h < 24 ? h : ((h % 24) + 24) % 24);

/** 解析三碼與六碼 hex、rgb／rgba 函式寫法；其他格式（oklch 等）回 null，所以 tokens.css 只用這兩種寫法。 */
export function parseColor(raw: string): Rgba | null {
  const s = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
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

/** 時刻 h 落在哪兩個相位之間，以及往後一個相位的比例 t（0–1）。 */
export function phaseSpan(h: number): { from: Phase; to: Phase; t: number } {
  const x = wrapHour(h);
  let k = 0;
  while (k < PHASE_KEYS.length - 2 && x >= PHASE_KEYS[k + 1][0]) k++;
  const [h0, from] = PHASE_KEYS[k];
  const [h1, to] = PHASE_KEYS[k + 1];
  return { from, to, t: clamp((x - h0) / (h1 - h0), 0, 1) };
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(c, 0, 1) * 255);
};

/**
 * 時刻 h 的 token 顏色。`--sky-top` 會找 `--sky-top-night` 等四相位版本內插；
 * 某相位沒定義時退回不帶後綴的全天值；兩者都沒有就丟錯。
 */
export function tokenAt(name: string, h: number, read: TokenReader = readCssToken): Rgba {
  const plain = parseColor(read(name));
  const { from, to, t } = phaseSpan(h);
  const c0 = parseColor(read(`${name}-${from}`)) ?? plain;
  const c1 = parseColor(read(`${name}-${to}`)) ?? plain ?? c0;
  if (!c0 || !c1) throw new Error(`token ${name} 沒有全天值也沒有 -${from} 相位值`);
  const rgb = [0, 1, 2].map((i) => toSrgb(toLinear(c0[i]) + (toLinear(c1[i]) - toLinear(c0[i])) * t));
  return [rgb[0], rgb[1], rgb[2], c0[3] + (c1[3] - c0[3]) * t];
}

/** 太陽高度（-1–1）與夜晚程度（0–1）；日出 5.7 時、日落 18.0 時（DESIGN.md「光」）。 */
export const SUNRISE = 5.7;
export const SUNSET = 18.0;
export function sunAt(h: number): { elevation: number; night: number } {
  const t = (wrapHour(h) - SUNRISE) / (SUNSET - SUNRISE);
  const elevation = Math.sin(Math.PI * t);
  return { elevation, night: 1 - smooth(-0.3, 0.06, elevation) };
}

/** HUD 用白天還是夜晚那組 token（寫到 :root 的 data-phase）。 */
export function hudPhase(h: number): "day" | "night" {
  return sunAt(h).night > 0.55 ? "night" : "day";
}
