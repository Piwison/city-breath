import { describe, expect, it } from "vitest";
import tokensCss from "../styles/tokens.css?raw";
import designMd from "../../../DESIGN.md?raw";
import { cssTokenReader, parseColor, type TokenReader } from "../styles/tokens";
import { LIGHT, PHASE_KEYS, SUNRISE, SUNSET, lightingAt, phaseAt, phaseSpan, skyDiscs, sunAt, tokenAt } from "./daylight";

const reader = (vars: Record<string, string>): TokenReader => (name) => vars[name] ?? "";
const css = cssTokenReader(tokensCss, "day");

describe("phaseSpan", () => {
  it("同相位的關鍵點之間維持該相位", () => {
    expect(phaseSpan(0)).toMatchObject({ from: "night", to: "night" });
    expect(phaseSpan(6)).toMatchObject({ from: "dawn", to: "dawn" });
    expect(phaseSpan(12)).toMatchObject({ from: "day", to: "day" });
    expect(phaseSpan(18)).toMatchObject({ from: "dusk", to: "dusk" });
    expect(phaseSpan(23)).toMatchObject({ from: "night", to: "night" });
  });
  it("相鄰相位之間給比例", () => {
    expect(phaseSpan(5.25)).toEqual({ from: "night", to: "dawn", t: 0.5 });
    expect(phaseSpan(19.3)).toMatchObject({ from: "night", to: "night", t: 0 });
  });
  it("超出 0–24 時繞回", () => {
    expect(phaseSpan(24)).toEqual(phaseSpan(0));
    expect(phaseSpan(-1)).toEqual(phaseSpan(23));
    expect(phaseSpan(29.25)).toEqual(phaseSpan(5.25));
  });
  it("關鍵時刻與 DESIGN.md 一致", () => {
    const listed = /關鍵時刻 ([\d.／]+) 時/.exec(designMd)![1].split("／").map(Number);
    expect(PHASE_KEYS.map(([h]) => h).filter((h) => h > 0 && h < 24)).toEqual(listed.filter((h) => h > 0));
  });
});

describe("tokenAt", () => {
  const read = reader({
    "--sky-night": "#000000",
    "--sky-dawn": "#ffffff",
    "--sky-day": "#ffffff",
    "--sky-dusk": "#000000",
    "--water": "#7db3dc",
    "--hud-bg-night": "rgba(0, 0, 0, 0.2)",
    "--hud-bg-dawn": "rgba(0, 0, 0, 0.6)",
  });
  it("相位內等於該相位的值", () => {
    expect(tokenAt("--sky", 12, read)).toEqual([255, 255, 255, 1]);
    expect(tokenAt("--sky", 2, read)).toEqual([0, 0, 0, 1]);
  });
  it("相位間在線性 sRGB 內插", () => {
    expect(tokenAt("--sky", 5.25, read)).toEqual([188, 188, 188, 1]);
    expect(tokenAt("--hud-bg", 5.25, read)[3]).toBeCloseTo(0.4);
  });
  it("超出 0–24 的時刻繞回", () => {
    expect(tokenAt("--sky", 24, read)).toEqual(tokenAt("--sky", 0, read));
    expect(tokenAt("--sky", -1, read)).toEqual(tokenAt("--sky", 23, read));
  });
  it("沒有相位版本時用全天值（材質色整天固定）", () => {
    expect(tokenAt("--water", 5.25, read)).toEqual([125, 179, 220, 1]);
    for (const h of [0, 6, 12, 18]) expect(tokenAt("--terrain-3", h, css)).toEqual(parseColor(css("--terrain-3")));
  });
  it("token 不存在時丟錯", () => {
    expect(() => tokenAt("--nope", 8, read)).toThrow("--nope");
  });
  it("讀 tokens.css 的天空色：正午就是 day 值", () => {
    expect(tokenAt("--sky-top", 12, css)).toEqual(parseColor(css("--sky-top-day")));
  });
});

