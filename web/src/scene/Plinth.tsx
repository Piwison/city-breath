// 沙盤底座：三層「地層」蛋糕（--plinth、--strata-1、--strata-2），頂面有細刻度，底下一片柔和的影子（原型 slab／grid／blob）。
// 底座範圍就是 basemap.json 的 bbox，經 project()（AD-12）。
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { CanvasTexture, DataTexture, LinearFilter, MeshBasicMaterial, RGBAFormat, SRGBColorSpace } from "three";
import { readCssToken } from "../styles/tokens";
import type { FrameLight } from "./Daylight";
import { merge, roundedRect, slab } from "./geometry";
import { project } from "./projection";
import { useTokenColor, useTokenColors } from "./useTokenColor";

export interface PlinthBox {
  cx: number;
  cz: number;
  /** 東西寬、南北深（場景單位） */
  w: number;
  d: number;
}

/** basemap bbox → 底座的中心與尺寸。 */
export function plinthBox([w, s, e, n]: [number, number, number, number]): PlinthBox {
  const [x0, z0] = project(w, s);
  const [x1, z1] = project(e, n);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z0 - z1 };
}

/** 底座三層的總厚度（底面在 −PLINTH_DEPTH）。 */
export const PLINTH_DEPTH = 6.8;

/** 放射狀漸層的 alpha 貼圖（影子用）：中心不透明、往外線性淡出。 */
function radialAlpha(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const r = Math.hypot(i + 0.5 - size / 2, j + 0.5 - size / 2) / (size / 2);
      const v = Math.round(255 * Math.min(1, Math.max(0, (1 - r) / (1 - 10 / 64))));
      data.set([v, v, v, 255], (j * size + i) * 4);
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.magFilter = tex.minFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** 頂面刻度：每 32px 一條線，色＝--plinth-line。 */
function gridTexture(): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 512;
  const c2 = cv.getContext("2d")!;
  c2.strokeStyle = readCssToken("--plinth-line");
  c2.globalAlpha = 0.6;
  c2.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    c2.beginPath();
    c2.moveTo(i, 0);
    c2.lineTo(i, 512);
    c2.stroke();
    c2.beginPath();
    c2.moveTo(0, i);
    c2.lineTo(512, i);
    c2.stroke();
  }
  const tex = new CanvasTexture(cv);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function Plinth({ box, frame }: { box: PlinthBox; frame: MutableRefObject<FrameLight> }) {
  const [plinth, plinthSide, strata1, strata2] = useTokenColors(["--plinth", "--plinth-side", "--strata-1", "--strata-2"]);
  const shadow = useTokenColor("--shadow");
  const geometry = useMemo(() => {
    const layer = (inset: number, t: number, top: number, topC = plinth, sideC = plinthSide) =>
      slab([roundedRect(box.cx, box.cz, box.w - inset, box.d - inset, 5)], { bottom: top - t - 1, top, bevel: 0.5, bevelSegments: 3, curveSegments: 10 }, topC, sideC);
    return merge([layer(0, 1.4, 0), layer(0.6, 1.8, -2.4, strata1, strata1), layer(1.4, 1.6, -4.7, strata2, strata2)]);
  }, [box, plinth, plinthSide, strata1, strata2]);
  const grid = useMemo(() => gridTexture(), []);
  const blob = useMemo(() => radialAlpha(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  // 影子的濃淡跟著白天程度（原型 0.18 + 0.3 × day）
  const blobMat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const L = frame.current.lighting;
    if (L && blobMat.current) blobMat.current.opacity = 0.18 + 0.3 * L.sun.day;
  });
  useEffect(
    () => () => {
      grid.dispose();
      blob.dispose();
    },
    [grid, blob],
  );

  return (
    <group>
      {geometry && (
        <mesh geometry={geometry} receiveShadow matrixAutoUpdate={false}>
          <meshStandardMaterial vertexColors roughness={0.9} metalness={0} />
        </mesh>
      )}
      <mesh position={[box.cx, 0.02, box.cz]} rotation-x={-Math.PI / 2} renderOrder={1}>
        <planeGeometry args={[box.w - 2, box.d - 2]} />
        <meshBasicMaterial map={grid} transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh position={[box.cx, -PLINTH_DEPTH - 2, box.cz]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[box.w * 1.5, box.d * 1.5]} />
        <meshBasicMaterial
          ref={blobMat}
          color={shadow}
          alphaMap={blob}
          transparent
          depthWrite={false}
          opacity={0.4}
        />
      </mesh>
    </group>
  );
}
