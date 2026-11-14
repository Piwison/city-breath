// 車站（3.1，取代 3.6 的 DistrictStations）：每站「廣場＋細柱＋站珠」，全部 120 站用三個 InstancedMesh（AD-6、AD-11）。
// 柱高＝此刻進出人數（views.ts pillarAt：stations.json，平方根比例，不乘地形倍數，AD-12）；停止營運時柱收進廣場、
// 站珠熄燈（AD-5），和 3.4 城市睡覺用同一條入睡曲線（state/service.ts sleepAt：停駛前淡出、減少動態時直接切換）。站在台地上（levelHeight → elevation()），跟著行政區抬起與按壓（lift.ts）。
// 廣場與站珠是路線色（--line-*，AD-21），細柱是 --station；夜裡站珠以路線色自發光（天光：夜裡亮的是窗、站珠、列車）。
// 放大或選了區才點得到、才標站名，只標重要的（stationRules.ts）；點站時站珠彈一下（gsap），減少動態或靜態模式時直接切換。
// 只吃 views.ts 的 StationFrame（AD-19）；站屬哪區只看 stations.json 的 district（AD-9）。
// 第一班車（3.14）：播放中走過第一班車的整點，站珠從台北車站往外依距離彈一下、亮一下（firstTrain.ts；Trains 觸發）。
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import { pillarAt, stationFrames, type BaseView, type PillarState, type StationFrame, type StationIndex } from "../data/views";
import { sleepAt } from "../state/service";
import { getView, time, useView } from "../state/view";
import { sunAt } from "./daylight";
import type { LabelBoard } from "./DistrictLabels";
import { waveAt, waveGlow, waveRunning, WAVE_ORIGIN } from "./firstTrain";
import type { LegendLink } from "./FlowLegend";
import { lifts, liftOf } from "./lift";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { useTier, type Tier } from "./quality";
import { chooseStationLabels, isZoomed, labelTier, stationPickable, type LabelCandidate } from "./stationRules";
import { TILE_TOP } from "./Terrain";
import { useTokenColor, useTokenColors } from "./useTokenColor";

/** 站珠半徑、站珠離柱頂多高（原型 capGeo 0.27、capY = 柱頂 + 0.2）。 */
const BEAD_R = 0.27;
const BEAD_GAP = 0.2;
/** 選中的站珠放大幾倍（原型 1.6）。 */
const BEAD_ON = 1.6;
/** 點站時站珠從幾成彈回（原型 stPop 0.4 → 1，elastic.out(1.3, 0.35) 0.7 秒）。 */
const POP_FROM = 0.4;
/** 停止營運時站珠往 --station 褪多少（熄燈）。 */
const CLOSED_FADE = 0.65;
/** 柱高追目標的速度（每秒）；減少動態或靜態模式時直接切換。 */
const HEIGHT_RATE = 9;
/** 名牌估計大小（px）：每字約 11px＋路線色點與留白，高 18。 */
const labelW = (text: string) => text.length * 11 + 20;
const LABEL_H = 18;

/** 幾何的細緻度：lite 少一半以上的面（quality.ts）。 */
const DETAIL: Record<Tier, { plaza: number; column: number; bead: [number, number] }> = {
  full: { plaza: 20, column: 10, bead: [14, 10] },
  lite: { plaza: 10, column: 6, bead: [8, 6] },
};

/** Canvas 內外共用：站名 DOM、可點的站目前的螢幕位置（點擊判斷用）。 */
export interface StationLink {
  els: Map<string, HTMLDivElement>;
  spots: { id: string; x: number; y: number }[];
}

/** 全部的站（Canvas 內外各自訂閱，算法同一個純函式）。 */
function useFrames(index: StationIndex): StationFrame[] {
  const dayType = useView((s) => s.dayType);
  const hour = useView((s) => s.hour);
  return useMemo(() => stationFrames(index, null, dayType, hour), [index, dayType, hour]);
}

/** Canvas 外：站名（路線色點＋短名），位置與顯示由 Canvas 內每格寫。 */
export function StationLabelLayer({ index, link }: { index: StationIndex; link: StationLink }) {
  const frames = useFrames(index);
  const station = useView((s) => s.station);
  const on = useView((s) => s.layers.station);
  return (
    <div className="scene-labels" aria-hidden="true" hidden={!on}>
      {frames.map((f) => (
        <div
          key={f.id}
          className="slabel"
          data-on={f.id === station}
          hidden
          ref={(el) => {
            if (el) link.els.set(f.id, el);
            else link.els.delete(f.id);
          }}
        >
          <i style={{ background: `var(${f.token})` }} />
          {f.label}
        </div>
      ))}
    </div>
  );
}

