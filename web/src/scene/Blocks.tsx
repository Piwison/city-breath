// 街廓建築與樹（3.13，示意，AD-23）：疏密依附近車站全日人數、整區高度隨此刻該區進出人數起伏；不顯示數字、點不到。
// 佈局是純函式（blockLayout.ts）；這裡把它變成 4 個 InstancedMesh（建築、屋頂小塔、樹冠、樹幹），全城 4 個 draw call（AD-6、AD-11）。
// 每個 instance 帶所在行政區的索引 aDistrict：區的呼吸倍數與抬起高度是 uniform 陣列，CPU 每格只寫兩排 22 個數字。
// 窗戶照原型用世界座標畫（樓層大小一致），入夜由 daylight.ts 的 windowsAt() 亮起、深夜漸少；材質顏色只走 token（AD-8）。
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { activityAt, blockSource, breathScale, type BlockSource } from "../data/blocks";
import { loadBasemap, loadStations } from "../data/load";
import type { BaseView } from "../data/views";
import { getView, time, useView } from "../state/view";
import { layoutBlocks, type BlockLayout } from "./blockLayout";
import { windowsAt } from "./daylight";
import { plinthBox } from "./Plinth";
import { QualityGovernor, useTier, type Tier } from "./quality";
import { TILE_TOP } from "./Terrain";
import { useTokenColors } from "./useTokenColor";

/** Terrain 的薄片縮放比例（區與區之間的細縫），建築不跨過去。 */
const TILE_SHRINK = 0.992;
/** 降級時樹的疏密倍數。 */
const LITE_TREES = 0.6;
/** 換時段或日型時，整區高度追上目標的速度（每秒；減少動態時直接切換）。 */
const BREATH_RATE = 6;
/** 待機正弦波的振幅與頻率（減少動態、靜態模式時沒有）。 */
const IDLE_AMP = 0.02;
const IDLE_FREQ = 1.6;
/** 第一次出現時長出來的秒數（減少動態時沒有）。 */
const RISE_SECONDS = 0.9;

const TOKENS = [
  "--building",
  "--roof",
  "--window",
  "--bld-tint-1",
  "--bld-tint-2",
  "--bld-tint-3",
  "--accent-1",
  "--accent-2",
  "--accent-3",
  "--tree",
  "--tree-tint-1",
  "--tree-tint-2",
  "--plinth-side",
] as const;

interface Uniforms {
  uBreath: { value: Float32Array };
  uLift: { value: Float32Array };
  uBase: { value: number };
  uLit: { value: number };
  uRoof: { value: Color };
}

/**
 * 頂點：在 begin_vertex 把呼吸與抬起套到 instance 的世界高度上（y' = base + (y − base)·b + lift），
 * 再換回物件座標，後面的世界座標、陰影接收與投影都一致。樹不呼吸（b＝1），只跟著區抬起。
 */
function patchVertex(shader: WebGLProgramParametersWithUniforms, U: Uniforms, n: number, breathe: boolean, windows: boolean) {
  shader.uniforms.uBreath = U.uBreath;
  shader.uniforms.uLift = U.uLift;
  shader.uniforms.uBase = U.uBase;
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      `#include <common>
attribute float aDistrict;
uniform float uBreath[${n}];
uniform float uLift[${n}];
uniform float uBase;
${windows ? "varying vec3 vCbW;\nvarying vec3 vCbN;" : ""}`,
    )
    .replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  int cbD = int(aDistrict + 0.5);
  float cbS = max(instanceMatrix[1][1], 1e-4);
  float cbY0 = instanceMatrix[3][1];
  float cbY = cbY0 + cbS * transformed.y;
  float cbB = ${breathe ? "uBreath[cbD]" : "1.0"};
  transformed.y = (uBase + (cbY - uBase) * cbB + uLift[cbD] - cbY0) / cbS;
}
#endif`,
    );
  if (windows) {
    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
#ifdef USE_INSTANCING
  vCbW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  vCbN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
#else
  vCbW = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vCbN = normalize(mat3(modelMatrix) * objectNormal);
#endif`,
    );
  }
}