describe("sunAt", () => {
  it("日出、正午、日落", () => {
    expect(sunAt(SUNRISE).elevation).toBeCloseTo(0, 9);
    expect(sunAt(SUNSET).elevation).toBeCloseTo(0, 9);
    const noon = sunAt((SUNRISE + SUNSET) / 2);
    expect(noon.elevation).toBeCloseTo(1, 9);
    expect(noon.azimuth).toBeCloseTo(Math.PI / 2, 9);
    expect(noon.day).toBe(1);
    expect(noon.night).toBe(0);
  });
  it("東升西落：早上方位接近 0（東），傍晚接近 π（西）", () => {
    expect(sunAt(7).azimuth).toBeLessThan(Math.PI / 4);
    expect(sunAt(17).azimuth).toBeGreaterThan((3 * Math.PI) / 4);
  });
  it("深夜是夜", () => {
    expect(sunAt(0).night).toBe(1);
    expect(sunAt(23).isDay).toBe(false);
  });
});

describe("phaseAt", () => {
  it("依太陽高度切換 HUD 日夜（夜晚程度 > 0.55）", () => {
    expect(phaseAt(12)).toBe("day");
    expect(phaseAt(0)).toBe("night");
    expect(phaseAt(5)).toBe("night");
    expect(phaseAt(6)).toBe("day");
    expect(phaseAt(19)).toBe("night");
  });
});

describe("lightingAt", () => {
  it("正午：太陽在南方高空（+z、+y），全強度，曝光 1.0", () => {
    const L = lightingAt(11.85, css);
    const [x, y, z] = L.key.position;
    expect(L.key.moon).toBe(false);
    expect(y).toBeGreaterThan(100);
    expect(z).toBeGreaterThan(0);
    expect(Math.abs(x)).toBeLessThan(5);
    expect(L.key.intensity).toBeCloseTo(LIGHT.sun, 6);
    expect(L.exposure).toBeCloseTo(LIGHT.exposure[1], 6);
    expect(L.hemi.intensity).toBeCloseTo(LIGHT.hemi[1], 6);
    expect(L.key.color).toEqual(parseColor(css("--light-day")));
  });
  it("清晨太陽在東（+x），黃昏在西（−x）", () => {
    expect(lightingAt(6.5, css).key.position[0]).toBeGreaterThan(50);
    expect(lightingAt(17.5, css).key.position[0]).toBeLessThan(-50);
  });
  it("深夜：換月光、月光色，曝光 0.78", () => {
    const L = lightingAt(0, css);
    expect(L.key.moon).toBe(true);
    expect(L.key.position).toEqual(LIGHT.moonPosition);
    expect(L.key.intensity).toBeCloseTo(LIGHT.moon, 6);
    expect(L.key.color).toEqual(parseColor(css("--light-night")));
    expect(L.exposure).toBeCloseTo(LIGHT.exposure[0], 6);
    expect(L.sky.top).toEqual(parseColor(css("--sky-top-night")));
  });
  it("曝光只在 0.78–1.0 之間", () => {
    for (let h = 0; h < 24; h += 0.25) {
      const e = lightingAt(h, css).exposure;
      expect(e).toBeGreaterThanOrEqual(0.78 - 1e-9);
      expect(e).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("skyDiscs", () => {
  it("太陽白天在地平線上方、從右往左走；夜裡看不到太陽、看得到月亮與星星", () => {
    const morning = skyDiscs(sunAt(8), 300);
    const evening = skyDiscs(sunAt(16), 300);
    expect(morning.sun.x).toBeGreaterThan(evening.sun.x);
    expect(morning.sun.y).toBeLessThan(300);
    expect(morning.sun.alpha).toBe(1);
    const night = skyDiscs(sunAt(23), 300);
    expect(night.sun.alpha).toBe(0);
    expect(night.moon.alpha).toBe(1);
    expect(night.stars).toBeCloseTo(0.9, 6);
  });
});
