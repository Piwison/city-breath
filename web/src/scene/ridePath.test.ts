// 搭乘路徑（8.6）：以已提交的 basemap.json 與最新月份的 stations.json 驗證——路徑每一點都在板南線的真實軌道上（經 project()），
// 不走 approx 直線補段；頂埔段已由管線補上 OpenStreetMap 的真實軌道，所以頂埔是起點站（票面二選一的「補了真實軌跡」）。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import months from "../../public/data/months.json";
import type { BasemapFile, StationsFile } from "../data/types";
import type { TrackView } from "../data/views";
import { project } from "./projection";
import { buildRidePath, pathAt, SNAP, STOP_NEAR, type RidePath } from "./ridePath";

const basemap = basemapJson as unknown as BasemapFile;
const stationFiles = import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>;
const stations = stationFiles[`../../public/data/${months.latest}/stations.json`].stations;
const tracks: TrackView[] = basemap.tracks.map((t) => ({ line: t.line, token: "--line-x", coords: t.coords, di: t.di, approx: t.approx }));
const bl = stations.filter((s) => basemap.stationLines[s.id]?.includes("BL"));
const nameOf = (id: string) => stations.find((s) => s.id === id)!.name;

/** 點到一組線段的最短距離（場景單位）。 */
function distTo(segs: [number, number, number, number][], x: number, z: number): number {
  let best = Infinity;
  for (const [ax, az, bx, bz] of segs) {
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

function segmentsOf(approx: boolean): [number, number, number, number][] {
  return basemap.tracks
    .filter((t) => t.line === "BL" && t.approx === approx)
    .flatMap((t) =>
      t.coords.slice(1).map((c, k): [number, number, number, number] => {
        const [ax, az] = project(t.coords[k][0], t.coords[k][1]);
        const [bx, bz] = project(c[0], c[1]);
        return [ax, az, bx, bz];
      }),
    );
}

describe("板南線搭乘路徑", () => {
  const path = buildRidePath(tracks, "BL", bl) as RidePath;

  it("建得出來，西端在前", () => {
    expect(path).not.toBeNull();
    expect(path.x[0]).toBeLessThan(path.x[path.x.length - 1]);
    expect(path.len).toBeGreaterThan(50);
  });

  it("每個頂點都是板南線真實軌道（非 approx）的頂點，相鄰兩點是同一段的相鄰頂點或很短的接縫", () => {
    const real = basemap.tracks.filter((t) => t.line === "BL" && !t.approx).map((t) => t.coords.map(([lon, lat]) => project(lon, lat)));
    const key = (x: number, z: number) => `${x.toFixed(9)},${z.toFixed(9)}`;
    const vertices = new Set(real.flat().map(([x, z]) => key(x, z)));
    const edges = new Set(real.flatMap((pts) => pts.slice(1).flatMap((p, k) => [key(...pts[k]) + ">" + key(...p), key(...p) + ">" + key(...pts[k])])));
    for (let k = 0; k < path.x.length; k++) expect(vertices.has(key(path.x[k], path.z[k]))).toBe(true);
    for (let k = 1; k < path.x.length; k++) {
      const e = key(path.x[k - 1], path.z[k - 1]) + ">" + key(path.x[k], path.z[k]);
      if (!edges.has(e)) expect(path.cum[k] - path.cum[k - 1]).toBeLessThanOrEqual(SNAP);
    }
  });

  it("沿路每 0.05 單位取樣都貼在真實軌道上（經 project()）", () => {
    const real = segmentsOf(false);
    for (let s = 0; s <= path.len; s += 0.05) {
      const p = pathAt(path, s);
      // 接縫最長 SNAP，中點離兩端的軌道最多 SNAP / 2
      expect(distTo(real, p.x, p.z)).toBeLessThanOrEqual(SNAP / 2 + 1e-9);
    }
  });

  it("停靠站：頂埔到南港展覽館依序，頂埔段是真實軌道；只連在 approx 直線上的站不停", () => {
    const names = path.stops.map((s) => nameOf(s.id));
    expect(names[0]).toBe("頂埔");
    expect(names.slice(0, 4)).toEqual(["頂埔", "永寧", "土城", "海山"]);
    expect(names.at(-1)).toBe("南港展覽館");
    expect(names).toContain("台北車站");
    expect(names).toHaveLength(23);
    for (let k = 1; k < path.stops.length; k++) expect(path.stops[k].s).toBeGreaterThan(path.stops[k - 1].s);
    // 頂埔站離真實軌道在 STOP_NEAR 內（不是靠 approx 直線接上的）
    const dingpu = stations.find((s) => s.name === "頂埔")!;
    expect(distTo(segmentsOf(false), ...project(dingpu.lon, dingpu.lat))).toBeLessThanOrEqual(STOP_NEAR);
    // 仍是 approx 補段的站（廣慈/奉天宮：路網圖缺段以直線補）不在路線上
    const approxEnds = basemap.tracks.filter((t) => t.line === "BL" && t.approx).map((t) => t.coords.at(-1)!);
    for (const [lon, lat] of approxEnds) {
      const st = bl.find((s) => Math.abs(s.lon - lon) < 1e-4 && Math.abs(s.lat - lat) < 1e-4);
      if (st) expect(path.stops.some((s) => s.id === st.id)).toBe(false);
    }
  });

  it("pathAt 在兩端外沿端點那段直線延伸（往前看的點）", () => {
    const a = pathAt(path, -1);
    const b = pathAt(path, 0);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(1);
    const c = pathAt(path, path.len + 2);
    expect(Math.hypot(c.x - path.x.at(-1)!, c.z - path.z.at(-1)!)).toBeCloseTo(2);
  });

  it("沒有真實軌道或站不到兩個 → null", () => {
    expect(buildRidePath(tracks.filter((t) => t.approx), "BL", bl)).toBeNull();
    expect(buildRidePath(tracks, "BL", bl.slice(0, 1))).toBeNull();
  });
});
