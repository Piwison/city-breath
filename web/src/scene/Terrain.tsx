// 地面：行政區薄片＋六層台地（每區合成一個頂點色 mesh）、河川、綠地；21 區以外的台地、海與河。
// 每區保持自己的 group，之後選區時整區（含河川、綠地）一起彈起（diorama-game-juice「沙盤」）。
// 高度：薄片固定厚度 TILE_TOP；台地頂面＝基座＋elevation(門檻公尺)（AD-12）。
import { useEffect, useMemo } from "react";
import type { BufferGeometry, Color } from "three";
import type { BaseDistrictView, BaseView } from "../data/views";
import { useView } from "../state/view";
import { flat, merge, shapesOf, slab, type MultiPolygon } from "./geometry";
import { elevation, project } from "./projection";
import { useTokenColor, useTokenColors } from "./useTokenColor";

/** 行政區薄片頂面的高度（原型 TILE_TOP）。 */
export const TILE_TOP = 1.16;
/** 薄片往中心縮 0.8%，區與區之間留一條細縫。 */
const TILE_SHRINK = 0.992;

const PALETTE_TOKENS = [
  "--tile",
  "--tile-side",
  "--terrain-side",
  "--terrain-1",
  "--terrain-2",
  "--terrain-3",
  "--terrain-4",
  "--terrain-5",
  "--terrain-6",
];

/** 六層台地：第 k 層從基座擠到 base + elevation(levels[k])；各層頂面一色、側面共用 --terrain-side。 */
function terraces(levels: MultiPolygon[], heights: number[], base: number, tops: Color[], side: Color): (BufferGeometry | null)[] {
  return levels.map((mp, k) =>
    slab(shapesOf(mp), { bottom: base, top: base + heights[k], bevel: 0.03, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 }, tops[k], side),
  );
}

function useDispose(geos: (BufferGeometry | null)[]) {
  useEffect(() => () => geos.forEach((g) => g?.dispose()), [geos]);
}

interface Palette {
  tile: Color;
  tileSide: Color;
  terrain: Color[];
  terrainSide: Color;
}

function District({ d, heights, palette }: { d: BaseDistrictView; heights: number[]; palette: Palette }) {
  const layers = useView((s) => s.layers);
  const geos = useMemo(() => {
    const [cx, cz] = project(d.centroid[0], d.centroid[1]);
    const tile = slab(
      shapesOf(d.polygon, { cx, cz, k: TILE_SHRINK }),
      { bottom: 0, top: TILE_TOP, bevel: 0.08, bevelSize: 0.1, bevelSegments: 2, curveSegments: 2 },
      palette.tile,
      palette.tileSide,
    );
    const land = merge([tile, ...terraces(d.terrain, heights, TILE_TOP, palette.terrain, palette.terrainSide)]);
    return [land, flat(shapesOf(d.water), TILE_TOP + 0.004), flat(shapesOf(d.green), TILE_TOP + 0.008)];
  }, [d, heights, palette]);
  useDispose(geos);
  const [land, water, green] = geos;
  return (
    <group name={`district-${d.id}`}>
      {land && (
        <mesh geometry={land} castShadow receiveShadow matrixAutoUpdate={false}>
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
        </mesh>
      )}
      {water && (
        <mesh geometry={water} receiveShadow visible={layers.water} matrixAutoUpdate={false}>
          <WaterMaterial />
        </mesh>
      )}
      {green && (
        <mesh geometry={green} receiveShadow visible={layers.green} matrixAutoUpdate={false}>
          <GreenMaterial />
        </mesh>
      )}
    </group>
  );
}

function WaterMaterial() {
  const color = useTokenColor("--water");
  return <meshStandardMaterial color={color} roughness={0.35} metalness={0} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />;
}

function GreenMaterial() {
  const color = useTokenColor("--green");
  return <meshStandardMaterial color={color} roughness={0.95} metalness={0} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />;
}

/** 21 區以外：觀音山、林口台地、外圍的山與北邊的海，讓盆地的輪廓完整。 */
function Outside({ view, heights, palette }: { view: BaseView; heights: number[]; palette: Palette }) {
  const layers = useView((s) => s.layers);
  const geos = useMemo(
    () => [
      merge(terraces(view.outsideTerrain, heights, 0, palette.terrain, palette.terrainSide)),
      flat(shapesOf(view.sea), 0.03),
      flat(shapesOf(view.outsideWater), 0.03),
    ],
    [view, heights, palette],
  );
  useDispose(geos);
  const [land, sea, rivers] = geos;
  return (
    <group name="outside">
      {land && (
        <mesh geometry={land} castShadow receiveShadow matrixAutoUpdate={false}>
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
        </mesh>
      )}
      {/* 海是地形的一部分，一直顯示；底座外的河跟著河川圖層 */}
      {sea && (
        <mesh geometry={sea} receiveShadow matrixAutoUpdate={false}>
          <WaterMaterial />
        </mesh>
      )}
      {rivers && (
        <mesh geometry={rivers} receiveShadow visible={layers.water} matrixAutoUpdate={false}>
          <WaterMaterial />
        </mesh>
      )}
    </group>
  );
}

export function Terrain({ view }: { view: BaseView }) {
  const colors = useTokenColors(PALETTE_TOKENS);
  const palette = useMemo(() => {
    const [tile, tileSide, terrainSide, ...terrain] = colors;
    return { tile, tileSide, terrain, terrainSide };
  }, [colors]);
  const heights = useMemo(() => view.levels.map(elevation), [view.levels]);
  return (
    <group>
      <Outside view={view} heights={heights} palette={palette} />
      {view.districts.map((d) => (
        <District key={d.id} d={d} heights={heights} palette={palette} />
      ))}
    </group>
  );
}
