import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import districtsJson from "../../public/data/2026-09/districts.json";
import stationsJson from "../../public/data/2026-09/stations.json";
import { blockSource, buildingHeight } from "../data/blocks";
import type { BasemapFile, DistrictsFile, LonLat, MultiPolygonCoords, StationsFile } from "../data/types";
import { baseView } from "../data/views";
import {
  AVENUE_EVERY,
  CELL,
  cellAt,
  densityAt,
  hash01,
  layoutBlocks,
  layoutContext,
  PARK_TREE,
  type LayoutInput,
} from "./blockLayout";
import { plinthBox } from "./Plinth";
import { levelHeight, project, terrainLevelAt, unproject } from "./projection";
import { TILE_TOP } from "./Terrain";

/** 場景座標的方框 → 經緯度多邊形（經 unproject，和正式資料同一個投影）。 */
function square(x0: number, z0: number, x1: number, z1: number): MultiPolygonCoords {
  const ring: LonLat[] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
    [x0, z0],
  ].map(([x, z]) => unproject(x, z));
  return [[ring]];
}

const center = (g: number) => (g + 0.5) * CELL;
const LEVELS = [40, 120, 250, 400, 600, 850];

/** 一個 24×24 單位的假行政區：西半邊（x < −1）是 120 公尺以上的山，東邊平地。 */
function fixture(): LayoutInput {
  const [lonW, latN] = unproject(-14, -14);
  const step = 0.002;
  const nx = 80;
  const ny = 80;
  const rows = Array.from({ length: ny }, (_, j) =>
    Array.from({ length: nx }, (_, i) => {
      const [x] = project(lonW + i * step, latN - j * step);
      return x < -1 ? "2" : "0";
    }).join(""),
  );
  const st = unproject(center(3), center(3));
  const lm = unproject(center(7), center(6));
  return {
    districts: [
      {
        centroid: unproject(0, 0),
        polygon: square(-12, -12, 12, 12),
        water: square(center(6) - 0.3, center(-6) - 0.3, center(6) + 0.3, center(-6) + 0.3),
        green: square(center(9) - 0.3, center(1) - 0.3, center(10) + 0.3, center(2) + 0.3),
      },
    ],
    grid: { lon0: lonW, lat0: latN, step, nx, ny, rows },
    levels: LEVELS,
    stations: [{ lon: st[0], lat: st[1], weight: 1 }],
    clears: [{ lon: lm[0], lat: lm[1], r: 1.5 }],
    plinth: { cx: 0, cz: 0, w: 30, d: 30 },
    tileTop: TILE_TOP,
  };
}

describe("cellAt：每格蓋什麼", () => {
  const input = fixture();
  const ctx = layoutContext(input);
  it("車站所在格留廣場", () => {
    expect(cellAt(3, 3, ctx)).toEqual({ kind: "empty", why: "plaza" });
  });
  it("車站旁的格蓋建築，高度＝buildingHeight(score, r)", () => {
    const c = cellAt(2, 3, ctx);
    expect(c.kind).toBe("building");
    if (c.kind !== "building") return;
    const { score } = densityAt(center(2), center(3), ctx);
    expect(c.building.h).toBeCloseTo(buildingHeight(score, hash01(2, 3, 3)));
    expect(c.building.district).toBe(0);
    expect(c.building.w).toBeLessThan(CELL);
  });
  it("每 4 格一條大街", () => {
    expect(cellAt(AVENUE_EVERY, 3, ctx)).toEqual({ kind: "empty", why: "avenue" });
    expect(cellAt(2, 0, ctx)).toEqual({ kind: "empty", why: "avenue" });
  });
  it("河上不蓋也不種", () => {
    expect(cellAt(6, -6, ctx)).toEqual({ kind: "empty", why: "water" });
  });
  it("地標周圍留空地", () => {
    expect(cellAt(7, 6, ctx)).toEqual({ kind: "empty", why: "landmark" });
  });
  it("公園不蓋房子，多半種樹", () => {
    const cells = [cellAt(9, 1, ctx), cellAt(9, 2, ctx), cellAt(10, 1, ctx), cellAt(10, 2, ctx)];
    expect(cells.every((c) => c.kind === "tree" || (c.kind === "empty" && c.why === "park"))).toBe(true);
    expect(PARK_TREE).toBeGreaterThan(0.5);
  });
  it("山上（等級 ≥ 1）不蓋房子；種的樹站在台地頂面", () => {
    let trees = 0;
    for (let gx = -11; gx <= -2; gx++) {
      for (let gz = -11; gz <= 10; gz++) {
        const c = cellAt(gx, gz, ctx);
        expect(c.kind).not.toBe("building");
        if (c.kind === "tree") {
          trees++;
          expect(c.why).toBe("mountain");
          expect(c.tree.y).toBeCloseTo(TILE_TOP + levelHeight(2, LEVELS));
        }
      }
    }
    expect(trees).toBeGreaterThan(0);
  });
  it("離車站很遠的疏處不蓋，偶爾（約 8%）種一棵樹", () => {
    const cells = [];
    for (let gx = 5; gx <= 10; gx++) for (let gz = -11; gz <= -8; gz++) if (gx % AVENUE_EVERY && gz % AVENUE_EVERY) cells.push(cellAt(gx, gz, ctx));
    expect(cells.length).toBeGreaterThan(10);
    expect(cells.every((c) => (c.kind === "tree" && c.why === "sparse") || (c.kind === "empty" && c.why === "sparse"))).toBe(true);
    expect(cells.filter((c) => c.kind === "tree").length).toBeLessThan(cells.length * 0.4);
  });
  it("21 區以外的平地不種、不蓋", () => {
    expect(cellAt(13, 13, ctx)).toEqual({ kind: "empty", why: "outside" });
  });
});

