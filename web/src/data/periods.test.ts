import { describe, expect, it } from "vitest";
import { CLOSED, closedRanges, periodHint, periodName, shouldToast, whenLabel } from "./periods";

describe("periodName", () => {
  it("平日與假日的尖峰名不同", () => {
    expect(periodName(8, "weekday", true)).toBe("早晨通勤尖峰");
    expect(periodName(8, "holiday", true)).toBe("假日早晨");
    expect(periodName(18, "weekday", true)).toBe("傍晚下班尖峰");
    expect(periodName(18, "holiday", true)).toBe("假日傍晚");
  });
  it("一天各時段", () => {
    expect(periodName(6, "weekday", true)).toBe("城市醒來");
    expect(periodName(10, "weekday", true)).toBe("上午");
    expect(periodName(12.9, "weekday", true)).toBe("午間");
    expect(periodName(15, "holiday", true)).toBe("下午");
    expect(periodName(21, "weekday", true)).toBe("夜晚");
    expect(periodName(23, "weekday", true)).toBe("末班車時段");
    expect(periodName(0, "weekday", true)).toBe("末班車時段");
  });
  it("沒有資料的小時是停止營運（看資料，不看鐘點）；5 點是第一班車前後", () => {
    expect(periodName(3, "weekday", false)).toBe(CLOSED);
    expect(periodName(14, "weekday", false)).toBe(CLOSED);
    expect(periodName(5, "weekday", true)).toBe("第一班車前後");
    expect(periodName(5, "weekday", false)).toBe("第一班車前後");
  });
  it("副標只給幾個時段", () => {
    expect(periodHint("早晨通勤尖峰")).toBe("線條變粗、光點變快");
    expect(periodHint(CLOSED)).toBe("捷運休息中");
    expect(periodHint("午間")).toBeUndefined();
  });
});

describe("shouldToast", () => {
  it("播放中時段換了才浮出；開場第一次與暫停中不浮出", () => {
    expect(shouldToast("城市醒來", "早晨通勤尖峰", true)).toBe(true);
    expect(shouldToast("城市醒來", "早晨通勤尖峰", false)).toBe(false);
    expect(shouldToast(null, "城市醒來", true)).toBe(false);
    expect(shouldToast("午間", "午間", true)).toBe(false);
  });
});

describe("closedRanges", () => {
  it("把連續停止營運的小時合成半開區間", () => {
    expect(closedRanges((h) => h < 2 || h > 4)).toEqual([[2, 5]]);
    expect(closedRanges(() => true)).toEqual([]);
    expect(closedRanges((h) => h !== 0 && h !== 23)).toEqual([
      [0, 1],
      [23, 24],
    ]);
  });
});

describe("whenLabel（小卡標明時段與日型，走查 F1）", () => {
  it("平日 8 點、假日整天", () => {
    expect(whenLabel("weekday", 8)).toBe("平日 8 點");
    expect(whenLabel("holiday", "day")).toBe("假日整天");
    expect(whenLabel("holiday", 18.7)).toBe("假日 18 點");
  });
  it("停止營運的小時加註", () => {
    expect(whenLabel("weekday", 3, false)).toBe("平日 3 點・停止營運");
  });
});
