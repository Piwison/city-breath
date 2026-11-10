import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDaily, loadEvents, loadOdShard } from "./load";

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
  thresholds: { city: 0.15, stationRatio: 1.3, stationExtra: 1000, stationZ: 3.5, provisional: false },
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

const shard = (month: string, origin: string, n: number) => ({
  v: 2,
  month,
  origin,
  weekday: [null, Array.from({ length: n }, () => null)],
  holiday: [null, Array.from({ length: n }, () => 10)],
  weekdayDepartures: [null, 0],
  holidayDepartures: [null, 0],
});

describe("loadOdShard", () => {
  it("載入起站分片與同月 stations.json", async () => {
    const calls = mockFetch({
      "2031-10/od/s1.json": shard("2031-10", "s1", 2),
      "2031-10/stations.json": stations("2031-10", 2),
    });
    const s = await loadOdShard("2031-10", "s1");
    expect(s.origin).toBe("s1");
    expect(calls.map((u) => u.replace(/^.*data\//, "")).sort()).toEqual([
      "2031-10/od/s1.json",
      "2031-10/stations.json",
    ]);
  });

  it("列長與同月站數不同就報錯（各月站數可能不同，索引不可跨月使用）", async () => {
    mockFetch({
      "2031-11/od/s1.json": shard("2031-11", "s1", 3),
      "2031-11/stations.json": stations("2031-11", 2),
    });
    await expect(loadOdShard("2031-11", "s1")).rejects.toThrow("對不上");
  });

  it("月份或起站不符就報錯", async () => {
    mockFetch({
      "2031-12/od/s1.json": shard("2031-11", "s2", 2),
      "2031-12/stations.json": stations("2031-12", 2),
    });
    await expect(loadOdShard("2031-12", "s1")).rejects.toThrow("對不上");
  });
});

describe("loadBasemap", () => {
  const hw = () => Array.from({ length: 24 }, () => null);
  const terrain = () => [[], [], [], [], [], []];
  const basemap = (over: Record<string, unknown> = {}) => ({
    v: 2,
    basemapRevision: 1,
    stationsMonth: "2031-01",
    bbox: [121.3, 24.8, 121.7, 25.3],
    levels: [40, 120, 250, 400, 600, 850],
    lines: [{ id: "BR", name: "文湖線" }],
    districts: [{ id: "63000010", water: [], green: [], terrain: terrain() }],
    outside: { terrain: terrain() },
    sea: [],
    outsideWater: [],
    grid: { lon0: 121.3, lat0: 25.3, step: 0.003, nx: 2, ny: 1, rows: ["01"] },
    tracks: [{ line: "BR", coords: [[121.5, 25], [121.6, 25]], di: [0, -1], approx: false }],
    stationLines: { s1: ["BR"] },
    headway: { BR: { weekday: hw(), holiday: hw() } },
    landmarks: [],
    sources: [],
    notes: [],
    ...over,
  });
  // getJson 會快取成功的回應，每個案例重新載入模組
  const fresh = async () => {
    vi.resetModules();
    return (await import("./load")).loadBasemap;
  };

  it("讀根目錄的 basemap.json（不分月份）", async () => {
    const calls = mockFetch({ "data/basemap.json": basemap() });
    const b = await (await fresh())();
    expect(b.basemapRevision).toBe(1);
    expect(calls.map((u) => u.replace(/^.*data\//, ""))).toEqual(["basemap.json"]);
  });

  it("契約版本不符或缺 v 就報錯（AD-1）", async () => {
    mockFetch({ "data/basemap.json": basemap({ v: 99 }) });
    await expect((await fresh())()).rejects.toThrow("版本");
    mockFetch({ "data/basemap.json": basemap({ v: undefined }) });
    await expect((await fresh())()).rejects.toThrow("形狀");
  });

  it("形狀不符（班距不是 24 格、di 與座標不等長）就報錯", async () => {
    mockFetch({ "data/basemap.json": basemap({ headway: { BR: { weekday: [null], holiday: hw() } } }) });
    await expect((await fresh())()).rejects.toThrow("形狀");
    mockFetch({
      "data/basemap.json": basemap({ tracks: [{ line: "BR", coords: [[121.5, 25]], di: [], approx: false }] }),
    });
    await expect((await fresh())()).rejects.toThrow("形狀");
  });
});
