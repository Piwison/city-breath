// 行政區流向（3.5，原型「流向」段移植）：等比例線寬的緞帶＋尾端箭頭、脈衝光點、前三大弧頂人數。
// 只吃 views.ts 的 FlowSource／FlowFrame（AD-19）；線寬、前 12 大、光點換算都在 views.ts。
// draw call（AD-6）：所有緞帶本體合成一個 mesh、所有箭頭一個 mesh、所有光點一個 InstancedMesh，共 3 個。
// 減少動態：箭紋不捲動、光點等距靜止（依人數的顆數不變，圖例照樣成立）。
import { useFrame } from "@react-three/fiber";
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
} from "three";
import { DOT_CAP, ribbonWidth, type BaseView, type FlowFrame, type FlowSource } from "../data/views";
import { useView } from "../state/view";
import type { LabelBoard } from "./DistrictLabels";
import { placeLabel } from "./labelPlace";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColor } from "./useTokenColor";

/** 尖峰（原型 RUSH）：光點與箭紋走快一點。只影響動畫速度，不承載數字。 */
const rush = (h: number) => (h >= 7 && h < 10) || (h >= 17 && h < 20);
const fract = (v: number) => v - Math.floor(v);
const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");
const OPACITY = 0.92;

/** 一條要畫的緞帶：二次貝茲曲線 p0 → p1 → p2。 */
export interface Arc {
  flow: FlowFrame;
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

/** 箭紋貼圖（原型 chevTex）：灰底上的白色 V 形，只是亮度遮罩，乘上 token 色後才是緞帶色。 */
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

/** FlowFrame → 曲線。沒有端點（不在底圖的區）就略過。 */
export function arcsOf(flows: FlowFrame[], counts: number[], max: number, anchors: Map<string, Vector3>): Arc[] {
  const arcs: Arc[] = [];
  flows.forEach((flow, k) => {
    const a0 = anchors.get(flow.from);
    const a2 = anchors.get(flow.to);
    if (!a0 || !a2 || flow.value === null) return;
    const dist = a0.distanceTo(a2);
    const p1 = a0.clone().lerp(a2, 0.5);
    p1.y = Math.max(a0.y, a2.y) + 2.5 + dist * 0.32;
    const h = (s: string) => [...s].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 997, 7) / 997;
    arcs.push({
      flow,
      p0: a0.clone(),
      p1,
      p2: a2.clone(),
      w: ribbonWidth(flow.value, max),
      len: dist * 1.15 + 1,
      phase: fract(h(flow.from) * 0.37 + h(flow.to) * 0.61),
      n: counts[k] ?? 0,
    });
  });
  return arcs;
}

