import { describe, expect, it } from "vitest";
import {
  anyTrainAt,
  GAP_PER_MIN,
  headwayMinutes,
  serviceStartCrossed,
  trainGap,
  trainLines,
  trainSlots,
  type TrainGap,
} from "./trains";
import basemapJson from "../../public/data/basemap.json";
import type { BasemapFile, HeadwayHours } from "./types";

const basemap = basemapJson as unknown as BasemapFile;
const H = basemap.headway;

/** 6–23 點每小時 [6, 6]，其餘 null（像真實資料的營運時段） */
const hours = (v: [number, number] | null, from = 6, to = 23): HeadwayHours =>
  Array.from({ length: 24 }, (_, h) => (h >= from && h <= to ? v : null));

const gapAt = (hrs: HeadwayHours | undefined, t: number, smooth = false): TrainGap => trainGap(hrs, t, smooth);

describe("代表班距（區間中點）", () => {
  it("[6,6] → 6、[8,10] → 9、[2,4] → 3", () => {
    expect(headwayMinutes([6, 6])).toBe(6);
    expect(headwayMinutes([8, 10])).toBe(9);
    expect(headwayMinutes([2, 4])).toBe(3);
  });
  it("null、0 或缺 → null（沒有列車）", () => {
    expect(headwayMinutes(null)).toBeNull();
    expect(headwayMinutes(undefined)).toBeNull();
    expect(headwayMinutes([0, 0])).toBeNull();
  });
});

describe("班距換算列車間隔", () => {
  it("間隔＝代表班距 × GAP_PER_MIN", () => {
    expect(gapAt(hours([8, 10]), 12).gap).toBeCloseTo(9 * GAP_PER_MIN);
    expect(gapAt(hours([6, 6]), 12)).toEqual({ gap: 6 * GAP_PER_MIN, presence: 1 });
  });

  it("平日板南線 8 點比 14 點密（2026 實際班距）", () => {
    const bl = H.BL!.weekday;
    const peak = gapAt(bl, 8).gap;
    const noon = gapAt(bl, 14).gap;
    expect(peak).toBeLessThan(noon);
    // 同一段軌道上，8 點的班數多於 14 點
    const out: number[] = [];
    expect(trainSlots(26, peak, 0, out)).toBeGreaterThan(trainSlots(26, noon, 0, out));
  });

  it("所有有班距的線，平日尖峰（8 點）都不比午間（14 點）疏", () => {
    for (const d of Object.values(H)) expect(gapAt(d!.weekday, 8).gap).toBeLessThanOrEqual(gapAt(d!.weekday, 14).gap);
  });

  it("播放中整點前平滑換間隔：7:50 介於 7 點與 8 點之間，7:30 還是 7 點的", () => {
    const hrs = hours([8, 10]);
    hrs[8] = [6, 6];
    const g7 = 9 * GAP_PER_MIN;
    const g8 = 6 * GAP_PER_MIN;
    expect(gapAt(hrs, 7.5, true).gap).toBeCloseTo(g7);
    const mid = gapAt(hrs, 7.88, true).gap;
    expect(mid).toBeLessThan(g7);
    expect(mid).toBeGreaterThan(g8);
    expect(gapAt(hrs, 8, true).gap).toBeCloseTo(g8);
    // 暫停：用整點值
    expect(gapAt(hrs, 7.88, false).gap).toBeCloseTo(g7);
  });
});

