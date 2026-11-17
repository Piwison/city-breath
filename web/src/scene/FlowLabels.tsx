// 流向的弧頂標籤（3.21 從 Flows.tsx 拆出）：前三大的人數標籤 DOM（Canvas 外）與每格的投影、避讓。
// 選了區時這區的站名優先（產品計畫 v2 決定 5）：流向標籤避開已放的站名（board.stationRects，上一格 Stations 放的）。
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Matrix4, Vector3 } from "three";
import { formatNumber } from "../data/format";
import { sleepAt } from "../state/service";
import { getView, time } from "../state/view";
import type { LabelBoard } from "./DistrictLabels";
import { bez, type Arc } from "./flowGeometry";
import { placeLabel } from "./labelPlace";


/** 前三大標籤的 DOM（Canvas 外）：路線、人數；文字與位置由 FlowLabelProjector 直接寫，不經 React。 */
export type FlowLabelEls = MutableRefObject<(HTMLDivElement | null)[]>;

export function FlowLabelLayer({ els }: { els: FlowLabelEls }) {
  return (
    <div className="scene-labels" aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <div
          key={k}
          className="flabel"
          hidden
          ref={(el) => {
            els.current[k] = el;
          }}
        >
          <span className="route" />
          <br />
          <b className="num" />
          <span className="unit"> 人</span>
        </div>
      ))}
    </div>
  );
}

/**
 * 前三大在弧頂標人數（DOM；聚焦時只標那一條）；彼此重疊時往上或往下挪（最多兩格），挪不開就藏起來。
 * 結果寫進 board 讓區名避開。標籤色塊跟著去哪／誰來換色（data-kind）。
 */
export function FlowLabelProjector({
  arcs,
  focused,
  names,
  els,
  board,
  visible: layerOn,
  reduced,
}: {
  arcs: Arc[];
  focused: string | null;
  names: Map<string, string>;
  els: FlowLabelEls;
  board: LabelBoard;
  visible: boolean;
  reduced: boolean;
}) {
  const top = useMemo(
    () => (focused ? arcs.filter((a) => a.key === focused) : [...arcs].sort((a, b) => b.w - a.w).slice(0, 3)),
    [arcs, focused],
  );
  // 文字：流向變了才寫（layout effect：下一格量大小前就寫好）；人數 null 顯示「少於 10 人」（AD-3），不會出現在前三，但不假設
  useLayoutEffect(() => {
    els.current.forEach((el, k) => {
      const a = top[k];
      if (!el || !a) return;
      el.dataset.kind = a.flow.kind ?? "city";
      const route = el.querySelector<HTMLElement>(".route");
      const num = el.querySelector<HTMLElement>(".num");
      const unit = el.querySelector<HTMLElement>(".unit");
      if (route) route.textContent = `${names.get(a.flow.from) ?? ""} → ${names.get(a.flow.to) ?? ""}`;
      if (num) num.textContent = formatNumber(a.flow.value);
      if (unit) unit.hidden = false; // formatNumber 寫「少於 10」，單位照放
    });
  }, [top, names, els]);

  const P = useMemo(() => new Vector3(), []);
  const last = useRef({ m: new Matrix4(), w: 0, h: 0, top: null as Arc[] | null, visible: false, safe: -1, sv: -1 });
  // 標籤大小只在文字換了之後量一次（量的時候要先顯示），鏡頭移動時不再逼瀏覽器重排
  const dims = useRef<{ top: Arc[] | null; wh: [number, number][] }>({ top: null, wh: [] });
  useFrame(({ camera, size }) => {
    // 停駛前淡出到一半就收起標籤（3.4），人數不留在快消失的緞帶上
    const visible = layerOn && sleepAt(time.t, getView().dayType, reduced) < 0.5;
    const L = last.current;
    const safeKey = board.safeTop * 10000 + board.safeBottom;
    // 選了區：站名先放，流向標籤讓路；站名換了位置就重算
    const stationFirst = getView().district !== null;
    const sv = stationFirst ? board.stationVersion : -1;
    if (
      L.sv === sv &&
      L.top === top &&
      L.visible === visible &&
      L.safe === safeKey &&
      L.w === size.width &&
      L.h === size.height &&
      L.m.equals(camera.matrixWorld)
    )
      return;
    L.m.copy(camera.matrixWorld);
    L.w = size.width;
    L.h = size.height;
    L.top = top;
    L.visible = visible;
    L.safe = safeKey;
    L.sv = sv;
    if (visible && dims.current.top !== top) {
      dims.current.top = top;
      dims.current.wh = els.current.map((el, k) => {
        if (!el || !top[k]) return [0, 0];
        el.hidden = false;
        return [el.offsetWidth || 90, el.offsetHeight || 34];
      });
    }
    const taken: [number, number, number, number][] = stationFirst ? [...board.stationRects] : [];
    els.current.forEach((el, k) => {
      if (!el) return;
      const a = top[k];
      if (!a || !visible) {
        el.hidden = true;
        return;
      }
      const [w, h] = dims.current.wh[k] ?? [90, 34];
      bez(a, 0.5, P);
      P.y += 0.6;
      P.project(camera);
      // 弧頂在鏡頭後面：不標；其餘交給 placeLabel（安全區、左右留邊、彼此不重疊）
      const spot =
        P.z > 1
          ? null
          : placeLabel(
              (P.x * 0.5 + 0.5) * size.width,
              (-P.y * 0.5 + 0.5) * size.height,
              w,
              h,
              { width: size.width, height: size.height, top: board.safeTop, bottom: board.safeBottom },
              taken,
            );
      el.hidden = spot === null;
      if (!spot) return;
      taken.push(spot.rect);
      el.style.transform = `translate(${spot.x.toFixed(1)}px, ${spot.y.toFixed(1)}px) translate(-50%, -100%)`;
    });
    board.rects = stationFirst ? taken.slice(board.stationRects.length) : taken;
    board.version++;
  });
  return null;
}
