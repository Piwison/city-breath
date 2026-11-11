import { describe, expect, it } from "vitest";
import { readQuery, shareUrl, siteLabel, toQuery } from "./url";

describe("readQuery", () => {
  it("讀 hour 與 day", () => {
    expect(readQuery("?hour=6&day=holiday")).toEqual({ hour: 6, dayType: "holiday" });
    expect(readQuery("hour=0")).toEqual({ hour: 0 });
    expect(readQuery("")).toEqual({});
  });
  it("首頁就是場景：舊的 ?scene=1 不再有作用", () => {
    expect(readQuery("?scene=1")).toEqual({});
  });
  it("hour 不是 0–23 的整數、day 不是平日／假日就忽略", () => {
    expect(readQuery("?hour=24")).toEqual({});
    expect(readQuery("?hour=6.5")).toEqual({});
    expect(readQuery("?hour=-1")).toEqual({});
    expect(readQuery("?hour=abc&day=event")).toEqual({});
  });
  it("和 toQuery 來回一致", () => {
    expect(readQuery(toQuery({ hour: 17, dayType: "weekday" }))).toEqual({ hour: 17, dayType: "weekday" });
  });
});

describe("url", () => {
  it("固定順序序列化，車站用站 ID", () => {
    expect(toQuery({ commute: { o: "sd821b2ec", d: "s0225d9de", h: 8 }, month: "2026-09", dayType: "weekday" })).toBe(
      "month=2026-09&day=weekday&from=sd821b2ec&to=s0225d9de&at=8",
    );
    expect(toQuery({ hour: 0 })).toBe("hour=0");
    expect(toQuery({})).toBe("");
  });

  it("shareUrl 換掉原有的 query 與 hash", () => {
    expect(shareUrl({ month: "2026-09" }, "https://city.example/app/?x=1#y")).toBe("https://city.example/app/?month=2026-09");
  });

  it("siteLabel 去掉協定、query 與結尾斜線", () => {
    expect(siteLabel("https://city.example/?month=2026-09")).toBe("city.example");
    expect(siteLabel("http://localhost:5173/app/?a=1")).toBe("localhost:5173/app");
  });
});
