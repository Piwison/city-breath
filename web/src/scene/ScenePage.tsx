// 首頁：微縮城市場景（2.3 基底：台北盆地與天光）＋行政區流向（3.5）＋時間軸（3.3）。
// 底層：底座、地形台地、海、行政區薄片、河川、綠地、捷運路線、天空與光；上面是全市前 12 大流向。
// 建築、車站、列車、點行政區等是之後的票。
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { loadBasemap, loadDistrictFlows, loadDistricts, loadMonths } from "../data/load";
import { baseView, flowSource, type BaseView, type FlowSource } from "../data/views";
import { startClock } from "../state/clock";
import { readQuery, syncUrl } from "../state/url";
import { setDayType, setPlaying, useView } from "../state/view";
import { Blocks } from "./Blocks";
import { CameraRig, type CameraLink } from "./CameraRig";
import { CommuteEntry } from "./CommuteEntry";
import { Daylight, type FrameLight } from "./Daylight";
import { DistrictLabelLayer, DistrictLabelProjector, type LabelBoard, type LabelEls } from "./DistrictLabels";
import { FlowLegend, ScaleProbe, type LegendLink } from "./FlowLegend";
import { FlowLabelLayer, Flows, type FlowLabelEls } from "./Flows";
import { LayerPanel } from "./LayerPanel";
import { PeriodToast } from "./PeriodToast";
import { Plinth, plinthBox, type PlinthBox } from "./Plinth";
import { Rails } from "./Rails";
import { SceneBoundary, SceneFallback } from "./SceneFallback";
import { Sky } from "./Sky";
import { Terrain } from "./Terrain";
import { TimeBar } from "./TimeBar";
import { hasWebGL, prefersReducedMotion } from "./webgl";
import "./scene.css";

/** renderer 設定（AD-11）：NeutralToneMapping；不開 preserveDrawingBuffer（AD-17）。物件放模組層，避免每次重繪都重新套用。 */
const GL = { antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: NeutralToneMapping } as const;
const CAMERA = { fov: 38, near: 0.5, far: 900, position: [0, 90, 106] as [number, number, number] };

/** Canvas 內外共用、不經 React 的物件：標籤 DOM、標籤佔位與安全區、圖例與緞帶縮放、鏡頭按鈕。 */
interface Overlays {
  labels: LabelEls;
  flowLabels: FlowLabelEls;
  board: LabelBoard;
  legend: LegendLink;
  camera: CameraLink;
}

function World({
  view,
  flows,
  box,
  reduced,
  overlays,
}: {
  view: BaseView;
  flows: FlowSource;
  box: PlinthBox;
  reduced: boolean;
  overlays: Overlays;
}) {
  const frame = useRef<FrameLight>({ t: -1, lighting: null });
  const showLabels = useView((s) => s.layers.label);
  // 手機上 2048 的陰影圖太吃記憶體與填充率（AD-6）；短邊 < 600px 用 1024
  const shadowMapSize = useThree((s) => (Math.min(s.size.width, s.size.height) < 600 ? 1024 : 2048));
  const farEdge = useMemo<[number, number, number]>(() => [box.cx, 0, box.cz - box.d / 2], [box]);
  return (
    <>
      <Daylight frame={frame} shadowMapSize={shadowMapSize} />
      <Sky frame={frame} farEdge={farEdge} />
      <Plinth box={box} frame={frame} />
      <Terrain view={view} />
      <Rails tracks={view.tracks} />
      {/* 先量縮放倍數（緞帶、光點、圖例同一格用），再畫流向；流向標籤先放，區名再避開它們 */}
      <ScaleProbe link={overlays.legend} />
      <Flows
        view={view}
        source={flows}
        labels={overlays.flowLabels}
        board={overlays.board}
        scale={overlays.legend}
      />
      <DistrictLabelProjector view={view} els={overlays.labels} visible={showLabels} board={overlays.board} />
      <CameraRig reduced={reduced} box={box} link={overlays.camera} />
    </>
  );
}