/** 所有緞帶本體與箭頭合成兩個 geometry（粗的先寫進 buffer，先畫，細的疊在上面）。 */
function ribbonGeometries(arcs: Arc[]): [Scalable, Scalable] {
  const N = 44;
  const U0 = 0.05;
  const U1 = 0.84;
  const U2 = 0.955;
  const P = new Vector3();
  const Q = new Vector3();
  const TAN = new Vector3();
  const SIDE = new Vector3();
  // 每個頂點存「中心線上的點」與「往側邊的偏移（半寬）」；實際位置＝中心＋偏移×k（放大時的線寬上限）
  const body = { c: [] as number[], o: [] as number[], uv: [] as number[], idx: [] as number[] };
  const head = { c: [] as number[], o: [] as number[] };
  const sorted = [...arcs].sort((a, b) => b.w - a.w);
  for (const a of sorted) {
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
      if (k < N) {
        const b = base + k * 2;
        body.idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    bez(a, U1, P);
    sideAt(U1);
    const hh = a.w * 0.95 + 0.38;
    bez(a, U2, Q);
    head.c.push(P.x, P.y, P.z, P.x, P.y, P.z, Q.x, Q.y, Q.z);
    head.o.push(SIDE.x * hh, 0, SIDE.z * hh, -SIDE.x * hh, 0, -SIDE.z * hh, 0, 0, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(body.c, 3));
  g.setAttribute("uv", new Float32BufferAttribute(body.uv, 2));
  g.setIndex(body.idx);
  const h = new BufferGeometry();
  h.setAttribute("position", new Float32BufferAttribute(head.c, 3));
  const out: [Scalable, Scalable] = [
    { geo: g, c: new Float32Array(body.c), o: new Float32Array(body.o), k: -1 },
    { geo: h, c: new Float32Array(head.c), o: new Float32Array(head.o), k: -1 },
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
  reduced: boolean;
  labels: FlowLabelEls;
  board: LabelBoard;
  /** ScaleProbe 每格寫入的緞帶縮放倍數 */
  scale: { k: number };
}

export function Flows({ view, source, reduced, labels, board, scale }: FlowsProps) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const visible = useView((s) => s.layers.flow);
  const color = useTokenColor("--flow-neutral");
  const hi = useTokenColor("--particle-hi");
  const anchors = useMemo(() => anchorsOf(view), [view]);
  const names = useMemo(() => new Map(view.districts.map((d) => [d.id, d.label])), [view]);
  const now = source.at(dayType, hour);
  const arcs = useMemo(
    () => (now.flows ? arcsOf(now.flows, now.counts, source.max, anchors) : []),
    [now, source, anchors],
  );

  const chev = useMemo(chevronTexture, []);
  useEffect(() => () => chev.dispose(), [chev]);

  const [bodyMat, headMat] = useMemo(() => {
    // 雙面透明材質預設畫兩次（背面再正面）；緞帶是平的，一次就夠（AD-6）
    const common = { transparent: true, opacity: OPACITY, side: DoubleSide, forceSinglePass: true, depthWrite: false } as const;
    return [new MeshBasicMaterial({ ...common, map: chev }), new MeshBasicMaterial({ ...common })];
  }, [chev]);
  useEffect(() => {
    bodyMat.color.copy(color);
    headMat.color.copy(color);
  }, [bodyMat, headMat, color]);
  useEffect(
    () => () => {
      bodyMat.dispose();
      headMat.dispose();
    },
    [bodyMat, headMat],
  );

  const ribbons = useMemo(() => {
    const [g, h] = ribbonGeometries(arcs);
    const body = new Mesh(g.geo, bodyMat);
    const head = new Mesh(h.geo, headMat);
    body.renderOrder = 4;
    head.renderOrder = 5;
    for (const m of [body, head]) m.matrixAutoUpdate = false;
    return { body, head, scalable: [g, h] };
  }, [arcs, bodyMat, headMat]);
  useEffect(
    () => () => {
      ribbons.body.geometry.dispose();
      ribbons.head.geometry.dispose();
    },
    [ribbons],
  );

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

  // 光點：脈衝一波波湧出，頭亮尾淡（diorama-game-juice「光點」）；減少動態時等距靜止，只在流向變了才重寫
  const tmp = useMemo(
    () => ({ o: new Object3D(), P: new Vector3(), T: new Vector3(), c: new Color(), t: 0, staticFor: null as Arc[] | null, k: 1 }),
    [],
  );
  useFrame((_, dt) => {
    if (!visible) return;
    // 放大時的線寬上限（ScaleProbe 在前面算好 k）：緞帶與光點同一個倍數
    const k = scale.k;
    for (const s of ribbons.scalable) scaleTo(s, k);
    const still = reduced;
    if (!still) tmp.t += Math.min(dt, 0.1);
    const fast = rush(hour);
    chev.offset.x = still ? 0 : -tmp.t * (fast ? 1.3 : 0.7);
    if (still && tmp.staticFor === arcs && Math.abs(k - tmp.k) <= tmp.k * 0.01) return;
    tmp.staticFor = still ? arcs : null;
    tmp.k = k;
    const speed = 7 * (fast ? 1.6 : 1);
    const rate = 0.55 * (fast ? 1.6 : 1);
    const { o, P, T, c } = tmp;
    let n = 0;
    for (const a of arcs) {
      for (let i = 0; i < a.n && n < DOT_CAP; i++) {
        const u = still ? 0.05 + (0.9 * (i + 0.5)) / a.n : 0.05 + 0.9 * fract(i / a.n + (tmp.t * speed) / a.len + a.phase);
        const pulse = still ? 0.4 : Math.pow(fract(tmp.t * rate - u * 1.6 + a.phase), 3);
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

  // 換了流向或顏色：靜止的光點要重寫一次
  useEffect(() => {
    tmp.staticFor = null;
  }, [arcs, color, hi, tmp]);

  return (
    <group visible={visible}>
      <primitive object={ribbons.body} />
      <primitive object={ribbons.head} />
      <primitive object={dots} />
      <FlowLabelProjector arcs={arcs} names={names} els={labels} board={board} visible={visible} />
    </group>
  );
}

/** 前三大在弧頂標人數（DOM）；彼此重疊時往上或往下挪（最多兩格），挪不開就藏起來。結果寫進 board 讓區名避開。 */
function FlowLabelProjector({
  arcs,
  names,
  els,
  board,
  visible,
}: {
  arcs: Arc[];
  names: Map<string, string>;
  els: FlowLabelEls;
  board: LabelBoard;
  visible: boolean;
}) {
  const top = useMemo(() => [...arcs].sort((a, b) => b.w - a.w).slice(0, 3), [arcs]);
  // 文字：流向變了才寫（layout effect：下一格量大小前就寫好）；人數 null 顯示「少於 10 人」（AD-3），不會出現在前三，但不假設
  useLayoutEffect(() => {
    els.current.forEach((el, k) => {
      const a = top[k];
      if (!el || !a) return;
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
