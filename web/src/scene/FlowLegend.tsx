// 流向圖例（時間軸下方）：線寬＝每小時人次（三段，用 views.ts 同一個 ribbonWidth），一顆光點＝N 人。
// 粗細要和畫面一致：ScaleProbe 在 Canvas 裡每格依目前鏡頭算「鏡頭看著的那一點，一個場景單位是幾像素」與
// 緞帶縮放倍數 k（views.ts ribbonScale：放大時最粗的緞帶不超過 RIBBON_MAX_PX），緞帶、光點與圖例共用同一組值；
// 圖例的 bar 高度直接改 DOM，不經 React。
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { ribbonScale, ribbonWidth, type FlowSource } from "../data/views";
import { useView } from "../state/view";

/** Canvas 內外共用的一個物件：圖例 bar 的 DOM、量到的像素比例與緞帶縮放倍數。 */
export interface LegendLink {
  bars: (HTMLElement | null)[];
  /** 鏡頭看著的那一點，一個場景單位約幾像素 */
  px: number;
  /** 緞帶、光點、圖例共用的縮放倍數（0–1] */
  k: number;
}

const MIN_PX = 1.5;
const barPx = (v: number, max: number, px: number, k: number) => Math.max(MIN_PX, ribbonWidth(v, max) * px * k);
const people = (v: number) => (v >= 1000 ? `${v / 1000} 千` : String(v));

export function FlowLegend({ source, link }: { source?: FlowSource; link: LegendLink }) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const on = useView((s) => s.layers.flow);
  if (!source) return <div className="legend" />;
  if (!on) return <div className="legend">流向已關閉，可從右上角「圖層」打開</div>;
  const now = source.at(dayType, hour);
  if (now.flows === null) return <div className="legend">停止營運：這個時段沒有列車</div>;
  if (now.flows.length === 0) return <div className="legend">這一小時，各區之間的流向都少於 10 人</div>;
  return (
    <div className="legend" aria-label="流向圖例">
      <span>線寬＝每小時人次</span>
      {source.legend.map((v, k) => (
        <span className="item" key={k}>
          <i
            className="bar"
            aria-hidden="true"
            ref={(el) => {
              link.bars[k] = el;
            }}
            style={{ height: `${barPx(v, source.max, link.px, link.k).toFixed(1)}px` }}
          />
          <span className="num">{people(v)}</span>
        </span>
      ))}
      <span className="sep" aria-hidden="true" />
      <span className="item">
        <i className="dotk" aria-hidden="true" />
        一顆光點＝{now.perDot} 人
      </span>
    </div>
  );
}

/**
 * Canvas 內：每格量像素比例（透視鏡頭在目標點距離 d 處，一單位＝畫面高 ÷ (2d·tan(fov/2)) 像素），
 * 算出 k，變了超過 1% 就改圖例 bar 的高度。要放在 Flows 之前，讓緞帶同一格就用到新的 k。
 */
export function ScaleProbe({ source, link }: { source: FlowSource; link: LegendLink }) {
  const controls = useThree((s) => s.controls) as unknown as { getTarget?: (out: Vector3) => Vector3 } | null;
  const T = useMemo(() => new Vector3(), []);
  const written = useRef<{ bars: (HTMLElement | null)[]; px: number }>({ bars: [], px: 0 });
  useFrame(({ camera, size }) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    if (controls?.getTarget) controls.getTarget(T);
    else T.set(0, 0, 0);
    const dist = Math.max(1e-3, camera.position.distanceTo(T));
    const px = size.height / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
    link.px = px;
    link.k = ribbonScale(px);
    const shown = px * link.k;
    const W = written.current;
    const same = link.bars.length === W.bars.length && link.bars.every((el, i) => el === W.bars[i]);
    if (same && Math.abs(shown - W.px) <= W.px * 0.01) return;
    W.bars = [...link.bars];
    W.px = shown;
    link.bars.forEach((el, i) => {
      if (el) el.style.height = `${barPx(source.legend[i], source.max, px, link.k).toFixed(1)}px`;
    });
  });
  return null;
}
