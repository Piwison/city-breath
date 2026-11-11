// 鏡頭（drei <CameraControls>，AD-11）：地圖的操作習慣（Piwi 2026-11-11，第一次使用者測試後）。
// 手機：單指拖曳＝平移（貼著地面走）；雙指＝捏合縮放，同時拖動＝旋轉／傾斜。
// 滑鼠：左鍵平移、右鍵或 Ctrl（Mac 也可 ⌘）＋左鍵拖曳旋轉、滾輪縮放；縮放朝手指中點或游標位置。
// 傾角有上下限（不翻到接近水平），平移時鏡頭看著的點不離開底座。
// 「回到全景」由 link.home() 觸發；減少動態或靜態模式時直接切回、不飛。
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Box3, Vector3 } from "three";
import { useView } from "../state/view";
import type { PlinthBox } from "./Plinth";

const { ACTION } = CameraControlsImpl;

/** 傾角：0＝正上方往下看；上限約 63°，再低城市會縮成一條。 */
export const MIN_POLAR = 0.12;
export const MAX_POLAR = 1.1;

/** 開場鏡頭（原型 HOME）：直式手機拉遠一點、目標往南偏，讓整個盆地落在上下 HUD 之間。 */
export function home(aspect: number): [number, number, number, number, number, number] {
  const narrow = aspect < 0.8;
  const d = narrow ? 208 : 140;
  return [0, d * 0.64, d * 0.76, 0, 0, narrow ? 12 : 6];
}

/** Canvas 外的按鈕呼叫 Canvas 內的鏡頭（不是畫面狀態，不進 state/）。 */
export interface CameraLink {
  home?: () => void;
}

export function CameraRig({ reduced: reducedMotion, box, link }: { reduced: boolean; box: PlinthBox; link: CameraLink }) {
  const ref = useRef<CameraControls>(null);
  const still = useView((s) => s.still);
  const reduced = reducedMotion || still;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const narrow = aspect < 0.8;

  useEffect(() => {
    ref.current?.setLookAt(...home(aspect), false);
    // 只在直式／橫式切換時回到開場鏡頭，一般縮放視窗不打斷使用者的視角
  }, [narrow]);

  useEffect(() => {
    link.home = () => ref.current?.setLookAt(...home(aspect), !reduced);
    return () => {
      link.home = undefined;
    };
  }, [link, aspect, reduced]);

  // 地圖式操作的設定；平移範圍＝底座
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.left = ACTION.TRUCK;
    c.mouseButtons.right = ACTION.ROTATE;
    c.mouseButtons.middle = ACTION.DOLLY;
    c.mouseButtons.wheel = ACTION.DOLLY;
    c.touches.one = ACTION.TOUCH_TRUCK;
    c.touches.two = ACTION.TOUCH_DOLLY_ROTATE;
    c.touches.three = ACTION.TOUCH_DOLLY_ROTATE;
    c.verticalDragToForward = true;
    c.dollyToCursor = true;
    c.setBoundary(
      new Box3(new Vector3(box.cx - box.w / 2, -10, box.cz - box.d / 2), new Vector3(box.cx + box.w / 2, 10, box.cz + box.d / 2)),
    );
  }, [box]);

  // Ctrl／⌘＋左鍵拖曳＝旋轉：在 camera-controls 收到 pointerdown 之前（capture）換掉左鍵的動作，放開再換回
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const c = ref.current;
      if (!c || e.pointerType !== "mouse" || e.button !== 0) return;
      c.mouseButtons.left = e.ctrlKey || e.metaKey ? ACTION.ROTATE : ACTION.TRUCK;
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, []);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={18}
      maxDistance={260}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      smoothTime={reduced ? 0 : 0.35}
      draggingSmoothTime={reduced ? 0 : 0.125}
    />
  );
}
