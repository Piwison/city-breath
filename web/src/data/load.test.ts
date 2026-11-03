import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDaily } from "./load";

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
