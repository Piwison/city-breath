// 天光：一盞會投影的方向光（白天太陽、夜裡月亮）＋半球光＋曝光，全部由 daylight.ts 從 clock 的時刻算出（AD-8、AD-11）。
// 材質顏色不動，日夜只改這裡的光與天空。
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { DirectionalLight, HemisphereLight } from "three";
import { advance } from "../state/clock";
import { time } from "../state/view";
import { lightingAt, type Lighting } from "./daylight";
import { rgbaToColor } from "./useTokenColor";

/** 每格算一次的光，Sky 也讀它。 */
export interface FrameLight {
  t: number;
  lighting: Lighting | null;
}

/** 陰影相機要涵蓋整個底座（約 81 × 116 單位）。 */
const SHADOW_HALF = 78;

export function Daylight({ frame, shadowMapSize }: { frame: MutableRefObject<FrameLight>; shadowMapSize: number }) {
  const gl = useThree((s) => s.gl);
  const key = useMemo(() => new DirectionalLight(), []);
  const hemi = useMemo(() => new HemisphereLight(), []);
  // live 的 CSSStyleDeclaration：每次讀的都是目前的 token 值，不是快取（AD-8）
  const read = useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    return (name: string) => cs.getPropertyValue(name).trim();
  }, []);
  const lastPos = useRef("");
  const dirtyFrames = useRef(3);

  useEffect(() => {
    // 陰影圖只在光的位置變了（播放、拖時間）或場景剛掛上時重畫；暫停時不耗 GPU
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
      key.dispose();
      hemi.dispose();
    };
  }, [gl, key, hemi]);

  useEffect(() => {
    key.castShadow = true;
    // 尺寸改了要丟掉舊的陰影圖，下一次陰影 pass 依新尺寸重建
    key.shadow.map?.dispose();
    key.shadow.map = null;
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    Object.assign(key.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 420 });
    key.shadow.camera.updateProjectionMatrix();
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 5;
    dirtyFrames.current = 3;
  }, [key, shadowMapSize]);

  useFrame((_, dt) => {
    advance(dt);
    const t = time.t;
    if (frame.current.lighting && frame.current.t === t && dirtyFrames.current <= 0) return;
    const L = lightingAt(t, read);
    frame.current = { t, lighting: L };
    key.position.set(...L.key.position);
    key.intensity = L.key.intensity;
    rgbaToColor(L.key.color, key.color);
    rgbaToColor(L.hemi.sky, hemi.color);
    rgbaToColor(L.hemi.ground, hemi.groundColor);
    hemi.intensity = L.hemi.intensity;
    gl.toneMappingExposure = L.exposure;
    const pos = L.key.position.map((v) => v.toFixed(2)).join(",");
    if (pos !== lastPos.current || dirtyFrames.current > 0) {
      lastPos.current = pos;
      gl.shadowMap.needsUpdate = true;
    }
    dirtyFrames.current--;
  });

  return (
    <>
      <primitive object={hemi} />
      <primitive object={key} />
      <primitive object={key.target} />
    </>
  );
}
