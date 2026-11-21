// 首頁的三條路（3.24，Piwi 2026-11-21 選原型 C「一個底座」；DESIGN.md 版面、體驗原則 9、10）。
// 畫面下方一張玻璃底座：上半是③看城市呼吸（TimeBar：播放、時間與月份日型、平日／假日、細拖曳條），分隔線，
// 下排「找你的站（②，次）｜搭板南線（①，主，最大、置中）｜⋯更多」。按 ⋯ 底座就地翻成更多清單（不另開一層），再按翻回；
// Esc、點場景、開卡、上車也翻回。更多清單：分享這一刻、圖層、播放速度、靜態模式、怎麼看這張圖（文字圖例）。
// 「關於」等 3.17 有內容再加進清單（3.24 時還沒有任何關於內容，不放空的一項）。
// 「回到全景」是貼在底座（或小卡）右上方的膠囊，只在鏡頭被移動過（state/view.ts 的 away）或選了區、站、流向時出現。
// 搭乘結束（到終點或按下車）的分享鈕也在這裡：開 3.15 的分享面板，只有複製連結（ride＋station，打開回到那一站、暫停中）。
// 更多清單開不開是首頁的暫時 UI 狀態（ScenePage 持有，同 4.1 搜尋面板），不進網址、不保存；其餘畫面狀態都在 state/。
// 動畫只有淡入（@starting-style＋--dur-enter），減少動態時時長歸零＝直接切換，不滑不彈。
import { useEffect, useId, useRef, useState } from "react";
import { monthLabel } from "../card/DistrictCard";
import { whenLabel } from "../data/periods";
import type { FlowSource, StationIndex } from "../data/views";
import { PinIcon } from "../find/FindStation";
import { setStillMode } from "../state/clock";
import { getView, setPlaying, setSpeed, useView } from "../state/view";
import { SharePanel, ShareIcon, type ShareTarget } from "../share/SharePanel";
import { FlowLegend, type LegendLink } from "./FlowLegend";
import { LayerList } from "./LayerPanel";
import { Sub, TimeBar } from "./TimeBar";

export function TrainIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="1.8" width="9" height="10" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.8 7.2h8.4M5.6 14.2l1-2.2M10.4 14.2l-1-2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6" cy="9.6" r=".9" fill="currentColor" />
      <circle cx="10" cy="9.6" r=".9" fill="currentColor" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="3" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="13" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

function HomeIcon() {
  return (
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
  );
}

