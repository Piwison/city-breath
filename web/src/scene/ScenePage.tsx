// 首頁：微縮城市場景（2.3 基底：台北盆地與天光）＋行政區流向（3.5）＋時間軸（3.3）＋點行政區（3.6）。
// 底層：底座、地形台地、海、行政區薄片、河川、綠地、捷運路線、天空與光；上面是全市前 12 大流向。
// 點一區：區抬起、鏡頭飛過去、流向換成這區的去哪／誰來、站珠展開；下方時間軸換成行政區卡（點站換成車站小卡）。
// 車站柱與站珠（3.1）、建築與樹（3.13）；點站開車站卡、流向換成這站前 5 目的地的站對站緞帶（3.12）。列車與雲（3.14，示意）；地標等是之後的票。
// 搭乘模式第 0 期（8.6）：首頁底座的「搭板南線」或板南線車站卡的「搭這條線」上車；鏡頭沿真實軌道走（RideCamera），
// 行進中畫面上只有暫停、下一站、下車三顆（先玩，再給資訊），停靠才開那站的車站卡；首頁其他控制、標籤與流向收起。
// 碰到場景或卡片就暫停搭乘。到終點時控制列多一顆分享、按下車換成「在 X 下車」小卡（分享＋回到首頁）（3.24）。
// 首頁三條路（3.24，原型 C「一個底座」）：沒開卡時下方只有底座（HomeDeck.tsx）——看城市呼吸的時間軸、
// 找你的站｜搭板南線｜⋯更多；「回到全景」只在鏡頭動過或選了東西時貼在底座或小卡右上方。上方不再放按鈕。
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { bootDone } from "../boot";
import { CommuteCard } from "../card/CommuteCard";
import { DistrictCard } from "../card/DistrictCard";
import { StationCard } from "../card/StationCard";
import { loadBasemap, loadDistrictFlows, loadDistricts, loadMonths, loadStations } from "../data/load";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, LineId } from "../data/types";
import { baseView, flowSource, stationIndex, type BaseView, type FlowSource, type StationIndex } from "../data/views";
import { pickHour, startClock } from "../state/clock";
import { atLineEnd, canRide, endRide, leaveRide, nextStop, pauseRide, restoreRide, setRideRoute, startRide, toggleRide } from "../state/ride";
import { setService } from "../state/service";
import { clearViewQuery, parseQuery, perfDebug, planLink, syncUrl, type ParsedQuery } from "../state/url";
import { commuteReady, getView, restoreCommute, restoreSelection, setDayType, setMonth, setPlaying, useView, type ViewState } from "../state/view";
import { useMeta } from "../data/useMeta";
import { monthLabel } from "../card/DistrictCard";
import { searchModel, type SearchModel } from "../data/stationSearch";
import { FindStation } from "../find/FindStation";
import { startSearch } from "../find/StationSearch";
import { Blocks } from "./Blocks";
import { CameraRig, type CameraLink } from "./CameraRig";
import { Clouds } from "./Clouds";
import { Daylight, type FrameLight } from "./Daylight";
import { DistrictLabelLayer, DistrictLabelProjector, type LabelBoard, type LabelEls } from "./DistrictLabels";
import { DistrictLift, type PressLink } from "./DistrictLift";
import { ScaleProbe, type LegendLink } from "./FlowLegend";
import { FlowLabelLayer, Flows, type FlowLabelEls } from "./Flows";
import { lifts } from "./lift";
import { HomeDeck, RecenterButton, RideEnd, RideShare } from "./HomeDeck";
import { PeriodToast } from "./PeriodToast";
import { Plinth, plinthBox, type PlinthBox } from "./Plinth";
import { Rails } from "./Rails";
import { RideCamera } from "./RideCamera";
import { buildRidePath, type RidePath } from "./ridePath";
import { SceneBoundary, SceneFallback } from "./SceneFallback";
import { SelectionCamera, SelectionInput } from "./Selection";
import { Sky } from "./Sky";
import { SleepHint } from "./SleepHint";
import { StationLabelLayer, Stations, type StationLink } from "./Stations";
import { Terrain } from "./Terrain";
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
  ride,
}: {
  view: BaseView;
  flows: FlowSource;
  stations: StationIndex;
  headway: BasemapFile["headway"];
  box: PlinthBox;
  reduced: boolean;
  overlays: Overlays;
  ride: RidePath | null;
}) {
  const frame = useRef<FrameLight>({ t: -1, lighting: null });
  // 搭乘中不標區名（行進中不給資訊，8.6）
  const showLabels = useView((s) => s.layers.label && s.ride === null);
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
      <RideCamera path={ride} view={view} reduced={reduced} />
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
  /** 「找你的站」的搜尋模型（4.1：依路線分組、站序照路線） */
  search: SearchModel;
  /** 搭乘模式（8.6）：板南線的真實軌道路徑與停靠站；建不出來是 null（不出搭乘入口） */
  ride: RidePath | null;
};

