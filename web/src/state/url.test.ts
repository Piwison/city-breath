import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seek } from "./clock";
import {
  clearViewQuery, parseQuery, perfDebug, planLink, readQuery, shareLink, shareUrl, siteLabel, syncUrl, toQuery, URL_WRITE_MS, urlStateOf, writeQuery,
} from "./url";
import { clearCommute, getView, restoreCommute, restoreSelection, setDayType, setMonth, setPlaying } from "./view";

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

  it("播放中整點變了不寫；按播放把 hour 拿掉、暫停再寫回（Piwi 2026-11-12）", () => {
    vi.advanceTimersByTime(URL_WRITE_MS);
    setPlaying(true);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes).toEqual(["day=weekday&hour=8&ref=share", "day=weekday&ref=share"]);
    for (let t = 8; t <= 14; t += 0.25) {
      seek(t);
      vi.advanceTimersByTime(URL_WRITE_MS);
    }
    expect(writes).toHaveLength(2);
    // 播放中重新整理：網址沒有 hour，照原本從清晨自動播放
    expect(readQuery(search).hour).toBeUndefined();
    setDayType("holiday");
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes.at(-1)).toBe("day=holiday&ref=share");
    setPlaying(false);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(writes.at(-1)).toBe("day=holiday&hour=14&ref=share");
  });

  it("開場自動播放時不寫網址", () => {
    stop();
    writes.length = 0;
    setPlaying(true);
    stop = syncUrl(
      (s) => writes.push(s),
      () => "",
    );
    vi.advanceTimersByTime(URL_WRITE_MS * 3);
    seek(9);
    vi.advanceTimersByTime(URL_WRITE_MS * 3);
    expect(writes).toEqual([]);
  });

  it("取消後不再寫", () => {
    stop();
    seek(3);
    vi.advanceTimersByTime(URL_WRITE_MS * 2);
    expect(writes).toEqual([]);
  });
});

describe("3.15 月份、行政區、站", () => {
  const full = { month: "2026-09", dayType: "holiday" as const, hour: 14, district: "63000030", station: "sd821b2ec" };

  it("五個鍵固定順序序列化、讀回一致", () => {
    expect(toQuery(full)).toBe("month=2026-09&day=holiday&hour=14&district=63000030&station=sd821b2ec");
    expect(readQuery(toQuery(full))).toEqual(full);
    expect(readQuery(toQuery({ dayType: "weekday", hour: 0, district: "65000010" }))).toEqual({ dayType: "weekday", hour: 0, district: "65000010" });
  });

  it("不合法的值退回預設（不讀），並列出是哪個鍵", () => {
    const p = parseQuery("?month=2026-13&day=event&hour=25&district=大安&station=a%20b&x=1");
    expect(p.state).toEqual({});
    expect(p.invalid).toEqual(["month", "day", "hour", "district", "station"]);
    expect(parseQuery("?hour=6.5&district=630000301").invalid).toEqual(["hour", "district"]);
    expect(parseQuery("?x=1").invalid).toEqual([]);
  });

  it("urlStateOf：暫停時記月份與時刻，選了區、站才記；播放中只記日型與選取", () => {
    expect(urlStateOf({ ...full, playing: false })).toEqual(full);
    expect(urlStateOf({ ...full, district: null, station: null, playing: false })).toEqual({ month: "2026-09", dayType: "holiday", hour: 14 });
    expect(urlStateOf({ ...full, playing: true })).toEqual({ dayType: "holiday", district: "63000030", station: "sd821b2ec" });
  });

  it("shareLink：播放中也給暫停的那一刻（分享這一刻）", () => {
    setMonth("2026-09");
    setDayType("weekday");
    setPlaying(true);
    restoreSelection(null, null);
    const link = shareLink(getView(), "https://city.example/");
    expect(link).toBe(`https://city.example/?month=2026-09&day=weekday&hour=${getView().hour}`);
    setPlaying(false);
    setMonth(null);
  });

  it("clearViewQuery 拿掉畫面鍵（4.2 起含通勤，連格式錯的也拿掉），留下其他鍵", () => {
    const out: string[] = [];
    clearViewQuery("?hour=99&station=x&from=a&to=b&at=8&ref=1", (s) => out.push(s));
    clearViewQuery("?from=a&at=99&ref=2", (s) => out.push(s));
    expect(out).toEqual(["ref=1", "ref=2"]);
  });
});