type Loaded = { view: BaseView; flows: FlowSource; box: PlinthBox; month: string };

export default function ScenePage() {
  const [webgl] = useState(hasWebGL);
  const [reduced] = useState(prefersReducedMotion);
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const labels: LabelEls = useRef<(HTMLDivElement | null)[]>([]);
  const flowLabels: FlowLabelEls = useRef<(HTMLDivElement | null)[]>([]);
  const overlays = useMemo<Overlays>(
    () => ({
      labels,
      flowLabels,
      board: { rects: [], version: 0, safeTop: 0, safeBottom: Number.MAX_SAFE_INTEGER },
      legend: { bars: [], px: 4, k: 1 },
      camera: {},
    }),
    [labels, flowLabels],
  );
  const showLabels = useView((s) => s.layers.label);
  const top = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);

  // 開場讀網址（停在網址的時刻與日型），之後畫面狀態的 hour、dayType 寫回網址（AD-16）
  useEffect(() => {
    const q = readQuery(location.search);
    if (q.dayType) setDayType(q.dayType);
    startClock({ hour: q.hour, reducedMotion: reduced });
    return syncUrl();
  }, [reduced]);

  // 流向標籤的安全區：上方 HUD 的下緣到時間軸的上緣；畫面或 HUD 大小變了就重量
  useEffect(() => {
    const measure = () => {
      const t = top.current?.getBoundingClientRect();
      const d = dock.current?.querySelector(".scene-dock")?.getBoundingClientRect();
      overlays.board.safeTop = t ? Math.round(t.bottom) + 6 : 0;
      overlays.board.safeBottom = d ? Math.round(d.top) - 6 : innerHeight;
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [top.current, dock.current?.querySelector(".scene-dock")]) if (el) ro.observe(el);
    addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      removeEventListener("resize", measure);
    };
  }, [overlays]);

  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    loadMonths()
      .then(({ latest }) => Promise.all([loadBasemap(), loadDistricts(latest), loadDistrictFlows(latest)]))
      .then(([basemap, districts, flows]) => {
        if (!alive) return;
        if (flows.month !== districts.month) throw new Error(`district-flows.json 與 districts.json 的月份不同`);
        const view = baseView(basemap, districts);
        setData({ view, flows: flowSource(flows), box: plinthBox(view.bbox), month: districts.month });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [webgl]);

  if (!webgl) return <SceneFallback />;

  return (
    <main className="scene-page">
      <SceneBoundary>
        {data && (
          <Canvas
            className="scene-canvas"
            dpr={[1, 2]}
            shadows="percentage"
            gl={GL}
            camera={CAMERA}
            aria-label={`臺北盆地的微縮模型：地形、海、河川、綠地、捷運路線、示意的建築與樹，以及 ${data.month} 各行政區之間人數最多的流向`}
            role="img"
            onPointerDown={() => setPlaying(false)}
          >
            <World view={data.view} flows={data.flows} box={data.box} reduced={reduced} overlays={overlays} />
            <Blocks view={data.view} month={data.month} reduced={reduced} />
          </Canvas>
        )}
      </SceneBoundary>
      {data && <DistrictLabelLayer view={data.view} els={labels} visible={showLabels} />}
      {data && <FlowLabelLayer els={flowLabels} />}
      {data && <PeriodToast source={data.flows} />}
      {!data && !error && <p className="scene-status">載入台北盆地中…</p>}
      {error && (
        <p className="scene-status" role="alert">
          資料載入失敗：{error}
        </p>
      )}
      <div ref={top} className="scene-top">
        <CommuteEntry />
        <button
          type="button"
          className="hud scene-home-btn"
          aria-label="回到全景"
          title="回到全景"
          disabled={!data}
          onClick={() => overlays.camera.home?.()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="8" r="1.8" fill="currentColor" />
          </svg>
        </button>
        <LayerPanel />
      </div>
      <div ref={dock}>
        <TimeBar month={data?.month} source={data?.flows}>
          <FlowLegend source={data?.flows} link={overlays.legend} />
        </TimeBar>
      </div>
    </main>
  );
}