describe("營運時段", () => {
  it("班距 null 的小時沒有列車（平日 3 點、0 點）", () => {
    for (const d of Object.values(H)) {
      expect(gapAt(d!.weekday, 3).presence).toBe(0);
      expect(gapAt(d!.weekday, 3, true).presence).toBe(0);
      expect(gapAt(d!.holiday, 0.5, true).presence).toBe(0);
    }
    expect(anyTrainAt(H, "weekday", 3)).toBe(false);
    expect(anyTrainAt(H, "weekday", 6)).toBe(true);
  });

  it("播放中首班車長出、收班前縮小；暫停時直接有或沒有", () => {
    const hrs = hours([6, 6]);
    expect(gapAt(hrs, 6, true).presence).toBe(0);
    expect(gapAt(hrs, 6.05, true).presence).toBeGreaterThan(0);
    expect(gapAt(hrs, 6.05, true).presence).toBeLessThan(1);
    expect(gapAt(hrs, 6.2, true).presence).toBe(1);
    expect(gapAt(hrs, 23.5, true).presence).toBe(1);
    expect(gapAt(hrs, 23.95, true).presence).toBeLessThan(1);
    expect(gapAt(hrs, 6.05, false).presence).toBe(1);
    expect(gapAt(hrs, 23.95, false).presence).toBe(1);
  });
});

describe("環狀線排除", () => {
  it("basemap 的班距沒有環狀線，Y 不在要畫的路線裡；其他路線都在", () => {
    const lines = trainLines(H);
    expect(lines.has("Y")).toBe(false);
    for (const id of ["BR", "R", "R-3", "G", "G-3", "O", "BL"] as const) expect(lines.has(id)).toBe(true);
    // 軌道裡有環狀線的段，但都被排除
    expect(basemap.tracks.some((t) => t.line === "Y")).toBe(true);
    expect(basemap.tracks.filter((t) => lines.has(t.line)).every((t) => t.line !== "Y")).toBe(true);
    expect(gapAt(H.Y?.weekday, 8).presence).toBe(0);
  });
});

describe("trainSlots", () => {
  it("從段頭每 gap 一班，相位往前推；只取相位的小數", () => {
    const out: number[] = [];
    expect(trainSlots(10, 3, 0, out)).toBe(4);
    expect(out).toEqual([0, 3, 6, 9]);
    trainSlots(10, 3, 2.5, out);
    expect(out).toEqual([1.5, 4.5, 7.5]);
  });
  it("段比間隔短時有時沒有車（不會因為『至少一班』比班距密）", () => {
    const out: number[] = [];
    expect(trainSlots(1, 9.6, 0.5, out)).toBe(0);
    expect(trainSlots(1, 9.6, 0.05, out)).toBe(1);
  });
  it("gap 0 或段長 0 → 沒有車", () => {
    const out: number[] = [1];
    expect(trainSlots(10, 0, 0, out)).toBe(0);
    expect(out).toEqual([]);
    expect(trainSlots(0, 3, 0, out)).toBe(0);
  });
});

describe("第一班車（波紋觸發）", () => {
  it("播放中跨過 6 點觸發；5 點、7 點不觸發", () => {
    expect(serviceStartCrossed(H, "weekday", 5.98, 6.01)).toBe(true);
    expect(serviceStartCrossed(H, "holiday", 5.98, 6.01)).toBe(true);
    expect(serviceStartCrossed(H, "weekday", 4.98, 5.01)).toBe(false);
    expect(serviceStartCrossed(H, "weekday", 6.98, 7.01)).toBe(false);
  });
  it("往回走、一次跳太遠（拖時間軸）不算；換日照常判斷", () => {
    expect(serviceStartCrossed(H, "weekday", 6.01, 5.98)).toBe(false);
    expect(serviceStartCrossed(H, "weekday", 3, 6.5)).toBe(false);
    expect(serviceStartCrossed(H, "weekday", 23.98, 0.01)).toBe(false);
    const all = { BL: { weekday: hours([6, 6], 0, 23), holiday: hours([6, 6], 0, 23) } };
    all.BL.weekday[23] = null;
    expect(serviceStartCrossed(all, "weekday", 23.98, 0.01)).toBe(true);
  });
  it("沒有班距資料 → 不觸發", () => {
    expect(serviceStartCrossed(undefined, "weekday", 5.98, 6.01)).toBe(false);
  });
});