const ICONS = {
  layers: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8L14.5 5 8 8.2 1.5 5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M1.5 8L8 11.2 14.5 8M1.5 11L8 14.2 14.5 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  speed: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3.5v9l5-4.5zM8.5 3.5v9l5-4.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  still: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 5h12M2 8h12M2 11h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  legend: (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2 4.5h5M2 8h7M2 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M10 4.5h4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  ),
  chev: (
    <svg className="chev" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/** 「分享這一刻」的分享目標（3.15 原本上方的按鈕；3.24 收進更多）：停在這一刻再讀時刻。 */
export function momentTarget(month?: string): ShareTarget {
  setPlaying(false);
  const v = getView();
  const when = whenLabel(v.dayType, v.hour);
  return {
    kicker: "全城",
    title: month ? `台北捷運・${monthLabel(month)}` : "台北捷運",
    when,
    summary: `${when}的台北捷運：各行政區之間，每小時誰去了哪。`,
  };
}

/** 搭乘結束的分享目標（3.24）：連結由 shareLink() 依畫面狀態產生＝ride＋station（打開回到這一站、暫停中）。 */
export function rideTarget(line: string, station: string): ShareTarget {
  return {
    heading: "分享這趟搭乘",
    kicker: line,
    title: station,
    when: `打開會停在${station}、暫停中`,
    summary: `搭${line}，停在${station}。`,
  };
}

type Expand = "layers" | "legend" | null;

/**
 * 更多清單（底座翻過來的那一面）。每一項的功能和 3.24 之前相同：分享這一刻開 3.15 的分享面板（只有複製連結）、
 * 圖層是同一份開關、播放速度 1x／2x、靜態模式（停在 8 點、光點換成光帶）、怎麼看這張圖是原本時間軸下方的文字圖例。
 */
export function MoreMenu({
  month,
  source,
  stations,
  legend,
  onShare,
  initial = null,
}: {
  month?: string;
  source?: FlowSource;
  stations?: StationIndex;
  legend: LegendLink;
  onShare: () => void;
  /** 一開始展開哪一項（測試用） */
  initial?: Expand;
}) {
  const speed = useView((s) => s.speed);
  const still = useView((s) => s.still);
  const [open, setOpen] = useState<Expand>(initial);
  const id = useId();
  const toggle = (k: Exclude<Expand, null>) => setOpen((o) => (o === k ? null : k));
  return (
    <ul className="deck-menu" aria-label="更多">
      <li>
        <button type="button" className="mitem" aria-haspopup="dialog" disabled={!month} onClick={onShare}>
          <ShareIcon />
          <span className="label">分享這一刻</span>
        </button>
      </li>
      <li>
        <button type="button" className="mitem" aria-expanded={open === "layers"} aria-controls={`${id}-layers`} onClick={() => toggle("layers")}>
          {ICONS.layers}
          <span className="label">圖層</span>
          {ICONS.chev}
        </button>
        {open === "layers" && (
          <div id={`${id}-layers`} className="mbody">
            <LayerList />
          </div>
        )}
      </li>
      <li>
        <button
          type="button"
          className="mitem"
          aria-label={`播放速度 ${speed} 倍，按一下換成 ${speed === 1 ? 2 : 1} 倍`}
          onClick={() => setSpeed(speed === 1 ? 2 : 1)}
        >
          {ICONS.speed}
          <span className="label">播放速度</span>
          <span className="val num">{speed}x</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          className="mitem"
          aria-pressed={still}
          title={still ? "靜態模式開：停在 8 點、光點換成光帶" : "靜態模式關"}
          onClick={() => setStillMode(!still)}
        >
          {ICONS.still}
          <span className="label">靜態模式</span>
          <span className="val">{still ? "開" : "關"}</span>
        </button>
      </li>
      <li>
        <button type="button" className="mitem" aria-expanded={open === "legend"} aria-controls={`${id}-legend`} onClick={() => toggle("legend")}>
          {ICONS.legend}
          <span className="label">怎麼看這張圖</span>
          {ICONS.chev}
        </button>
        {open === "legend" && (
          <div id={`${id}-legend`} className="mbody">
            <p className="mnote">
              <Sub month={month} source={source} />
            </p>
            <FlowLegend source={source} stations={stations} link={legend} />
          </div>
        )}
      </li>
    </ul>
  );
}

/**
 * 首頁底座（沒開卡、沒在搭乘時）。menu：底座翻成更多清單；hidden：搜尋或通勤面板蓋著時收起（元素留著，
 * 面板關掉時焦點回得到「找你的站」）。
 */
export function HomeDeck({
  month,
  source,
  stations,
  legend,
  rideReady,
  findReady,
  onRide,
  onFind,
  menu,
  onMenu,
  hidden = false,
}: {
  month?: string;
  source?: FlowSource;
  stations?: StationIndex;
  legend: LegendLink;
  rideReady: boolean;
  findReady: boolean;
  onRide: () => void;
  onFind: () => void;
  menu: boolean;
  onMenu: (open: boolean) => void;
  hidden?: boolean;
}) {
  const [share, setShare] = useState<ShareTarget | null>(null);
  const more = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Esc 翻回（分享面板開著時 Esc 歸它），焦點回到 ⋯
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      onMenu(false);
      more.current?.focus({ preventScroll: true });
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [menu, onMenu]);

  return (
    <section className="hud scene-dock home-deck" aria-label="首頁" data-menu={menu || undefined} hidden={hidden}>
      {menu ? (
        <div id={menuId} className="deck-face">
          <MoreMenu
            month={month}
            source={source}
            stations={stations}
            legend={legend}
            onShare={() => {
              onMenu(false);
              setShare(momentTarget(month));
            }}
          />
        </div>
      ) : (
        <div className="deck-face">
          <TimeBar month={month} source={source} />
        </div>
      )}
      <div className="deck-divider" aria-hidden="true" />
      <div className="deck-paths">
        <button type="button" className="deck-side deck-find" aria-haspopup="dialog" disabled={!findReady} onClick={onFind}>
          <PinIcon />
          找你的站
        </button>
        <button type="button" className="deck-ride" disabled={!rideReady} onClick={onRide}>
          <TrainIcon />
          搭板南線
        </button>
        <button
          ref={more}
          type="button"
          className="deck-side deck-more"
          aria-expanded={menu}
          aria-controls={menu ? menuId : undefined}
          onClick={() => onMenu(!menu)}
        >
          <MoreIcon />
          更多
        </button>
      </div>
      {share && <SharePanel open target={share} onClose={() => setShare(null)} />}
    </section>
  );
}

/** 「回到全景」該不該出現（3.24）：沒在搭乘，且鏡頭動過或選了區、站、流向。 */
export const showRecenter = (s: { ride: unknown; away: boolean; district: string | null; station: string | null; focus: string | null }) =>
  s.ride === null && (s.away || s.district !== null || s.station !== null || s.focus !== null);

/** 「回到全景」膠囊：貼在底座（或小卡）右上方；按了飛回開場構圖（CameraRig 清掉 away）後收起。 */
export function RecenterButton({ onHome, hidden = false }: { onHome: () => void; hidden?: boolean }) {
  const show = useView(showRecenter);
  if (!show || hidden) return null;
  return (
    <button type="button" className="hud home-recenter" onClick={onHome}>
      <HomeIcon />
      回到全景
    </button>
  );
}

/** 搭乘結束的分享鈕（到終點的控制列、下車小卡共用）：開分享面板，只有複製連結。 */
export function RideShare({ line, station, className }: { line: string; station: string; className: string }) {
  const [target, setTarget] = useState<ShareTarget | null>(null);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setTarget(rideTarget(line, station))}>
        <ShareIcon />
        分享
      </button>
      {target && <SharePanel open target={target} onClose={() => setTarget(null)} />}
    </>
  );
}

/** 下車後的小卡（3.24）：在哪一站下車、分享（只有複製連結）、回到首頁。 */
export function RideEnd({ line, station, docked, onHome }: { line: string; station: string; docked: boolean; onHome: () => void }) {
  return (
    <section className="hud ride-end" aria-label="搭乘結束">
      <h2>{docked ? `在${station}下車` : `在${station}附近下車`}</h2>
      <p>把這一站傳給朋友：連結打開會停在{station}、暫停中。</p>
      <div className="ride-end-btns">
        <RideShare line={line} station={station} className="ride-end-share" />
        <button type="button" className="ride-end-home" onClick={onHome}>
          回到首頁
        </button>
      </div>
    </section>
  );
}
