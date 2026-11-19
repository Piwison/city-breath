import { describe, expect, it } from "vitest";
import { computeCommute, formatCount, nearbyHours } from "./commute";
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

describe("早一點、晚一點出門呢？（4.2）", () => {
  // 7、8、9 點有車；7 點到站 1 少於 10 人（null），9 點 800 人；其餘停止營運
  const multi: OdShard = {
    ...shard,
    weekday: Array.from({ length: 24 }, (_, h) =>
      h === 7 ? [5, null, 20, 30] : h === 8 ? [40, 500, null, 1200] : h === 9 ? [8, 800, 12, 300] : h === 0 || h === 23 ? [1, 15, 1, 1] : null,
    ),
  };

  it("前一小時、這小時、後一小時的同路人數；少於 10 人是 null", () => {
    expect(nearbyHours(multi, 0, 1, "weekday", 8)).toEqual([
      { hour: 7, offset: -1, operating: true, companions: null },
      { hour: 8, offset: 0, operating: true, companions: 500 },
      { hour: 9, offset: 1, operating: true, companions: 800 },
    ]);
  });

  it("停止營運的鄰格標 operating=false（不是 0）", () => {
    const cells = nearbyHours(multi, 0, 1, "weekday", 7);
    expect(cells[0]).toEqual({ hour: 6, offset: -1, operating: false, companions: null });
    expect(cells[2].companions).toBe(500);
  });

  it("繞回：0 點的前一格是 23 點、23 點的後一格是 0 點（和卡內時間列一樣）", () => {
    expect(nearbyHours(multi, 0, 1, "weekday", 0).map((c) => c.hour)).toEqual([23, 0, 1]);
    expect(nearbyHours(multi, 0, 1, "weekday", 23).map((c) => [c.hour, c.companions])).toEqual([
      [22, null],
      [23, 15],
      [0, 15],
    ]);
  });
});
