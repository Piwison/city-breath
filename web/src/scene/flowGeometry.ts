// 流向緞帶的幾何（3.21 從 Flows.tsx 拆出，行為不變）：區的端點、FlowFrame → 二次貝茲曲線（雙向分左右車道）、
// 緞帶本體／箭頭／靜態光帶合成的 geometry，與放大時就地改線寬（Scalable）。
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from "three";
import { bandWidth, flowKey, ribbonWidth, twoWay, type BaseView, type FlowFrame } from "../data/views";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";

export const fract = (v: number) => v - Math.floor(v);
/** 雙向車道之間的空隙（場景單位）。 */
const LANE_GAP = 0.25;
/** 畫出動畫：依序晚 0.05 秒開始（原型 rebuildArcs）。 */
const STAGGER = 0.05;

/** 一條要畫的緞帶：二次貝茲曲線 p0 → p1 → p2。 */
export interface Arc {
  flow: FlowFrame;
  key: string;
  p0: Vector3;
  p1: Vector3;
  p2: Vector3;
  /** 緞帶寬（場景單位） */
  w: number;
  /** 曲線長度的近似（光點速度用） */
  len: number;
  /** 光點的相位，讓各條錯開 */
  phase: number;
  /** 光點數（views.ts dotScale） */
  n: number;
  /** 靜態模式的光帶寬（場景單位，views.ts bandWidth）；0＝不畫 */
  band: number;
  /** 畫出動畫的延遲（秒，依在清單裡的順序） */
  delay: number;
}

export function bez(a: Arc, u: number, out: Vector3): Vector3 {
  const v = 1 - u;
  return out.set(
    v * v * a.p0.x + 2 * v * u * a.p1.x + u * u * a.p2.x,
    v * v * a.p0.y + 2 * v * u * a.p1.y + u * u * a.p2.y,
    v * v * a.p0.z + 2 * v * u * a.p1.z + u * u * a.p2.z,
  );
}

export function bezTan(a: Arc, u: number, out: Vector3): Vector3 {
  return out
    .set(
      2 * (1 - u) * (a.p1.x - a.p0.x) + 2 * u * (a.p2.x - a.p1.x),
      2 * (1 - u) * (a.p1.y - a.p0.y) + 2 * u * (a.p2.y - a.p1.y),
      2 * (1 - u) * (a.p1.z - a.p0.z) + 2 * u * (a.p2.z - a.p1.z),
    )
    .normalize();
}

/** 每區的流向端點：區中心的台地頂上（與區名同一點）。 */
export function anchorsOf(view: BaseView): Map<string, Vector3> {
  return new Map(
    view.districts.map((d) => {
      const [x, z] = project(d.centroid[0], d.centroid[1]);
      const y = TILE_TOP + levelHeight(terrainLevelAt(d.centroid[0], d.centroid[1], view.grid), view.levels) + 0.3;
      return [d.id, new Vector3(x, y, z)];
    }),
  );
}

/**
 * FlowFrame → 曲線。沒有端點（不在底圖的區）或人數 null 就略過。lanes 裡的流向（雙向都畫的）
 * 整條往前進方向的右側偏移半個線寬＋半個空隙，A→B 與 B→A 不再疊在一起（Piwi 2026-11-12）。
 */
export function arcsOf(
  flows: FlowFrame[],
  counts: number[],
  max: number,
  anchors: Map<string, Vector3>,
  legend: readonly [number, number, number] = [max, max, max],
  lanes: ReadonlySet<string> = twoWay(flows),
): Arc[] {
  const arcs: Arc[] = [];
  flows.forEach((flow, k) => {
    const a0 = anchors.get(flow.from);
    const a2 = anchors.get(flow.to);
    if (!a0 || !a2 || flow.value === null) return;
    const key = flowKey(flow);
    const w = ribbonWidth(flow.value, max);
    const p0 = a0.clone();
    const p2 = a2.clone();
    if (lanes.has(key)) {
      // 前進方向 d 的右側（y 朝上）＝(−d.z, 0, d.x)
      const dx = p2.x - p0.x;
      const dz = p2.z - p0.z;
      const len = Math.hypot(dx, dz) || 1;
      const s = w / 2 + LANE_GAP / 2;
      const off = new Vector3((-dz / len) * s, 0, (dx / len) * s);
      p0.add(off);
      p2.add(off);
    }
    const dist = p0.distanceTo(p2);
    const p1 = p0.clone().lerp(p2, 0.5);
    p1.y = Math.max(p0.y, p2.y) + 2.5 + dist * 0.32;
    const h = (s: string) => [...s].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 997, 7) / 997;
    arcs.push({
      flow,
      key,
      p0,
      p1,
      p2,
      w,
      len: dist * 1.15 + 1,
      phase: fract(h(flow.from) * 0.37 + h(flow.to) * 0.61),
      n: counts[k] ?? 0,
      band: bandWidth(flow.value, legend, max),
      delay: STAGGER + arcs.length * STAGGER,
    });
  });
  return arcs;
}

/** 每條緞帶的顏色（線性 RGB）與透明度倍數。 */
export type Paint = (a: Arc) => { c: Color; alpha: number };

