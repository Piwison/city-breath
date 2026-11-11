// 展開一區的站（3.6）：選了區，這區的站在抬起的地塊上以站珠出現（路線色、大小依此刻進出），標站名、點得到。
// 站柱與廣場由 3.1 換成正式造型；這裡只畫一個 InstancedMesh（一個 draw call，AD-6）。
// 只吃 views.ts 的 StationFrame（AD-19）；站屬哪區只看 stations.json 的 district（AD-9）。
// 站名是 Canvas 外的 DOM，位置每格由 StationProjector 直接寫；同一份螢幕位置給點擊判斷用（命中半徑 22px）。
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, InstancedMesh, Matrix4, MeshStandardMaterial, Object3D, SphereGeometry, Vector3 } from "three";
import { stationFrames, type BaseView, type StationFrame, type StationIndex } from "../data/views";
import { useView } from "../state/view";
import { liftOf, lifts } from "./lift";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColor, useTokenColors } from "./useTokenColor";

/** 站珠半徑（場景單位）；大小＝BEAD_MIN＋BEAD_GAIN×√(此刻進出÷當月單站最大)。 */
const BEAD_R = 0.42;
const BEAD_MIN = 0.6;
const BEAD_GAIN = 0.9;
/** 停止營運時的大小（不是 0：站還在，只是沒車） */
const BEAD_CLOSED = 0.45;
/** 選中的站放大幾倍 */
const BEAD_ON = 1.4;
const MAX_BEADS = 64;

/** Canvas 內外共用：站名 DOM、每個站珠目前的螢幕位置（點擊判斷用）。 */
export interface StationLink {
  els: Map<string, HTMLDivElement>;
  spots: { id: string; x: number; y: number }[];
}

/** 這一區此刻的站珠（Canvas 內外各自訂閱，算法同一個純函式）。 */
function useFrames(index: StationIndex): StationFrame[] {
  const district = useView((s) => s.district);
  const dayType = useView((s) => s.dayType);
  const hour = useView((s) => s.hour);
  return useMemo(() => (district ? stationFrames(index, district, dayType, hour) : []), [index, district, dayType, hour]);
}

/** Canvas 外：站名（路線色點＋短名）。 */
export function StationLabelLayer({ index, link }: { index: StationIndex; link: StationLink }) {
  const frames = useFrames(index);
  const station = useView((s) => s.station);
  return (
    <div className="scene-labels" aria-hidden="true">
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

/** Canvas 內：站珠＋站名投影。 */
export function DistrictStations({ view, index, link }: { view: BaseView; index: StationIndex; link: StationLink }) {
  const frames = useFrames(index);
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const tokens = useMemo(() => frames.map((f) => f.token), [frames]);
  const colors = useTokenColors(tokens);
  const glow = useTokenColor("--station-glow");

  const mesh = useMemo(() => {
    const m = new InstancedMesh(new SphereGeometry(BEAD_R, 18, 12), new MeshStandardMaterial({ roughness: 0.35, metalness: 0 }), MAX_BEADS);
    m.setColorAt(0, new Color());
    m.count = 0;
    m.castShadow = true;
    m.frustumCulled = false;
    return m;
  }, []);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.dispose();
    },
    [mesh],
  );

  // 每站的地面高度（台地頂，不含抬起）與大小
  const beads = useMemo(
    () =>
      frames.slice(0, MAX_BEADS).map((f) => {
        const [x, z] = project(f.lon, f.lat);
        const ground = TILE_TOP + levelHeight(terrainLevelAt(f.lon, f.lat, view.grid), view.levels);
        const s = (f.value === null ? BEAD_CLOSED : BEAD_MIN + BEAD_GAIN * Math.sqrt(Math.min(1, f.value / index.peak))) * (f.id === station ? BEAD_ON : 1);
        return { id: f.id, x, z, ground, s };
      }),
    [frames, view, index, station],
  );

  // 顏色：路線色；選中的站往站燈色推
  useEffect(() => {
    const c = new Color();
    beads.forEach((b, i) => {
      c.copy(colors[i] ?? glow);
      if (b.id === station) c.lerp(glow, 0.45);
      mesh.setColorAt(i, c);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [beads, colors, glow, station, mesh]);

  const o = useMemo(() => new Object3D(), []);
  const P = useMemo(() => new Vector3(), []);
  const last = useRef({ beads: null as typeof beads | null, lift: -1, els: -1, m: new Matrix4(), w: 0, h: 0 });
  useFrame(({ camera, size, gl }) => {
    const L = last.current;
    const lift = district ? liftOf(district) : 0;
    const geometryChanged = L.beads !== beads || L.lift !== lifts.frame;
    if (geometryChanged) {
      beads.forEach((b, i) => {
        o.position.set(b.x, b.ground + lift + BEAD_R * b.s, b.z);
        o.scale.setScalar(b.s);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.count = beads.length;
      mesh.instanceMatrix.needsUpdate = true;
      gl.shadowMap.needsUpdate = true;
    }
    // 站名 DOM 由另一個 React root 掛上，數量對上之前每格都重排
    if (!geometryChanged && L.els === link.els.size && L.m.equals(camera.matrixWorld) && L.w === size.width && L.h === size.height) return;
    L.els = link.els.size;
    L.beads = beads;
    L.lift = lifts.frame;
    L.m.copy(camera.matrixWorld);
    L.w = size.width;
    L.h = size.height;
    // 站名：大的先放，彼此重疊就藏；位置同時寫給點擊判斷
    const spots: StationLink["spots"] = [];
    const placed: [number, number, number, number][] = [];
    const order = beads.map((_, i) => i).sort((a, b) => (beads[b].id === station ? 1 : 0) - (beads[a].id === station ? 1 : 0) || beads[b].s - beads[a].s);
    for (const i of order) {
      const b = beads[i];
      P.set(b.x, b.ground + lift + BEAD_R * b.s, b.z).project(camera);
      const el = link.els.get(b.id);
      const sx = (P.x * 0.5 + 0.5) * size.width;
      const sy = (-P.y * 0.5 + 0.5) * size.height;
      const front = P.z <= 1;
      if (front) spots.push({ id: b.id, x: sx, y: sy });
      if (!el) continue;
      const w = (el.textContent?.length ?? 2) * 11 + 20;
      const h = 18;
      const ly = sy - BEAD_R * b.s * 4 - h / 2;
      const hit = !front || placed.some(([px, py, pw, ph]) => Math.abs(px - sx) < (pw + w) / 2 && Math.abs(py - ly) < (ph + h) / 2);
      el.hidden = hit;
      if (hit) continue;
      placed.push([sx, ly, w, h]);
      el.style.transform = `translate(${sx.toFixed(1)}px, ${(ly + h / 2).toFixed(1)}px) translate(-50%, -100%)`;
    }
    link.spots = spots;
  });

  return <primitive object={mesh} visible={district !== null} />;
}
