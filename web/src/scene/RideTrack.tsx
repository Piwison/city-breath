// 搭乘中的道床與月台（8.7「搭乘畫面打磨」造型 b「月台」，rideStyle.ts）：只在搭乘時出現，全景完全不畫。
// 道床：沿搭乘路徑（ridePath.ts，basemap 真實軌道經 project()）一條微微隆起的窄條，頂面在路線線（Rails，LIFT）下方一點，
// 路線色的細線就成了道床中間的一條色帶。月台：每個停靠站在軌道兩側各一塊長方形的薄板，外緣一根不寫字的站牌柱，
// 牌子是路線色。全是示意（AD-23），不加資料；顏色只從 :root token 來（AD-8）。幾何一次建好，月台與站牌各一個 InstancedMesh（AD-6）。
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from "three";
import { lineToken } from "../data/views";
import { useView } from "../state/view";
import { LIFT as RAIL_LIFT } from "./Rails";
import { pathAt, type RidePath } from "./ridePath";
import { RIDE_LOOK } from "./rideStyle";
import { TILE_TOP } from "./Terrain";
import { useTokenColor } from "./useTokenColor";

/** 道床半寬（場景單位；全寬約 60 公尺，比全景的路線線窄一半）。 */
const BED_HALF = 0.07;
/** 道床頂面在路線線下方多少（路線線浮在薄片上 LIFT＝0.09）。 */
const BED_BELOW = 0.008;
/** 月台：沿軌道長、寬、高（場景單位）。 */
const PLAT_LEN = 0.5;
const PLAT_W = 0.07;
const PLAT_H = 0.06;
/** 月台內緣離道床多遠。 */
const PLAT_GAP = 0.012;
/** 站牌柱：粗、高；牌子：寬、高、厚。 */
const POST_W = 0.018;
const POST_H = 0.16;
const SIGN: [number, number, number] = [0.1, 0.04, 0.012];

/** 路徑第 k 個頂點的地面（軌道所在區的薄片頂；不在有車站的區是 0），和 Rails 的高度算法相同。 */
const groundOf = (path: RidePath, k: number) => (path.di[Math.min(k, path.di.length - 1)] >= 0 ? TILE_TOP : 0);

