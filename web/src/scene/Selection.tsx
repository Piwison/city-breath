// 點行政區、點站（3.6）：點擊判斷與選取後的鏡頭。
// 點擊：按下到放開移動 < 6px、只有一根手指才算點（拖曳、捏合交給鏡頭）。先看站珠（螢幕距離 22px 內，
// 手機 44px 的目標），再用 raycaster 打 21 區的地塊（一個平面陣列、不遞迴，threejs-core-raycaster）；
// 點到空白處關卡。按下時那區微微壓扁、放開彈回（DistrictLift），Android 輕震。
// 鏡頭：選區飛到那區、選站飛到那站、聚焦一條流向飛到它的中點，關卡回到全景；減少動態或靜態模式時直接切換。
// 手機上目標往南偏，讓主體落在小卡之上（原型 lookAt）。
import type { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Raycaster, Vector2, type Intersection, type Mesh, type Object3D } from "three";
import type { BaseView, StationIndex } from "../data/views";
import { closeCard, getView, selectDistrict, selectStation, useView } from "../state/view";
import { home } from "./CameraRig";
import type { PressLink } from "./DistrictLift";
import type { StationLink } from "./DistrictStations";
import { project } from "./projection";

/** 移動超過幾像素就不算點。 */
const TAP_SLOP = 6;
/** 站珠的命中半徑（螢幕像素）。 */
export const STATION_HIT_PX = 22;

/** 離點擊位置最近、在半徑內的站；沒有回傳 null。 */
export function nearestSpot(spots: readonly { id: string; x: number; y: number }[], x: number, y: number, r: number = STATION_HIT_PX): string | null {
  let best: string | null = null;
  let bd = r;
  for (const s of spots) {
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bd) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}

export function SelectionInput({ view, stations, press }: { view: BaseView; stations: StationLink; press: PressLink }) {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);

  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    const hits: Intersection<Object3D>[] = [];
    let targets: Object3D[] = [];
    const meshes = () => {
      if (targets.length === view.districts.length && targets.every((m) => m.parent?.parent)) return targets;
      const { scene } = get();
      targets = view.districts.flatMap((d) => {
        const g = scene.getObjectByName(`district-${d.id}`);
        // 每區的地塊＝會投影的那個 mesh（薄片＋台地合成）；河川、綠地不擋
        const m = g?.children.find((c) => (c as Mesh).isMesh && c.castShadow);
        if (!m) return [];
        m.userData.district = d.id;
        return [m];
      });
      return targets;
    };
    const districtAt = (e: PointerEvent): string | null => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, get().camera);
      hits.length = 0;
      ray.intersectObjects(meshes(), false, hits);
      return (hits[0]?.object.userData.district as string | undefined) ?? null;
    };

    let pointers = 0;
    let down: { x: number; y: number; id: string | null } | null = null;
    const release = () => {
      if (down?.id) press.press?.(down.id, false);
      down = null;
    };
    const onDown = (e: PointerEvent) => {
      pointers++;
      if (pointers > 1) {
        release();
        return;
      }
      const id = districtAt(e);
      down = { x: e.clientX, y: e.clientY, id };
      if (id) press.press?.(id, true);
    };
    const onUp = (e: PointerEvent) => {
      pointers = Math.max(0, pointers - 1);
      const d = down;
      release();
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_SLOP) return;
      const v = getView();
      const r = el.getBoundingClientRect();
      // 站珠只在選了區時出現；手指在站珠附近就算點站
      const sid = v.district ? nearestSpot(stations.spots, e.clientX - r.left, e.clientY - r.top) : null;
      if (sid) {
        navigator.vibrate?.(6);
        selectStation(sid);
        return;
      }
      const id = districtAt(e);
      if (id) {
        navigator.vibrate?.(6);
        if (id !== v.district) selectDistrict(id);
        else if (v.station) selectStation(null);
      } else if (v.district || v.station) closeCard();
    };
    const onCancel = () => {
      pointers = 0;
      release();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
    };
  }, [gl, get, view, stations, press]);
  return null;
}

/** 原型 lookAt：鏡頭朝北、俯視；手機（直式）拉遠 1.4 倍、目標往南偏，主體落在小卡之上。 */
export function lookAtArgs(x: number, z: number, d: number, narrow: boolean): [number, number, number, number, number, number] {
  const dd = d * (narrow ? 1.4 : 1);
  const tz = z + dd * (narrow ? 0.2 : 0.08);
  return [x, dd * 0.72, tz + dd * 0.7, x, 0, tz];
}

export function SelectionCamera({ view, index, reduced }: { view: BaseView; index: StationIndex; reduced: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const focus = useView((s) => s.focus);
  const still = useView((s) => s.still);
  const calm = reduced || still;
  // 每區的中心與大小（場景單位；界線經 project()，AD-12）
  const boxes = useMemo(
    () =>
      new Map(
        view.districts.map((d) => {
          let x0 = Infinity;
          let x1 = -Infinity;
          let z0 = Infinity;
          let z1 = -Infinity;
          for (const poly of d.polygon)
            for (const ring of poly)
              for (const [lon, lat] of ring) {
                const [x, z] = project(lon, lat);
                x0 = Math.min(x0, x);
                x1 = Math.max(x1, x);
                z0 = Math.min(z0, z);
                z1 = Math.max(z1, z);
              }
          const [cx, cz] = project(d.centroid[0], d.centroid[1]);
          return [d.id, { cx, cz, size: Math.max(x1 - x0, z1 - z0) }];
        }),
      ),
    [view],
  );
  const had = useRef(false);
  useEffect(() => {
    if (!controls) return;
    const narrow = aspect < 0.8;
    const fly = (x: number, z: number, d: number) => void controls.setLookAt(...lookAtArgs(x, z, d, narrow), !calm);
    if (station) {
      const i = index.byId.get(station);
      if (i !== undefined) {
        const [x, z] = project(index.stations[i].lon, index.stations[i].lat);
        fly(x, z, 42);
      }
    } else if (focus) {
      const [from, to] = focus.split(">");
      const a = boxes.get(from);
      const b = boxes.get(to);
      if (a && b && from !== to) {
        const span = Math.hypot(a.cx - b.cx, a.cz - b.cz);
        fly((a.cx + b.cx) / 2, (a.cz + b.cz) / 2, Math.max(60, span * 2.1));
      } else if (a) fly(a.cx, a.cz, a.size * 1.9 + 34);
    } else if (district) {
      const b = boxes.get(district);
      if (b) fly(b.cx, b.cz, b.size * 1.9 + 34);
    } else if (had.current) {
      void controls.setLookAt(...home(aspect), !calm);
    }
    had.current = district !== null || station !== null;
    // 只在選取換了時飛；縮放視窗、換靜態模式不重飛
  }, [controls, district, station, focus]);
  return null;
}
