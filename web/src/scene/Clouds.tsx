// 雲（3.14，純裝飾，AD-23）：幾朵低多邊形雲在沙盤上空由西往東飄，白天在地圖上投下影子；入夜與放大看細節時淡出（clouds.ts）。
// 全部雲團一個 InstancedMesh（AD-6）；顏色 --cloud（AD-8）。點不到（raycast 關掉）。
// 影子跟著淡：陰影用的深度材質依不透明度抖動丟棄片段（半透明的雲投半淡的影），PCF 再把抖動抹平。
// 陰影圖只在光移動時重畫（Daylight）：雲在飄就補 shadowMap.needsUpdate，暫停時節流到每秒約 20 次。
// lite（quality.ts）：2 朵、不投影。減少動態或靜態模式：雲停在原位不飄。
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { IcosahedronGeometry, InstancedMesh, MeshDepthMaterial, MeshStandardMaterial, Object3D, type Material } from "three";
import { getView, time, useView } from "../state/view";
import { cloudFade, cloudLayout, CLOUD_OPACITY, driftX } from "./clouds";
import type { PlinthBox } from "./Plinth";
import { useTier, type Tier } from "./quality";
import { useTokenColor } from "./useTokenColor";

const COUNT: Record<Tier, number> = { full: 4, lite: 2 };
/** 暫停時雲影最多多久重畫一次（秒）。 */
const SHADOW_EVERY = 0.05;

function buildMesh(tier: Tier, box: PlinthBox) {
  const layout = cloudLayout(box, COUNT[tier]);
  const geo = new IcosahedronGeometry(1, 1);
  const mat = new MeshStandardMaterial({ flatShading: true, transparent: true, opacity: CLOUD_OPACITY, roughness: 1, metalness: 0 });
  // 陰影的深度材質：依不透明度抖動丟棄，影子跟著雲一起淡
  const shadow = { value: 1 };
  const depth = new MeshDepthMaterial();
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uCloudShadow = shadow;
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float uCloudShadow;\nvoid main() {")
      .replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\n if (fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) >= uCloudShadow) discard;",
      );
  };
  depth.customProgramCacheKey = () => "city-breath-clouds-depth";
  const mesh = new InstancedMesh(geo, mat, layout.puffs.length);
  mesh.customDepthMaterial = depth;
  mesh.castShadow = tier === "full";
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.raycast = () => {};
  return { mesh, mat, depth, shadow, layout };
}

export function Clouds({ box, reduced }: { box: PlinthBox; reduced: boolean }) {
  const tier = useTier();
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { distance?: number } | null;
  const on = useView((s) => s.layers.cloud);
  const still = useView((s) => s.still);
  const calm = reduced || still;

  const built = useMemo(() => buildMesh(tier, box), [tier, box]);
  const { mesh, mat } = built;
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mat.dispose();
      (built.depth as Material).dispose();
      mesh.dispose();
    },
    [built, mesh, mat],
  );
  const color = useTokenColor("--cloud");
  useEffect(() => {
    mat.color.copy(color);
  }, [mat, color]);

  // 每朵雲目前的 x（從佈局的起點開始飄）
  const xs = useMemo(() => built.layout.clouds.map((c) => c.x), [built]);
  const o = useMemo(() => new Object3D(), []);
  const last = useRef({ shown: false, since: 0, placed: false, fade: -1 });

  // 圖層開關、換等級：陰影圖補一次
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    last.current.placed = false;
  }, [gl, on, built]);

  useFrame(({ camera }, dt) => {
    const v = getView();
    const L = last.current;
    const distance = typeof controls?.distance === "number" ? controls.distance : camera.position.length();
    const fade = on ? cloudFade(time.t, distance) : 0;
    const shown = fade > 0.02;
    mesh.visible = shown;
    if (!shown) {
      if (L.shown && mesh.castShadow) gl.shadowMap.needsUpdate = true;
      L.shown = false;
      return;
    }
    mat.opacity = fade;
    built.shadow.value = fade / CLOUD_OPACITY;

    const drift = !calm;
    if (drift || !L.placed) {
      const { clouds, puffs } = built.layout;
      const k = Math.min(dt, 0.1) * (v.playing ? v.speed : 1);
      if (drift) for (let c = 0; c < clouds.length; c++) xs[c] = driftX(xs[c], clouds[c].v * k, box);
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        const c = clouds[p.cloud];
        o.position.set(xs[p.cloud] + p.dx, c.y + p.dy, c.z + p.dz);
        o.scale.setScalar(p.scale);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      L.placed = true;
    }

    // 雲影：剛出現、淡入淡出或飄動時補畫；暫停時節流（播放中光本來就每格在動）
    if (mesh.castShadow) {
      L.since += dt;
      const changed = !L.shown || Math.abs(fade - L.fade) > 0.02;
      if (changed || (drift && (v.playing || L.since >= SHADOW_EVERY))) {
        gl.shadowMap.needsUpdate = true;
        L.since = 0;
        L.fade = fade;
      }
    }
    L.shown = true;
  });

  return <primitive object={mesh} />;
}
