import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seek } from "./clock";
import { readQuery, shareUrl, siteLabel, syncUrl, toQuery, URL_WRITE_MS, urlStateOf, writeQuery } from "./url";
import { setDayType, setPlaying } from "./view";

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

describe("readQuery（3.3 擴充：之後的票的鍵也讀得回來）", () => {
  it("讀 month 與通勤起訖", () => {
    expect(readQuery("?month=2026-09&from=a1&to=b2&at=8")).toEqual({ month: "2026-09", commute: { o: "a1", d: "b2", h: 8 } });
  });
  it("不合法的月份、不完整的通勤忽略", () => {
    expect(readQuery("?month=2026-13&from=a1&at=8")).toEqual({});
    expect(readQuery("?from=a1&to=b2&at=24")).toEqual({});
  });
});

describe("writeQuery（合併並保留不認得的鍵）", () => {
  it("寫回 hour 與 day，固定順序，不認得的鍵留在後面", () => {
    expect(writeQuery("?x=1&hour=8", { hour: 14, dayType: "holiday" })).toBe("day=holiday&hour=14&x=1");
  });
  it("patch 沒給的鍵沿用原值（之後的票寫的 month、通勤不會被洗掉）", () => {
    expect(writeQuery("month=2026-09&from=a1&to=b2&at=8", { hour: 6, dayType: "weekday" })).toBe(
      "month=2026-09&day=weekday&hour=6&from=a1&to=b2&at=8",
    );
  });
  it("和 readQuery 來回一致", () => {
    const s = writeQuery("", urlStateOf({ hour: 0, dayType: "weekday" }));
    expect(readQuery(s)).toEqual({ hour: 0, dayType: "weekday" });
  });
});

describe("syncUrl（畫面狀態 → 網址）", () => {
  let search = "";
  const writes: string[] = [];
  let stop = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    search = "?ref=share";
    writes.length = 0;
    setPlaying(false);
    setDayType("weekday");
    seek(8);
    stop = syncUrl(
      (s) => {
        writes.push(s);
        search = `?${s}`;
      },
      () => search,
    );
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("開場補齊 hour 與 day，保留原有的鍵", () => {
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes).toEqual(["day=weekday&hour=8&ref=share"]);
  });

  it("hour、dayType 變了才寫；拖動時節流成一次", () => {
    vi.advanceTimersByTime(URL_WRITE_MS);
    for (let t = 8; t <= 20; t += 0.5) seek(t);
    setDayType("holiday");
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes).toEqual(["day=weekday&hour=8&ref=share", "day=holiday&hour=20&ref=share"]);
    seek(20.5);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes).toHaveLength(2);
  });

  it("重新整理：寫出的網址讀回同一刻", () => {
    seek(17.4);
    setDayType("holiday");
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(readQuery(search)).toEqual({ hour: 17, dayType: "holiday" });
  });

  it("取消後不再寫", () => {
    stop();
    seek(3);
    vi.advanceTimersByTime(URL_WRITE_MS * 2);
    expect(writes).toEqual([]);
  });
});
