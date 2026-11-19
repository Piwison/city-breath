// 搭乘鏡頭（8.6，平視搭乘模式第 0 期）：用首頁同一個 <CameraControls>（AD-11，不另建鏡頭），每格推進搭乘時鐘
// （state/ride.ts advanceRide）並把鏡頭擺在軌道正上方約三層樓高（FLOOR_H × 3）、朝前略往下看。
// 路徑是 basemap 的真實軌道（ridePath.ts，經 project()）；高度＝軌道高度與台地頂（levelHeight → elevation()，AD-12）取大者；
// 板南線幾乎全在地下，鏡頭照樣走地面、不做隧道。
// 行進中每格直接 setLookAt（不經 camera-controls 的平滑）；上車、繼續（使用者暫停時可能移動過鏡頭）、掉頭、行進中按下一站時
// 先平滑飛回軌道（holdRide 期間搭乘不前進），減少動態或靜態模式時直接切換。暫停與停靠時不動鏡頭，使用者可以自己看看四周。
// 搭乘中把 FOV 放寬（直式手機 38° 太窄）、near 拉近（鏡頭離地很近）；下車後回到原值。
import type { CameraControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import type { BaseView } from "../data/views";
import { advanceRide, holdRide, takeRejoin } from "../state/ride";
import { getView, rideMotion, useView } from "../state/view";
import { FLOOR_H } from "./blockLayout";
import { levelHeight, terrainLevelAt, unproject } from "./projection";
import { LIFT as RAIL_LIFT } from "./Rails";
import { pathAt, type PathPoint, type RidePath } from "./ridePath";
import { TILE_TOP } from "./Terrain";

/** 鏡頭離軌道多高：約三層樓（街廓的樓層高 × 3）。 */
export const RIDE_EYE = FLOOR_H * 3;
/** 往前看多遠（場景單位）。 */
export const RIDE_LOOK = 3.6;
/** 看的點在軌道下方多少：和 RIDE_EYE、RIDE_LOOK 一起讓鏡頭朝前略往下看，約 15°（天空不佔半個畫面）。 */
const LOOK_Y = -0.3;
/** 平滑飛回軌道的等待秒數（camera-controls smoothTime 0.35 約 1.2 秒到位）。 */
const REJOIN_S = 1.2;
/** 鏡頭離該在的位置超過這個距離才需要飛回。 */
const REJOIN_EPS = 0.05;
/** 搭乘中的 near（場景單位）：列車在鏡頭下方約半個單位。 */
const RIDE_NEAR = 0.08;
/** 搭乘中的水平視角目標與垂直視角上下限（度）。 */
const RIDE_HFOV = 62;
const RIDE_VFOV = [48, 72] as const;
/** FOV 追目標的速度（每秒）。 */
const FOV_RATE = 3;

/** 這個畫面比例下搭乘用的垂直 FOV：讓水平視角接近 RIDE_HFOV，夾在上下限內（直式手機取上限）。 */
export function rideFov(aspect: number): number {
  const v = (2 * Math.atan(Math.tan((RIDE_HFOV * Math.PI) / 360) / Math.max(0.1, aspect)) * 180) / Math.PI;
  return Math.min(RIDE_VFOV[1], Math.max(RIDE_VFOV[0], v));
}

/** 沿路徑距離 s、往 dir 方向時的鏡頭位置與看的點（場景座標）。 */
export function ridePose(
  path: RidePath,
  view: Pick<BaseView, "grid" | "levels">,
  s: number,
  dir: 1 | -1,
  eye: Vector3,
  target: Vector3,
  P: PathPoint = { x: 0, z: 0, k: 0, dx: 1, dz: 0 },
): void {
  // 地面：軌道所在區的薄片頂（不在有車站的區是 0）＋台地頂（elevation()），再加軌道浮起的高度
  const ground = (k: number, x: number, z: number) => {
    const [lon, lat] = unproject(x, z);
    return (path.di[k] >= 0 ? TILE_TOP : 0) + levelHeight(terrainLevelAt(lon, lat, view.grid), view.levels) + RAIL_LIFT;
  };
  pathAt(path, s, P);
  eye.set(P.x, ground(P.k, P.x, P.z) + RIDE_EYE, P.z);
  pathAt(path, s + dir * RIDE_LOOK, P);
  target.set(P.x, ground(P.k, P.x, P.z) + LOOK_Y, P.z);
}

export function RideCamera({ path, view, reduced }: { path: RidePath | null; view: BaseView; reduced: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const riding = useView((s) => s.ride !== null);
  const still = useView((s) => s.still);
  const calm = reduced || still;
  // 開場的 FOV 與 near（Canvas 的 camera 設定），下車後回到這裡
  const base = useRef<{ fov: number; near: number } | null>(null);
  if (!base.current) base.current = { fov: camera.fov, near: camera.near };
  const tmp = useMemo(() => ({ eye: new Vector3(), target: new Vector3(), P: { x: 0, z: 0, k: 0, dx: 1, dz: 0 } as PathPoint }), []);

  // near 跟著上下車切換（鏡頭離地很近時 0.5 會切掉腳下的列車與站珠）
  useEffect(() => {
    camera.near = riding ? RIDE_NEAR : base.current!.near;
    camera.updateProjectionMatrix();
  }, [camera, riding]);

  useFrame((_, dt) => {
    // FOV：搭乘中放寬、下車後收回；減少動態時直接切換
    const fov = riding ? rideFov(aspect) : base.current!.fov;
    if (camera.fov !== fov) {
      const k = calm ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * FOV_RATE);
      camera.fov = Math.abs(fov - camera.fov) < 0.05 ? fov : camera.fov + (fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }
    const ride = getView().ride;
    if (!ride || !path || !controls) return;
    const { eye, target, P } = tmp;
    // 接回軌道：上車、繼續、掉頭、行進中按下一站
    const rejoin = takeRejoin();
    if (rejoin) {
      ridePose(path, view, rideMotion.s, rideMotion.dir, eye, target, P);
      const far = camera.position.distanceTo(eye) > REJOIN_EPS || controls.getTarget(new Vector3()).distanceTo(target) > REJOIN_EPS;
      if (rejoin === 2 || calm || !far) void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, false);
      else {
        void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, true);
        holdRide(REJOIN_S);
      }
    }
    advanceRide(dt, calm);
    // 行進中（或暫停中按下一站走這一段）每格擺鏡頭；飛回軌道的那段時間交給 camera-controls 的平滑
    const v = getView().ride;
    if (!v || rideMotion.hold > 0) return;
    const moving = !v.docked && (v.playing || rideMotion.step);
    // 這一格剛到站（含減少動態的直接切換：同一格出站又到下一站）：停在停靠點
    const arrived = v.docked && (!ride.docked || v.station !== ride.station);
    if (moving || arrived) {
      ridePose(path, view, rideMotion.s, rideMotion.dir, eye, target, P);
      void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, false);
    }
  });
  return null;
}