describe("planLink（對照資料還原或退回全景）", () => {
  const data = {
    months: ["2026-08", "2026-09"],
    latest: "2026-09",
    hasDistrict: (id: string) => id === "63000030",
    hasStation: (id: string) => id === "sd821b2ec",
  };
  const plan = (q: string) => planLink(parseQuery(q), data);

  it("區與站都在：還原", () => {
    expect(plan("?month=2026-09&day=holiday&hour=14&district=63000030")).toEqual({ kind: "restore", district: "63000030", station: null, commute: null, staleMonth: null });
    expect(plan("?district=63000030&station=sd821b2ec")).toMatchObject({ kind: "restore", district: "63000030", station: "sd821b2ec" });
  });
  it("站不存在、月份不在資料裡、格式錯：退回全景", () => {
    expect(plan("?station=snope")).toEqual({ kind: "fallback", invalid: ["station"] });
    expect(plan("?month=2030-01&district=63000030")).toEqual({ kind: "fallback", invalid: ["month"] });
    expect(plan("?hour=25&district=63000030")).toEqual({ kind: "fallback", invalid: ["hour"] });
    expect(plan("?district=65000999")).toEqual({ kind: "fallback", invalid: ["district"] });
  });
  it("舊月份：照樣還原並註明", () => {
    expect(plan("?month=2026-08&station=sd821b2ec")).toEqual({ kind: "restore", district: null, station: "sd821b2ec", commute: null, staleMonth: "2026-08" });
  });
  it("只有時刻與日型：none（開場已經停在那一刻）", () => {
    expect(plan("?day=holiday&hour=14")).toEqual({ kind: "none" });
    expect(plan("")).toEqual({ kind: "none" });
  });
});

describe("4.2 通勤卡的網址", () => {
  const data = {
    months: ["2026-09"],
    latest: "2026-09",
    hasDistrict: () => false,
    hasStation: (id: string) => ["sa", "sb", "sloop"].includes(id),
    canBeDest: (id: string) => id !== "sloop",
  };
  const plan = (q: string) => planLink(parseQuery(q), data);

  it("三個鍵要一起出現且格式對，否則列為不合法的 commute", () => {
    expect(parseQuery("?from=sa&to=sb&at=7")).toEqual({ state: { commute: { o: "sa", d: "sb", h: 7 } }, invalid: [] });
    expect(parseQuery("?from=sa&to=sb").invalid).toEqual(["commute"]);
    expect(parseQuery("?from=sa&to=sb&at=24").invalid).toEqual(["commute"]);
    expect(parseQuery("?from=s%20a&to=sb&at=7").invalid).toEqual(["commute"]);
    expect(parseQuery("?at=7").invalid).toEqual(["commute"]);
  });

  it("planLink：起訖都在、迄站有出站紀錄、不同站才還原；否則退回全景", () => {
    expect(plan("?month=2026-09&day=weekday&hour=7&from=sa&to=sb&at=7")).toEqual({
      kind: "restore",
      district: null,
      station: null,
      commute: { o: "sa", d: "sb", h: 7 },
      staleMonth: null,
    });
    expect(plan("?station=sa&from=sa&to=sb&at=8")).toMatchObject({ kind: "restore", station: "sa", commute: { o: "sa", d: "sb", h: 8 } });
    expect(plan("?from=snope&to=sb&at=7")).toEqual({ kind: "fallback", invalid: ["commute"] });
    expect(plan("?from=sa&to=sloop&at=7")).toEqual({ kind: "fallback", invalid: ["commute"] });
    expect(plan("?from=sa&to=sa&at=7")).toEqual({ kind: "fallback", invalid: ["commute"] });
    expect(plan("?from=sa&to=sb")).toEqual({ kind: "fallback", invalid: ["commute"] });
  });

  it("urlStateOf：通勤卡開著（起訖都選好）才寫，還在選的通勤面板不寫", () => {
    const v = { month: "2026-09", dayType: "weekday" as const, hour: 7, district: null, station: null, playing: false };
    expect(urlStateOf({ ...v, commute: { o: "sa", d: "sb", h: 7 } })).toEqual({
      month: "2026-09",
      dayType: "weekday",
      hour: 7,
      commute: { o: "sa", d: "sb", h: 7 },
    });
    expect(urlStateOf({ ...v, commute: { o: "sa", d: null, h: 7 } })).toEqual({ month: "2026-09", dayType: "weekday", hour: 7 });
  });

  it("syncUrl 與 shareLink：通勤卡的起訖與時段寫進網址；換時段跟著換；關卡拿掉", () => {
    vi.useFakeTimers();
    let search = "ref=x";
    const stop = syncUrl((s) => (search = s), () => search);
    setMonth("2026-09");
    setDayType("weekday");
    restoreSelection(null, null);
    seek(8);
    restoreCommute({ o: "sa", d: "sb", h: 8 });
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=weekday&hour=8&from=sa&to=sb&at=8&ref=x");
    expect(shareLink(getView(), "https://city.example/")).toBe("https://city.example/?month=2026-09&day=weekday&hour=8&from=sa&to=sb&at=8");
    // 點「7 點」那格＝seek(7)：hour 與 at 一起換
    seek(7);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=weekday&hour=7&from=sa&to=sb&at=7&ref=x");
    // 讀回同一張通勤卡
    expect(readQuery(search).commute).toEqual({ o: "sa", d: "sb", h: 7 });
    clearCommute();
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=weekday&hour=7&ref=x");
    stop();
    setMonth(null);
    vi.useRealTimers();
  });
});

