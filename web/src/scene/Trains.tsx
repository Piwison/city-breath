// 列車（3.14，示意，AD-23）：沿 basemap.json 的真實軌道雙向跑；同線同向相鄰兩車的間隔＝官方班距的代表值 × 固定比例
// （data/trains.ts），尖峰較密；班距 null 的小時（營運外）沒有列車，環狀線沒有班距不畫。位置是示意：車在畫面上跑多快、
// 從哪裡排起都不是真實列車，也不顯示數字、點不到（raycast 關掉）。
// 全部列車一個 InstancedMesh（AD-6、AD-11）：車身＝路線色（--line-*，instanceColor），夜裡以 --train-glow 乘路線色自發光（天光）。
// 高度照 Rails：薄片頂面＋路線浮起，選區時跟著所在的區一起彈起（lift.ts）。
// 不投影：陰影圖只在光移動時重畫（Daylight），暫停時車還在跑，影子會留在原地。
// 播放中走過第一班車的整點時觸發站珠波紋（firstTrain.ts，3.4 的 service.ts 同一份班距）。
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CapsuleGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from "three";
import { trainGap, trainLines, trainSlots, type TrainGap } from "../data/trains";
import type { Headway } from "../data/periods";
import type { TrackView } from "../data/views";
import { firstTrainCrossed } from "../state/service";
import { getView, time, useView } from "../state/view";
import { sunAt } from "./daylight";
import { triggerWave } from "./firstTrain";
import { lifts } from "./lift";
import { project } from "./projection";
import { useTier, type Tier } from "./quality";
import { LIFT as RAIL_LIFT } from "./Rails";
import { TILE_TOP } from "./Terrain";
import { useTokenColor, useTokenColors } from "./useTokenColor";

/** 同時最多幾班（平日尖峰約 90 班；原型 260）。 */
export const TRAIN_CAP = 240;
/** 播放 1x 時車在畫面上跑多快（單位／秒，原型 2.4）；暫停時 0.6 倍，靜態模式與減少動態不動。 */
const SPEED = 2.4;
const PAUSED = 0.6;
/** 兩個方向各偏離軌道中心多少（場景單位；路線寬 0.3）。 */
const SIDE = 0.16;
/** 車身半徑與中心離路線多高。 */
const RADIUS = 0.13;
const RIDE = 0.11;
/** 段頭段尾多長的距離內縮放進出（場景單位）。 */
const END_FADE = 0.4;

const DETAIL: Record<Tier, [number, number]> = { full: [3, 8], lite: [2, 5] };

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** 每段的起始相位（決定性），各段的車不會排成一排。 */
const seed = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

interface Track {
  line: TrackView["line"];
  token: string;
  /** 投影後的頂點（x, z）、累計長度、頂點高度（不含抬起）、頂點所在區代碼 */
  x: Float32Array;
  z: Float32Array;
  cum: Float32Array;
  y: Float32Array;
  ids: (string | null)[];
  len: number;
}

function buildTracks(tracks: TrackView[], headway: Headway | undefined, ids: string[]): Track[] {
  const lines = trainLines(headway);
  const out: Track[] = [];
  for (const t of tracks) {
    // 環狀線沒有班距：不畫（AD-23）；approx 補段是該線的一部分，照跑
    if (!lines.has(t.line) || t.coords.length < 2) continue;
    const n = t.coords.length;
    const x = new Float32Array(n);
    const z = new Float32Array(n);
    const cum = new Float32Array(n);
    const y = new Float32Array(n);
    const vid: (string | null)[] = [];
    for (let k = 0; k < n; k++) {
      [x[k], z[k]] = project(t.coords[k][0], t.coords[k][1]);
      if (k) cum[k] = cum[k - 1] + Math.hypot(x[k] - x[k - 1], z[k] - z[k - 1]);
      y[k] = (t.di[k] >= 0 ? TILE_TOP : 0) + RAIL_LIFT;
      vid.push(t.di[k] >= 0 ? (ids[t.di[k]] ?? null) : null);
    }
    if (cum[n - 1] > 0) out.push({ line: t.line, token: t.token, x, z, cum, y, ids: vid, len: cum[n - 1] });
  }
  return out;
}

/** 沿軌道距離 s 的位置、方向與高度（含所在區的抬起）。 */
function trackAt(t: Track, s: number, P: { x: number; y: number; z: number; dx: number; dz: number }) {
  let lo = 0;
  let hi = t.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t.cum[m] <= s) lo = m;
    else hi = m;
  }
  const seg = t.cum[hi] - t.cum[lo] || 1;
  const f = (s - t.cum[lo]) / seg;
  const lift = (k: number) => (t.ids[k] ? (lifts.now.get(t.ids[k]!) ?? 0) : 0);
  P.dx = (t.x[hi] - t.x[lo]) / seg;
  P.dz = (t.z[hi] - t.z[lo]) / seg;
  P.x = t.x[lo] + (t.x[hi] - t.x[lo]) * f;
  P.z = t.z[lo] + (t.z[hi] - t.z[lo]) * f;
  P.y = t.y[lo] + lift(lo) + (t.y[hi] + lift(hi) - t.y[lo] - lift(lo)) * f;
}

