// 街廓與樹的佈局（3.13，示意，AD-23）：純函式、不碰 three，方便測試。照 2.1 原型（index.html 705–841）：
// 整座城共用一張 CELL 單位的方格，每格依附近車站的權重（gaussian σ＝SIG）算「密度」，密的蓋高、疏的蓋矮、太疏就種樹；
// 山上（等級格網 ≥ 1，也就是 40 公尺以上）不蓋、成片種樹；河上不蓋；公園種樹；車站周圍留廣場、地標周圍留空地；每 4 格一條大街。
// 經緯度只經 project()／unproject()，山上的基座只經 levelHeight()（AD-12）；建築高度由人數決定，不乘地形倍數。
import { buildingHeight, type BlockClear, type BlockStation } from "../data/blocks";
import type { MultiPolygonCoords } from "../data/types";
import { levelHeight, project, terrainLevelAt, unproject, type LevelGrid } from "./projection";

/** 方格邊長（場景單位，約 445 公尺）。 */
export const CELL = 1.05;
/** 車站影響範圍的 gaussian σ（場景單位）。 */
export const SIG = 1.5;
/** 每幾格留一條大街。 */
export const AVENUE_EVERY = 4;
/** 車站周圍留廣場的半徑。 */
export const PLAZA_R = 0.55;
/** 山上成片種樹：低頻雜訊的格距（格）、片內與片外的機率。 */
export const FOREST = { period: 5, cut: 0.55, inside: 0.45, outside: 0.04 } as const;
/** 公園、疏處種樹的機率。 */
export const PARK_TREE = 0.85;
export const SPARSE_TREE = 0.08;

export interface LayoutDistrict {
  /** 薄片往這點縮（districts.json 的 centroid，和 Terrain 相同） */
  centroid: [number, number];
  polygon: MultiPolygonCoords;
  water: MultiPolygonCoords;
  green: MultiPolygonCoords;
}

export interface LayoutInput {
  /** 順序＝場景行政區索引（aDistrict）；21 區以外的索引是 districts.length */
  districts: LayoutDistrict[];
  grid: LevelGrid;
  levels: readonly number[];
  stations: readonly BlockStation[];
  clears: readonly BlockClear[];
  /** 底座（場景座標）：中心與寬深 */
  plinth: { cx: number; cz: number; w: number; d: number };
  /** 行政區薄片頂面高度（Terrain.TILE_TOP） */
  tileTop: number;
  /** 行政區薄片往中心縮的比例（Terrain 的 TILE_SHRINK），讓建築不跨過區與區之間的細縫 */
  shrink?: number;
  /** 樹的疏密倍數（降級時 < 1） */
  treeDensity?: number;
}

export interface Building {
  x: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** 0–2：--bld-tint-1..3 */
  tint: number;
  district: number;
}

/** 高樓頂上的小塔；tint 是 3–5（--accent-1..3）。 */
export interface Crown extends Building {
  /** 小塔底部的高度（＝建築高，相對薄片頂面） */
  base: number;
}

export interface Tree {
  x: number;
  z: number;
  /** 基座高度（場景絕對高度：薄片頂面或台地頂面） */
  y: number;
  /** 大小 */
  s: number;
  /** 樹冠的高度比例 */
  sy: number;
  rot: number;
  district: number;
}

export interface BlockLayout {
  buildings: Building[];
  crowns: Crown[];
  trees: Tree[];
}