describe("layoutBlocks", () => {
  it("同樣的輸入得到同樣的佈局（決定性亂數）", () => {
    expect(layoutBlocks(fixture())).toEqual(layoutBlocks(fixture()));
  });
  it("樹的疏密倍數 0 時沒有樹", () => {
    expect(layoutBlocks({ ...fixture(), treeDensity: 0 }).trees).toEqual([]);
  });
});

describe("2026-09 實際資料", () => {
  const basemap = basemapJson as unknown as BasemapFile;
  const districts = districtsJson as unknown as DistrictsFile;
  const stations = stationsJson as unknown as StationsFile;
  const view = baseView(basemap, districts);
  const src = blockSource(stations, basemap, view.districts.map((d) => d.id));
  const input: LayoutInput = {
    districts: view.districts.map((d) => ({ centroid: d.centroid, polygon: d.polygon, water: d.water, green: d.green })),
    grid: view.grid,
    levels: view.levels,
    stations: src.stations,
    clears: src.clears,
    plinth: plinthBox(view.bbox),
    tileTop: TILE_TOP,
    shrink: 0.992,
  };
  const t0 = performance.now();
  const layout = layoutBlocks(input);
  const ms = performance.now() - t0;
  const ctx = layoutContext(input);

  it("建築與樹的數量在手機預算內（AD-6）", () => {
    console.info(`blocks 2026-09：建築 ${layout.buildings.length}、小塔 ${layout.crowns.length}、樹 ${layout.trees.length}、佈局 ${ms.toFixed(0)} ms`);
    expect(layout.buildings.length).toBeGreaterThan(200);
    expect(layout.buildings.length).toBeLessThan(5000);
    expect(layout.trees.length).toBeLessThan(6000);
  });
  it("山上（等級格網 ≥ 1）沒有房子", () => {
    for (const b of layout.buildings) {
      const [lon, lat] = unproject(Math.floor(b.x / CELL) * CELL + CELL / 2, Math.floor(b.z / CELL) * CELL + CELL / 2);
      expect(terrainLevelAt(lon, lat, view.grid)).toBe(0);
    }
  });
  it("河上沒有房子：河面的格子（淡水河、基隆河、新店溪）都空著", () => {
    const p = plinthBox(view.bbox);
    let water = 0;
    for (let gx = Math.ceil(-p.w / 2 / CELL); gx < p.w / 2 / CELL; gx++) {
      for (let gz = Math.ceil(-p.d / 2 / CELL); gz < p.d / 2 / CELL; gz++) {
        const c = cellAt(gx, gz, ctx);
        if (c.kind === "empty" && c.why === "water") water++;
      }
    }
    expect(water).toBeGreaterThan(50);
    // 每棟建築所在的格子重算一次仍是建築（不是河、山、廣場）
    for (const b of layout.buildings) expect(cellAt(Math.floor(b.x / CELL), Math.floor(b.z / CELL), ctx).kind).toBe("building");
  });
  it("市中心（台北車站周圍 5 單位）的建築比全城平均高", () => {
    const [tx, tz] = project(121.5172, 25.0478);
    const near = layout.buildings.filter((b) => Math.hypot(b.x - tx, b.z - tz) < 5);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    expect(near.length).toBeGreaterThan(10);
    expect(avg(near.map((b) => b.h))).toBeGreaterThan(avg(layout.buildings.map((b) => b.h)));
  });
  it("山上有成片的樹", () => {
    expect(layout.trees.filter((t) => t.y > TILE_TOP + 0.01 || t.district === view.districts.length).length).toBeGreaterThan(300);
  });
});
