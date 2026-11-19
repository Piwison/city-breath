// 搭乘模式（8.6）的路徑：把 basemap.json 一條路線的真實軌道（不含 approx 直線補段，AD-21）接成一條可以沿著走的折線，
// 再把這條線上的車站依沿線距離排好。純函式、不碰 three，方便測試（ridePath.test.ts：每一點都在軌道上）。
// 經緯度只經 project()（AD-12）；高度在 RideCamera（軌道高度與 levelHeight → elevation()）。
//
// 做法：軌道各段的頂點是圖的節點，段內相鄰頂點相連；段的端點離別段的頂點在 SNAP 以內就接上（路網圖切段的接縫、
// 雙線與渡線的小段）。離軌道 STOP_NEAR 以內的站是候選；從一站找最遠的候選站，再從那站找最遠的候選站（兩次最短路），
// 這兩站之間的最短路就是路徑。只連在 approx 段上的站（例：路網圖缺段以直線補的站）離真實軌道太遠，不會成為停靠站。
import type { LineId } from "../data/types";
import type { TrackView } from "../data/views";
import { project } from "./projection";

/** 段端點接到別段頂點的距離上限（場景單位；約 170 公尺，兩份圖的接縫與雙線間距）。 */
export const SNAP = 0.4;
/** 站離軌道在這以內才是停靠站（場景單位；約 150 公尺，和管線判路線的 NEAR_TRACK_M 相同）。 */
export const STOP_NEAR = 150 / 424;

export interface RideStopAt {
  id: string;
  /** 沿路徑的距離（場景單位） */
  s: number;
}

export interface RidePath {
  line: LineId;
  /** 頂點（場景 x、z）、累計長度、頂點所在區的索引（TrackView.di：−1＝不在有車站的區） */
  x: Float64Array;
  z: Float64Array;
  cum: Float64Array;
  di: Int32Array;
  len: number;
  /** 依沿線距離排好的停靠站（西端在前：路徑起點是 x 較小的那端） */
  stops: RideStopAt[];
}

interface Node {
  x: number;
  z: number;
  di: number;
}

/** 點到線段的最近點：回傳距離與線段上的比例 t。 */
function toSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): { d: number; t: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}

