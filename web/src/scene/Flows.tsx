// 行政區流向（3.5，原型「流向」段移植；3.6 加選區模式）：等比例線寬的緞帶＋尾端箭頭、脈衝光點、前三大弧頂人數。
// 只吃 views.ts 的 FlowSource／FlowFrame（AD-19）；線寬、前 12 大、去哪／誰來、光點換算、光帶分級都在 views.ts。
// 全城模式畫前 12 大（橘）；選了區畫這區前 5 去哪（藍）與前 5 誰來（橘紅），端點跟著區抬起（lift.ts）。
// 選了站（3.12）畫這站這一小時前 5 目的地的站對站緞帶（藍，od 分片），端點在站珠頂上；同一個光點換算。
// 線寬（3.21 決定 7）：全城＝當月最大；選區、選站＝畫面上最大的那條當最粗（flowNow.ts，圖例同一份）。
// 雙向的兩條各往前進方向的右側偏移成左右車道（Piwi 2026-11-12）。
// draw call（AD-6）：所有緞帶本體合成一個 mesh、所有箭頭一個 mesh、所有光點一個 InstancedMesh；顏色放在頂點色
// （RGBA，聚焦時其他條的 alpha 降低），所以去哪與誰來兩種顏色也不多畫一次。
// 靜態模式（3.3，減少動態時開場就開）把光點換成依人數分級粗細的靜態光帶（一個合併 mesh），兩者不同時畫，總數不變。
// 城市睡覺（3.4）：停駛的小時本來就沒有流向（FlowSource 回 null，不畫成 0）；停駛前約 15 分鐘
// 緞帶、光帶、光點與標籤依 state/service.ts 的 sleepAt(t) 淡出，減少動態時直接消失。
// 換情境（選區、換日型、聚焦一條）時緞帶從起點畫出去（gsap 推 uReveal，shader 依每個頂點在緞帶上的位置裁掉，
// 原型的 drawRange 動畫在合併幾何上的作法）；整點更新不重畫。靜態模式或減少動態時直接出現、箭紋不捲動。
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { CapsuleGeometry, Color, DoubleSide, DynamicDrawUsage, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Vector3 } from "three";
import { stationVolume } from "../data/traits";
import {
  DOT_CAP,
  flowKey,
  pillarHeight,
  stationLabel,
  type BaseView,
  type FlowKind,
  type FlowSource,
  type StationIndex,
} from "../data/views";
import { sleepAt } from "../state/service";
import { getView, time, useView } from "../state/view";
import type { LabelBoard } from "./DistrictLabels";
import { anchorsOf, arcsOf, bez, bezTan, fract, ribbonGeometries, scaleTo, type Paint } from "./flowGeometry";
import { FlowLabelProjector, type FlowLabelEls } from "./FlowLabels";
import { useFlowNow } from "./flowNow";
import { BAND_OPACITY, chevronTexture, DIM, OPACITY, REVEAL, revealAt, SHOWN, withReveal } from "./flowMaterial";
import { liftTarget } from "./lift";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColor } from "./useTokenColor";

// 拆檔（3.21）：幾何在 flowGeometry.ts、材質在 flowMaterial.ts、弧頂標籤在 FlowLabels.tsx；外部照舊從這裡匯入。
export { arcsOf, type Arc } from "./flowGeometry";
export { FlowLabelLayer, type FlowLabelEls } from "./FlowLabels";
export { revealAt } from "./flowMaterial";

/** 尖峰（原型 RUSH）：光點與箭紋走快一點。只影響動畫速度，不承載數字。 */
const rush = (h: number) => (h >= 7 && h < 10) || (h >= 17 && h < 20);

/** 站對站緞帶的端點在柱頂之上多高：廣場 0.08＋站珠離柱頂 0.2＋站珠半徑 0.27（Stations.tsx）。 */
const STATION_CAP = 0.55;

interface FlowsProps {
  view: BaseView;
  source: FlowSource;
  /** 選站時的站對站緞帶（3.12）：站的位置、柱高與站名 */
  stations: StationIndex;
  labels: FlowLabelEls;
  board: LabelBoard;
  /** ScaleProbe 每格寫入的緞帶縮放倍數 */
  scale: { k: number };
  /** 系統要求減少動態：緞帶不畫出、箭紋與光點照靜態模式 */
  reduced: boolean;
}

