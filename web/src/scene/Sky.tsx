// 天空：畫在沙盤後面的全螢幕四邊形。上緣→地平線→地平線以下的三段漸層、太陽、月亮與星星都在一個 shader 裡，
// 一個 draw call、每格不動 DOM。顏色在 sRGB 空間混合後直接輸出（不 tone map），與原型的 CSS 漸層一致。
// 位置與透明度由 daylight.ts 的 skyDiscs() 算；顏色全部來自 token（AD-8）。
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject } from "react";
import { ShaderMaterial, Vector2, Vector3, Vector4 } from "three";
import { readCssToken, tokenRgba, type Rgba } from "../styles/tokens";
import { skyDiscs } from "./daylight";
import type { FrameLight } from "./Daylight";
import { usePhaseAttr } from "./useTokenColor";

const vertexShader = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uRes;
  uniform float uDpr;
  uniform vec3 uTop;
  uniform vec3 uHor;
  uniform vec3 uLow;
  uniform float uHorizon;
  uniform vec2 uSun;
  uniform float uSunA;
  uniform vec2 uMoon;
  uniform float uMoonA;
  uniform float uStarA;
  uniform vec3 uSunDisc;
  uniform vec4 uSunGlow;
  uniform vec3 uMoonDisc;
  uniform vec4 uMoonGlow;
  uniform vec3 uStar;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  void main() {
    // CSS px，y 從畫面上緣往下量
    vec2 q = vec2(gl_FragCoord.x / uDpr, uRes.y - gl_FragCoord.y / uDpr);
    vec3 c = q.y < uHorizon
      ? mix(uTop, uHor, q.y / max(uHorizon, 1.0))
      : mix(uHor, uLow, (q.y - uHorizon) / max(uRes.y - uHorizon, 1.0));

    // 星星：畫面上方 42% 切成 10 × 7 格，每格一顆，亮度不一
    if (uStarA > 0.0 && q.y < uRes.y * 0.42) {
      vec2 cellSize = vec2(uRes.x / 10.0, uRes.y * 0.42 / 7.0);
      vec2 cell = floor(q / cellSize);
      vec2 center = (cell + 0.1 + 0.8 * vec2(hash12(cell), hash12(cell + 17.0))) * cellSize;
      float a = (0.35 + 0.65 * hash12(cell + 41.0)) * uStarA * (1.0 - smoothstep(0.6, 1.4, length(q - center)));
      c = mix(c, uStar, a);
    }

    // 太陽：大片光暈、光圈、日輪
    float ds = length(q - uSun);
    c = mix(c, uSunGlow.rgb, uSunA * uSunGlow.a * (1.0 - smoothstep(2.0, 92.0, ds)));
    c = mix(c, uSunGlow.rgb, uSunA * uSunGlow.a * (1.0 - smoothstep(26.5, 27.5, ds)));
    c = mix(c, uSunDisc, uSunA * (1.0 - smoothstep(16.5, 17.5, ds)));
    // 月亮：光暈、月輪
    float dm = length(q - uMoon);
    c = mix(c, uMoonGlow.rgb, uMoonA * uMoonGlow.a * (1.0 - smoothstep(3.0, 47.0, dm)));
    c = mix(c, uMoonDisc, uMoonA * (1.0 - smoothstep(12.5, 13.5, dm)));

    gl_FragColor = vec4(c, 1.0);
  }
`;

const srgb = ([r, g, b]: Rgba, out: Vector3) => out.set(r / 255, g / 255, b / 255);
const srgba = (c: Rgba, out: Vector4) => out.set(c[0] / 255, c[1] / 255, c[2] / 255, c[3]);

/** farEdge：底座遠端（北邊）中點的場景座標，投影到畫面上就是地平線。 */
export function Sky({ frame, farEdge }: { frame: MutableRefObject<FrameLight>; farEdge: [number, number, number] }) {
  const phase = usePhaseAttr();
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uRes: { value: new Vector2(1, 1) },
          uDpr: { value: 1 },
          uTop: { value: new Vector3() },
          uHor: { value: new Vector3() },
          uLow: { value: new Vector3() },
          uHorizon: { value: 200 },
          uSun: { value: new Vector2() },
          uSunA: { value: 0 },
          uMoon: { value: new Vector2() },
          uMoonA: { value: 0 },
          uStarA: { value: 0 },
          uSunDisc: { value: new Vector3() },
          uSunGlow: { value: new Vector4() },
          uMoonDisc: { value: new Vector3() },
          uMoonGlow: { value: new Vector4() },
          uStar: { value: new Vector3() },
        },
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);

  // 日月星的顏色是全天 token；data-phase 變了就重讀
  useEffect(() => {
    const u = material.uniforms;
    srgb(tokenRgba("--sun-disc", readCssToken), u.uSunDisc.value);
    srgba(tokenRgba("--sun-glow", readCssToken), u.uSunGlow.value);
    srgb(tokenRgba("--moon-disc", readCssToken), u.uMoonDisc.value);
    srgba(tokenRgba("--moon-glow", readCssToken), u.uMoonGlow.value);
    srgb(tokenRgba("--star", readCssToken), u.uStar.value);
  }, [material, phase]);

  const P = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size, viewport }) => {
    const L = frame.current.lighting;
    if (!L) return;
    const u = material.uniforms;
    u.uRes.value.set(size.width, size.height);
    u.uDpr.value = viewport.dpr;
    srgb(L.sky.top, u.uTop.value);
    srgb(L.sky.horizon, u.uHor.value);
    srgb(L.sky.low, u.uLow.value);
    P.set(...farEdge).project(camera);
    const horizon = Math.min(Math.max((-P.y * 0.5 + 0.5) * size.height, 80), size.height * 0.6);
    u.uHorizon.value = horizon;
    const d = skyDiscs(L.sun, horizon);
    u.uSun.value.set(d.sun.x * size.width, d.sun.y);
    u.uSunA.value = d.sun.alpha;
    u.uMoon.value.set(d.moon.x * size.width, d.moon.y);
    u.uMoonA.value = d.moon.alpha;
    u.uStarA.value = d.stars;
  });

  return (
    <mesh frustumCulled={false} renderOrder={-1000} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