/** 搭乘模式第 0 期只開板南線（8.6）。 */
const RIDE_LINE: LineId = "BL";

/** 有小卡開著（行政區卡、車站卡，或蓋在最上面的通勤卡 4.2）。 */
const anyCard = (s: ViewState) => s.district !== null || s.station !== null || commuteReady(s.commute);

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

/** 首頁的通勤卡（4.2）：meta.json 用到才載（分享卡頁尾）；換了起訖就重開一張。 */
function SceneCommuteCard({ data, commute }: { data: Loaded; commute: { o: string; d: string; h: number } }) {
  const meta = useMeta(data.month);
  return (
    <CommuteCard
      key={`${commute.o}>${commute.d}`}
      commute={commute}
      month={data.month}
      stations={data.stations.stations}
      byId={data.stations.byId}
      meta={meta.status === "ok" ? meta.meta : undefined}
    />
  );
}

/** 首頁的暫時 UI 狀態（ScenePage 持有，不進網址、不保存）：搜尋面板與更多清單開不開（3.24）。 */
interface HomeUi {
  searching: boolean;
  setSearching: (open: boolean) => void;
  menu: boolean;
  setMenu: (open: boolean) => void;
}

/**
 * 下方：沒選東西時是首頁底座（3.24：時間軸＋三條路）；選了區是行政區卡、選了站是車站小卡（卡框與卡內時間列共用，打開就暫停）。
 * 通勤的起訖選齊了，通勤卡蓋在最上面（4.2）；關掉回到底下原本的車站卡、行政區卡或底座。
 */
function Bottom({ data, legend, calm, ui }: { data?: Loaded; legend: LegendLink; calm: boolean; ui: HomeUi }) {
  const district = useView((s) => s.district);
  const station = useView((s) => s.station);
  const commute = useView((s) => s.commute);
  const riding = useView((s) => s.ride !== null);
  if (data && commuteReady(commute)) return <SceneCommuteCard data={data} commute={commute} />;
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
        // 搭乘中流向不畫（8.6），卡底的緞帶圖例也不放
        legend={riding ? undefined : legend}
        // 板南線車站卡的「搭這條線」（8.6）：這站在搭乘路線上、還沒在搭
        rideLine={!riding && canRide(RIDE_LINE, station) ? RIDE_LINE : undefined}
        onRide={() => startRide(station, calm)}
      />
    );
  // 搭乘行進中：沒有卡片、沒有時間軸（先玩，再給資訊）
  if (riding) return null;
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
    <HomeDeck
      month={data?.month}
      source={data?.flows}
      stations={data?.stations}
      legend={legend}
      rideReady={!!data?.ride}
      findReady={!!data}
      onRide={() => startRide(undefined, calm)}
      onFind={() => startSearch(() => ui.setSearching(true))}
      menu={ui.menu}
      onMenu={ui.setMenu}
      // 搜尋面板、通勤面板（還在選起訖）蓋著時收起底座
      hidden={ui.searching || commute !== null}
    />
  );
}

