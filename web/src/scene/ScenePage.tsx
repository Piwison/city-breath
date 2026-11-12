// 首頁：微縮城市場景（2.3 基底：台北盆地與天光）＋行政區流向（3.5）＋時間軸（3.3）＋點行政區（3.6）。
// 底層：底座、地形台地、海、行政區薄片、河川、綠地、捷運路線、天空與光；上面是全市前 12 大流向。
// 點一區：區抬起、鏡頭飛過去、流向換成這區的去哪／誰來、站珠展開；下方時間軸換成行政區卡（點站換成車站小卡）。
// 車站柱與站珠（3.1）、建築與樹（3.13）；列車、地標等是之後的票。
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { DistrictCard } from "../card/DistrictCard";
import { StationCard } from "../card/StationCard";
import { loadBasemap, loadDistrictFlows, loadDistricts, loadMonths, loadStations } from "../data/load";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, LineId } from "../data/types";
import { baseView, flowSource, stationIndex, type BaseView, type FlowSource, type StationIndex } from "../data/views";
import { startClock } from "../state/clock";
import { setService } from "../state/service";
import { readQuery, syncUrl } from "../state/url";
import { setDayType, setPlaying, useView } from "../state/view";
import { Blocks } from "./Blocks";
import { CameraRig, type CameraLink } from "./CameraRig";
import { CommuteEntry } from "./CommuteEntry";
import { Daylight, type FrameLight } from "./Daylight";
import { DistrictLabelLayer, DistrictLabelProjector, type LabelBoard, type LabelEls } from "./DistrictLabels";
import { DistrictLift, type PressLink } from "./DistrictLift";
import { FlowLegend, ScaleProbe, type LegendLink } from "./FlowLegend";
import { FlowLabelLayer, Flows, type FlowLabelEls } from "./Flows";
import { lifts } from "./lift";
import { LayerPanel } from "./LayerPanel";
import { PeriodToast } from "./PeriodToast";
import { Plinth, plinthBox, type PlinthBox } from "./Plinth";
import { Rails } from "./Rails";
import { SceneBoundary, SceneFallback } from "./SceneFallback";
import { SelectionCamera, SelectionInput } from "./Selection";
import { Sky } from "./Sky";
import { SleepHint } from "./SleepHint";
import { StationLabelLayer, Stations, type StationLink } from "./Stations";
import { Terrain } from "./Terrain";
import { TimeBar } from "./TimeBar";
import { hasWebGL, prefersReducedMotion } from "./webgl";
import "./scene.css";

/** renderer 設定（AD-11）：NeutralToneMapping；不開 preserveDrawingBuffer（AD-17）。物件放模組層，避免每次重繪都重新套用。 */
const GL = { antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: NeutralToneMapping } as const;
const CAMERA = { fov: 38, near: 0.5, far: 900, position: [0, 90, 106] as [number, number, number] };

/** Canvas 內外共用、不經 React 的物件：標籤 DOM、標籤佔位與安全區、圖例與緞帶縮放、鏡頭按鈕、按壓、站珠位置。 */
interface Overlays {
  labels: LabelEls;
  flowLabels: FlowLabelEls;
  board: LabelBoard;
  legend: LegendLink;
  camera: CameraLink;
  press: PressLink;
  stations: StationLink;
}

function World({
  view,
  flows,
  stations,
  box,
  reduced,
  overlays,
}: {
  view: BaseView;
  flows: FlowSource;
  stations: StationIndex;
  box: PlinthBox;
  reduced: boolean;
  overlays: Overlays;
}) {
  const frame = useRef<FrameLight>({ t: -1, lighting: null });
  const showLabels = useView((s) => s.layers.label);
  // 手機上 2048 的陰影圖太吃記憶體與填充率（AD-6）；短邊 < 600px 用 1024
  const shadowMapSize = useThree((s) => (Math.min(s.size.width, s.size.height) < 600 ? 1024 : 2048));
  const farEdge = useMemo<[number, number, number]>(() => [box.cx, 0, box.cz - box.d / 2], [box]);
  const ids = useMemo(() => view.districts.map((d) => d.id), [view]);
  return (
    <>
      <Daylight frame={frame} shadowMapSize={shadowMapSize} />
      <Sky frame={frame} farEdge={farEdge} />
      <Plinth box={box} frame={frame} />
      <Terrain view={view} />
      {/* 選區的抬起與按壓（改 Terrain 的 district-<id> group），軌道、區名、站珠讀同一份高度 */}
      <DistrictLift view={view} reduced={reduced} link={overlays.press} />
      <Rails tracks={view.tracks} ids={ids} reduced={reduced} />
      {/* 先量縮放倍數（緞帶、光點、圖例同一格用），再畫流向；流向標籤先放，區名再避開它們 */}
      <ScaleProbe link={overlays.legend} />
      <Flows
        view={view}
        source={flows}
        labels={overlays.flowLabels}
        board={overlays.board}
        scale={overlays.legend}
        reduced={reduced}
      />
      {/* 車站柱（3.1）：站名在流向標籤之後、區名之前放（掛載順序＝useFrame 順序） */}
      <Stations
        view={view}
        index={stations}
        link={overlays.stations}
        board={overlays.board}
        scale={overlays.legend}
        reduced={reduced}
      />
      <DistrictLabelProjector view={view} els={overlays.labels} visible={showLabels} board={overlays.board} />
      <CameraRig reduced={reduced} box={box} link={overlays.camera} />
      <SelectionInput view={view} stations={overlays.stations} press={overlays.press} />
      <SelectionCamera view={view} index={stations} reduced={reduced} />
    </>
  );
}

