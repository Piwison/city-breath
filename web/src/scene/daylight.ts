// 天光（DESIGN.md）：日夜只靠光。相位的關鍵時刻、依時刻內插、HUD 的 data-phase 與場景的光，
// 都只在這裡從時刻算出（AD-8、AD-11）。純函式、不 import three，分享卡（share/render.ts）也用得到。
// 數值照 2.1 原型（design/prototypes/2.1-diorama）的 sunState()、makeTokens().at() 與天光版本的光照參數。
import { mixRgba, readCssToken, parseColor, type Phase, type Rgba, type TokenReader } from "../styles/tokens";

/** 相位關鍵時刻（時）：兩個同相位的關鍵點之間維持該相位，相鄰不同相位之間線性內插（DESIGN.md）。 */
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

/** 太陽：2026 年 9 月臺北約 5:40 日出、18:00 日落（DESIGN.md「光」；全年先用這組，見架構 Deferred）。 */
export const SUNRISE = 5.7;
export const SUNSET = 18.0;

/** 天光的光照參數（原型 VARIANTS[0]）。 */
export const LIGHT = {
  /** 太陽在高空時的強度；接近地平線時降到 38% */
  sun: 2.4,
  /** 月光強度（乘上夜晚程度） */
  moon: 0.55,
  /** 半球光：夜、日 */
  hemi: [0.32, 1.05],
  /** 曝光：夜、日（NeutralToneMapping） */
  exposure: [0.78, 1.0],
  /** 太陽繞行半徑（場景單位），陰影相機的 far 要涵蓋 */
  orbit: 160,
  /** 月亮固定在西北方高空 */
  moonPosition: [-70, 120, -60] as [number, number, number],
} as const;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (v: number) => v - Math.floor(v);
/** 0–24 內原值不動（避免 19.3 變成 19.299999… 而落到前一段）。 */
export const wrapHour = (h: number) => (h >= 0 && h < 24 ? h : ((h % 24) + 24) % 24);

/** 時刻 h 落在哪兩個相位之間，以及往後一個相位的比例 t（0–1）。 */
export function phaseSpan(h: number): { from: Phase; to: Phase; t: number } {
  const x = wrapHour(h);
  let k = 0;
  while (k < PHASE_KEYS.length - 2 && x >= PHASE_KEYS[k + 1][0]) k++;
  const [h0, from] = PHASE_KEYS[k];
  const [h1, to] = PHASE_KEYS[k + 1];
  return { from, to, t: clamp((x - h0) / (h1 - h0), 0, 1) };
}

/**
 * 時刻 h 的 token 顏色。`--sky-top` 會找 `--sky-top-night` 等四相位版本，在線性 sRGB 內插；
 * 某相位沒定義時退回不帶後綴的全天值；兩者都沒有就丟錯。
 */
export function tokenAt(name: string, h: number, read: TokenReader = readCssToken): Rgba {
  const plain = parseColor(read(name));
  const { from, to, t } = phaseSpan(h);
  const c0 = parseColor(read(`${name}-${from}`)) ?? plain;
  const c1 = parseColor(read(`${name}-${to}`)) ?? plain ?? c0;
  if (!c0 || !c1) throw new Error(`token ${name} 沒有全天值也沒有 -${from} 相位值`);
  return mixRgba(c0, c1, t);
}

export interface Sun {
  /** 白天的進度：日出 0、日落 1（之外小於 0 或大於 1） */
  t: number;
  /** 太陽高度 −1–1 */
  elevation: number;
  /** 方位：0＝東、π/2＝南、π＝西 */
  azimuth: number;
  /** 白天程度 0–1 */
  day: number;
  /** 夜晚程度 0–1 */
  night: number;
  /** 曙暮光程度 0–1 */
  twilight: number;
  /** 夜晚的進度：日落 0、隔天日出 1（月亮用） */
  tn: number;
  isDay: boolean;
}

/** 太陽在時刻 h 的位置與日夜程度（原型 sunState）。 */
export function sunAt(h: number): Sun {
  const x = wrapHour(h);
  const t = (x - SUNRISE) / (SUNSET - SUNRISE);
  const elevation = Math.sin(Math.PI * t);
  return {
    t,
    elevation,
    azimuth: Math.PI * clamp(t, 0, 1),
    day: smooth(-0.08, 0.32, elevation),
    night: 1 - smooth(-0.3, 0.06, elevation),
    twilight: clamp(1 - Math.abs(elevation) / 0.32, 0, 1),
    tn: fract((x - SUNSET) / (24 - (SUNSET - SUNRISE))),
    isDay: elevation > 0,
  };
}

