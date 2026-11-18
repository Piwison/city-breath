// 首頁：微縮城市場景（2.3 基底：台北盆地與天光）＋行政區流向（3.5）＋時間軸（3.3）＋點行政區（3.6）。
// 底層：底座、地形台地、海、行政區薄片、河川、綠地、捷運路線、天空與光；上面是全市前 12 大流向。
// 點一區：區抬起、鏡頭飛過去、流向換成這區的去哪／誰來、站珠展開；下方時間軸換成行政區卡（點站換成車站小卡）。
// 車站柱與站珠（3.1）、建築與樹（3.13）；點站開車站卡、流向換成這站前 5 目的地的站對站緞帶（3.12）。列車與雲（3.14，示意）；地標等是之後的票。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { bootDone } from "../boot";
import { DistrictCard } from "../card/DistrictCard";
import { StationCard } from "../card/StationCard";
import { loadBasemap, loadDistrictFlows, loadDistricts, loadMonths, loadStations } from "../data/load";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, LineId } from "../data/types";
import { baseView, flowSource, stationIndex, type BaseView, type FlowSource, type StationIndex } from "../data/views";
import { startClock } from "../state/clock";
import { setService } from "../state/service";
import { clearViewQuery, parseQuery, perfDebug, planLink, syncUrl, type ParsedQuery } from "../state/url";
import { getView, restoreSelection, setDayType, setMonth, setPlaying, useView } from "../state/view";
import { monthLabel } from "../card/DistrictCard";
import { whenLabel } from "../data/periods";
import { SharePanel, ShareIcon, type ShareTarget } from "../share/SharePanel";
import { Blocks } from "./Blocks";
import { CameraRig, type CameraLink } from "./CameraRig";
import { Clouds } from "./Clouds";
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
import { Trains } from "./Trains";
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
  headway,
  box,
  reduced,
  overlays,
}: {
  view: BaseView;
  flows: FlowSource;
  stations: StationIndex;
  headway: BasemapFile["headway"];
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
      {/* 列車（3.14，示意）：在車站之前掛，第一班車的波紋在同一格交給站珠 */}
      <Trains tracks={view.tracks} headway={headway} ids={ids} reduced={reduced} />
      {/* 先量縮放倍數（緞帶、光點、圖例同一格用），再畫流向；流向標籤先放，區名再避開它們 */}
      <ScaleProbe link={overlays.legend} />
      <Flows
        view={view}
        source={flows}
        stations={stations}
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
      <Clouds box={box} reduced={reduced} />
      <DistrictLabelProjector view={view} els={overlays.labels} visible={showLabels} board={overlays.board} />
      <CameraRig reduced={reduced} box={box} link={overlays.camera} />
      <SelectionInput view={view} stations={overlays.stations} press={overlays.press} />
      <SelectionCamera view={view} index={stations} reduced={reduced} />
    </>
  );
}

// 6.4 真機實測：`?debug=perf` 才動態載入效能面板（Canvas 內的探針＋Canvas 外的面板，同一個分包）；
// 沒帶時不抓那個分包（scripts/check-build.mjs 檢查面板程式不在首包與這個分包裡）。
const loadPerf = () => import("../debug/PerfPanel");
const PerfProbe = lazy(() => loadPerf().then((m) => ({ default: m.PerfProbe })));
const PerfPanel = lazy(() => loadPerf().then((m) => ({ default: m.PerfPanel })));

/** 場景畫出第一格後收起品牌載入畫面（6.2）：再等一個 rAF，確定這一格已經上螢幕。 */
function FirstFrame() {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    requestAnimationFrame(() => bootDone());
  });
  return null;
}

type Loaded = {
  view: BaseView;
  flows: FlowSource;
  flowsFile: DistrictFlowsFile;
  districts: DistrictsFile;
  stations: StationIndex;
  lineNames: Map<LineId, string>;
  /** 行政區代碼 → 名稱（車站卡的所在區、去哪幾區） */
  districtNames: Map<string, string>;
  box: PlinthBox;
  month: string;
  /** 官方班距（第一班車約幾點，3.4） */
  headway: BasemapFile["headway"];
  /** months.json 列的所有月份（分享連結的月份檢查，3.15） */
  months: string[];
};