/** 決定性的 0–1 亂數：同一格、同一用途永遠同一個值（佈局穩定，不受走訪順序影響）。 */
export function hash01(a: number, b: number, k: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(k | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** 低頻值雜訊（0–1）：格點亂數做雙線性平滑內插，決定山上哪裡成片。 */
export function patchNoise(gx: number, gz: number, period: number = FOREST.period): number {
  const u = gx / period;
  const v = gz / period;
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fu = u - i;
  const fv = v - j;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash01(i, j, 91);
  const b = hash01(i + 1, j, 91);
  const c = hash01(i, j + 1, 91);
  const d = hash01(i + 1, j + 1, 91);
  const x0 = a + (b - a) * s(fu);
  const x1 = c + (d - c) * s(fu);
  return x0 + (x1 - x0) * s(fv);
}

/** 預先投影的多邊形（含洞）與外框，給點在多邊形內的測試用。 */
interface Prepared {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** 第一個是外框，其餘是洞；每個環 [x0, z0, x1, z1, …] */
  rings: Float64Array[];
}

function prepare(mp: MultiPolygonCoords, shrink?: { cx: number; cz: number; k: number }): Prepared[] {
  return mp
    .filter((poly) => poly.length && poly[0].length >= 4)
    .map((poly) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      const rings = poly.map((ring) => {
        const out = new Float64Array(ring.length * 2);
        ring.forEach(([lon, lat], i) => {
          let [x, z] = project(lon, lat);
          if (shrink) {
            x = shrink.cx + (x - shrink.cx) * shrink.k;
            z = shrink.cz + (z - shrink.cz) * shrink.k;
          }
          out[i * 2] = x;
          out[i * 2 + 1] = z;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        });
        return out;
      });
      return { minX, maxX, minZ, maxZ, rings };
    });
}

function inRing(x: number, z: number, r: Float64Array): boolean {
  let c = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2];
    const zi = r[i * 2 + 1];
    const xj = r[j * 2];
    const zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function inside(x: number, z: number, polys: Prepared[]): boolean {
  for (const p of polys) {
    if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
    if (!inRing(x, z, p.rings[0])) continue;
    let hole = false;
    for (let k = 1; k < p.rings.length && !hole; k++) hole = inRing(x, z, p.rings[k]);
    if (!hole) return true;
  }
  return false;
}

/** 佈局要用的預先計算（投影後的多邊形、車站、地標）。 */
export interface LayoutContext {
  input: LayoutInput;
  land: Prepared[][];
  water: Prepared[][];
  green: Prepared[][];
  /** 每區的外框（預篩） */
  boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[];
  st: Float64Array;
  weight: Float64Array;
  clears: { x: number; z: number; r: number }[];
}

export function layoutContext(input: LayoutInput): LayoutContext {
  // 和 Terrain 的薄片一樣往 centroid 縮，建築不跨過區與區之間的細縫
  const land = input.districts.map((d) => {
    const [cx, cz] = project(d.centroid[0], d.centroid[1]);
    return prepare(d.polygon, input.shrink ? { cx, cz, k: input.shrink } : undefined);
  });
  const boxes = land.map((ps) =>
    ps.reduce((b, p) => ({ minX: Math.min(b.minX, p.minX), maxX: Math.max(b.maxX, p.maxX), minZ: Math.min(b.minZ, p.minZ), maxZ: Math.max(b.maxZ, p.maxZ) }), {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    }),
  );
  const st = new Float64Array(input.stations.length * 2);
  const weight = new Float64Array(input.stations.length);
  input.stations.forEach((s, i) => {
    const [x, z] = project(s.lon, s.lat);
    st[i * 2] = x;
    st[i * 2 + 1] = z;
    weight[i] = s.weight;
  });
  return {
    input,
    land,
    water: input.districts.map((d) => prepare(d.water)),
    green: input.districts.map((d) => prepare(d.green)),
    boxes,
    st,
    weight,
    clears: input.clears.map((c) => {
      const [x, z] = project(c.lon, c.lat);
      return { x, z, r: c.r };
    }),
  };
}

/** 場景座標落在哪一區（索引），不在 21 區內回 −1。 */
export function districtAt(x: number, z: number, ctx: LayoutContext): number {
  for (let k = 0; k < ctx.land.length; k++) {
    const b = ctx.boxes[k];
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (inside(x, z, ctx.land[k])) return k;
  }
  return -1;
}

/** 格中心附近車站的密度分數（gaussian 權重和）與最近車站的距離。 */
export function densityAt(x: number, z: number, ctx: LayoutContext): { score: number; near: number } {
  let score = 0;
  let near = Infinity;
  const cut = 36 * SIG * SIG;
  for (let k = 0; k < ctx.weight.length; k++) {
    const dx = x - ctx.st[k * 2];
    const dz = z - ctx.st[k * 2 + 1];
    const dd = dx * dx + dz * dz;
    if (dd < near) near = dd;
    if (dd < cut) score += ctx.weight[k] * Math.exp(-dd / (2 * SIG * SIG));
  }
  return { score, near: Math.sqrt(near) };
}

export type Cell =
  | { kind: "building"; building: Building; crown: Crown | null }
  | { kind: "tree"; tree: Tree; why: "mountain" | "park" | "sparse" }
  | { kind: "empty"; why: "outside" | "water" | "mountain" | "park" | "plaza" | "landmark" | "avenue" | "sparse" };

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 一格（方格索引 gx, gz；中心 ((gx+½)·CELL, (gz+½)·CELL)）蓋什麼。 */
export function cellAt(gx: number, gz: number, ctx: LayoutContext): Cell {
  const { input } = ctx;
  const x = (gx + 0.5) * CELL;
  const z = (gz + 0.5) * CELL;
  const r = (k: number) => hash01(gx, gz, k);
  const [lon, lat] = unproject(x, z);
  const level = terrainLevelAt(lon, lat, input.grid);
  const density = input.treeDensity ?? 1;
  const k = districtAt(x, z, ctx);
  const outsideIndex = input.districts.length;

  const tree = (base: number, size: number, jitter: number, district: number, why: "mountain" | "park" | "sparse"): Cell => ({
    kind: "tree",
    why,
    tree: {
      x: x + (r(11) - 0.5) * jitter,
      z: z + (r(12) - 0.5) * jitter,
      y: base,
      s: size,
      sy: 0.8 + r(14) * 0.4,
      rot: r(15) * Math.PI * 2,
      district,
    },
  });
  const forest = () => (patchNoise(gx, gz) > FOREST.cut ? FOREST.inside : FOREST.outside) * density;

  if (k < 0) {
    // 21 區以外的底座：只在山上成片種樹（海、外圍的河與平地留空）
    if (level >= 1 && r(1) < forest()) return tree(levelHeight(level, input.levels), 0.9 + r(13) * 0.6, 0.6, outsideIndex, "mountain");
    return { kind: "empty", why: level >= 1 ? "mountain" : "outside" };
  }
  if (inside(x, z, ctx.water[k])) return { kind: "empty", why: "water" };
  if (level >= 1) {
    if (r(1) < forest()) return tree(input.tileTop + levelHeight(level, input.levels), 0.9 + r(13) * 0.6, 0.6, k, "mountain");
    return { kind: "empty", why: "mountain" };
  }
  if (inside(x, z, ctx.green[k])) {
    if (r(1) < PARK_TREE * density) return tree(input.tileTop, 0.8 + r(13) * 0.5, 0.5, k, "park");
    return { kind: "empty", why: "park" };
  }
  const { score, near } = densityAt(x, z, ctx);
  if (near < PLAZA_R) return { kind: "empty", why: "plaza" };
  if (ctx.clears.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return { kind: "empty", why: "landmark" };
  if (mod(gx, AVENUE_EVERY) === 0 || mod(gz, AVENUE_EVERY) === 0) return { kind: "empty", why: "avenue" };
  if (score > 0.11 + r(2) * 0.05) {
    const h = buildingHeight(score, r(3));
    const w = CELL * (0.58 + 0.2 * r(4));
    const d = CELL * (0.58 + 0.2 * r(5));
    const tint = h > 1.3 ? 2 : r(6) < 0.55 ? 0 : 1;
    const building: Building = { x: x + (r(7) - 0.5) * 0.1, z: z + (r(8) - 0.5) * 0.1, w, h, d, tint, district: k };
    const crown: Crown | null =
      h > 1.05 && r(9) < 0.6
        ? { x: building.x, z: building.z, w: w * 0.6, h: 0.18 + h * 0.15, d: d * 0.6, base: h, tint: 3 + Math.floor(r(10) * 3), district: k }
        : null;
    return { kind: "building", building, crown };
  }
  if (score < 0.03 && near > 2.4 && r(1) < SPARSE_TREE * density) return tree(input.tileTop, 0.9 + r(13) * 0.4, 0.6, k, "sparse");
  return { kind: "empty", why: "sparse" };
}

/** 走過整個底座的方格（留 1 單位邊），回傳所有建築、屋頂小塔與樹。 */
export function layoutBlocks(input: LayoutInput): BlockLayout {
  const ctx = layoutContext(input);
  const { cx, cz, w, d } = input.plinth;
  const out: BlockLayout = { buildings: [], crowns: [], trees: [] };
  const gx0 = Math.ceil((cx - w / 2 + 1) / CELL - 0.5);
  const gx1 = Math.floor((cx + w / 2 - 1) / CELL - 0.5);
  const gz0 = Math.ceil((cz - d / 2 + 1) / CELL - 0.5);
  const gz1 = Math.floor((cz + d / 2 - 1) / CELL - 0.5);
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const c = cellAt(gx, gz, ctx);
      if (c.kind === "building") {
        out.buildings.push(c.building);
        if (c.crown) out.crowns.push(c.crown);
      } else if (c.kind === "tree") out.trees.push(c.tree);
    }
  }
  return out;
}