/** HUD 用白天還是夜晚那組 token：clock 把它寫到 :root 的 data-phase（AD-8）。夜晚程度 > 0.55 為夜。 */
export function phaseAt(h: number): "day" | "night" {
  return sunAt(h).night > 0.55 ? "night" : "day";
}

export interface Lighting {
  sun: Sun;
  /** 唯一會投影的方向光：白天是太陽、夜裡是月亮 */
  key: { position: [number, number, number]; intensity: number; color: Rgba; moon: boolean };
  hemi: { sky: Rgba; ground: Rgba; intensity: number };
  exposure: number;
  /** 天空漸層：上緣、地平線、地平線以下（地平線色往地面環境光偏 45%） */
  sky: { top: Rgba; horizon: Rgba; low: Rgba };
}

/** 時刻 h 的光：方向光位置、強度、顏色，半球光，曝光與天色（原型 frame() 的天光分支）。 */
export function lightingAt(h: number, read: TokenReader = readCssToken): Lighting {
  const sun = sunAt(h);
  let position: [number, number, number];
  let intensity: number;
  if (sun.elevation > 0) {
    const e = sun.elevation * 1.1;
    const R = LIGHT.orbit;
    // 東為 +x、南為 +z：正午在南方高空
    position = [Math.cos(sun.azimuth) * Math.cos(e) * R, Math.sin(e) * R + 8, Math.sin(sun.azimuth) * Math.cos(e) * R * 0.85];
    intensity = LIGHT.sun * (0.38 + 0.62 * smooth(0, 0.35, sun.elevation));
  } else {
    position = [...LIGHT.moonPosition];
    intensity = LIGHT.moon * sun.night;
  }
  const lit = Math.max(sun.day, sun.twilight * 0.62);
  const ground = tokenAt("--amb-ground", h, read);
  const horizon = tokenAt("--sky-horizon", h, read);
  return {
    sun,
    key: { position, intensity, color: tokenAt("--light", h, read), moon: sun.elevation <= 0 },
    hemi: { sky: tokenAt("--amb-sky", h, read), ground, intensity: LIGHT.hemi[0] + (LIGHT.hemi[1] - LIGHT.hemi[0]) * lit },
    exposure: LIGHT.exposure[0] + (LIGHT.exposure[1] - LIGHT.exposure[0]) * lit,
    sky: { top: tokenAt("--sky-top", h, read), horizon, low: mixRgba(horizon, ground, 0.45) },
  };
}

/** 窗光的強度上限（原型天光 winNight）。 */
export const WINDOW_GLOW = 2.2;

/**
 * 街廓窗戶在時刻 h 的光（3.13，原型 frame()）：入夜亮起、黃昏帶一點暖光（glow 乘到 `--window` 自發光），
 * 亮著的窗比例 lit 從 20 點的 0.62 在 4 小時內降到 0.30，到 6 點回來；材質顏色不動（天光：日夜只靠光）。
 */
export function windowsAt(h: number): { glow: number; lit: number } {
  const x = wrapHour(h);
  const sun = sunAt(x);
  const golden = clamp(1 - Math.abs(sun.elevation - 0.1) / 0.3, 0, 1) * (sun.elevation > -0.15 ? 1 : 0);
  const late = x < 6 || x >= 20 ? smooth(0, 4, (x + 24 - 20) % 24) : 0;
  return { glow: WINDOW_GLOW * smooth(0.25, 0.9, sun.night) + 0.15 * golden, lit: 0.62 - 0.32 * late };
}

export interface SkyDiscs {
  /** 太陽中心：x 為畫面寬的比例、y 為距畫面上緣的 px；alpha 0–1 */
  sun: { x: number; y: number; alpha: number };
  moon: { x: number; y: number; alpha: number };
  stars: number;
}

/**
 * 天空上的太陽、月亮與星星（畫面座標，原型 updateSky）：太陽從右（東）到左（西）劃過地平線上方，
 * 月亮在夜裡走同一條弧；horizon 是地平線距畫面上緣的 px。
 */
export function skyDiscs(sun: Sun, horizon: number): SkyDiscs {
  const arc = Math.max(40, horizon - 70);
  return {
    sun: {
      x: (88 - 76 * clamp(sun.t, -0.05, 1.05)) / 100,
      y: horizon - Math.sin(Math.PI * clamp(sun.t, 0, 1)) * arc * 0.85 + (sun.elevation < 0 ? -sun.elevation * 60 : 0),
      alpha: smooth(-0.12, 0.05, sun.elevation),
    },
    moon: { x: (88 - 76 * sun.tn) / 100, y: horizon - Math.sin(Math.PI * sun.tn) * arc * 0.7, alpha: sun.night },
    stars: sun.night * 0.9,
  };
}
