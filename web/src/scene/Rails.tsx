// 捷運路線：basemap 的真實軌道（approx 段是以直線補的缺段），顏色＝路線色 token（AD-21）。
// 全部路線合成一個 LineSegments2（世界單位線寬），一個 draw call（AD-6、AD-11）。
import { useEffect, useMemo } from "react";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { TrackView } from "../data/views";
import { useView } from "../state/view";
import { project } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColors } from "./useTokenColor";

/** 線寬（場景單位，約 130 公尺） */
const WIDTH = 0.3;
/** 浮在薄片頂面上方一點 */
const LIFT = 0.09;

export function Rails({ tracks }: { tracks: TrackView[] }) {
  const visible = useView((s) => s.layers.rail);
  const tokens = useMemo(() => [...new Set(tracks.map((t) => t.token))], [tracks]);
  const colors = useTokenColors(tokens);
  const line = useMemo(() => {
    const byToken = new Map(tokens.map((t, i) => [t, colors[i]]));
    const pos: number[] = [];
    const col: number[] = [];
    for (const t of tracks) {
      const c = byToken.get(t.token)!;
      const y = (k: number) => (t.di[k] >= 0 ? TILE_TOP : 0) + LIFT;
      for (let k = 0; k < t.coords.length - 1; k++) {
        const [x0, z0] = project(t.coords[k][0], t.coords[k][1]);
        const [x1, z1] = project(t.coords[k + 1][0], t.coords[k + 1][1]);
        pos.push(x0, y(k), z0, x1, y(k + 1), z1);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    g.setColors(col);
    const m = new LineMaterial({ vertexColors: true, linewidth: WIDTH, worldUnits: true });
    const l = new LineSegments2(g, m);
    l.matrixAutoUpdate = false;
    return l;
  }, [tracks, tokens, colors]);
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );
  return <primitive object={line} visible={visible} />;
}
