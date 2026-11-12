// 3.1 車站柱：柱高換算、停止營運（null）、內插與整點、環狀線、全部站的 frame。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import tokensCss from "../styles/tokens.css?raw";
import { cssTokenReader, parseColor } from "../styles/tokens";
import type { BasemapFile, Station, StationsFile } from "./types";
import { PILLAR_GAIN, PILLAR_MIN, pillarAt, pillarHeight, stationFrames, stationIndex, type StationIndex } from "./views";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const stations = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`];
const index = stationIndex(stations, basemap.stationLines);
const byName = (display: string) => index.byId.get(stations.stations.find((s) => s.display === display)!.id)!;

/** 一個合成站：4 點停止營運、5 點 100 人、6 點 400 人；出站有紀錄與否可切。 */
function fakeIndex(exitsRecorded = true): StationIndex {
  const entries: (number | null)[] = Array.from({ length: 24 }, (_, h) => (h >= 2 && h <= 4 ? null : 0));
  const exits = [...entries];
  entries[5] = 60;
  exits[5] = 40;
  entries[6] = 300;
  exits[6] = 100;
  const s = {
    id: "s1",
    name: "測試",
    display: "測試",
    lon: 121.5,
    lat: 25.05,
    exitsRecorded,
    district: "63000010",
    type: null,
    weekday: { entries, exits },
    holiday: { entries, exits },
    topDestinations: [],
  } as unknown as Station;
  const file = { v: 3, month: "2026-09", stations: [s] } as unknown as StationsFile;
  const ix = stationIndex(file, { s1: ["BL"] });
  return { ...ix, peak: 400 };
}

describe("pillarHeight（柱高＝此刻進出，平方根比例）", () => {
  it("0 人是最矮的柱，最大值是 MIN＋GAIN", () => {
    expect(pillarHeight(0, 1000)).toBe(PILLAR_MIN);
    expect(pillarHeight(1000, 1000)).toBeCloseTo(PILLAR_MIN + PILLAR_GAIN);
    expect(pillarHeight(250, 1000)).toBeCloseTo(PILLAR_MIN + PILLAR_GAIN * 0.5);
  });
  it("停止營運（null）不當 0：回傳 null（AD-5）", () => {
    expect(pillarHeight(null, 1000)).toBeNull();
  });
  it("超過分母時封頂，人越多柱越高", () => {
    expect(pillarHeight(5000, 1000)).toBeCloseTo(PILLAR_MIN + PILLAR_GAIN);
    expect(pillarHeight(900, 1000)!).toBeGreaterThan(pillarHeight(100, 1000)!);
  });
});

describe("pillarAt（畫面上的柱）", () => {
  const ix = fakeIndex();
  it("整點：用那一小時的值；停止營運沒有柱、open 0", () => {
    expect(pillarAt(ix, 0, "weekday", 6.4, false)).toEqual({ height: pillarHeight(400, 400), open: 1 });
    expect(pillarAt(ix, 0, "weekday", 3, false)).toEqual({ height: 0, open: 0 });
  });
  it("0 人的柱（最矮）和停止營運（沒有柱）分得出來", () => {
    const zero = pillarAt(ix, 0, "weekday", 1, false);
    expect(zero.height).toBe(PILLAR_MIN);
    expect(zero.open).toBe(1);
  });
  it("播放中在整點之間內插；4 點（停駛）到 5 點柱從廣場長出", () => {
    const a = pillarAt(ix, 0, "weekday", 5.5, true);
    expect(a.height).toBeCloseTo((pillarHeight(100, 400)! + pillarHeight(400, 400)!) / 2);
    const b = pillarAt(ix, 0, "weekday", 4.25, true);
    expect(b.height).toBeCloseTo(0.25 * pillarHeight(100, 400)!);
    expect(b.open).toBeCloseTo(0.25);
  });
  it("23 點之後接回 0 點", () => {
    expect(pillarAt(ix, 0, "weekday", 23.5, true).height).toBeCloseTo(PILLAR_MIN);
    expect(pillarAt(ix, 0, "weekday", -0.5, false).height).toBe(PILLAR_MIN);
  });
  it("環狀線（出站未入檔）只算進站", () => {
    const ring = fakeIndex(false);
    expect(pillarAt(ring, 0, "weekday", 6, false).height).toBeCloseTo(pillarHeight(300, 400)!);
  });
});

describe("真實資料（stations.json）", () => {
  it("全部站都有 frame、行政區與有定義的路線色（站珠與廣場）", () => {
    const read = cssTokenReader(tokensCss);
    const frames = stationFrames(index, null, "weekday", 8);
    expect(frames).toHaveLength(stations.stations.length);
    for (const f of frames) {
      expect(f.district).toBe(stations.stations[f.index].district);
      expect(parseColor(read(f.token)), f.token).not.toBeNull();
      expect(parseColor(read(f.plazaToken)), f.plazaToken).not.toBeNull();
    }
  });
  it("轉乘站的廣場是另一條路線的顏色", () => {
    const f = stationFrames(index, null, "weekday", 8).find((x) => index.lines(x.index).length > 1)!;
    expect(f.plazaToken).not.toBe(f.token);
  });
  it("凌晨 3 點全部停止營運（沒有柱）；平日 8 點台北車站比郊區的站高", () => {
    for (let i = 0; i < stations.stations.length; i++) expect(pillarAt(index, i, "weekday", 3, false)).toEqual({ height: 0, open: 0 });
    const main = pillarAt(index, byName("台北車站"), "weekday", 8, false).height;
    for (let i = 0; i < stations.stations.length; i++) expect(pillarAt(index, i, "weekday", 8, false).height).toBeLessThanOrEqual(main + 1e-9);
    expect(main).toBeGreaterThan(PILLAR_MIN + PILLAR_GAIN * 0.5);
  });
  it("環狀線的站 entriesOnly，柱高只算進站", () => {
    const f = stationFrames(index, null, "weekday", 8).find((x) => x.entriesOnly)!;
    const s = stations.stations[f.index];
    expect(f.value).toBe(s.weekday.entries[8]);
    expect(pillarAt(index, f.index, "weekday", 8, false).height).toBeCloseTo(pillarHeight(s.weekday.entries[8], index.peak)!);
  });
  it("dayTotal：這個日型整天的進出（停駛的小時跳過）", () => {
    const f = stationFrames(index, null, "holiday", 8)[0];
    const s = stations.stations[f.index];
    const sum = (a: (number | null)[]) => a.reduce<number>((t, x) => t + (x ?? 0), 0);
    expect(f.dayTotal).toBe(sum(s.holiday.entries) + (s.exitsRecorded ? sum(s.holiday.exits) : 0));
  });
});
