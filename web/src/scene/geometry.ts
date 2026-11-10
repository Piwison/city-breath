// 把 basemap／districts 的經緯度多邊形變成場景幾何。座標一律經 project()（AD-12）。
// 頂面／側面兩種顏色烘進頂點色，同一區的薄片與六層台地合成一個 mesh，省 draw call（AD-6）。
import { BufferAttribute, BufferGeometry, Color, ExtrudeGeometry, Path, Shape, ShapeGeometry, Vector2 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { project } from "./projection";

export type Ring = number[][];
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

/** 往中心 (cx, cz) 縮放 k 倍（行政區薄片之間留一條細縫）。 */
export interface Shrink {
  cx: number;
  cz: number;
  k: number;
}

/** 經緯度環 → Shape 平面座標 (x, −z)：擠出後轉 −90° 正好落回 (x, z)。 */
function ringPoints(ring: Ring, shrink?: Shrink): Vector2[] {
  return ring.map(([lon, lat]) => {
    let [x, z] = project(lon, lat);
    if (shrink) {
      x = shrink.cx + (x - shrink.cx) * shrink.k;
      z = shrink.cz + (z - shrink.cz) * shrink.k;
    }
    return new Vector2(x, -z);
  });
}

/** GeoJSON MultiPolygon 座標 → Shape[]（第一個環是外框，其餘是洞）。 */
export function shapesOf(mp: MultiPolygon, shrink?: Shrink): Shape[] {
  return mp
    .filter((poly) => poly.length && poly[0].length >= 4)
    .map((poly) => {
      const s = new Shape(ringPoints(poly[0], shrink));
      for (const hole of poly.slice(1)) if (hole.length >= 4) s.holes.push(new Path(ringPoints(hole, shrink)));
      return s;
    });
}

export interface SlabOptions {
  /** 底面與頂面的場景高度（含倒角） */
  bottom: number;
  top: number;
  bevel: number;
  bevelSize?: number;
  bevelSegments?: number;
  curveSegments?: number;
}

/** 擠出成 [bottom, top] 的厚片；頂面（ExtrudeGeometry 的 group 0）與側面（group 1）各一色，烘進頂點色。 */
export function slab(shapes: Shape[], o: SlabOptions, topColor: Color, sideColor: Color): BufferGeometry | null {
  if (!shapes.length) return null;
  const depth = Math.max(0.001, o.top - o.bottom - 2 * o.bevel);
  const g = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: o.bevel > 0,
    bevelThickness: o.bevel,
    bevelSize: o.bevelSize ?? o.bevel,
    bevelSegments: o.bevelSegments ?? 1,
    curveSegments: o.curveSegments ?? 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, o.bottom + o.bevel, 0);
  const n = g.getAttribute("position").count;
  const colors = new Float32Array(n * 3);
  for (const grp of g.groups) {
    const c = grp.materialIndex === 0 ? topColor : sideColor;
    for (let v = grp.start; v < grp.start + grp.count; v++) colors.set([c.r, c.g, c.b], v * 3);
  }
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.deleteAttribute("uv");
  g.clearGroups();
  return g;
}

/** 平貼在高度 y 的面（河川、綠地、海）。 */
export function flat(shapes: Shape[], y: number): BufferGeometry | null {
  if (!shapes.length) return null;
  const g = new ShapeGeometry(shapes, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  g.deleteAttribute("uv");
  return g;
}

/** 合併同屬性的幾何並釋放原件；全部為空回 null。 */
export function merge(parts: (BufferGeometry | null)[]): BufferGeometry | null {
  const list = parts.filter((g): g is BufferGeometry => g !== null);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  return merged;
}

/** 圓角矩形（底座），中心 (cx, cz)。 */
export function roundedRect(cx: number, cz: number, w: number, d: number, r: number): Shape {
  const s = new Shape();
  const x = cx - w / 2;
  const y = -cz - d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