/** 站珠：自發光乘上每顆的顏色（路線色），夜裡亮的是各自路線的顏色（原型 tintEmissive）。 */
function beadMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.4, metalness: 0, emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n totalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  return m;
}

function buildMeshes(tier: Tier, n: number) {
  const d = DETAIL[tier];
  const plazaGeo = new CylinderGeometry(0.46, 0.5, 0.08, d.plaza);
  plazaGeo.translate(0, 0.04, 0);
  const colGeo = new CylinderGeometry(0.1, 0.13, 1, d.column);
  colGeo.translate(0, 0.5, 0);
  const beadGeo = new SphereGeometry(BEAD_R, d.bead[0], d.bead[1]);
  const plaza = new InstancedMesh(plazaGeo, new MeshStandardMaterial({ roughness: 0.7, metalness: 0 }), n);
  const column = new InstancedMesh(colGeo, new MeshStandardMaterial({ roughness: 0.6, metalness: 0 }), n);
  const bead = new InstancedMesh(beadGeo, beadMaterial(), n);
  plaza.setColorAt(0, new Color());
  bead.setColorAt(0, new Color());
  for (const m of [plaza, column, bead]) {
    m.frustumCulled = false;
    m.count = 0;
    // 不讓 raycaster 打到：站用螢幕距離挑（Selection），射線只打行政區地塊
    m.raycast = () => {};
  }
  // lite 不投影（陰影 pass 少 2 個 draw call）
  column.castShadow = bead.castShadow = tier === "full";
  plaza.receiveShadow = true;
  const tris = (g: { index: { count: number } | null }) => (g.index?.count ?? 0) / 3;
  return {
    plaza,
    column,
    bead,
    trianglesPerStation: tris(plazaGeo) + tris(colGeo) + tris(beadGeo),
    dispose() {
      for (const m of [plaza, column, bead]) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
        m.dispose();
      }
    },
  };
}