/** 單源最短路（節點不到兩百個，O(V²) 就夠）。回傳距離與前一個節點。 */
function dijkstra(adj: Map<number, number>[], src: number): { dist: Float64Array; prev: Int32Array } {
  const n = adj.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[src] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

/**
 * 一條路線的搭乘路徑。stations：這條路線的車站（站 ID 與經緯度）；沒有夠長的真實軌道或站不到兩個時回傳 null。
 */
export function buildRidePath(
  tracks: readonly TrackView[],
  line: LineId,
  stations: readonly { id: string; lon: number; lat: number }[],
): RidePath | null {
  // 1. 只用真實軌道（approx 是路網圖缺段以直線補的，不當成真實沿線，AD-11、AD-21）
  const nodes: Node[] = [];
  const pieces: number[][] = [];
  for (const t of tracks) {
    if (t.line !== line || t.approx || t.coords.length < 2) continue;
    const ids: number[] = [];
    t.coords.forEach(([lon, lat], k) => {
      const [x, z] = project(lon, lat);
      ids.push(nodes.length);
      nodes.push({ x, z, di: t.di[k] ?? -1 });
    });
    pieces.push(ids);
  }
  if (!pieces.length) return null;
  const adj: Map<number, number>[] = nodes.map(() => new Map());
  const link = (a: number, b: number) => {
    if (a === b) return;
    const w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z);
    if (!adj[a].has(b) || adj[a].get(b)! > w) {
      adj[a].set(b, w);
      adj[b].set(a, w);
    }
  };
  for (const p of pieces) for (let k = 1; k < p.length; k++) link(p[k - 1], p[k]);
  // 段端點接到別段最近的頂點（SNAP 以內）
  pieces.forEach((p, pi) => {
    for (const e of [p[0], p[p.length - 1]]) {
      let best = -1;
      let bd = SNAP;
      pieces.forEach((q, qi) => {
        if (qi === pi) return;
        for (const v of q) {
          const d = Math.hypot(nodes[e].x - nodes[v].x, nodes[e].z - nodes[v].z);
          if (d <= bd) {
            bd = d;
            best = v;
          }
        }
      });
      if (best >= 0) link(e, best);
    }
  });

  // 2. 候選站：離任何一段真實軌道 STOP_NEAR 以內；記下最近的頂點當最短路的起訖
  const near = stations.flatMap((s) => {
    const [px, pz] = project(s.lon, s.lat);
    let d = Infinity;
    let v = -1;
    for (const p of pieces)
      for (let k = 1; k < p.length; k++) {
        const a = nodes[p[k - 1]];
        const b = nodes[p[k]];
        const hit = toSegment(px, pz, a.x, a.z, b.x, b.z);
        if (hit.d < d) {
          d = hit.d;
          v = hit.t < 0.5 ? p[k - 1] : p[k];
        }
      }
    return d <= STOP_NEAR ? [{ id: s.id, px, pz, v }] : [];
  });
  if (near.length < 2) return null;

  // 3. 兩次最短路找出最遠的兩站，路徑＝兩站之間的最短路
  const farthest = (src: number) => {
    const { dist, prev } = dijkstra(adj, src);
    let best = near[0];
    for (const c of near) if (dist[c.v] < Infinity && dist[c.v] > dist[best.v]) best = c;
    return { best, prev };
  };
  const a = farthest(near[0].v).best;
  const { best: b, prev } = farthest(a.v);
  const order: number[] = [];
  for (let u = b.v; u >= 0; u = prev[u]) {
    order.push(u);
    if (u === a.v) break;
  }
  if (order[order.length - 1] !== a.v || order.length < 2) return null;
  // 西端在前（x 較小的一端）
  if (nodes[order[0]].x > nodes[order[order.length - 1]].x) order.reverse();

  const n = order.length;
  const x = new Float64Array(n);
  const z = new Float64Array(n);
  const cum = new Float64Array(n);
  const di = new Int32Array(n);
  order.forEach((u, k) => {
    x[k] = nodes[u].x;
    z[k] = nodes[u].z;
    di[k] = nodes[u].di;
    if (k) cum[k] = cum[k - 1] + Math.hypot(x[k] - x[k - 1], z[k] - z[k - 1]);
  });
  const len = cum[n - 1];

  // 4. 停靠站：投影到路徑上，離路徑 STOP_NEAR 以內的才算（叉出去的支段上的站不算）
  const stops: RideStopAt[] = [];
  for (const c of near) {
    let d = Infinity;
    let s = 0;
    for (let k = 1; k < n; k++) {
      const hit = toSegment(c.px, c.pz, x[k - 1], z[k - 1], x[k], z[k]);
      if (hit.d < d) {
        d = hit.d;
        s = cum[k - 1] + (cum[k] - cum[k - 1]) * hit.t;
      }
    }
    if (d <= STOP_NEAR) stops.push({ id: c.id, s });
  }
  stops.sort((p, q) => p.s - q.s);
  if (stops.length < 2) return null;
  return { line, x, z, cum, di, len, stops };
}

export interface PathPoint {
  x: number;
  z: number;
  /** 所在線段的起點索引（高度、區） */
  k: number;
  /** 前進方向（單位向量） */
  dx: number;
  dz: number;
}

/** 沿路徑距離 s 的位置與方向；超出兩端時沿端點那段的方向直線延伸（鏡頭往前看的點用得到）。 */
export function pathAt(p: RidePath, s: number, out: PathPoint = { x: 0, z: 0, k: 0, dx: 1, dz: 0 }): PathPoint {
  const n = p.cum.length;
  let lo = 0;
  let hi = n - 1;
  if (s <= 0) hi = 1;
  else if (s >= p.len) lo = n - 2;
  else
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (p.cum[m] <= s) lo = m;
      else hi = m;
    }
  const seg = p.cum[hi] - p.cum[lo] || 1;
  out.dx = (p.x[hi] - p.x[lo]) / seg;
  out.dz = (p.z[hi] - p.z[lo]) / seg;
  const f = s - p.cum[lo];
  out.x = p.x[lo] + out.dx * f;
  out.z = p.z[lo] + out.dz * f;
  out.k = lo;
  return out;
}
