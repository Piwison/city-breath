// 捷運路線：basemap 的真實軌道（approx 段是以直線補的缺段），顏色＝路線色 token（AD-21）。
// 全部路線合成一個 LineSegments2（世界單位線寬），一個 draw call（AD-6、AD-11）。
// 選區時路線跟著所在的區一起彈起（diorama-game-juice「沙盤」，3.6）：區在動的那幾格就地改寫端點高度。
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { InterleavedBufferAttribute } from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { TrackView } from "../data/views";
import { useView } from "../state/view";
import { lifts } from "./lift";
import { project } from "./projection";
import { TILE_TOP } from "./Terrain";
import { useTokenColors } from "./useTokenColor";

/** 線寬（場景單位，約 130 公尺） */
const WIDTH = 0.3;
/** 浮在薄片頂面上方一點 */
const LIFT = 0.09;

const NO_IDS: string[] = [];

/** ids：view.districts 的代碼（TrackView.di 是它的索引），用來查每個端點所在區的抬起高度；要傳穩定的陣列。 */
export function Rails({ tracks, ids = NO_IDS }: { tracks: TrackView[]; ids?: string[] }) {
  const visible = useView((s) => s.layers.rail);
  const tokens = useMemo(() => [...new Set(tracks.map((t) => t.token))], [tracks]);
  const colors = useTokenColors(tokens);
  const built = useMemo(() => {
    const byToken = new Map(tokens.map((t, i) => [t, colors[i]]));
    const pos: number[] = [];
    const col: number[] = [];
    // 每段兩個端點所在的區（代碼；不在有車站的區為 null）與原本的高度
    const ends: (string | null)[] = [];
    const baseY: number[] = [];
    for (const t of tracks) {
      const c = byToken.get(t.token)!;
      const y = (k: number) => (t.di[k] >= 0 ? TILE_TOP : 0) + LIFT;
      const id = (k: number) => (t.di[k] >= 0 ? (ids[t.di[k]] ?? null) : null);
      for (let k = 0; k < t.coords.length - 1; k++) {
        const [x0, z0] = project(t.coords[k][0], t.coords[k][1]);
        const [x1, z1] = project(t.coords[k + 1][0], t.coords[k + 1][1]);
        pos.push(x0, y(k), z0, x1, y(k + 1), z1);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
        ends.push(id(k), id(k + 1));
        baseY.push(y(k), y(k + 1));
      }
    }
    const g = new LineSegmentsGeometry();
    g.setPositions(pos);
    g.setColors(col);
    const m = new LineMaterial({ vertexColors: true, linewidth: WIDTH, worldUnits: true });
    const l = new LineSegments2(g, m);
    l.matrixAutoUpdate = false;
    return { line: l, ends, baseY };
  }, [tracks, tokens, colors, ids]);
  const { line } = built;
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );

  // 區的高度變了（lifts.frame）才改寫：instanceStart／instanceEnd 共用一個 6 格一組的交錯 buffer，y 在第 1、4 格
  const seen = useRef(-1);
  useFrame(() => {
    if (seen.current === lifts.frame) return;
    seen.current = lifts.frame;
    const attr = line.geometry.getAttribute("instanceStart") as InterleavedBufferAttribute | undefined;
    if (!attr) return;
    const arr = attr.data.array as Float32Array;
    const { ends, baseY } = built;
    for (let i = 0; i < ends.length; i++) {
      const id = ends[i];
      const y = baseY[i] + (id ? (lifts.now.get(id) ?? 0) : 0);
      arr[(i >> 1) * 6 + (i & 1 ? 4 : 1)] = y;
    }
    attr.data.needsUpdate = true;
  });
  return <primitive object={line} visible={visible} />;
}