type Loaded = {
  view: BaseView;
  flows: FlowSource;
  flowsFile: DistrictFlowsFile;
  districts: DistrictsFile;
  stations: StationIndex;
  lineNames: Map<LineId, string>;
  box: PlinthBox;
  month: string;
  /** 官方班距（第一班車約幾點，3.4） */
  headway: BasemapFile["headway"];
};

/** 下方：沒選東西時是時間軸；選了區是行政區卡、選了站是車站小卡（卡框與卡內時間列共用，打開就暫停）。 */
function Bottom({ data, legend }: { data?: Loaded; legend: LegendLink }) {
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  if (data && station) {
    const name = district ? data.districts.districts.find((d) => d.id === district)?.name : undefined;
    return <StationCard id={station} stations={data.stations} source={data.flows} lineNames={data.lineNames} districtName={name} />;
  }
  if (data && district)
    return (
      <DistrictCard
        id={district}
        flows={data.flowsFile}
        districts={data.districts}
        source={data.flows}
        stations={data.stations}
        legend={legend}
      />
    );
  return (
    <TimeBar month={data?.month} source={data?.flows}>
      <FlowLegend source={data?.flows} link={legend} />
    </TimeBar>
  );
}

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
      board: { rects: [], version: 0, stationRects: [], stationVersion: 0, safeTop: 0, safeBottom: Number.MAX_SAFE_INTEGER },
      legend: { bars: [], px: 4, k: 1 },
      camera: {},
      press: {},
      stations: { els: new Map(), spots: [] },
    }),
    [labels, flowLabels],
  );
  const showLabels = useView((s) => s.layers.label);
  const cardOpen = useView((s) => s.district !== null || s.station !== null);
  const top = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);

  // 開場讀網址（停在網址的時刻與日型），之後使用者操作後把 hour、dayType 寫回網址（AD-16）
  useEffect(() => {
    const q = readQuery(location.search);
    if (q.dayType) setDayType(q.dayType);
    startClock({ hour: q.hour, reducedMotion: reduced });
    return syncUrl();
  }, [reduced]);

  // 流向標籤的安全區：上方 HUD 的下緣到時間軸（或小卡）的上緣；畫面、HUD 大小變了或換成小卡就重量
  useEffect(() => {
    const bottom = () => dock.current?.querySelector<HTMLElement>(".scene-dock, .card") ?? null;
    const measure = () => {
      const t = top.current?.getBoundingClientRect();
      const d = bottom()?.getBoundingClientRect();
      overlays.board.safeTop = t ? Math.round(t.bottom) + 6 : 0;
      overlays.board.safeBottom = d ? Math.round(d.top) - 6 : innerHeight;
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [top.current, bottom()]) if (el) ro.observe(el);
    addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      removeEventListener("resize", measure);
    };
  }, [overlays, cardOpen, data]);

  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    loadMonths()
      .then(({ latest }) => Promise.all([loadBasemap(), loadDistricts(latest), loadDistrictFlows(latest), loadStations(latest)]))
      .then(([basemap, districts, flows, stations]) => {
        if (!alive) return;
        if (flows.month !== districts.month || stations.month !== districts.month)
          throw new Error(`district-flows.json、stations.json 與 districts.json 的月份不同`);
        const view = baseView(basemap, districts);
        setData({
          view,
          flows: flowSource(flows),
          flowsFile: flows,
          districts,
          stations: stationIndex(stations, basemap.stationLines),
          lineNames: new Map(basemap.lines.map((l) => [l.id, l.name])),
          box: plinthBox(view.bbox),
          month: districts.month,
          headway: basemap.headway,
        });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [webgl]);

  // 營運時段（3.4）：停駛只看流向資料（AD-5）、第一班車看官方班距；場景與提示從 state/service.ts 讀
  useEffect(() => {
    if (!data) return;
    setService({ isOpen: data.flows.operating, headway: data.headway });
    return () => setService(null);
  }, [data]);

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
            aria-label={`臺北盆地的微縮模型：地形、海、河川、綠地、捷運路線、示意的建築與樹、依此刻進出人數升降的車站柱，以及 ${data.month} 各行政區之間人數最多的流向；點一個行政區看這區的人去哪、誰來這裡，放大後可點車站`}
            role="img"
            onPointerDown={() => setPlaying(false)}
          >
            <World
              view={data.view}
              flows={data.flows}
              stations={data.stations}
              box={data.box}
              reduced={reduced}
              overlays={overlays}
            />
            {/* 選區時建築與樹跟著區一起彈起（DistrictLift 寫 lifts.ref） */}
            <Blocks view={data.view} month={data.month} reduced={reduced} lift={lifts.ref} />

          </Canvas>
        )}
      </SceneBoundary>
      {data && <DistrictLabelLayer view={data.view} els={labels} visible={showLabels} />}
      {data && <StationLabelLayer index={data.stations} link={overlays.stations} />}
      {data && <FlowLabelLayer els={flowLabels} />}
      {data && <PeriodToast source={data.flows} />}
      {data && <SleepHint />}
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
        <Bottom data={data} legend={overlays.legend} />
      </div>
    </main>
  );
}
