// 行政區流向（3.5，原型「流向」段移植；3.6 加選區模式）：等比例線寬的緞帶＋尾端箭頭、脈衝光點、前三大弧頂人數。
// 只吃 views.ts 的 FlowSource／FlowFrame（AD-19）；線寬、前 12 大、去哪／誰來、光點換算、光帶分級都在 views.ts。
// 全城模式畫前 12 大（橘）；選了區畫這區前 5 去哪（藍）與前 5 誰來（橘紅），端點跟著區抬起（lift.ts）。
// 雙向的兩條各往前進方向的右側偏移成左右車道（Piwi 2026-11-12）。
// draw call（AD-6）：所有緞帶本體合成一個 mesh、所有箭頭一個 mesh、所有光點一個 InstancedMesh；顏色放在頂點色
// （RGBA，聚焦時其他條的 alpha 降低），所以去哪與誰來兩種顏色也不多畫一次。
// 靜態模式（3.3，減少動態時開場就開）把光點換成依人數分級粗細的靜態光帶（一個合併 mesh），兩者不同時畫，總數不變。
// 換情境（選區、換日型、聚焦一條）時緞帶從起點畫出去（gsap 推 uReveal，shader 依每個頂點在緞帶上的位置裁掉，
// 原型的 drawRange 動畫在合併幾何上的作法）；整點更新不重畫。靜態模式或減少動態時直接出現、箭紋不捲動。
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  BufferGeometry,
  CapsuleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from "three";
import {
  bandWidth,
  DOT_CAP,
  flowKey,
  ribbonWidth,
  twoWay,
  type BaseView,
  type FlowFrame,
  type FlowKind,
  type FlowSource,
} from "../data/views";
import { useView } from "../state/view";
import type { LabelBoard } from "./DistrictLabels";
import { placeLabel } from "./labelPlace";
import { liftTarget } from "./lift";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColor } from "./useTokenColor";

/** 尖峰（原型 RUSH）：光點與箭紋走快一點。只影響動畫速度，不承載數字。 */
const rush = (h: number) => (h >= 7 && h < 10) || (h >= 17 && h < 20);
const fract = (v: number) => v - Math.floor(v);
const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");
const OPACITY = 0.92;
/** 聚焦一條時，其他條的透明度倍數（原型 0.22 ÷ 0.92）。 */
const DIM = 0.24;
/** 雙向車道之間的空隙（場景單位）。 */
const LANE_GAP = 0.25;
/** 畫出動畫：每條 0.6 秒、依序晚 0.05 秒開始（原型 rebuildArcs）。 */
const REVEAL = 0.6;
const STAGGER = 0.05;
/** 沒有在畫出時 uReveal 的值（大於任何一條的延遲＋時長）。 */
const SHOWN = 1e3;

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

function bez(a: Arc, u: number, out: Vector3): Vector3 {
  const v = 1 - u;
  return out.set(
    v * v * a.p0.x + 2 * v * u * a.p1.x + u * u * a.p2.x,
    v * v * a.p0.y + 2 * v * u * a.p1.y + u * u * a.p2.y,
    v * v * a.p0.z + 2 * v * u * a.p1.z + u * u * a.p2.z,
  );
}

function bezTan(a: Arc, u: number, out: Vector3): Vector3 {
  return out
    .set(
      2 * (1 - u) * (a.p1.x - a.p0.x) + 2 * u * (a.p2.x - a.p1.x),
      2 * (1 - u) * (a.p1.y - a.p0.y) + 2 * u * (a.p2.y - a.p1.y),
      2 * (1 - u) * (a.p1.z - a.p0.z) + 2 * u * (a.p2.z - a.p1.z),
    )
    .normalize();
}

/** 畫出進度（0–1，power2.out）：和 shader 裡同一個公式，光點依它決定這一條畫到哪。 */
export function revealAt(t: number, delay: number): number {
  const p = Math.min(1, Math.max(0, (t - delay) / REVEAL));
  return 1 - (1 - p) * (1 - p);
}

