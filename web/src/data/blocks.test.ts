import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import stationsJson from "../../public/data/2026-09/stations.json";
import {
  activityAt,
  blockSource,
  breathScale,
  buildingHeight,
  LANDMARK_CLEAR,
  LANDMARK_CLEAR_DEFAULT,
  stationDayTotal,
  sumHourly,
} from "./blocks";
import type { BasemapFile, StationsFile } from "./types";

const stations = stationsJson as unknown as StationsFile;
const basemap = basemapJson as unknown as BasemapFile;

type St = StationsFile["stations"][number];
const hours = (fill: (h: number) => number | null) => Array.from({ length: 24 }, (_, h) => fill(h));
function station(over: Partial<St> & { district: string }): St {
  const p = { entries: hours((h) => (h >= 2 && h <= 4 ? null : 10)), exits: hours((h) => (h >= 2 && h <= 4 ? null : 5)) };
  return {
    id: "s0",
    name: "x",
    display: "x",
    lon: 121.5,
    lat: 25.04,
    exitsRecorded: true,
    type: null,
    weekday: p,
    holiday: p,
    topDestinations: { weekday: [], holiday: [] },
    ...over,
  } as St;
}

describe("全日人數", () => {
  it("null（停止營運）不算", () => {
    expect(sumHourly([1, null, 2])).toBe(3);
    expect(sumHourly(null)).toBe(0);
  });
  it("平日進站＋出站；環狀線沒有出站紀錄只算進站", () => {
    expect(stationDayTotal(station({ district: "a" }))).toBe(21 * 15);
    expect(stationDayTotal(station({ district: "a", exitsRecorded: false }))).toBe(21 * 10);
  });
});

describe("blockSource", () => {
  const src = blockSource(
    {
      stations: [
        station({ district: "a" }),
        station({ district: "a", weekday: { entries: hours(() => 40), exits: hours(() => 0) }, holiday: { entries: hours(() => 1), exits: hours(() => 1) } }),
        station({ district: "z" }),
      ],
    },
    { landmarks: [{ lon: 121.5, lat: 25, kind: "airport" }, { lon: 121.6, lat: 25.1, kind: "steam" }] as BasemapFile["landmarks"] },
    ["a", "b"],
  );
  it("權重是 √(全日 ÷ 最大)", () => {
    expect(src.stations.map((s) => s.weight)).toEqual([Math.sqrt(315 / 960), 1, Math.sqrt(315 / 960)]);
  });
  it("每區每小時進出：同區相加，不在場景的區略過，null 當 0", () => {
    expect(src.activity.weekday[8]).toEqual([15 + 40, 0]);
    expect(src.activity.weekday[3]).toEqual([40, 0]);
    expect(src.activity.holiday[8]).toEqual([15 + 2, 0]);
    expect(src.max).toBe(55);
  });
  it("地標的空地半徑依種類，其他用預設", () => {
    expect(src.clears.map((c) => c.r)).toEqual([LANDMARK_CLEAR.airport, LANDMARK_CLEAR_DEFAULT]);
  });
  it("activityAt 在相鄰整點間內插，23 點接回 0 點", () => {
    const s = { ...src, activity: { ...src.activity, weekday: hours((h) => h).map((h) => [h ?? 0, 0]) } };
    expect(activityAt(s, "weekday", 8.25)).toEqual([8.25, 0]);
    expect(activityAt(s, "weekday", 23.5)).toEqual([11.5, 0]);
    expect(activityAt(s, "weekday", 24)).toEqual([0, 0]);
  });
});

describe("人數 → 高度", () => {
  it("建築高度：0.28 + 1.3·score^0.8·(0.75+0.5r)，score 超過 1 夾住", () => {
    expect(buildingHeight(0, 0.5)).toBeCloseTo(0.28);
    expect(buildingHeight(1, 0)).toBeCloseTo(0.28 + 1.3 * 0.75);
    expect(buildingHeight(3, 1)).toBeCloseTo(0.28 + 1.3 * 1.25);
    expect(buildingHeight(0.5, 0.5)).toBeCloseTo(0.28 + 1.3 * Math.pow(0.5, 0.8));
  });
  it("整區呼吸：0.7 + 0.5·√(a/max)，0 是 0.7、最大是 1.2", () => {
    expect(breathScale(0, 100)).toBe(0.7);
    expect(breathScale(100, 100)).toBeCloseTo(1.2);
    expect(breathScale(25, 100)).toBeCloseTo(0.95);
    expect(breathScale(-5, 100)).toBe(0.7);
  });
});

describe("2026-09 實際資料", () => {
  const ids = basemap.districts.map((d) => d.id);
  const src = blockSource(stations, basemap, ids);
  it("最忙的站權重 1、所有權重在 0–1", () => {
    expect(Math.max(...src.stations.map((s) => s.weight))).toBe(1);
    expect(src.stations.every((s) => s.weight >= 0 && s.weight <= 1)).toBe(true);
  });
  it("平日 8 點比 4 點忙；停止營運的 3 點全城是 0", () => {
    const sum = (h: number) => src.activity.weekday[h].reduce((a, b) => a + b, 0);
    expect(sum(8)).toBeGreaterThan(sum(5) * 3);
    expect(sum(3)).toBe(0);
  });
});