/** 上方「分享這一刻」（3.15，DESIGN.md 上方一排）：沒開卡時才有；按了停在這一刻、開分享面板（只有複製連結）。 */
function ShareMoment({ month }: { month?: string }) {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const cardOpen = useView((s) => s.district !== null || s.station !== null);
  if (cardOpen && !target) return null;
  const open = () => {
    // 停在這一刻再讀時刻（播放中按也分享畫面上的那一小時）
    setPlaying(false);
    const v = getView();
    const when = whenLabel(v.dayType, v.hour);
    setTarget({
      kicker: "全城",
      title: month ? `台北捷運・${monthLabel(month)}` : "台北捷運",
      when,
      summary: `${when}的台北捷運：各行政區之間，每小時誰去了哪。`,
    });
  };
  return (
    <>
      <button type="button" className="hud scene-share-btn" aria-label="分享這一刻" title="分享這一刻" aria-haspopup="dialog" disabled={!month} onClick={open}>
        <ShareIcon />
        <span>分享這一刻</span>
      </button>
      {target && <SharePanel open target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

/** 打開的連結有問題時的說明（3.15）：點 × 才收。 */
function LinkNotice({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="hud scene-notice" role="status">
      <p>{text}</p>
      <button type="button" aria-label="知道了，關閉說明" onClick={onClose}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/** 下方：沒選東西時是時間軸；選了區是行政區卡、選了站是車站小卡（卡框與卡內時間列共用，打開就暫停）。 */
function Bottom({ data, legend }: { data?: Loaded; legend: LegendLink }) {
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  if (data && station)
    return (
      <StationCard
        key={station}
        id={station}
        stations={data.stations}
        source={data.flows}
        lineNames={data.lineNames}
        districtNames={data.districtNames}
        backTo={district ? data.districtNames.get(district) : undefined}
        legend={legend}
      />
    );
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
      <FlowLegend source={data?.flows} stations={data?.stations} link={legend} />
    </TimeBar>
  );
}

export default function ScenePage() {
  const [webgl] = useState(hasWebGL);
  const [reduced] = useState(prefersReducedMotion);
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [perf] = useState(() => perfDebug());
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
  const sheet = useView((s) => s.sheet);
  const top = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);

  // 開場讀網址（AD-16）：停在網址的時刻與日型；任一鍵不合法就照常從清晨播放（資料到了再退回全景並說明）。
  // 區與站要等資料載入後才查得到在不在（下一個 effect）；網址的寫回（syncUrl）也等還原完才開始，免得先把區與站洗掉。
  const link = useRef<ParsedQuery | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const q = parseQuery(location.search);
    link.current = q;
    const bad = q.invalid.length > 0;
    if (q.state.dayType && !bad) setDayType(q.state.dayType);
    startClock({ hour: bad ? undefined : q.state.hour, reducedMotion: reduced });
  }, [reduced]);

  // 資料到了：還原連結裡的區與站（開好那張卡、暫停在那一刻），或退回全景並說明（3.15）
  useEffect(() => {
    if (!data) return;
    setMonth(data.month);
    const q = link.current ?? parseQuery(location.search);
    const plan = planLink(q, {
      months: data.months,
      latest: data.month,
      hasDistrict: (id) => data.districtNames.has(id),
      hasStation: (id) => data.stations.byId.has(id),
    });
    if (plan.kind === "fallback") {
      // 退回首頁全景：不選區站、照常從清晨播放，網址拿掉看不懂的部分
      restoreSelection(null, null);
      setDayType("weekday");
      if (!getView().playing) startClock({ reducedMotion: reduced });
      clearViewQuery();
      setNotice("這個連結裡的站、行政區或時段在資料裡找不到，先帶你看全城。");
    } else if (plan.kind === "restore") {
      restoreSelection(plan.district, plan.station);
      if (plan.staleMonth)
        setNotice(`這個連結是 ${monthLabel(plan.staleMonth)}的，網站顯示的是最新的 ${monthLabel(data.month)}資料。`);
    }
    return syncUrl();
  }, [data, reduced]);

  // 流向標籤的安全區：上方 HUD 的下緣到時間軸（或小卡）的上緣；畫面、HUD 大小變了或換成小卡就重量。
  // 小卡兩段高度（3.22）只動 transform（大小不變），所以換段、拖曳結束與滑動結束（transitionend）也重量：標籤讓路到卡片上方
  // 時要跟著卡片的上緣（體驗原則 5）。
  useEffect(() => {
    const bottom = () => dock.current?.querySelector<HTMLElement>(".scene-dock, .card") ?? null;
    const measure = () => {
      const t = top.current?.getBoundingClientRect();
      const d = bottom()?.getBoundingClientRect();
      overlays.board.safeTop = t ? Math.round(t.bottom) + 6 : 0;
      overlays.board.safeBottom = d ? Math.round(d.top) - 6 : innerHeight;
      // 停駛提示放在時間軸（或小卡）正上方（決定 8）：畫面底到它上緣的距離交給 CSS
      if (d) main.current?.style.setProperty("--dock-top", `${Math.round(innerHeight - d.top)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [top.current, bottom()]) if (el) ro.observe(el);
    addEventListener("resize", measure);
    const d = dock.current;
    d?.addEventListener("transitionend", measure);
    d?.addEventListener("pointerup", measure);
    return () => {
      ro.disconnect();
      removeEventListener("resize", measure);
      d?.removeEventListener("transitionend", measure);
      d?.removeEventListener("pointerup", measure);
    };
  }, [overlays, cardOpen, sheet, data]);

  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    let monthsList: string[] = [];
    loadMonths()
      .then(({ latest, months }) => {
        monthsList = months;
        return Promise.all([loadBasemap(), loadDistricts(latest), loadDistrictFlows(latest), loadStations(latest)]);
      })
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
          districtNames: new Map(districts.districts.map((d) => [d.id, d.name])),
          box: plinthBox(view.bbox),
          month: districts.month,
          headway: basemap.headway,
          months: monthsList,
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

  // 資料載入失敗：收起品牌載入畫面，露出錯誤訊息（整頁錯誤畫面在 6.5；不支援 WebGL 由 SceneFallback 收）
  useEffect(() => {
    if (error) bootDone();
  }, [error]);

  if (!webgl) return <SceneFallback />;

  return (
    <main ref={main} className="scene-page">
      <SceneBoundary>
        {data && (
          <Canvas
            className="scene-canvas"
            dpr={[1, 2]}
            shadows="percentage"
            gl={GL}
            camera={CAMERA}
            aria-label={`臺北盆地的微縮模型：地形、海、河川、綠地、捷運路線、示意的建築與樹、示意的列車（間隔依官方班距）與飄過的雲、依這小時進出人數升降的車站柱（放大或點一區才出現），以及 ${data.month} 各行政區之間人數最多的流向；點一個行政區看這區的人去哪、誰來這裡，放大後可點車站`}
            role="img"
            onPointerDown={() => setPlaying(false)}
          >
            <World
              view={data.view}
              flows={data.flows}
              stations={data.stations}
              headway={data.headway}
              box={data.box}
              reduced={reduced}
              overlays={overlays}
            />
            {/* 選區時建築與樹跟著區一起彈起（DistrictLift 寫 lifts.ref） */}
            <Blocks view={data.view} month={data.month} reduced={reduced} lift={lifts.ref} />
            <FirstFrame />
            {perf && (
              <Suspense fallback={null}>
                <PerfProbe />
              </Suspense>
            )}
          </Canvas>
        )}
      </SceneBoundary>
      {data && <DistrictLabelLayer view={data.view} els={labels} visible={showLabels} />}
      {data && <StationLabelLayer index={data.stations} link={overlays.stations} />}
      {data && <FlowLabelLayer els={flowLabels} />}
      {data && <PeriodToast source={data.flows} />}
      {data && <SleepHint />}
      {data && perf && (
        <Suspense fallback={null}>
          <PerfPanel />
        </Suspense>
      )}
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
        <ShareMoment month={data?.month} />
        <LayerPanel />
        {notice && <LinkNotice text={notice} onClose={() => setNotice(null)} />}
      </div>
      <div ref={dock}>
        <Bottom data={data} legend={overlays.legend} />
      </div>
    </main>
  );
}
