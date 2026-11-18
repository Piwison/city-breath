import { describe, expect, it } from "vitest";
import { FpsMeter, fpsStats, perfSummary, WINDOW_MS } from "./perfStats";

/** from 到 to（含）每 step 毫秒一格。 */
const frames = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let t = from; t <= to + 1e-9; t += step) out.push(t);
  return out;
};

describe("fpsStats（6.4：最近 30 秒的目前、平均、最低 fps）", () => {
  it("沒有格：全部 null", () => {
    expect(fpsStats([], 1000)).toEqual({ current: null, avg: null, min: null, seconds: 0 });
  });

  it("穩定 50 fps 跑 30 秒：目前、平均、最低都是 50", () => {
    const s = fpsStats(frames(0, 30_000, 20), 30_000);
    expect(s.current).toBe(50);
    expect(s.avg).toBeCloseTo(50, 6);
    expect(s.min).toBe(50);
    expect(s.seconds).toBe(30);
  });

  it("中間卡了一秒（只畫 10 格）：最低 10，平均被拉低", () => {
    const t = [...frames(0, 10_000, 20), ...frames(10_100, 11_000, 100), ...frames(11_020, 30_000, 20)];
    const s = fpsStats(t, 30_000);
    expect(s.min).toBe(10);
    expect(s.current).toBe(50);
    // 1491 格 − 1 ＝ 1490 個間隔 ÷ 30 秒
    expect(s.avg).toBeCloseTo((t.length - 1) / 30, 6);
    expect(s.avg!).toBeLessThan(50);
  });

  it("只看最近 30 秒：更早的慢格不算", () => {
    // 前 10 秒 10 fps，之後 30 秒 50 fps
    const t = [...frames(0, 10_000, 100), ...frames(10_020, 40_000, 20)];
    const s = fpsStats(t, 40_000);
    expect(s.min).toBe(50);
    expect(s.avg).toBeCloseTo(50, 6);
    expect(s.seconds).toBe(30);
  });

  it("取樣不到 1 秒：目前與最低是 null，平均照算", () => {
    const s = fpsStats(frames(0, 500, 20), 500);
    expect(s.current).toBeNull();
    expect(s.min).toBeNull();
    expect(s.avg).toBeCloseTo(50, 6);
    expect(s.seconds).toBe(0.5);
  });

  it("最後一格之後停住（分頁卡住）：目前的那一秒是 0", () => {
    const s = fpsStats(frames(0, 5000, 20), 7000);
    expect(s.current).toBe(0);
    expect(s.min).toBe(0);
  });

  it("只用完整的 1 秒區段：2.5 秒的取樣切成 2 段", () => {
    // 前 1.5 秒 50 fps，最後 1 秒 25 fps
    const t = [...frames(0, 1500, 20), ...frames(1540, 2500, 40)];
    const s = fpsStats(t, 2500);
    expect(s.current).toBe(25);
    expect(s.min).toBe(25);
  });
});

describe("FpsMeter", () => {
  it("只留視窗內的格；reset 清空", () => {
    const m = new FpsMeter();
    for (const t of frames(0, 40_000, 20)) m.push(t);
    expect(m.stats(40_000).seconds).toBe(WINDOW_MS / 1000);
    expect(m.stats(40_000).min).toBe(50);
    m.reset();
    expect(m.stats(40_000)).toEqual({ current: null, avg: null, min: null, seconds: 0 });
  });
});

describe("perfSummary（複製的文字）", () => {
  it("包含裝置、fps、畫面狀態與首次載入", () => {
    const text = perfSummary(
      {
        stats: { current: 58, avg: 57.25, min: 49, seconds: 30 },
        dpr: 2,
        deviceDpr: 3,
        tier: "full",
        calls: 140,
        triangles: 120_000,
        dots: 240,
        trains: 18,
        bootSeconds: 2.43,
      },
      { hour: 8, dayType: "weekday", playing: false, district: "63000030", station: null },
      { userAgent: "UA-test", width: 390, height: 844, href: "https://x.example/?debug=perf", date: new Date("2026-11-18T06:00:00Z") },
    );
    expect(text).toContain("瀏覽器：UA-test");
    expect(text).toContain("視窗：390×844，裝置 DPR 3.00，畫面 DPR 2.00");
    expect(text).toContain("畫質：full");
    expect(text).toContain("首次載入：2.4 秒");
    expect(text).toContain("fps：目前 58，30 秒平均 57.3，最低 49（取樣 30 秒）");
    expect(text).toContain("draw call：140");
    expect(text).toContain("粒子（流向光點）：240，列車：18");
    expect(text).toContain("畫面：平日 8 點（暫停），行政區 63000030，車站 無");
    expect(text).toContain("2026-11-18T06:00:00.000Z");
  });
  it("還沒量到的值顯示「—」", () => {
    const text = perfSummary(
      { stats: { current: null, avg: null, min: null, seconds: 0 }, dpr: 1, deviceDpr: 1, tier: "lite", calls: 0, triangles: 0, dots: 0, trains: 0, bootSeconds: null },
      { hour: 5, dayType: "holiday", playing: true, district: null, station: null },
      { userAgent: "", width: 1, height: 1, href: "", date: new Date(0) },
    );
    expect(text).toContain("首次載入：—");
    expect(text).toContain("fps：目前 —，30 秒平均 —，最低 —");
    expect(text).toContain("假日 5 點（播放中）");
  });
});
