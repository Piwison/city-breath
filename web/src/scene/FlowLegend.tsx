// 流向的文字圖例（3.24 起在首頁「⋯更多」的「怎麼看這張圖」，小卡底部照放）：顏色代表什麼（依模式換字，3.3／走查 F5）、線寬＝每小時人次（三段，用 views.ts 同一個 ribbonWidth）、
// 一顆光點＝N 人；靜態模式時光點換成光帶，最後一段改成光帶三級（views.ts bandCuts、BAND_W）。
// 3.21：選區、選站時線寬用畫面上最大的那條當最粗，圖例寫「最粗 N 人」（決定 7，flowNow.ts 與緞帶同一份）；
// 加一行柱高「柱子越高人越多」（決定 4，不寫倍數）。
// 粗細要和畫面一致：ScaleProbe 在 Canvas 裡每格依目前鏡頭算「鏡頭看著的那一點，一個場景單位是幾像素」與
// 緞帶縮放倍數 k（views.ts ribbonScale：放大時最粗的緞帶不超過 RIBBON_MAX_PX），緞帶、光帶、光點與圖例共用同一組值；
// 每個 bar 的場景寬放在 data-w，高度直接改 DOM，不經 React。
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { formatCount, formatNumber } from "../data/format";
import { BAND_W, bandCuts, FLOW_KEYS, ribbonScale, ribbonWidth, type FlowSource, type StationIndex } from "../data/views";
import { useView } from "../state/view";
import { useFlowNow } from "./flowNow";

/** Canvas 內外共用的一個物件：圖例 bar 的 DOM、量到的像素比例與緞帶縮放倍數。 */
export interface LegendLink {
  bars: (HTMLElement | null)[];
  /** 鏡頭看著的那一點，一個場景單位約幾像素 */
  px: number;
  /** 緞帶、光點、圖例共用的縮放倍數（0–1] */
  k: number;
}

const MIN_PX = 1.5;
const barPx = (w: number, px: number, k: number) => Math.max(MIN_PX, w * px * k);
const people = (v: number) => (v >= 1000 && v % 100 === 0 ? `${v / 1000} 千` : fmt(v));
const fmt = (n: number) => formatNumber(n);
/** 光帶圖例的短寫（手機一行放得下）：2000 → 2千；不是整百的照寫人數 */
const short = (v: number) => (v >= 1000 && v % 100 === 0 ? `${v / 1000}千` : String(Math.round(v)));

/**
 * 柱高（決定 4、22 的文字圖例）：維持平方根，只寫「越高人越多」、不寫倍數。
 * 全城視角不畫站柱（決定 3），所以補一句放大或選區才出現。
 */
const PILLAR_ROW = (
  <div className="lrow">
    <span className="item">
      <i className="pillark" aria-hidden="true" />
      柱子越高人越多（車站這小時進出，放大或選區才出現）
    </span>
  </div>
);

export function FlowLegend({ source, stations, link }: { source?: FlowSource; stations?: StationIndex; link: LegendLink }) {
  const on = useView((s) => s.layers.flow);
  const still = useView((s) => s.still);
  // 選了區或站：圖例換成那個模式（藍＝這區的人去哪、橘紅＝誰來這裡，走查 F5），線寬與光點換算用畫面上那一組（flowNow.ts）
  const flow = useFlowNow(source, stations);
  if (!source || !flow) return <div className="legend" />;
  if (!on)
    return (
      <div className="legend">
        流向已關閉，可從「⋯更多」的「圖層」打開
        {PILLAR_ROW}
      </div>
    );
  const { mode, now, scale } = flow;
  if (now.flows === null)
    return (
      <div className="legend">
        停止營運：這個時段沒有列車
        {PILLAR_ROW}
      </div>
    );
  if (now.flows.length === 0)
    return (
      <div className="legend">
        {mode === "city" ? "這一小時，各區之間的流向都少於 10 人" : mode === "district" ? "這一小時，這區往來各區都少於 10 人" : "這一小時，從這站出發的每個方向都少於 10 人，或還在載入"}
        {PILLAR_ROW}
      </div>
    );
  link.bars.length = 0;
  let n = 0;
  const bar = (w: number, cls: string) => {
    const i = n++;
    return (
      <i
        className={cls}
        aria-hidden="true"
        data-w={w}
        ref={(el) => {
          link.bars[i] = el;
        }}
        style={{ height: `${barPx(w, link.px, link.k).toFixed(1)}px` }}
      />
    );
  };
  const [a, b] = bandCuts(scale.legend);
  // 選區、選站（決定 7）：最粗的那條就是畫面上最大的流向，寫它的人數；前面再放一段對照（相同就不放）
  const widths: { v: number; label: string }[] = scale.local
    ? [
        ...(scale.legend[1] < scale.max ? [{ v: scale.legend[1], label: people(scale.legend[1]) }] : []),
        { v: scale.max, label: `最粗 ${formatCount(scale.max)}` },
      ]
    : scale.legend.map((v) => ({ v, label: people(v) }));
  return (
    <div className="legend" aria-label="流向圖例">
      <div className="lrow">
        <span>線寬＝每小時人次</span>
        {widths.map(({ v, label }, k) => (
          <span className="item" key={k}>
            {bar(ribbonWidth(v, scale.max), "bar")}
            <span className="num">{label}</span>
          </span>
        ))}
      </div>
      <div className="lrow">
        {FLOW_KEYS[mode].map((key) => (
          <span className="item key" key={key.token}>
            <i className="sw" aria-hidden="true" style={{ background: `var(${key.token})` }} />
            {key.label}
          </span>
        ))}
        <span className="sep" aria-hidden="true" />
        {still ? (
          <>
            <span>光帶</span>
            <span className="item">
              {bar(BAND_W[1], "bandk")}
              <span className="num">&lt;{short(a)}</span>
            </span>
            <span className="item">
              {bar(BAND_W[2], "bandk")}
              <span className="num">
                {short(a).replace(/千$/, "")}–{short(b)}
              </span>
            </span>
            <span className="item">
              {bar(BAND_W[3], "bandk")}
              <span className="num">≥{short(b)}</span>
            </span>
          </>
        ) : (
          <span className="item">
            <i className="dotk" aria-hidden="true" />
            一顆光點＝{now.perDot} 人
          </span>
        )}
      </div>
      {PILLAR_ROW}
    </div>
  );
}

/**
 * Canvas 內：每格量像素比例（透視鏡頭在目標點距離 d 處，一單位＝畫面高 ÷ (2d·tan(fov/2)) 像素），
 * 算出 k，變了超過 1% 就改圖例 bar 的高度。要放在 Flows 之前，讓緞帶同一格就用到新的 k。
 */
export function ScaleProbe({ link }: { link: LegendLink }) {
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
    for (const el of link.bars) if (el) el.style.height = `${barPx(Number(el.dataset.w), px, link.k).toFixed(1)}px`;
  });
  return null;
}