/** 所有緞帶本體、箭頭與靜態光帶各合成一個 geometry（粗的先寫進 buffer，先畫，細的疊在上面）。 */
export function ribbonGeometries(arcs: Arc[], paint: Paint, bandPaint: Paint): [Scalable, Scalable, Scalable] {
  const N = 44;
  const U0 = 0.05;
  const U1 = 0.84;
  const U2 = 0.955;
  const P = new Vector3();
  const Q = new Vector3();
  const TAN = new Vector3();
  const SIDE = new Vector3();
  // 每個頂點存「中心線上的點」與「往側邊的偏移（半寬）」；實際位置＝中心＋偏移×k（放大時的線寬上限）
  // reveal：(這個頂點在緞帶上的位置 0–1, 這條的延遲)；箭頭在 1，整條畫完才出現
  const body = { c: [] as number[], o: [] as number[], uv: [] as number[], idx: [] as number[], col: [] as number[], rv: [] as number[] };
  const head = { c: [] as number[], o: [] as number[], col: [] as number[], rv: [] as number[] };
  // 光帶：緞帶中線上一條較窄的亮帶，寬度依人數分級（views.ts bandWidth），稍微抬高免得和緞帶打架
  const band = { c: [] as number[], o: [] as number[], idx: [] as number[], col: [] as number[] };
  const LIFT = 0.02;
  const sorted = [...arcs].sort((a, b) => b.w - a.w);
  for (const a of sorted) {
    const { c, alpha } = paint(a);
    const bp = bandPaint(a);
    const last = new Vector3(1, 0, 0);
    const sideAt = (u: number) => {
      bezTan(a, u, TAN);
      SIDE.set(-TAN.z, 0, TAN.x);
      if (SIDE.lengthSq() < 1e-6) SIDE.copy(last);
      SIDE.normalize();
      last.copy(SIDE);
      return SIDE;
    };
    const period = a.w * 2.4 + 0.8;
    const base = body.c.length / 3;
    const bandBase = band.c.length / 3;
    const bw = a.band / 2;
    const prev = new Vector3();
    let acc = 0;
    const hw = a.w / 2;
    for (let k = 0; k <= N; k++) {
      const u = U0 + (U1 - U0) * (k / N);
      bez(a, u, P);
      sideAt(u);
      if (k) acc += P.distanceTo(prev);
      prev.copy(P);
      body.c.push(P.x, P.y, P.z, P.x, P.y, P.z);
      body.o.push(SIDE.x * hw, 0, SIDE.z * hw, -SIDE.x * hw, 0, -SIDE.z * hw);
      body.uv.push(acc / period, 0, acc / period, 1);
      body.col.push(c.r, c.g, c.b, alpha, c.r, c.g, c.b, alpha);
      body.rv.push(k / N, a.delay, k / N, a.delay);
      if (k < N) {
        const b = base + k * 2;
        body.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
      if (bw > 0) {
        band.c.push(P.x, P.y + LIFT, P.z, P.x, P.y + LIFT, P.z);
        band.o.push(SIDE.x * bw, 0, SIDE.z * bw, -SIDE.x * bw, 0, -SIDE.z * bw);
        band.col.push(bp.c.r, bp.c.g, bp.c.b, bp.alpha, bp.c.r, bp.c.g, bp.c.b, bp.alpha);
        if (k < N) {
          const b = bandBase + k * 2;
          band.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
    }
    bez(a, U1, P);
    sideAt(U1);
    const hh = a.w * 0.95 + 0.38;
    bez(a, U2, Q);
    head.c.push(P.x, P.y, P.z, P.x, P.y, P.z, Q.x, Q.y, Q.z);
    head.o.push(SIDE.x * hh, 0, SIDE.z * hh, -SIDE.x * hh, 0, -SIDE.z * hh, 0, 0, 0);
    for (let v = 0; v < 3; v++) {
      head.col.push(c.r, c.g, c.b, alpha);
      head.rv.push(1, a.delay);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(body.c, 3));
  g.setAttribute("uv", new Float32BufferAttribute(body.uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(body.col, 4));
  g.setAttribute("aReveal", new Float32BufferAttribute(body.rv, 2));
  g.setIndex(body.idx);
  const h = new BufferGeometry();
  h.setAttribute("position", new Float32BufferAttribute(head.c, 3));
  h.setAttribute("color", new Float32BufferAttribute(head.col, 4));
  h.setAttribute("aReveal", new Float32BufferAttribute(head.rv, 2));
  const s = new BufferGeometry();
  s.setAttribute("position", new Float32BufferAttribute(band.c, 3));
  s.setAttribute("color", new Float32BufferAttribute(band.col, 4));
  s.setIndex(band.idx);
  const out: [Scalable, Scalable, Scalable] = [
    { geo: g, c: new Float32Array(body.c), o: new Float32Array(body.o), k: -1 },
    { geo: h, c: new Float32Array(head.c), o: new Float32Array(head.o), k: -1 },
    { geo: s, c: new Float32Array(band.c), o: new Float32Array(band.o), k: -1 },
  ];
  for (const s of out) scaleTo(s, 1);
  return out;
}

/** 可依 k 改線寬的合併幾何：位置＝中心 c ＋ 偏移 o × k。 */
export interface Scalable {
  geo: BufferGeometry;
  c: Float32Array;
  o: Float32Array;
  k: number;
}

/** 就地改寫位置（不配置新陣列）；k 變不到 1% 就不動。 */
export function scaleTo(s: Scalable, k: number) {
  if (s.k > 0 && Math.abs(k - s.k) <= s.k * 0.01) return;
  s.k = k;
  const pos = s.geo.getAttribute("position") as Float32BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i++) arr[i] = s.c[i] + s.o[i] * k;
  pos.needsUpdate = true;
  s.geo.computeBoundingSphere();
}