/** Canvas 內：車站柱、站名投影、可點的站。名牌在流向標籤之後、區名之前放（掛載順序＝useFrame 順序）。 */
export function Stations({
  view,
  index,
  link,
  board,
  scale,
  reduced,
}: {
  view: BaseView;
  index: StationIndex;
  link: StationLink;
  board: LabelBoard;
  scale: LegendLink;
  reduced: boolean;
}) {
  const tier = useTier();
  const gl = useThree((s) => s.gl);
  const allFrames = useFrames(index);
  const visible = useView((s) => s.layers.station);
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const still = useView((s) => s.still);
  const calm = reduced || still;

  // 只畫在底圖 21 區裡的站（stations.json 的 district，AD-9；目前全部都在）
  const frames = useMemo(() => {
    const ids = new Set(view.districts.map((d) => d.id));
    return allFrames.filter((f) => ids.has(f.district));
  }, [allFrames, view]);

  const meshes = useMemo(() => buildMeshes(tier, Math.max(1, index.stations.length)), [tier, index]);
  useEffect(() => () => meshes.dispose(), [meshes]);
  useEffect(() => {
    performance.mark?.("stations:build", {
      detail: { tier, stations: index.stations.length, trianglesPerStation: meshes.trianglesPerStation },
    });
  }, [meshes, tier, index]);

  // 每站固定的東西：位置與地面（台地頂，不含抬起），依 frames 的順序
  const spots = useMemo(
    () =>
      frames.map((f) => {
        const [x, z] = project(f.lon, f.lat);
        return { x, z, ground: TILE_TOP + levelHeight(terrainLevelAt(f.lon, f.lat, view.grid), view.levels) };
      }),
    [frames, view],
  );

  // 第一班車波紋：每站離圓心（台北車站；找不到用場景原點）多遠
  const wave = useMemo(() => {
    const o = frames.findIndex((f) => index.stations[f.index]?.name === WAVE_ORIGIN);
    const [cx, cz] = o >= 0 ? [spots[o].x, spots[o].z] : [0, 0];
    const dist = spots.map((g) => Math.hypot(g.x - cx, g.z - cz));
    return { dist, max: Math.max(0, ...dist), pulse: new Float32Array(spots.length).fill(1) };
  }, [frames, spots, index]);

  // 顏色只從 token 來（AD-8）
  const beadTokens = useMemo(() => frames.map((f) => f.token), [frames]);
  const plazaTokens = useMemo(() => frames.map((f) => f.plazaToken), [frames]);
  const beadColors = useTokenColors(beadTokens);
  const plazaColors = useTokenColors(plazaTokens);
  const stationColor = useTokenColor("--station");
  const glow = useTokenColor("--station-glow");
  useEffect(() => {
    (meshes.column.material as MeshStandardMaterial).color.copy(stationColor);
    (meshes.bead.material as MeshStandardMaterial).emissive.copy(glow);
    plazaColors.forEach((c, i) => meshes.plaza.setColorAt(i, c));
    if (meshes.plaza.instanceColor) meshes.plaza.instanceColor.needsUpdate = true;
  }, [meshes, plazaColors, stationColor, glow]);

  // 站珠彈一下：選了一站就從 0.4 彈回 1（gsap，AD-11）；減少動態或靜態模式時直接是 1
  const pop = useMemo(() => ({ id: null as string | null, v: 1 }), []);
  useEffect(() => {
    gsap.killTweensOf(pop);
    pop.id = station;
    pop.v = 1;
    if (!station || calm) return;
    pop.v = POP_FROM;
    gsap.to(pop, { v: 1, duration: 0.7, ease: "elastic.out(1.3, 0.35)" });
  }, [station, calm, pop]);
  useEffect(() => () => void gsap.killTweensOf(pop), [pop]);

  // 圖層開關、換等級：陰影圖不會自己重畫（Daylight 只在光移動時重畫），補一次
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, visible, meshes]);

  const st = useRef({
    shown: new Float32Array(0),
    open: new Float32Array(0),
    colors: null as unknown,
    colorStation: undefined as string | null | undefined,
    index: null as StationIndex | null,
    meshes: null as unknown,
    waved: false,
  });
  const o = useMemo(() => new Object3D(), []);
  const P = useMemo(() => new Vector3(), []);
  const want = useMemo<PillarState>(() => ({ height: 0, open: 0 }), []);
  const c = useMemo(() => new Color(), []);
  const last = useRef({ m: new Matrix4(), w: 0, h: 0, key: "", bv: -1, els: -1, matKey: "" });

  useFrame(({ camera, size, clock }, dt) => {
    const S = st.current;
    const n = frames.length;
    // frames 每個整點換一份（value 變了），站的順序不變；換了一組站（換月份）或換了等級（重建網格）才從頭來、不緩動
    const reset = S.index !== index || S.meshes !== meshes || S.shown.length !== n;
    if (reset) {
      S.shown = new Float32Array(n);
      S.open = new Float32Array(n);
      S.index = index;
      S.meshes = meshes;
    }
    if (!visible) {
      link.spots = [];
      if (board.stationRects.length) {
        board.stationRects = [];
        board.stationVersion++;
      }
      return;
    }
    const v = getView();
    // 播放中照連續時間內插；暫停或減少動態時用整點（和小卡同一個值）
    const smooth = v.playing && !calm;
    const t = smooth ? time.t : v.hour;
    const k = calm || reset ? 1 : 1 - Math.exp(-dt * HEIGHT_RATE);
    // 入睡程度（3.4）：停駛中 1，停駛前一刻漸升；柱高與站燈都乘上 1 − sleep（照時刻 time.t，和流向一起睡）
    const awake = 1 - sleepAt(time.t, v.dayType, calm);
    let moved = reset;
    let recolor = reset;
    let openSum = 0;
    for (let i = 0; i < n; i++) {
      pillarAt(index, frames[i].index, v.dayType, t, smooth, want);
      const dh = (want.height * awake - S.shown[i]) * k;
      const dopen = (want.open * awake - S.open[i]) * k;
      if (Math.abs(dh) > 1e-4 || Math.abs(dopen) > 1e-4) moved = true;
      if (Math.abs(dopen) > 1e-3) recolor = true;
      S.shown[i] += dh;
      S.open[i] += dopen;
      openSum += S.open[i];
    }
    const liftKey = lifts.frame;
    const popping = pop.id !== null && pop.v !== 1;
    // 第一班車波紋（減少動態或靜態模式時不彈：站珠照停駛結束直接亮）；結束後再多寫一格回到 1
    const waving = !calm && waveRunning(clock.elapsedTime, wave.max);
    const waveDirty = waving || S.waved;
    if (waveDirty) for (let i = 0; i < n; i++) wave.pulse[i] = waving ? waveAt(clock.elapsedTime, wave.dist[i] ?? 0) : 1;

    // 矩陣：廣場貼地、細柱依高度、站珠在柱頂上；整區抬起時跟著抬、按壓時跟著壓扁（地塊的 group 以 y=0 縮放）
    const matKey = `${liftKey}|${station}|${pop.v.toFixed(3)}`;
    if (moved || popping || waveDirty || matKey !== last.current.matKey) {
      last.current.matKey = matKey;
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        const g = spots[i];
        const press = lifts.press.get(f.district) ?? 1;
        const base = g.ground * press + liftOf(f.district);
        const h = S.shown[i];
        o.position.set(g.x, base, g.z);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        meshes.plaza.setMatrixAt(i, o.matrix);
        o.scale.set(1, Math.max(h, 1e-3), 1);
        o.updateMatrix();
        meshes.column.setMatrixAt(i, o.matrix);
        o.position.y = base + 0.08 + h + BEAD_GAP;
        o.scale.setScalar((f.id === station ? BEAD_ON * (pop.id === f.id ? pop.v : 1) : 1) * wave.pulse[i]);
        o.updateMatrix();
        meshes.bead.setMatrixAt(i, o.matrix);
      }
      for (const m of [meshes.plaza, meshes.column, meshes.bead]) {
        m.count = n;
        m.instanceMatrix.needsUpdate = true;
      }
      gl.shadowMap.needsUpdate = true;
    }

    // 站珠顏色：路線色；停止營運往 --station 褪（熄燈），選中的站往站燈色推。變了才上傳
    if (recolor || waveDirty || S.colors !== beadColors || S.colorStation !== station) {
      S.colors = beadColors;
      S.colorStation = station;
      for (let i = 0; i < n; i++) {
        c.copy(beadColors[i] ?? glow).lerp(stationColor, CLOSED_FADE * (1 - S.open[i]));
        if (frames[i].id === station) c.lerp(glow, 0.45);
        if (waveDirty) c.lerp(glow, waveGlow(wave.pulse[i]));
        meshes.bead.setColorAt(i, c);
      }
      if (meshes.bead.instanceColor) meshes.bead.instanceColor.needsUpdate = true;
    }
    // 夜裡亮（原型 0.25 + 1.5·night），停止營運的時段跟著熄
    S.waved = waving;
    const night = sunAt(time.t).night;
    (meshes.bead.material as MeshStandardMaterial).emissiveIntensity = (0.25 + 1.5 * night) * (n ? openSum / n : 0);

    // 名牌與可點的站：鏡頭、畫面、柱高、抬起、選取或流向標籤變了才重算
    const L = last.current;
    const key = `${station}|${district}|${board.safeTop}|${board.safeBottom}`;
    if (!moved && !popping && L.key === key + liftKey && L.bv === board.version && L.w === size.width && L.h === size.height && L.m.equals(camera.matrixWorld) && link.els.size === L.els)
      return;
    L.key = key + liftKey;
    L.bv = board.version;
    L.w = size.width;
    L.h = size.height;
    L.m.copy(camera.matrixWorld);
    L.els = link.els.size;

    const zoomed = isZoomed(scale.px);
    const cands: LabelCandidate[] = [];
    const pick: StationLink["spots"] = [];
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const g = spots[i];
      const press = lifts.press.get(f.district) ?? 1;
      const top = g.ground * press + liftOf(f.district) + 0.08 + S.shown[i] + BEAD_GAP;
      P.set(g.x, top, g.z).project(camera);
      const sx = (P.x * 0.5 + 0.5) * size.width;
      const sy = (-P.y * 0.5 + 0.5) * size.height;
      const front = P.z <= 1;
      if (front && stationPickable({ layer: true, zoomed, district, station, stationDistrict: f.district })) pick.push({ id: f.id, x: sx, y: sy });
      const tier = labelTier({ id: f.id, stationDistrict: f.district, zoomed, district, station });
      if (tier === null) continue;
      // 名牌底邊在站珠上緣再上去一點
      P.set(g.x, top + BEAD_R * (f.id === station ? BEAD_ON : 1) + 0.15, g.z).project(camera);
      const ly = (-P.y * 0.5 + 0.5) * size.height - 3;
      cands.push({ id: f.id, x: sx, y: ly, w: labelW(f.label), h: LABEL_H, tier, rank: f.dayTotal, front });
    }
    const placed = chooseStationLabels(
      cands,
      { width: size.width, height: size.height, top: board.safeTop, bottom: board.safeBottom },
      board.rects,
    );
    // 點站名也算點那一站（名牌中心也是一個點擊位置；名牌只出現在點得到的站）
    const pickable = new Set(pick.map((p) => p.id));
    for (const p of placed) if (pickable.has(p.id)) pick.push({ id: p.id, x: p.rect[0], y: p.rect[1] });
    link.spots = pick;
    const shown = new Map(placed.map((p) => [p.id, p]));
    for (const [id, el] of link.els) {
      const p = shown.get(id);
      el.hidden = !p;
      if (p) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    board.stationRects = placed.map((p) => p.rect);
    board.stationVersion++;
  });

  return (
    <group visible={visible}>
      <primitive object={meshes.plaza} />
      <primitive object={meshes.column} />
      <primitive object={meshes.bead} />
    </group>
  );
}
