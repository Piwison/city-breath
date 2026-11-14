import { afterEach, describe, expect, it } from "vitest";
import { triggerWave, wave, waveAt, waveGlow, wavePulse, waveRunning, WAVE_DELAY, WAVE_PEAK, WAVE_RISE, WAVE_SETTLE } from "./firstTrain";

afterEach(() => {
  wave.start = Number.NEGATIVE_INFINITY;
});

describe("wavePulse", () => {
  it("觸發前與結束後是 1", () => {
    expect(wavePulse(-0.1)).toBe(1);
    expect(wavePulse(0)).toBe(1);
    expect(wavePulse(WAVE_RISE + WAVE_SETTLE)).toBe(1);
    expect(wavePulse(5)).toBe(1);
  });
  it("彈到 1.8 再彈回 1", () => {
    expect(wavePulse(WAVE_RISE / 2)).toBeGreaterThan(1);
    expect(wavePulse(WAVE_RISE - 1e-6)).toBeCloseTo(WAVE_PEAK, 3);
    expect(wavePulse(WAVE_RISE + WAVE_SETTLE - 1e-6)).toBeCloseTo(1, 2);
  });
});

describe("waveAt", () => {
  it("沒觸發過：全部 1、不在傳", () => {
    expect(waveAt(10, 0)).toBe(1);
    expect(waveRunning(10, 40)).toBe(false);
  });
  it("離圓心越遠越晚彈：一圈圈往外", () => {
    triggerWave(100);
    const now = 100 + WAVE_RISE;
    expect(waveAt(now, 0)).toBeCloseTo(WAVE_PEAK, 2);
    // 遠 10 單位的站晚 0.3 秒，此刻還沒開始
    expect(waveAt(now, 10)).toBe(1);
    expect(waveAt(now + 10 * WAVE_DELAY, 10)).toBeCloseTo(WAVE_PEAK, 2);
    expect(waveRunning(now, 40)).toBe(true);
    expect(waveRunning(100 + 40 * WAVE_DELAY + WAVE_RISE + WAVE_SETTLE + 0.01, 40)).toBe(false);
  });
});

describe("waveGlow", () => {
  it("縮放越大越亮；1 以下不亮", () => {
    expect(waveGlow(1)).toBe(0);
    expect(waveGlow(0.9)).toBe(0);
    expect(waveGlow(WAVE_PEAK)).toBeCloseTo(0.6);
  });
});