/** 箭紋貼圖（原型 chevTex）：灰底上的白色 V 形，只是亮度遮罩，乘上頂點的 token 色後才是緞帶色。 */
function chevronTexture(): DataTexture {
  const W = 64;
  const H = 32;
  const poly = [
    [10, 3],
    [28, 16],
    [10, 29],
    [18, 16],
  ];
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = inside(x + 0.5, y + 0.5) ? 255 : 199;
      const k = (y * W + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = v;
      data[k + 3] = 255;
    }
  const t = new DataTexture(data, W, H, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 每區的流向端點：區中心的台地頂上（與區名同一點）。 */
function anchorsOf(view: BaseView): Map<string, Vector3> {
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
type Paint = (a: Arc) => { c: Color; alpha: number };

/** 所有緞帶本體、箭頭與靜態光帶各合成一個 geometry（粗的先寫進 buffer，先畫，細的疊在上面）。 */
function ribbonGeometries(arcs: Arc[], paint: Paint, bandPaint: Paint): [Scalable, Scalable, Scalable] {
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
interface Scalable {
  geo: BufferGeometry;
  c: Float32Array;
  o: Float32Array;
  k: number;
}

/** 就地改寫位置（不配置新陣列）；k 變不到 1% 就不動。 */
function scaleTo(s: Scalable, k: number) {
  if (s.k > 0 && Math.abs(k - s.k) <= s.k * 0.01) return;
  s.k = k;
  const pos = s.geo.getAttribute("position") as Float32BufferAttribute;
  const arr = pos.array as Float32Array;
  for (let i = 0; i < arr.length; i++) arr[i] = s.c[i] + s.o[i] * k;
  pos.needsUpdate = true;
  s.geo.computeBoundingSphere();
}

/** 在 MeshBasicMaterial 上加「畫出」：頂點位置 aReveal.x 超過這條的進度就丟掉（與 revealAt 同一個公式）。 */
function withReveal(m: MeshBasicMaterial, uniform: { value: number }): MeshBasicMaterial {
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uReveal = uniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aReveal;\nvarying vec2 vReveal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvReveal = aReveal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uReveal;\nvarying vec2 vReveal;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
float rp = clamp((uReveal - vReveal.y) / ${REVEAL.toFixed(2)}, 0.0, 1.0);
rp = 1.0 - (1.0 - rp) * (1.0 - rp);
if (vReveal.x > rp + 1e-4) discard;`,
      );
  };
  m.customProgramCacheKey = () => "flow-reveal";
  return m;
}

/** 前三大標籤的 DOM（Canvas 外）：路線、人數；文字與位置由 FlowLabelProjector 直接寫，不經 React。 */
export type FlowLabelEls = MutableRefObject<(HTMLDivElement | null)[]>;

export function FlowLabelLayer({ els }: { els: FlowLabelEls }) {
  return (
    <div className="scene-labels" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <div
          key={k}
          className="flabel"
          hidden
          ref={(el) => {
            els.current[k] = el;
          }}
        >
          <span className="route" />
          <br />
          <b className="num" />
          <span className="unit"> 人</span>
        </div>
      ))}
    </div>
  );
}

interface FlowsProps {
  view: BaseView;
  source: FlowSource;
  labels: FlowLabelEls;
  board: LabelBoard;
  /** ScaleProbe 每格寫入的緞帶縮放倍數 */
  scale: { k: number };
  /** 系統要求減少動態：緞帶不畫出、箭紋與光點照靜態模式 */
  reduced: boolean;
}

export function Flows({ view, source, labels, board, scale, reduced }: FlowsProps) {
  const hour = useView((s) => s.hour);
  const still = useView((s) => s.still);
  const dayType = useView((s) => s.dayType);
  const visible = useView((s) => s.layers.flow);
  const district = useView((s) => s.district);
  const focus = useView((s) => s.focus);
  const neutral = useTokenColor("--flow-neutral");
  const outColor = useTokenColor("--flow-out");
  const inColor = useTokenColor("--flow-in");
  const hi = useTokenColor("--particle-hi");
  const colorOf = useMemo(
    () => (kind?: FlowKind) => (kind === "out" ? outColor : kind === "in" ? inColor : neutral),
    [neutral, outColor, inColor],
  );
  // 端點：選區時跟著區抬起的目標高度（動畫中也先畫在終點，原型 topOf(k, true)）
  const base = useMemo(() => anchorsOf(view), [view]);
  const anchors = useMemo(() => {
    if (district === null) return base;
    return new Map([...base].map(([id, p]) => [id, p.clone().setY(p.y + liftTarget(district, id))]));
  }, [base, district]);
  const names = useMemo(() => new Map(view.districts.map((d) => [d.id, d.label])), [view]);
  const now = district === null ? source.at(dayType, hour) : source.district(dayType, hour, district);
  const frames = useMemo(() => {
    if (!now.flows) return null;
    const flows = [...now.flows];
    const counts = [...now.counts];
    // 聚焦的那條（卡片整天前 3 可能不在這一小時前 5）：這一小時有人數就補畫
    if (focus && !flows.some((f) => flowKey(f) === focus)) {
      const [from, to] = focus.split(">");
      const value = from !== to ? source.pair(dayType, hour, from, to) : null;
      if (value !== null && value > 0) {
        flows.push({ from, to, value, kind: district === null ? undefined : from === district ? "out" : "in" });
        counts.push(Math.max(1, Math.round(value / now.perDot)));
      }
    }
    return { flows, counts };
  }, [now, focus, source, dayType, hour, district]);
  const arcs = useMemo(
    () => (frames ? arcsOf(frames.flows, frames.counts, source.max, anchors, source.legend) : []),
    [frames, source, anchors],
  );
  const focused = focus !== null && arcs.some((a) => a.key === focus) ? focus : null;

  const chev = useMemo(chevronTexture, []);
  useEffect(() => () => chev.dispose(), [chev]);

  const reveal = useMemo(() => ({ value: SHOWN }), []);
  const [bodyMat, headMat, bandMat] = useMemo(() => {
    // 雙面透明材質預設畫兩次（背面再正面）；緞帶是平的，一次就夠（AD-6）。顏色全在頂點色（RGBA）。
    const common = {
      transparent: true,
      opacity: OPACITY,
      side: DoubleSide,
      forceSinglePass: true,
      depthWrite: false,
      vertexColors: true,
    } as const;
    return [
      withReveal(new MeshBasicMaterial({ ...common, map: chev }), reveal),
      withReveal(new MeshBasicMaterial({ ...common }), reveal),
      new MeshBasicMaterial({ ...common, opacity: 0.95 }),
    ];
  }, [chev, reveal]);
  useEffect(
    () => () => {
      bodyMat.dispose();
      headMat.dispose();
      bandMat.dispose();
    },
    [bodyMat, headMat, bandMat],
  );

  const ribbons = useMemo(() => {
    const tmp = new Color();
    const paint: Paint = (a) => ({ c: colorOf(a.flow.kind), alpha: focused && a.key !== focused ? DIM : 1 });
    // 光帶＝緞帶色往光點亮色推（和光點頭的亮度相同），日夜都亮在緞帶上
    const bandPaint: Paint = (a) => ({
      c: tmp.copy(colorOf(a.flow.kind)).lerp(hi, 0.7).clone(),
      alpha: focused && a.key !== focused ? DIM : 1,
    });
    const [g, h, s] = ribbonGeometries(arcs, paint, bandPaint);
    const body = new Mesh(g.geo, bodyMat);
    const head = new Mesh(h.geo, headMat);
    const band = new Mesh(s.geo, bandMat);
    body.renderOrder = 4;
    head.renderOrder = 5;
    band.renderOrder = 6;
    for (const m of [body, head, band]) m.matrixAutoUpdate = false;
    return { body, head, band, scalable: [g, h, s] };
  }, [arcs, bodyMat, headMat, bandMat, colorOf, hi, focused]);
  useEffect(
    () => () => {
      ribbons.body.geometry.dispose();
      ribbons.head.geometry.dispose();
      ribbons.band.geometry.dispose();
    },
    [ribbons],
  );

  // 換情境時從起點畫出去（diorama-game-juice「流向」）；開場與整點更新不畫。layout effect：新幾何的第一格就從 0 開始。
  const calm = still || reduced;
  // 選站不換流向（3.12 才畫站對站），不算換情境
  const context = `${district}|${dayType}|${focus}`;
  const lastContext = useRef(context);
  useLayoutEffect(() => {
    if (lastContext.current === context) return;
    lastContext.current = context;
    gsap.killTweensOf(reveal);
    if (calm || arcs.length === 0) {
      reveal.value = SHOWN;
      return;
    }
    const end = arcs.reduce((m, a) => Math.max(m, a.delay), 0) + REVEAL;
    reveal.value = 0;
    gsap.to(reveal, { value: end, duration: end, ease: "none", onComplete: () => void (reveal.value = SHOWN) });
    // 只在情境換了時重來；arcs 每小時換也不重畫
  }, [context]);
  useEffect(() => () => void gsap.killTweensOf(reveal), [reveal]);

  const dots = useMemo(() => {
    const geo = new CapsuleGeometry(0.14, 0.42, 3, 8);
    geo.rotateX(Math.PI / 2);
    const m = new InstancedMesh(geo, new MeshBasicMaterial(), DOT_CAP);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.setColorAt(0, new Color());
    m.count = 0;
    m.frustumCulled = false;
    m.renderOrder = 6;
    return m;
  }, []);
  useEffect(
    () => () => {
      dots.geometry.dispose();
      (dots.material as MeshBasicMaterial).dispose();
      dots.dispose();
    },
    [dots],
  );

  // 光點：脈衝一波波湧出，頭亮尾淡（diorama-game-juice「光點」）。靜態模式不畫光點（換成光帶）；
  // 聚焦時其他條不出光點；畫出中的緞帶，光點只走在已畫出的那一段。
  const tmp = useMemo(() => ({ o: new Object3D(), P: new Vector3(), T: new Vector3(), c: new Color(), t: 0 }), []);
  useFrame((_, dt) => {
    if (!visible) return;
    // 放大時的線寬上限（ScaleProbe 在前面算好 k）：緞帶、光帶與光點同一個倍數
    const k = scale.k;
    for (const s of ribbons.scalable) scaleTo(s, k);
    const fast = rush(hour);
    if (still) {
      chev.offset.x = 0;
      return;
    }
    tmp.t += Math.min(dt, 0.1);
    chev.offset.x = -tmp.t * (fast ? 1.3 : 0.7);
    const speed = 7 * (fast ? 1.6 : 1);
    const rate = 0.55 * (fast ? 1.6 : 1);
    const { o, P, T, c } = tmp;
    let n = 0;
    for (const a of arcs) {
      if (focused && a.key !== focused) continue;
      const shown = reveal.value >= SHOWN ? 1 : revealAt(reveal.value, a.delay);
      const color = colorOf(a.flow.kind);
      for (let i = 0; i < a.n && n < DOT_CAP; i++) {
        const u = 0.05 + 0.9 * fract(i / a.n + (tmp.t * speed) / a.len + a.phase);
        if (u > 0.05 + 0.79 * shown) continue;
        const pulse = Math.pow(fract(tmp.t * rate - u * 1.6 + a.phase), 3);
        bez(a, u, P);
        bezTan(a, u, T);
        o.position.set(P.x, P.y + 0.12, P.z);
        o.lookAt(P.x + T.x, P.y + 0.12 + T.y, P.z + T.z);
        o.scale.setScalar((0.75 + 0.6 * pulse) * k);
        o.updateMatrix();
        dots.setMatrixAt(n, o.matrix);
        dots.setColorAt(n, c.copy(color).lerp(hi, 0.35 + 0.65 * pulse));
        n++;
      }
    }
    dots.count = n;
    dots.instanceMatrix.needsUpdate = true;
    if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
  });

  return (
    <group visible={visible}>
      <primitive object={ribbons.body} />
      <primitive object={ribbons.head} />
      <primitive object={ribbons.band} visible={still} />
      <primitive object={dots} visible={!still} />
      <FlowLabelProjector arcs={arcs} focused={focused} names={names} els={labels} board={board} visible={visible} />
    </group>
  );
}

/**
 * 前三大在弧頂標人數（DOM；聚焦時只標那一條）；彼此重疊時往上或往下挪（最多兩格），挪不開就藏起來。
 * 結果寫進 board 讓區名避開。標籤色塊跟著去哪／誰來換色（data-kind）。
 */
function FlowLabelProjector({
  arcs,
  focused,
  names,
  els,
  board,
  visible,
}: {
  arcs: Arc[];
  focused: string | null;
  names: Map<string, string>;
  els: FlowLabelEls;
  board: LabelBoard;
  visible: boolean;
}) {
  const top = useMemo(
    () => (focused ? arcs.filter((a) => a.key === focused) : [...arcs].sort((a, b) => b.w - a.w).slice(0, 3)),
    [arcs, focused],
  );
  // 文字：流向變了才寫（layout effect：下一格量大小前就寫好）；人數 null 顯示「少於 10 人」（AD-3），不會出現在前三，但不假設
  useLayoutEffect(() => {
    els.current.forEach((el, k) => {
      const a = top[k];
      if (!el || !a) return;
      el.dataset.kind = a.flow.kind ?? "city";
      const route = el.querySelector<HTMLElement>(".route");
      const num = el.querySelector<HTMLElement>(".num");
      const unit = el.querySelector<HTMLElement>(".unit");
      if (route) route.textContent = `${names.get(a.flow.from) ?? ""} → ${names.get(a.flow.to) ?? ""}`;
      if (num) num.textContent = a.flow.value === null ? "少於 10 人" : fmt(a.flow.value);
      if (unit) unit.hidden = a.flow.value === null;
    });
  }, [top, names, els]);

  const P = useMemo(() => new Vector3(), []);
  const last = useRef({ m: new Matrix4(), w: 0, h: 0, top: null as Arc[] | null, visible: false, safe: -1 });
  // 標籤大小只在文字換了之後量一次（量的時候要先顯示），鏡頭移動時不再逼瀏覽器重排
  const dims = useRef<{ top: Arc[] | null; wh: [number, number][] }>({ top: null, wh: [] });
  useFrame(({ camera, size }) => {
    const L = last.current;
    const safeKey = board.safeTop * 10000 + board.safeBottom;
    if (
      L.top === top &&
      L.visible === visible &&
      L.safe === safeKey &&
      L.w === size.width &&
      L.h === size.height &&
      L.m.equals(camera.matrixWorld)
    )
      return;
    L.m.copy(camera.matrixWorld);
    L.w = size.width;
    L.h = size.height;
    L.top = top;
    L.visible = visible;
    L.safe = safeKey;
    if (visible && dims.current.top !== top) {
      dims.current.top = top;
      dims.current.wh = els.current.map((el, k) => {
        if (!el || !top[k]) return [0, 0];
        el.hidden = false;
        return [el.offsetWidth || 90, el.offsetHeight || 34];
      });
    }
    const taken: [number, number, number, number][] = [];
    els.current.forEach((el, k) => {
      if (!el) return;
      const a = top[k];
      if (!a || !visible) {
        el.hidden = true;
        return;
      }
      const [w, h] = dims.current.wh[k] ?? [90, 34];
      bez(a, 0.5, P);
      P.y += 0.6;
      P.project(camera);
      // 弧頂在鏡頭後面：不標；其餘交給 placeLabel（安全區、左右留邊、彼此不重疊）
      const spot =
        P.z > 1
          ? null
          : placeLabel(
              (P.x * 0.5 + 0.5) * size.width,
              (-P.y * 0.5 + 0.5) * size.height,
              w,
              h,
              { width: size.width, height: size.height, top: board.safeTop, bottom: board.safeBottom },
              taken,
            );
      el.hidden = spot === null;
      if (!spot) return;
      taken.push(spot.rect);
      el.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
    board.rects = taken;
    board.version++;
  });
  return null;
}
