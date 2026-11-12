import { describe, expect, it } from "vitest";
import {
  CLOSED,
  closedRanges,
  firstTrainHour,
  periodHint,
  periodName,
  shouldToast,
  sleepHint,
  sleepLevel,
  SLEEP_RAMP,
  whenLabel,
  type Headway,
} from "./periods";

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
    expect(periodHint(CLOSED)).toBeUndefined();
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
  it("進入停止營運不浮出（常駐睡覺提示取代，3.4）；醒來的 5 點照常浮出", () => {
    expect(shouldToast("末班車時段", CLOSED, true)).toBe(false);
    expect(shouldToast(CLOSED, "第一班車前後", true)).toBe(true);
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

// 班距：0–5 點 null、6 點起有值（與 basemap.json 的形狀相同）
const hw = (from: number): (readonly [number, number] | null)[] =>
  Array.from({ length: 24 }, (_, h) => (h >= from ? ([4, 10] as const) : null));
const HEADWAY = {
  BR: { weekday: hw(6), holiday: hw(6) },
  G: { weekday: hw(7), holiday: hw(8) },
} as unknown as Headway;

describe("firstTrainHour（3.4，只看官方班距）", () => {
  it("停駛中往後找第一個有班距的整點", () => {
    expect(firstTrainHour(HEADWAY, "weekday", 3)).toBe(6);
    expect(firstTrainHour(HEADWAY, "holiday", 2.7)).toBe(6);
  });
  it("任一線有班距就算（取最早的線）", () => {
    const onlyG = { G: HEADWAY.G } as Headway;
    expect(firstTrainHour(onlyG, "weekday", 3)).toBe(7);
    expect(firstTrainHour(onlyG, "holiday", 3)).toBe(8);
  });
  it("沒有班距或全部 null：不推時間", () => {
    expect(firstTrainHour(undefined, "weekday", 3)).toBeNull();
    expect(firstTrainHour({} as Headway, "weekday", 3)).toBeNull();
    expect(firstTrainHour({ BR: { weekday: hw(99), holiday: hw(99) } } as unknown as Headway, "weekday", 3)).toBeNull();
  });
});

describe("sleepHint", () => {
  it("推得出第一班車就附時間，否則只寫停駛中", () => {
    expect(sleepHint(6)).toEqual({ title: "捷運停駛中", sub: "約 6 點第一班車" });
    expect(sleepHint(null)).toEqual({ title: "捷運停駛中", sub: null });
  });
});

describe("sleepLevel（場景入睡程度）", () => {
  const R: [number, number][] = [[2, 5]];
  it("停駛前淡入、停駛中 1、一結束就醒", () => {
    expect(sleepLevel(1.5, R)).toBe(0);
    expect(sleepLevel(2 - SLEEP_RAMP / 2, R)).toBeCloseTo(0.5, 6);
    expect(sleepLevel(2, R)).toBe(1);
    expect(sleepLevel(3, R)).toBe(1);
    expect(sleepLevel(4.99, R)).toBe(1);
    expect(sleepLevel(5, R)).toBe(0);
    expect(sleepLevel(12, R)).toBe(0);
  });
  it("減少動態（ramp 0）是階梯", () => {
    expect(sleepLevel(1.99, R, 0)).toBe(0);
    expect(sleepLevel(2, R, 0)).toBe(1);
  });
  it("跨午夜：23.9 點已在 0 點開始的停駛前淡入；沒有停駛時永遠 0", () => {
    expect(sleepLevel(23.9, [[0, 1]])).toBeGreaterThan(0);
    expect(sleepLevel(24.5, [[0, 1]])).toBe(1);
    expect(sleepLevel(3, [])).toBe(0);
  });
});