/**
 * 搭乘中的三顆控制（8.6）：暫停／繼續、下一站、下車，點擊目標 --tap；停靠開卡時在卡片上方，行進中在畫面下方。
 * 畫面上不出現站名與數字；到站時給螢幕閱讀器一句「停靠 X」（看不到的 live region）。
 */
function RideControls({ data, calm, onHome }: { data: Loaded; calm: boolean; onHome: () => void }) {
  const ride = useView((s) => s.ride);
  const card = useView((s) => s.station !== null || commuteReady(s.commute));
  // 停靠時從車站卡打開的通勤面板（還在選起訖）蓋住下方：先收起控制，關掉面板就回來
  const picking = useView((s) => s.commute !== null && !commuteReady(s.commute));
  if (!ride || picking) return null;
  const i = data.stations.byId.get(ride.station);
  const name = i === undefined ? "" : data.stations.stations[i].display;
  const line = data.lineNames.get(ride.line) ?? "";
  // 按了下車（3.24）：控制換成「在 X 下車」小卡（分享＋回到首頁）
  if (ride.left) return <RideEnd line={line} station={name} docked={ride.docked} onHome={onHome} />;
  return (
    <div className="ride-controls" role="group" aria-label="搭乘板南線" data-card={card || undefined}>
      <button type="button" className="hud ride-btn" onClick={() => toggleRide(calm)}>
        {ride.playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />
          </svg>
        )}
        {ride.playing ? "暫停" : "繼續"}
      </button>
      <button type="button" className="hud ride-btn" onClick={() => nextStop(calm)}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3v10l7-5z" fill="currentColor" />
          <path d="M12.5 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        下一站
      </button>
      {/* 停在終點（3.24）：多一顆分享，開分享面板（只有複製連結，回到這一站、暫停中） */}
      {atLineEnd(ride) && name && <RideShare line={line} station={name} className="hud ride-btn" />}
      <button type="button" className="hud ride-btn" onClick={endRide}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M9.5 2.5H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M7.5 8h6M11 5.2L13.8 8 11 10.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        下車
      </button>
      <p className="ride-sr" aria-live="polite">
        {ride.docked && name ? `停靠${name}` : ""}
      </p>
    </div>
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
  const cardOpen = useView(anyCard);
  const sheet = useView((s) => s.sheet);
  const riding = useView((s) => s.ride !== null);
  const still = useView((s) => s.still);
  const calm = reduced || still;
  const top = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  // 首頁的暫時 UI 狀態（3.24）：搜尋面板、更多清單開不開。開卡、上車就把更多清單翻回來
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const ui = useMemo<HomeUi>(() => ({ searching, setSearching, menu, setMenu }), [searching, menu]);
  useEffect(() => {
    if (cardOpen || riding) setMenu(false);
  }, [cardOpen, riding]);

  // 開場讀網址（AD-16）：停在網址的時刻與日型；任一鍵不合法就照常從清晨播放（資料到了再退回全景並說明）。
  // 區與站要等資料載入後才查得到在不在（下一個 effect）；網址的寫回（syncUrl）也等還原完才開始，免得先把區與站洗掉。
  const link = useRef<ParsedQuery | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const q = parseQuery(location.search);
    link.current = q;
    const bad = q.invalid.length > 0;
    if (q.state.dayType && !bad) setDayType(q.state.dayType);
    // 通勤卡的連結（4.2）：停在通勤的時段（hour 與 at 由同一份狀態寫出，通常相同；手改過時以 at 為準）
    startClock({ hour: bad ? undefined : (q.state.commute?.h ?? q.state.hour), reducedMotion: reduced });
  }, [reduced]);

  // 資料到了：還原連結裡的區與站（開好那張卡、暫停在那一刻），或退回全景並說明（3.15）
  useEffect(() => {
    if (!data) return;
    setMonth(data.month);
    // 搭乘路線（8.6）先登記，連結裡的 ride 才查得到
    setRideRoute(data.ride ? { line: data.ride.line, len: data.ride.len, stops: data.ride.stops } : null);
    const q = link.current ?? parseQuery(location.search);
    const plan = planLink(q, {
      months: data.months,
      latest: data.month,
      hasDistrict: (id) => data.districtNames.has(id),
      hasStation: (id) => data.stations.byId.has(id),
      // 環狀線站出站未入檔，不能當迄站（4.1）
      canBeDest: (id) => {
        const i = data.stations.byId.get(id);
        return i !== undefined && data.stations.stations[i].exitsRecorded;
      },
      canRide,
    });
    if (plan.kind === "fallback") {
      // 退回首頁全景：不選區站、照常從清晨播放，網址拿掉看不懂的部分
      restoreSelection(null, null);
      setDayType("weekday");
      if (!getView().playing) startClock({ reducedMotion: reduced });
      clearViewQuery();
      setNotice("這個連結裡的站、行政區或時段在資料裡找不到，先帶你看全城。");
    } else if (plan.kind === "restore" && plan.ride) {
      // 搭乘的連結（8.6）：回到同一站、暫停中、車站卡開著
      restoreRide(plan.ride.line, plan.ride.station);
      if (plan.staleMonth)
        setNotice(`這個連結是 ${monthLabel(plan.staleMonth)}的，網站顯示的是最新的 ${monthLabel(data.month)}資料。`);
    } else if (plan.kind === "restore") {
      restoreSelection(plan.district, plan.station);
      // 通勤卡（4.2）：起訖與時段一起還原，蓋在車站卡（若有）上面
      if (plan.commute) {
        pickHour(plan.commute.h);
        restoreCommute(plan.commute);
      }
      if (plan.staleMonth)
        setNotice(`這個連結是 ${monthLabel(plan.staleMonth)}的，網站顯示的是最新的 ${monthLabel(data.month)}資料。`);
    }
    return syncUrl();
  }, [data, reduced]);

  // 流向標籤的安全區：上方 HUD 的下緣到首頁底座（或小卡）的上緣；「回到全景」膠囊出現時到它的上緣（3.24）。
  // 畫面、HUD 大小變了或換成小卡就重量。
  // 小卡兩段高度（3.22）只動 transform（大小不變），所以換段、拖曳結束與滑動結束（transitionend）也重量：標籤讓路到卡片上方
  // 時要跟著卡片的上緣（體驗原則 5）。
  useEffect(() => {
    // 底座在搜尋、通勤面板蓋著時是 hidden（量不到）：當作沒有
    const bottom = () => dock.current?.querySelector<HTMLElement>(".scene-dock:not([hidden]), .card") ?? null;
    // 「回到全景」膠囊（3.24）在底座或小卡右上方：停駛提示與流向標籤再往上讓
    const pill = () => dock.current?.querySelector<HTMLElement>(".home-recenter") ?? null;
    const measure = () => {
      const t = top.current?.getBoundingClientRect();
      const d = bottom()?.getBoundingClientRect();
      const tops = [pill()]
        .map((el) => el?.getBoundingClientRect())
        .filter((r): r is DOMRect => !!r && r.height > 0)
        .map((r) => r.top);
      const edge = d ? Math.min(d.top, ...tops) : innerHeight;
      overlays.board.safeTop = t ? Math.round(t.bottom) + 6 : 0;
      overlays.board.safeBottom = Math.round(edge) - 6;
      // 膠囊貼在底座（或小卡）上緣之上；停駛提示（決定 8）再往上，放在膠囊（沒有時是底座或小卡）正上方：距離交給 CSS
      if (d) main.current?.style.setProperty("--dock-top", `${Math.round(innerHeight - d.top)}px`);
      main.current?.style.setProperty("--hint-bottom", `${Math.round(innerHeight - edge)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [top.current, bottom(), pill()]) if (el) ro.observe(el);
    // 底座在搜尋、通勤面板打開時收起、關掉時回來，膠囊出現、收起：下方換了元素或 hidden 就重量
    const mo = new MutationObserver(() => {
      for (const el of [pill(), bottom()]) if (el) ro.observe(el);
      measure();
    });
    if (dock.current) mo.observe(dock.current, { childList: true, subtree: true, attributeFilter: ["hidden"] });
    addEventListener("resize", measure);
    const d = dock.current;
    d?.addEventListener("transitionend", measure);
    d?.addEventListener("pointerup", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      removeEventListener("resize", measure);
      d?.removeEventListener("transitionend", measure);
      d?.removeEventListener("pointerup", measure);
    };
  }, [overlays, cardOpen, sheet, data, riding, searching]);

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
        // 搭乘路徑（8.6）：板南線的真實軌道（不含 approx 直線補段）與這條線的站
        const rideStations = stations.stations.filter((s) => basemap.stationLines[s.id]?.includes(RIDE_LINE));
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
          search: searchModel(stations.stations, basemap.stationLines, basemap.lines),
          ride: buildRidePath(view.tracks, RIDE_LINE, rideStations),
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
            onPointerDown={() => {
              setPlaying(false);
              // 碰到場景＝更多清單翻回（3.24）
              setMenu(false);
              // 搭乘中碰到場景＝暫停搭乘（和首頁碰到就暫停播放一樣），可以自己看看四周
              pauseRide();
            }}
          >
            <World
              view={data.view}
              flows={data.flows}
              stations={data.stations}
              headway={data.headway}
              box={data.box}
              reduced={reduced}
              overlays={overlays}
              ride={data.ride}
            />
            {/* 選區時建築與樹跟著區一起彈起（DistrictLift 寫 lifts.ref）；搭乘時軌道兩側走廊裡的沉下去（8.6） */}
            <Blocks view={data.view} month={data.month} reduced={reduced} lift={lifts.ref} corridor={data.ride} />
            <FirstFrame />
            {perf && (
              <Suspense fallback={null}>
                <PerfProbe />
              </Suspense>
            )}
          </Canvas>
        )}
      </SceneBoundary>
      {data && <DistrictLabelLayer view={data.view} els={labels} visible={showLabels && !riding} />}
      {data && <StationLabelLayer index={data.stations} link={overlays.stations} />}
      {data && <FlowLabelLayer els={flowLabels} />}
      {/* 搭乘中不出時段名與停駛提示（行進中不給說明，8.6） */}
      {data && !riding && <PeriodToast source={data.flows} />}
      {data && !riding && <SleepHint />}
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
        {/* 3.24 起上方不放按鈕（都收進底座的「⋯更多」）；只剩打開的連結有問題時的說明 */}
        {notice && <LinkNotice text={notice} onClose={() => setNotice(null)} />}
      </div>
      {/* 搭乘中碰到卡片（停靠時的車站卡）＝暫停搭乘：讀卡時卡片不會因為出發而收起 */}
      <div ref={dock} onPointerDownCapture={riding ? pauseRide : undefined}>
        <Bottom data={data} legend={overlays.legend} calm={calm} ui={ui} />
        {/* 回到全景（3.24）：只在鏡頭動過或選了東西時，貼在底座或小卡右上方；更多清單、搜尋面板開著時不出 */}
        {data && <RecenterButton hidden={menu || searching} onHome={() => overlays.camera.home?.()} />}
        {/* 搜尋與通勤面板（4.1）：按鈕在底座（3.24）；停靠時從車站卡打開的通勤面板照常 */}
        <FindStation
          model={data?.search}
          stations={data?.stations.stations}
          month={data?.month}
          open={searching}
          onOpenChange={setSearching}
        />
      </div>
      {data && riding && (
        <RideControls
          data={data}
          calm={calm}
          onHome={() => {
            // 回到首頁：離開搭乘、回到全景（減少動態時直接切換），一天的播放維持暫停
            leaveRide();
            overlays.camera.home?.();
          }}
        />
      )}
    </main>
  );
}
