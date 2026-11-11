// 區名：DOM 文字貼在每區中心的台地頂上，彼此重疊時讓給車站多的區（原型 updateLabels 的區名部分）。
// 位置在 Canvas 的 useFrame 裡直接寫 transform，不經 React；鏡頭與畫面大小沒變時不重算。
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type MutableRefObject } from "react";
import { Matrix4, Vector3 } from "three";
import type { BaseView } from "../data/views";
import { levelHeight, project, terrainLevelAt } from "./projection";
import { TILE_TOP } from "./Terrain";

export type LabelEls = MutableRefObject<(HTMLDivElement | null)[]>;

/**
 * 已被流向標籤佔走的螢幕矩形（中心 x、中心 y、寬、高）：流向標籤先放，區名避開它們（原型 updateLabels(taken)）。
 * version 每次改寫加一，區名據此重算。
 */
export interface LabelBoard {
  rects: [number, number, number, number][];
  version: number;
  /** 流向標籤可放的上下界（螢幕像素）：上方 HUD 的下緣、時間軸的上緣；ScenePage 量 */
  safeTop: number;
  safeBottom: number;
}

/** Canvas 外的 DOM：每區一個標籤。 */
export function DistrictLabelLayer({ view, els, visible }: { view: BaseView; els: LabelEls; visible: boolean }) {
  return (
    <div className="scene-labels" aria-hidden="true" hidden={!visible}>
      {view.districts.map((d, i) => (
        <div
          key={d.id}
          className="dlabel"
          ref={(el) => {
            els.current[i] = el;
          }}
        >
          {d.label}
        </div>
      ))}
    </div>
  );
}

/** Canvas 內：投影並避開重疊。 */
export function DistrictLabelProjector({
  view,
  els,
  visible,
  board,
}: {
  view: BaseView;
  els: LabelEls;
  visible: boolean;
  board?: LabelBoard;
}) {
  const anchors = useMemo(
    () =>
      view.districts.map((d) => {
        const [x, z] = project(d.centroid[0], d.centroid[1]);
        const y = TILE_TOP + levelHeight(terrainLevelAt(d.centroid[0], d.centroid[1], view.grid), view.levels) + 0.3;
        return new Vector3(x, y, z);
      }),
    [view],
  );
  // 車站多的區先放
  const order = useMemo(
    () => view.districts.map((_, i) => i).sort((a, b) => view.districts[b].stationCount - view.districts[a].stationCount),
    [view],
  );
  const P = useMemo(() => new Vector3(), []);
  const last = useRef({ m: new Matrix4(), w: 0, h: 0, visible: false, board: -1 });

  useFrame(({ camera, size }) => {
    const L = last.current;
    if (!visible) {
      L.visible = false;
      return;
    }
    const bv = board?.version ?? 0;
    if (L.visible && L.board === bv && L.w === size.width && L.h === size.height && L.m.equals(camera.matrixWorld)) return;
    L.m.copy(camera.matrixWorld);
    L.w = size.width;
    L.h = size.height;
    L.visible = true;
    L.board = bv;
    const placed: [number, number, number, number][] = [...(board?.rects ?? [])];
    for (const i of order) {
      const el = els.current[i];
      if (!el) continue;
      P.copy(anchors[i]).project(camera);
      const sx = (P.x * 0.5 + 0.5) * size.width;
      const sy = (-P.y * 0.5 + 0.5) * size.height;
      const w = (el.textContent?.length ?? 2) * 12 + 6;
      const h = 14;
      const hit =
        P.z > 1 ||
        sx < 0 ||
        sx > size.width ||
        sy < 0 ||
        sy > size.height ||
        placed.some(([px, py, pw, ph]) => Math.abs(px - sx) < (pw + w) / 2 && Math.abs(py - sy) < (ph + h) / 2);
      el.hidden = hit;
      if (hit) continue;
      placed.push([sx, sy, w, h]);
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%)`;
    }
  });
  return null;
}