describe("syncUrl 寫月份、行政區、站（3.15）", () => {
  it("暫停時寫月份；選區、選站寫進網址，關卡拿掉", () => {
    vi.useFakeTimers();
    let search = "";
    const stop = syncUrl((s) => (search = s), () => search);
    setPlaying(false);
    setDayType("holiday");
    seek(14);
    setMonth("2026-09");
    restoreSelection("63000030", null);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=holiday&hour=14&district=63000030");
    restoreSelection("63000030", "sd821b2ec");
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=holiday&hour=14&district=63000030&station=sd821b2ec");
    restoreSelection(null, null);
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toBe("month=2026-09&day=holiday&hour=14");
    stop();
    setMonth(null);
    vi.useRealTimers();
  });
});

describe("perfDebug（6.4 效能面板）", () => {
  it("只有 debug=perf 算數", () => {
    expect(perfDebug("?debug=perf")).toBe(true);
    expect(perfDebug("hour=8&debug=perf&day=weekday")).toBe(true);
    expect(perfDebug("")).toBe(false);
    expect(perfDebug("?debug=")).toBe(false);
    expect(perfDebug("?debug=PERF")).toBe(false);
    expect(perfDebug("?debug=perf2")).toBe(false);
    expect(perfDebug("?perf=1")).toBe(false);
  });
  it("debug 不是畫面狀態：parseQuery 不讀它，也不算不合法", () => {
    expect(parseQuery("?debug=perf&hour=8")).toEqual({ state: { hour: 8 }, invalid: [] });
  });
  it("分享網址不帶 debug", () => {
    const state = readQuery("?debug=perf&month=2026-09&day=weekday&hour=8&station=s560caae9");
    expect(shareUrl(state, "https://city.example/?debug=perf")).toBe(
      "https://city.example/?month=2026-09&day=weekday&hour=8&station=s560caae9",
    );
    setMonth("2026-09");
    restoreSelection("63000030", null);
    expect(shareLink(getView(), "https://city.example/")).not.toContain("debug");
    restoreSelection(null, null);
    setMonth(null);
  });
  it("網址列上的 debug 在寫回畫面狀態後還留著（重新整理仍有面板）", () => {
    expect(writeQuery("debug=perf", { hour: 14, dayType: "holiday" })).toBe("day=holiday&hour=14&debug=perf");
    expect(perfDebug(writeQuery("debug=perf&hour=8", {}, ["hour"]))).toBe(true);
  });
});
