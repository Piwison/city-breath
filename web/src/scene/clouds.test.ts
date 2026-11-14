import { describe, expect, it } from "vitest";
import { CLOUD_MARGIN, CLOUD_OPACITY, cloudFade, cloudLayout, driftX, FADE_FAR, FADE_NEAR } from "./clouds";

const box = { cx: 0, cz: 0, w: 80, d: 110 };
const HOME = 208;

describe("cloudFade", () => {
  it("白天全景：最濃", () => {
    expect(cloudFade(12, HOME)).toBeCloseTo(CLOUD_OPACITY);
  });
  it("深夜沒有雲", () => {
    expect(cloudFade(2, HOME)).toBe(0);
    expect(cloudFade(22, HOME)).toBe(0);
  });
  it("放大看細節時淡出", () => {
    expect(cloudFade(12, FADE_NEAR)).toBe(0);
    expect(cloudFade(12, 60)).toBe(0);
    const mid = cloudFade(12, (FADE_NEAR + FADE_FAR) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(CLOUD_OPACITY);
    expect(cloudFade(12, FADE_FAR)).toBeCloseTo(CLOUD_OPACITY);
  });
});

describe("cloudLayout", () => {
  it("決定性：每朵 4 團，都在底座範圍上空", () => {
    const a = cloudLayout(box, 4);
    expect(a).toEqual(cloudLayout(box, 4));
    expect(a.clouds).toHaveLength(4);
    expect(a.puffs).toHaveLength(16);
    for (const c of a.clouds) {
      expect(Math.abs(c.x)).toBeLessThanOrEqual(box.w / 2);
      expect(Math.abs(c.z)).toBeLessThanOrEqual(box.d / 2);
      expect(c.y).toBeGreaterThan(15);
    }
    expect(cloudLayout(box, 2).puffs).toHaveLength(8);
  });
});

describe("driftX", () => {
  it("往東飄，出了東緣就從西緣外回來", () => {
    expect(driftX(0, 5, box)).toBeCloseTo(5);
    const east = box.w / 2 + CLOUD_MARGIN;
    expect(driftX(east - 1, 2, box)).toBeCloseTo(-east + 1);
  });
});