export function Flows({ view, source, stations, labels, board, scale, reduced }: FlowsProps) {
  const hour = useView((s) => s.hour);
  const still = useView((s) => s.still);
  const dayType = useView((s) => s.dayType);
  const visible = useView((s) => s.layers.flow);
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const focus = useView((s) => s.focus);
  // 這一小時要畫的流向與線寬比例（flowNow.ts，圖例共用）：選了站（3.12）換成這站前 5 目的地（od 分片）；
  // 選區、選站時最粗＝畫面上最大的那條（決定 7），全城＝當月最大
  const flowNow = useFlowNow(source, stations)!;
  const { now, scale: flowScale } = flowNow;
  const stationNow = flowNow.mode === "station" ? now : null;
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
  const lifted = useMemo(() => {
    if (district === null) return base;
    return new Map([...base].map(([id, p]) => [id, p.clone().setY(p.y + liftTarget(district, id))]));
  }, [base, district]);
  // 站對站：端點在站珠頂上（台地頂＋區的抬起＋這一小時的柱高；柱高換算同 views.ts pillarHeight，經 project()，AD-12）
  const anchors = useMemo(() => {
    const flows = stationNow?.flows;
    if (!flows?.length) return lifted;
    const out = new Map(lifted);
    for (const f of flows)
      for (const id of [f.from, f.to]) {
        const i = stations.byId.get(id);
        if (i === undefined || out.has(id)) continue;
        const s = stations.stations[i];
        const [x, z] = project(s.lon, s.lat);
        const ground = TILE_TOP + levelHeight(terrainLevelAt(s.lon, s.lat, view.grid), view.levels);
        const h = pillarHeight(stationVolume(s, dayType, hour).value, stations.peak) ?? 0;
        out.set(id, new Vector3(x, ground + liftTarget(district, s.district) + h + STATION_CAP, z));
      }
    return out;
  }, [lifted, stationNow, stations, view, district, dayType, hour]);
  const names = useMemo(
    () =>
      new Map([
        ...view.districts.map((d): [string, string] => [d.id, d.label]),
        ...stations.stations.map((s): [string, string] => [s.id, stationLabel(s.display)]),
      ]),
    [view, stations],
  );
  const frames = useMemo(() => {
    if (!now.flows) return null;
    const flows = [...now.flows];
    const counts = [...now.counts];
    // 聚焦的那條（卡片整天前 3 可能不在這一小時前 5）：這一小時有人數就補畫。選站時只聚焦卡上列出的 5 條，不補畫
    if (focus && stationNow === null && !flows.some((f) => flowKey(f) === focus)) {
      const [from, to] = focus.split(">");
      const value = from !== to ? source.pair(dayType, hour, from, to) : null;
      if (value !== null && value > 0) {
        flows.push({ from, to, value, kind: district === null ? undefined : from === district ? "out" : "in" });
        counts.push(Math.max(1, Math.round(value / now.perDot)));
      }
    }
    return { flows, counts };
  }, [now, focus, source, dayType, hour, district, stationNow]);
  const arcs = useMemo(
    () => (frames ? arcsOf(frames.flows, frames.counts, flowScale.max, anchors, flowScale.legend) : []),
    [frames, flowScale, anchors],
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
      new MeshBasicMaterial({ ...common, opacity: BAND_OPACITY }),
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
  // 選站換成站對站（3.12）：換站、分片到了也算換情境，緞帶從這站畫出去
  const context = `${district}|${station}|${flowNow.shardReady}|${dayType}|${focus}`;
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
  const awake = useRef(-1);
  // 新的幾何（整點換流向）預設看得見：下一格重新套用入睡程度
  useEffect(() => void (awake.current = -1), [ribbons]);
  useFrame((_, dt) => {
    if (!visible) return;
    // 入睡（3.4）：1＝醒著、0＝停駛；時刻的純函式，暫停時不動
    const wake = 1 - sleepAt(time.t, getView().dayType, reduced);
    if (wake !== awake.current) {
      awake.current = wake;
      bodyMat.opacity = headMat.opacity = OPACITY * wake;
      bandMat.opacity = BAND_OPACITY * wake;
      ribbons.body.visible = ribbons.head.visible = wake > 0;
    }
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
        o.scale.setScalar((0.75 + 0.6 * pulse) * k * wake);
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
      <FlowLabelProjector
        arcs={arcs}
        focused={focused}
        names={names}
        els={labels}
        board={board}
        visible={visible}
        reduced={reduced}
      />
    </group>
  );
}
