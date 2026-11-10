import { describe, expect, it } from "vitest";
import { readQuery, shareUrl, siteLabel, toQuery } from "./url";

describe("readQuery", () => {
  it("讀 hour 與 scene", () => {
    expect(readQuery("?scene=1&hour=6")).toEqual({ scene: true, hour: 6 });
    expect(readQuery("hour=0")).toEqual({ hour: 0 });
    expect(readQuery("")).toEqual({});
  });
  it("hour 不是 0–23 的整數就忽略", () => {
    expect(readQuery("?hour=24")).toEqual({});
    expect(readQuery("?hour=6.5")).toEqual({});
    expect(readQuery("?hour=-1")).toEqual({});
    expect(readQuery("?hour=abc&scene=0")).toEqual({});
  });
  it("和 toQuery 來回一致", () => {
    expect(readQuery(toQuery({ hour: 17 }))).toEqual({ hour: 17 });
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