/** 牆面窗戶（原型 withWindows）＋屋頂色：同一個材質，屋頂依法向換成 --roof，省掉多材質的 draw call。 */
function patchWalls(shader: WebGLProgramParametersWithUniforms, U: Uniforms) {
  shader.uniforms.uLit = U.uLit;
  shader.uniforms.uRoof = U.uRoof;
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vCbW;\nvarying vec3 vCbN;\nuniform float uLit;\nuniform vec3 uRoof;")
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
float cbRoof = step(0.55, vCbN.y);
#if defined( USE_COLOR )
  diffuseColor.rgb = mix(diffuseColor.rgb, uRoof * vColor.rgb, cbRoof);
#else
  diffuseColor.rgb = mix(diffuseColor.rgb, uRoof, cbRoof);
#endif
float cbSide = 1.0 - step(0.55, abs(vCbN.y));
vec2 cbT = normalize(vec2(-vCbN.z, vCbN.x) + vec2(1e-4));
float cbU = dot(vCbW.xz, cbT) / 0.17;
float cbV = vCbW.y / 0.22;
float cbWin = cbSide * step(0.3, fract(cbU)) * step(fract(cbU), 0.72) * step(0.32, fract(cbV)) * step(fract(cbV), 0.8);
float cbLit = step(fract(sin(dot(vec3(floor(cbU), floor(cbV), floor(dot(vCbW.xz, vec2(0.37, 0.71)))), vec3(12.9898, 78.233, 37.719))) * 43758.5453), uLit);
diffuseColor.rgb *= 1.0 - 0.16 * cbWin;`,
    )
    .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= cbWin * cbLit;");
}

/** 材質加上著色器修補；cacheKey 讓牆、樹、陰影各自編譯（預設的 key 是函式原始碼，會被誤認為同一個 program）。 */
function patched<M extends Material>(m: M, key: string, patch: (s: WebGLProgramParametersWithUniforms) => void): M {
  m.onBeforeCompile = patch;
  m.customProgramCacheKey = () => `city-breath-blocks:${key}`;
  return m;
}

interface Built {
  group: Group;
  walls: MeshStandardMaterial;
  buildings: InstancedMesh;
  crowns: InstancedMesh;
  crownsT: InstancedMesh;
  trunks: InstancedMesh | null;
  /** 統計（PR 與效能紀錄用） */
  stats: { buildings: number; crowns: number; trees: number; triangles: number; drawCalls: number };
  dispose(): void;
}

/** instanceColor 的起始值（乘法單位元，不是畫面顏色）。 */
const WHITE = new Color(1, 1, 1);

const triangles = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

function build(layout: BlockLayout, tier: Tier, n: number, U: Uniforms): Built {
  const lite = tier === "lite";
  const bGeo: BufferGeometry = lite ? new BoxGeometry(1, 1, 1) : new RoundedBoxGeometry(1, 1, 1, 1, 0.07);
  bGeo.translate(0, 0.5, 0);
  const cGeo: BufferGeometry = lite ? new BoxGeometry(1, 1, 1) : new RoundedBoxGeometry(1, 1, 1, 1, 0.12);
  cGeo.translate(0, 0.5, 0);
  const tGeo = new IcosahedronGeometry(0.5, 0);
  tGeo.translate(0, 0.42, 0);
  const kGeo = lite ? null : new CylinderGeometry(0.05, 0.07, 0.34, 6);
  kGeo?.translate(0, 0.17, 0);

  const walls = patched(new MeshStandardMaterial({ roughness: 0.8, metalness: 0, emissiveIntensity: 0 }), "walls", (s) => {
    patchVertex(s, U, n, true, true);
    patchWalls(s, U);
  });
  const wallDepth = patched(new MeshDepthMaterial(), "walls-depth", (s) => patchVertex(s, U, n, true, false));
  const leaves = patched(new MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true }), "trees", (s) => patchVertex(s, U, n, false, false));
  const bark = patched(new MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), "trunks", (s) => patchVertex(s, U, n, false, false));
  const treeDepth = patched(new MeshDepthMaterial(), "trees-depth", (s) => patchVertex(s, U, n, false, false));

  const dummy = new Object3D();
  const mesh = (geo: BufferGeometry, mat: Material, depth: Material, count: number, place: (k: number) => number) => {
    const districts = new Float32Array(Math.max(1, count));
    geo.setAttribute("aDistrict", new InstancedBufferAttribute(districts, 1));
    const m = new InstancedMesh(geo, mat, Math.max(1, count));
    // 先建 instanceColor，第一次編譯就帶 USE_INSTANCING_COLOR（真正的 token 色由 Blocks 的 effect 寫入）
    if (count) m.setColorAt(0, WHITE);
    for (let k = 0; k < count; k++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      districts[k] = place(k);
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
    }
    m.count = count;
    m.customDepthMaterial = depth;
    m.castShadow = true;
    m.receiveShadow = true;
    // 呼吸與抬起在著色器裡改高度，CPU 的外接球不準；整城幾乎都在畫面裡，關掉剔除
    m.frustumCulled = false;
    // 示意物件點不到（AD-23）：點擊穿過到下面的行政區
    m.raycast = () => {};
    m.matrixAutoUpdate = false;
    return m;
  };

  const { buildings: B, crowns: C, trees: T } = layout;
  const buildings = mesh(bGeo, walls, wallDepth, B.length, (k) => {
    const b = B[k];
    dummy.position.set(b.x, TILE_TOP, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    return b.district;
  });
  const crowns = mesh(cGeo, walls, wallDepth, C.length, (k) => {
    const c = C[k];
    dummy.position.set(c.x, TILE_TOP + c.base - 0.02, c.z);
    dummy.scale.set(c.w, c.h, c.d);
    return c.district;
  });
  const crownsT = mesh(tGeo, leaves, treeDepth, T.length, (k) => {
    const t = T[k];
    dummy.position.set(t.x, t.y, t.z);
    dummy.rotation.y = t.rot;
    dummy.scale.set(t.s * 0.7, t.s * t.sy, t.s * 0.7);
    return t.district;
  });
  const trunks = kGeo
    ? mesh(kGeo, bark, treeDepth, T.length, (k) => {
        const t = T[k];
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.y = t.rot;
        dummy.scale.setScalar(t.s);
        return t.district;
      })
    : null;
  if (trunks) trunks.receiveShadow = false;

  const group = new Group();
  group.name = "blocks";
  group.add(buildings, crowns, crownsT);
  if (trunks) group.add(trunks);
  const geos = [bGeo, cGeo, tGeo, ...(kGeo ? [kGeo] : [])];
  const mats = [walls, wallDepth, leaves, bark, treeDepth];
  return {
    group,
    walls,
    buildings,
    crowns,
    crownsT,
    trunks,
    stats: {
      buildings: B.length,
      crowns: C.length,
      trees: T.length,
      triangles:
        B.length * triangles(bGeo) + C.length * triangles(cGeo) + T.length * (triangles(tGeo) + (kGeo ? triangles(kGeo) : 0)),
      drawCalls: kGeo ? 4 : 3,
    },
    dispose() {
      for (const m of [buildings, crowns, crownsT, trunks]) m?.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** 記一筆效能量測（PR 與實機比對用）；瀏覽器不支援 detail 時略過。 */
function measure(name: string, start: number, detail?: unknown) {
  try {
    performance.measure(name, { start, end: performance.now(), detail });
  } catch {
    /* 舊瀏覽器沒有 measure(options)：只是少一筆紀錄 */
  }
}

/** 已載入的街廓資料：stations.json 與 basemap.json（load.ts 有快取，和首頁其他圖層共用）。 */
function useBlockSource(month: string, view: BaseView): BlockSource | undefined {
  const [src, setSrc] = useState<BlockSource>();
  useEffect(() => {
    let alive = true;
    Promise.all([loadStations(month), loadBasemap()])
      .then(([stations, basemap]) => {
        if (alive) setSrc(blockSource(stations, basemap, view.districts.map((d) => d.id)));
      })
      // 示意層：載不到就不畫，場景其他部分照常（錯誤留在 console 給開發者）
      .catch((e: unknown) => console.warn("街廓資料載入失敗", e));
    return () => {
      alive = false;
    };
  }, [month, view]);
  return src;
}

export function Blocks({
  view,
  month,
  reduced,
  lift,
}: {
  view: BaseView;
  month: string;
  /** 系統減少動態 */
  reduced: boolean;
  /**
   * 各區的抬起高度（場景單位，key＝行政區 ID）：選區時整區連建築與樹一起彈起（diorama-game-juice「沙盤」）。
   * 3.6 接上選取狀態後由它的動畫寫入；沒給就是 0。
   */
  lift?: MutableRefObject<Record<string, number>>;
}) {
  const tier = useTier();
  const visible = useView((s) => s.layers.building);
  const still = useView((s) => s.still);
  const gl = useThree((s) => s.gl);
  const src = useBlockSource(month, view);
  const colors = useTokenColors(TOKENS);
  const n = view.districts.length + 1;
  const U = useMemo<Uniforms>(
    () => ({
      uBreath: { value: new Float32Array(n).fill(1) },
      uLift: { value: new Float32Array(n) },
      uBase: { value: TILE_TOP },
      uLit: { value: 0.62 },
      uRoof: { value: new Color() },
    }),
    [n],
  );

  const layout = useMemo(() => {
    if (!src) return null;
    const t0 = performance.now();
    const out = layoutBlocks({
      districts: view.districts.map((d) => ({ centroid: d.centroid, polygon: d.polygon, water: d.water, green: d.green })),
      grid: view.grid,
      levels: view.levels,
      stations: src.stations,
      clears: src.clears,
      plinth: plinthBox(view.bbox),
      tileTop: TILE_TOP,
      shrink: TILE_SHRINK,
      treeDensity: tier === "lite" ? LITE_TREES : 1,
    });
    measure("blocks:layout", t0);
    return out;
  }, [src, view, tier]);

  const built = useMemo(() => {
    if (!layout) return null;
    const t0 = performance.now();
    const b = build(layout, tier, n, U);
    measure("blocks:build", t0, { tier, ...b.stats });
    return b;
  }, [layout, tier, n, U]);
  useEffect(() => () => built?.dispose(), [built]);

  // 顏色只從 token 來（AD-8）：牆色、屋頂點綴、樹的兩種綠寫進 instance color
  useEffect(() => {
    if (!built || !layout) return;
    const [building, roof, windowC, t1, t2, t3, a1, a2, a3, tree, g1, g2, bark] = colors;
    const tints = [t1, t2, t3, a1, a2, a3];
    built.walls.color.copy(building);
    built.walls.emissive.copy(windowC);
    U.uRoof.value.copy(roof);
    layout.buildings.forEach((b, k) => built.buildings.setColorAt(k, tints[b.tint]));
    layout.crowns.forEach((c, k) => built.crowns.setColorAt(k, tints[c.tint]));
    layout.trees.forEach((_, k) => built.crownsT.setColorAt(k, k % 2 ? g2 : g1));
    (built.crownsT.material as MeshStandardMaterial).color.copy(tree);
    if (built.trunks) (built.trunks.material as MeshStandardMaterial).color.copy(bark);
    for (const m of [built.buildings, built.crowns, built.crownsT]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [built, layout, colors, U]);

  // 圖層開關：陰影圖不會自己重畫（Daylight 只在光移動時重畫），開關時補一次
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, visible, built]);

  const shown = useRef<Float32Array | null>(null);
  const target = useMemo(() => [] as number[], []);
  const rise = useRef(0);
  const clock = useRef(0);
  useFrame((_, dt) => {
    if (!built || !src) return;
    const calm = reduced || still;
    clock.current += dt;
    if (calm) rise.current = 1;
    else rise.current = Math.min(1, rise.current + dt / RISE_SECONDS);
    const r = 1 - Math.pow(1 - rise.current, 3);
    activityAt(src, getView().dayType, time.t, target);
    if (!shown.current || shown.current.length !== target.length) shown.current = Float32Array.from(target.map((a) => breathScale(a, src.max)));
    const k = calm ? 1 : 1 - Math.exp(-dt * BREATH_RATE);
    let moving = rise.current < 1;
    const B = U.uBreath.value;
    const L = U.uLift.value;
    for (let i = 0; i < target.length; i++) {
      const want = breathScale(target[i], src.max);
      const prev = shown.current[i];
      shown.current[i] = prev + (want - prev) * k;
      if (Math.abs(shown.current[i] - prev) > 1e-3) moving = true;
      const idle = calm ? 0 : Math.sin(clock.current * IDLE_FREQ + i * 0.9) * IDLE_AMP;
      B[i] = Math.max(0.02, (shown.current[i] + idle) * r);
      const up = lift?.current[view.districts[i].id] ?? 0;
      if (Math.abs(up - L[i]) > 1e-4) moving = true;
      L[i] = up;
    }
    B[n - 1] = 1;
    L[n - 1] = 0;
    const w = windowsAt(time.t);
    built.walls.emissiveIntensity = w.glow;
    U.uLit.value = w.lit;
    // 換時段、日型或抬起時高度在變：陰影跟著重畫（待機波太小不算，光沒動時不耗 GPU）
    if (moving && visible) gl.shadowMap.needsUpdate = true;
  });

  return (
    <>
      <QualityGovernor />
      {built && <primitive object={built.group} visible={visible} />}
    </>
  );
}
