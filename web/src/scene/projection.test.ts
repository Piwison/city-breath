import { describe, expect, it } from "vitest";
import basemap from "../../public/data/basemap.json";
import months from "../../public/data/months.json";
import {
  DISTRICT_BBOX,
  EXTENT,
  LAT0,
  LON0,
  METERS_PER_UNIT,
  TERRAIN_EXAGGERATION,
  elevation,
  levelHeight,
  project,
  terrainLevelAt,
  unproject,
} from "./projection";

const districtFiles = import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }) as Record<
  string,
  { districts: { id: string; polygon: number[][][][] }[] }
>;
const flowFiles = import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }) as Record<
  string,
  { districts: string[] }
>;

describe("project()", () => {
  it("原點是 21 區外框中心", () => {
    const [x, z] = project(LON0, LAT0);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it("外框最大邊長是 100 單位，東為 +x、北為 −z", () => {
    const [w, s, e, n] = DISTRICT_BBOX;
    const [x0, z0] = project(w, s);
    const [x1, z1] = project(e, n);
    expect(Math.max(x1 - x0, z0 - z1)).toBeCloseTo(EXTENT, 6);
    expect(x1).toBeGreaterThan(x0);
    expect(z1).toBeLessThan(z0);
  });

  it("已知點：台北車站在原點西邊偏南、台北 101 在東邊偏南、淡水在西北", () => {
    // 2.1 原型 loadData() 用同一組外框算出的值
    const [mx, mz] = project(121.5172, 25.0478);
    expect(mx).toBeCloseTo(-2.854, 2);
    expect(mz).toBeCloseTo(1.376, 2);
    const [tx, tz] = project(121.5645, 25.034);
    expect(tx).toBeGreaterThan(0);
    expect(tz).toBeGreaterThan(0);
    const [dx, dz] = project(121.4445, 25.17);
    expect(dx).toBeLessThan(-15);
    expect(dz).toBeLessThan(-25);
  });

  it("兩點的場景距離與真實距離相符（台北車站到台北 101 約 4.9 公里）", () => {
    const a = project(121.5172, 25.0478);
    const b = project(121.5645, 25.034);
    const meters = Math.hypot(a[0] - b[0], a[1] - b[1]) * METERS_PER_UNIT;
    expect(meters).toBeGreaterThan(4800);
    expect(meters).toBeLessThan(5000);
  });

  it("unproject 是反函式", () => {
    for (const [lon, lat] of [[121.5172, 25.0478], [121.36, 24.84], [121.69, 25.27]]) {
      const [x, z] = project(lon, lat);
      const [lo, la] = unproject(x, z);
      expect(lo).toBeCloseTo(lon, 9);
      expect(la).toBeCloseTo(lat, 9);
    }
  });

  it("每個月份的 21 區外框都和常數相同（換月份不換投影）", () => {
    const entries = Object.entries(districtFiles);
    expect(entries.length).toBe(months.months.length);
    for (const [path, file] of entries) {
      const ids = new Set(flowFiles[path.replace("districts.json", "district-flows.json")].districts);
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const d of file.districts) {
        if (!ids.has(d.id)) continue;
        for (const poly of d.polygon) for (const ring of poly) for (const [lo, la] of ring) {
          w = Math.min(w, lo); e = Math.max(e, lo); s = Math.min(s, la); n = Math.max(n, la);
        }
      }
      expect([w, s, e, n], path).toEqual([...DISTRICT_BBOX]);
    }
  });

  it("basemap 底座外框是 21 區外框四周各加最大邊長的 8%", () => {
    const [w, s, e, n] = basemap.bbox as [number, number, number, number];
    const [x0, z0] = project(w, s);
    const [x1, z1] = project(e, n);
    const [dx0] = project(DISTRICT_BBOX[0], 0);
    const [dx1] = project(DISTRICT_BBOX[2], 0);
    expect(z0 - z1).toBeCloseTo(EXTENT * 1.16, 0);
    expect(x1 - x0).toBeCloseTo(dx1 - dx0 + EXTENT * 0.16, 0);
  });
});

describe("elevation()", () => {
  it("垂直誇張 1.5 倍：高程乘 1.5 再換成場景單位", () => {
    expect(TERRAIN_EXAGGERATION).toBe(1.5);
    expect(elevation(0)).toBe(0);
    expect(elevation(850)).toBeCloseTo((850 * 1.5) / METERS_PER_UNIT, 9);
    expect(elevation(850) * METERS_PER_UNIT).toBeCloseTo(1275, 6);
    expect(elevation(400) / elevation(200)).toBeCloseTo(2, 9);
  });

  it("一個場景單位約 424 公尺，850 公尺的台地約 3 單位高", () => {
    expect(METERS_PER_UNIT).toBeGreaterThan(420);
    expect(METERS_PER_UNIT).toBeLessThan(428);
    expect(elevation(850)).toBeCloseTo(3.01, 1);
  });

  it("levelHeight：等級 0 是地面，等級 k 是第 k 層門檻的高度", () => {
    const levels = basemap.levels;
    expect(levelHeight(0, levels)).toBe(0);
    expect(levelHeight(1, levels)).toBe(elevation(40));
    expect(levelHeight(6, levels)).toBe(elevation(850));
  });
});

describe("terrainLevelAt()", () => {
  const grid = { lon0: 121, lat0: 25, step: 0.5, nx: 3, ny: 2, rows: ["012", "345"] };
  it("取最近的格點", () => {
    expect(terrainLevelAt(121, 25, grid)).toBe(0);
    expect(terrainLevelAt(122, 25, grid)).toBe(2);
    expect(terrainLevelAt(121.6, 24.6, grid)).toBe(4);
  });
  it("格網外為 0", () => {
    expect(terrainLevelAt(120, 25, grid)).toBe(0);
    expect(terrainLevelAt(121, 26, grid)).toBe(0);
    expect(terrainLevelAt(123, 24.5, grid)).toBe(0);
  });
  it("basemap 格網：七星山一帶是高層台地，台北車站是平地", () => {
    expect(terrainLevelAt(121.5481, 25.1709, basemap.grid)).toBeGreaterThanOrEqual(5);
    expect(terrainLevelAt(121.5172, 25.0478, basemap.grid)).toBe(0);
  });
});
