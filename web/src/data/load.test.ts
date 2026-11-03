import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDaily, loadEvents } from "./load";

const hours = () => Array.from({ length: 24 }, () => 0);

function mockFetch(files: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const key = Object.keys(files).find((k) => url.endsWith(k));
      return key
        ? { ok: true, status: 200, json: async () => files[key] }
        : { ok: false, status: 404, json: async () => ({}) };
    }),
  );
  return calls;
}

const stations = (month: string, n: number) => ({
  v: 2,
  month,
  stations: Array.from({ length: n }, (_, i) => ({ id: `s${i}` })),
  types: [],
});
const daily = (month: string, date: string, n: number) => ({
  v: 2,
  month,
  date,
  dayType: "holiday",
  entries: Array.from({ length: n }, hours),
  exits: Array.from({ length: n }, hours),
  venues: [],
});

afterEach(() => vi.unstubAllGlobals());

describe("loadDaily", () => {
  it("只載入那一天的檔與同月 stations.json", async () => {
    const calls = mockFetch({
      "2031-01/daily/2031-01-13.json": daily("2031-01", "2031-01-13", 2),
      "2031-01/stations.json": stations("2031-01", 2),
    });
    const d = await loadDaily("2031-01", "2031-01-13");
    expect(d.date).toBe("2031-01-13");
    expect(calls.map((u) => u.replace(/^.*data\//, "")).sort()).toEqual([
      "2031-01/daily/2031-01-13.json",
      "2031-01/stations.json",
    ]);
  });

  it("站數與同月 stations.json 不符就報錯（索引不可跨月使用）", async () => {
    mockFetch({
      "2031-02/daily/2031-02-01.json": daily("2031-02", "2031-02-01", 3),
      "2031-02/stations.json": stations("2031-02", 2),
    });
    await expect(loadDaily("2031-02", "2031-02-01")).rejects.toThrow("對不上");
  });

  it("日期不屬於該月就不載入", async () => {
    const calls = mockFetch({});
    await expect(loadDaily("2031-03", "2031-04-01")).rejects.toThrow("不屬於");
    expect(calls).toEqual([]);
  });
});

const events = (month: string, stationRefs: (number | null)[], eventStations: number[] = []) => ({
  v: 2,
  month,
  thresholds: { city: 0.15, stationRatio: 1.5, stationExtra: 1000, provisional: true },
  days: [{ date: `${month}-01`, dayType: "weekday", cityEntries: 100, cityRatio: null }],
  anomalies: stationRefs.map((station) => ({
    date: `${month}-01`,
    station,
    measure: "entries",
    ratio: 2,
    baseline: 50,
    eventIds: [],
  })),
  events: eventStations.length
    ? [
        {
          id: "e1",
          startDate: `${month}-01`,
          endDate: `${month}-01`,
          venue: "v",
          stations: eventStations,
          name: "x",
          source: "manual",
          url: "https://example.org",
          verified: true,
        },
      ]
    : [],
});

describe("loadEvents", () => {
  it("載入 events.json 與同月 stations.json；全市級的 station 為 null", async () => {
    const calls = mockFetch({
      "2031-05/events.json": events("2031-05", [null, 1]),
      "2031-05/stations.json": stations("2031-05", 2),
    });
    const e = await loadEvents("2031-05");
    expect(e.anomalies.map((a) => a.station)).toEqual([null, 1]);
    expect(calls.map((u) => u.replace(/^.*data\//, "")).sort()).toEqual([
      "2031-05/events.json",
      "2031-05/stations.json",
    ]);
  });

  it("站索引超出同月 stations.json 就報錯", async () => {
    mockFetch({
      "2031-06/events.json": events("2031-06", [2]),
      "2031-06/stations.json": stations("2031-06", 2),
    });
    await expect(loadEvents("2031-06")).rejects.toThrow("對不上");
  });

  it("活動的車站索引也要檢查", async () => {
    mockFetch({
      "2031-07/events.json": events("2031-07", [], [0, 5]),
      "2031-07/stations.json": stations("2031-07", 2),
    });
    await expect(loadEvents("2031-07")).rejects.toThrow("對不上");
  });

  it("月份與 stations.json 不同就報錯", async () => {
    mockFetch({
      "2031-08/events.json": events("2031-09", []),
      "2031-08/stations.json": stations("2031-08", 2),
    });
    await expect(loadEvents("2031-08")).rejects.toThrow("對不上");
  });
});
