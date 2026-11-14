// 流向緞帶的材質（3.21 從 Flows.tsx 拆出，行為不變）：箭紋貼圖、「畫出」shader（uReveal）與透明度常數。
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, type WebGLProgramParametersWithUniforms } from "three";

export const OPACITY = 0.92;
export const BAND_OPACITY = 0.95;
/** 聚焦一條時，其他條的透明度倍數（原型 0.22 ÷ 0.92）。 */
export const DIM = 0.24;
/** 畫出動畫：每條 0.6 秒（原型 rebuildArcs）。 */
export const REVEAL = 0.6;
/** 沒有在畫出時 uReveal 的值（大於任何一條的延遲＋時長）。 */
export const SHOWN = 1e3;

/** 畫出進度（0–1，power2.out）：和 shader 裡同一個公式，光點依它決定這一條畫到哪。 */
export function revealAt(t: number, delay: number): number {
  const p = Math.min(1, Math.max(0, (t - delay) / REVEAL));
  return 1 - (1 - p) * (1 - p);
}

/** 箭紋貼圖（原型 chevTex）：灰底上的白色 V 形，只是亮度遮罩，乘上頂點的 token 色後才是緞帶色。 */
export function chevronTexture(): DataTexture {
  const W = 64;
  const H = 32;
  const poly = [
    [10, 3],
    [28, 16],
    [10, 29],
    [18, 16],
  ];
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = inside(x + 0.5, y + 0.5) ? 255 : 199;
      const k = (y * W + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = v;
      data[k + 3] = 255;
    }
  const t = new DataTexture(data, W, H, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** 在 MeshBasicMaterial 上加「畫出」：頂點位置 aReveal.x 超過這條的進度就丟掉（與 revealAt 同一個公式）。 */
export function withReveal(m: MeshBasicMaterial, uniform: { value: number }): MeshBasicMaterial {
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uReveal = uniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aReveal;\nvarying vec2 vReveal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvReveal = aReveal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uReveal;\nvarying vec2 vReveal;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
float rp = clamp((uReveal - vReveal.y) / ${REVEAL.toFixed(2)}, 0.0, 1.0);
rp = 1.0 - (1.0 - rp) * (1.0 - rp);
if (vReveal.x > rp + 1e-4) discard;`,
      );
  };
  m.customProgramCacheKey = () => "flow-reveal";
  return m;
}
