import { describe, expect, it } from "vitest";
import { shareUrl, siteLabel, toQuery } from "./url";

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
