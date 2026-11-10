// 微縮城市場景基底（2.3）：台北盆地與天光。先在 `?scene=1` 預覽，3.5 換成首頁並拿掉 maplibre＋deck.gl 骨架。
// 這張只畫底層：底座、地形台地、海、行政區薄片、河川、綠地、捷運路線、天空與光；建築、車站、流向等是之後的票。
import { CameraControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { NeutralToneMapping } from "three";
import { loadBasemap, loadDistricts, loadMonths } from "../data/load";
import { baseView, type BaseView } from "../data/views";
import { startClock } from "../state/clock";
import { readQuery } from "../state/url";
import { setPlaying, useView } from "../state/view";
import { Daylight, type FrameLight } from "./Daylight";
import { DistrictLabelLayer, DistrictLabelProjector, type LabelEls } from "./DistrictLabels";
import { LayerPanel } from "./LayerPanel";
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

/** 開場鏡頭（原型 HOME）：直式手機拉遠一點、目標往南偏，讓整個盆地落在上下 HUD 之間。 */
function home(aspect: number): [number, number, number, number, number, number] {
  const narrow = aspect < 0.8;
  const d = narrow ? 208 : 140;
  return [0, d * 0.64, d * 0.76, 0, 0, narrow ? 12 : 6];
}

function Camera({ reduced }: { reduced: boolean }) {
  const ref = useRef<CameraControls>(null);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const narrow = aspect < 0.8;
  useEffect(() => {
    ref.current?.setLookAt(...home(aspect), false);
    // 只在直式／橫式切換時回到開場鏡頭，一般縮放視窗不打斷使用者的視角
  }, [narrow]);
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={18}
      maxDistance={260}
      maxPolarAngle={1.32}
      smoothTime={reduced ? 0 : 0.35}
      draggingSmoothTime={reduced ? 0 : 0.125}
    />
  );
}

function World({ view, box, reduced, labels }: { view: BaseView; box: PlinthBox; reduced: boolean; labels: LabelEls }) {
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
      <DistrictLabelProjector view={view} els={labels} visible={showLabels} />
      <Camera reduced={reduced} />
    </>
  );
}

type Loaded = { view: BaseView; box: PlinthBox; month: string };

export default function ScenePage() {
  const [webgl] = useState(hasWebGL);
  const [reduced] = useState(prefersReducedMotion);
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const labels: LabelEls = useRef<(HTMLDivElement | null)[]>([]);
  const showLabels = useView((s) => s.layers.label);

  useEffect(() => {
    startClock({ hour: readQuery(location.search).hour, reducedMotion: reduced });
  }, [reduced]);

  useEffect(() => {
    if (!webgl) return;
    let alive = true;
    Promise.all([loadBasemap(), loadMonths().then((m) => loadDistricts(m.latest))])
      .then(([basemap, districts]) => {
        if (!alive) return;
        const view = baseView(basemap, districts);
        setData({ view, box: plinthBox(view.bbox), month: districts.month });
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
            aria-label={`臺北盆地的微縮模型：地形、海、河川、綠地與捷運路線（底座依 ${data.month} 的行政區）`}
            role="img"
            onPointerDown={() => setPlaying(false)}
          >
            <World view={data.view} box={data.box} reduced={reduced} labels={labels} />
          </Canvas>
        )}
      </SceneBoundary>
      {data && <DistrictLabelLayer view={data.view} els={labels} visible={showLabels} />}
      {!data && !error && <p className="scene-status">載入台北盆地中…</p>}
      {error && (
        <p className="scene-status" role="alert">
          底圖載入失敗：{error}
        </p>
      )}
      <LayerPanel />
      <TimeBar />
    </main>
  );
}