/** 沿路徑的道床：頂面＋左右兩側的牆，各自一條三角形帶（接縫用兩段方向的平均，不留縫）。 */
function bedGeometry(path: RidePath): BufferGeometry {
  const n = path.x.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const strip = (at: (i: number, side: 0 | 1) => [number, number, number]) => {
    const start = pos.length / 3;
    for (let i = 0; i < n; i++) for (const side of [0, 1] as const) pos.push(...at(i, side));
    for (let i = 0; i < n - 1; i++) {
      const a = start + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  };
  // 每個頂點的側向（前後兩段方向平均後轉 90°）
  const nx = new Float64Array(n);
  const nz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let dx = path.x[b] - path.x[a];
    let dz = path.z[b] - path.z[a];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    nx[i] = -dz;
    nz[i] = dx;
  }
  const top = (i: number) => groundOf(path, i) + RAIL_LIFT - BED_BELOW;
  const bot = (i: number) => groundOf(path, i) - 0.01;
  const edge = (i: number, s: number): [number, number] => [path.x[i] + nx[i] * BED_HALF * s, path.z[i] + nz[i] * BED_HALF * s];
  // 頂面：左（+n）→ 右（−n）
  strip((i, side) => {
    const [x, z] = edge(i, side ? -1 : 1);
    return [x, top(i), z];
  });
  // 左牆、右牆：上緣 → 下緣（繞向讓法線朝外；材質雙面，不怕繞反）
  strip((i, side) => {
    const [x, z] = edge(i, 1);
    return [x, side ? bot(i) : top(i), z];
  });
  strip((i, side) => {
    const [x, z] = edge(i, -1);
    return [x, side ? top(i) : bot(i), z];
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function RideTrack({ path }: { path: RidePath | null }) {
  if (!RIDE_LOOK.bed || !path) return null;
  return <Bed path={path} />;
}

function Bed({ path }: { path: RidePath }) {
  const gl = useThree((s) => s.gl);
  const riding = useView((s) => s.ride !== null);
  const layer = useView((s) => s.layers.rail);
  const bedColor = useTokenColor("--plinth-line");
  const platColor = useTokenColor("--station");
  const postColor = useTokenColor("--cable");
  const signColor = useTokenColor(lineToken(path.line));

  const built = useMemo(() => {
    const bed = new Mesh(bedGeometry(path), new MeshStandardMaterial({ roughness: 0.95, metalness: 0, side: DoubleSide }));
    bed.receiveShadow = true;
    const n = path.stops.length * 2;
    const box = () => {
      const g = new BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    };
    const plat = new InstancedMesh(box(), new MeshStandardMaterial({ roughness: 0.8, metalness: 0 }), n);
    const post = new InstancedMesh(box(), new MeshStandardMaterial({ roughness: 0.6, metalness: 0.1 }), n);
    const sign = new InstancedMesh(box(), new MeshStandardMaterial({ roughness: 0.5, metalness: 0 }), n);
    const o = new Object3D();
    const P = { x: 0, z: 0, k: 0, dx: 1, dz: 0 };
    let j = 0;
    for (const stop of path.stops) {
      pathAt(path, stop.s, P);
      const g = groundOf(path, P.k);
      for (const side of [1, -1]) {
        // 本地 x＝前進方向、z＝側向（(−dz, dx)）
        const off = side * (BED_HALF + PLAT_GAP + PLAT_W / 2);
        const cx = P.x - P.dz * off;
        const cz = P.z + P.dx * off;
        o.position.set(cx, g, cz);
        o.rotation.set(0, Math.atan2(-P.dz, P.dx), 0);
        o.scale.set(PLAT_LEN, PLAT_H, PLAT_W);
        o.updateMatrix();
        plat.setMatrixAt(j, o.matrix);
        // 站牌柱在月台外緣的中間
        const po = side * (BED_HALF + PLAT_GAP + PLAT_W - POST_W);
        o.position.set(P.x - P.dz * po, g + PLAT_H, P.z + P.dx * po);
        o.scale.set(POST_W, POST_H, POST_W);
        o.updateMatrix();
        post.setMatrixAt(j, o.matrix);
        o.position.y = g + PLAT_H + POST_H;
        o.scale.set(...SIGN);
        o.updateMatrix();
        sign.setMatrixAt(j, o.matrix);
        j++;
      }
    }
    for (const m of [plat, post, sign]) {
      m.instanceMatrix.needsUpdate = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.raycast = () => {};
    }
    bed.raycast = () => {};
    return { bed, plat, post, sign };
  }, [path]);

  useEffect(
    () => () => {
      for (const m of [built.bed, built.plat, built.post, built.sign]) {
        m.geometry.dispose();
        (m.material as MeshStandardMaterial).dispose();
      }
    },
    [built],
  );
  useEffect(() => {
    (built.bed.material as MeshStandardMaterial).color.copy(bedColor);
    (built.plat.material as MeshStandardMaterial).color.copy(platColor);
    (built.post.material as MeshStandardMaterial).color.copy(postColor);
    (built.sign.material as MeshStandardMaterial).color.copy(signColor);
  }, [built, bedColor, platColor, postColor, signColor]);
  // 上下車時陰影圖不會自己重畫（Daylight 只在光移動時重畫），補一次
  const shown = riding && layer;
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
  }, [gl, shown]);

  return (
    <group visible={shown}>
      <primitive object={built.bed} />
      <primitive object={built.plat} />
      <primitive object={built.post} />
      <primitive object={built.sign} />
    </group>
  );
}
