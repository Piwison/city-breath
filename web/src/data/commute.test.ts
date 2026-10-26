import { describe, expect, it } from "vitest";
import { computeCommute, formatCount } from "./commute";
import type { OdShard } from "./types";

const hours = <T,>(at: number, v: T) => Array.from({ length: 24 }, (_, h) => (h === at ? v : null));

const shard: OdShard = {
  v: 1,
  origin: "s0",
  month: "2026-09",
  // 站 0 是起站；8 點：站 1=500、站 2=null(<10)、站 3=1200、自己=40
  weekday: hours(8, [40, 500, null, 1200]),
  holiday: hours(8, [null, null, null, null]),
  weekdayDepartures: hours(8, 1745),
  holidayDepartures: hours(8, 5),
};

describe("computeCommute", () => {
  it("回傳同路人數與名次（不含起站本身）", () => {
    const r = computeCommute(shard, 0, 1, "weekday", 8)!;
    expect(r.companions).toBe(500);
    expect(r.companionsLabel).toBe("500 人");
    expect(r.rank).toBe(2);
    expect(r.rankedOf).toBe(2);
    expect(r.departures).toBe(1745);
    expect(r.top.map((t) => t.station)).toEqual([3, 1]);
  });

  it("少於 10 人只顯示「少於 10 人」且不給名次", () => {
    const r = computeCommute(shard, 0, 2, "weekday", 8)!;
    expect(r.companions).toBeNull();
    expect(r.companionsLabel).toBe("少於 10 人");
    expect(r.rank).toBeNull();
  });

  it("停止營運時段回傳 null", () => {
    expect(computeCommute(shard, 0, 1, "weekday", 3)).toBeNull();
  });

  it("formatCount 加千分位", () => {
    expect(formatCount(12345)).toBe("12,345 人");
  });
});