/** 車身：自發光乘上每台的顏色（路線色），夜裡亮的是各自路線的顏色（原型 tintEmissive）。 */
function trainMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ roughness: 0.45, metalness: 0, emissiveIntensity: 0 });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )\n totalEmissiveRadiance *= vColor.rgb;\n#endif",
    );
  };
  m.customProgramCacheKey = () => "city-breath-trains";
  return m;
}

function buildMesh(tier: Tier) {
  const [cap, radial] = DETAIL[tier];
  const geo = new CapsuleGeometry(RADIUS, 0.62, cap, radial);
  geo.rotateZ(Math.PI / 2);
  const mesh = new InstancedMesh(geo, trainMaterial(), TRAIN_CAP);
  mesh.setColorAt(0, new Color(1, 1, 1));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // 示意物件點不到（AD-23）：點擊穿過到下面的行政區
  mesh.raycast = () => {};
  const tris = (geo.index ? geo.index.count : geo.getAttribute("position").count) / 3;
  return { mesh, tris };
}

/** ids：view.districts 的代碼（TrackView.di 是它的索引），和 Rails 同一份。 */
export function Trains({
  tracks,
  headway,
  ids,
  reduced,
}: {
  tracks: TrackView[];
  headway: Headway | undefined;
  ids: string[];
  reduced: boolean;
}) {
  const tier = useTier();
  const showTrain = useView((s) => s.layers.train);
  const showRail = useView((s) => s.layers.rail);
  const still = useView((s) => s.still);
  const calm = reduced || still;
  const visible = showTrain && showRail;

  const list = useMemo(() => buildTracks(tracks, headway, ids), [tracks, headway, ids]);
  const built = useMemo(() => buildMesh(tier), [tier]);
  const { mesh } = built;
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );
  useEffect(() => {
    performance.mark?.("trains:build", { detail: { tier, tracks: list.length, trianglesPerTrain: built.tris } });
  }, [built, tier, list]);

  // 顏色只從 token 來（AD-8）
  const tokens = useMemo(() => list.map((t) => t.token), [list]);
  const colors = useTokenColors(tokens);
  const glow = useTokenColor("--train-glow");
  useEffect(() => {
    (mesh.material as MeshStandardMaterial).emissive.copy(glow);
  }, [mesh, glow]);

  // 每段兩個方向的相位（車數的小數部分往前推＝整串往前流）
  const phase = useMemo(() => {
    const p = new Float64Array(list.length * 2);
    for (let i = 0; i < list.length; i++) {
      p[i * 2] = seed(i);
      p[i * 2 + 1] = seed(i + 101);
    }
    return p;
  }, [list]);
  const prevT = useRef(-1);
  const g = useMemo<TrainGap>(() => ({ gap: 0, presence: 0 }), []);
  const o = useMemo(() => new Object3D(), []);
  const P = useMemo(() => ({ x: 0, y: 0, z: 0, dx: 1, dz: 0 }), []);
  const slots = useMemo<number[]>(() => [], []);

  useFrame(({ clock }, dt) => {
    const v = getView();
    // 第一班車：播放中走過第一班車的整點才觸發（拖時間軸、暫停、減少動態都不觸發）；不論列車圖層開不開
    const t = time.t;
    if (v.playing && !calm && prevT.current >= 0 && firstTrainCrossed(v.dayType, prevT.current, t)) triggerWave(clock.elapsedTime);
    prevT.current = t;

    if (!visible) {
      if (mesh.count) mesh.count = 0;
      return;
    }
    const smoothT = v.playing && !calm;
    const speed = calm ? 0 : SPEED * (v.playing ? v.speed : PAUSED);
    const step = Math.min(dt, 0.1) * speed;
    let n = 0;
    for (let i = 0; i < list.length && n < TRAIN_CAP; i++) {
      const tk = list[i];
      trainGap(headway?.[tk.line]?.[v.dayType], t, smoothT, g);
      if (g.presence <= 0 || g.gap <= 0) continue;
      for (let dir = 0; dir < 2 && n < TRAIN_CAP; dir++) {
        const k = i * 2 + dir;
        phase[k] = (phase[k] + step / g.gap) % 1;
        trainSlots(tk.len, g.gap, phase[k], slots);
        for (const s0 of slots) {
          if (n >= TRAIN_CAP) break;
          // 反方向從段尾往段頭跑
          const s = dir ? tk.len - s0 : s0;
          const scale = g.presence * smooth(0, END_FADE, Math.min(s, tk.len - s));
          if (scale < 0.02) continue;
          trackAt(tk, s, P);
          const side = dir ? -SIDE : SIDE;
          o.position.set(P.x - P.dz * side, P.y + RIDE, P.z + P.dx * side);
          o.rotation.set(0, Math.atan2(-P.dz, P.dx), 0);
          o.scale.setScalar(scale);
          o.updateMatrix();
          mesh.setMatrixAt(n, o.matrix);
          mesh.setColorAt(n, colors[i]);
          n++;
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // 夜裡亮（原型 0.1 + 0.7·night）
    (mesh.material as MeshStandardMaterial).emissiveIntensity = 0.1 + 0.7 * sunAt(t).night;
  });

  return <primitive object={mesh} visible={visible} />;
}
