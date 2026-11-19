// 「找你的站」（4.1，產品計畫 v2 決定 1、15；體驗原則 1、4）：畫面下方一顆主按鈕，取代左上角的「找你的通勤」。
// 按了從下方浮起搜尋面板（打字、依路線分組、最近用過的站在最上面）；選一站＝selectStation()：鏡頭飛到那站（Selection.tsx
// 的 SelectionCamera，減少動態時直接切）、開車站卡（3.12），卡上的「從這站找通勤」打開通勤面板。播放中也能直接按（不暫停；
// 選了站、開了卡才暫停，和點地圖一樣）。也可以不搜尋、直接點地圖。
// 面板開關是元件內的暫時 UI 狀態（不進網址、不保存）；通勤面板由 state/view.ts 的 commute 決定開不開：
// 起訖還沒選齊是這裡的通勤面板，選齊了（commuteReady）換成通勤卡（4.2；首頁由 ScenePage 的 Bottom 開，替代頁在這裡開）。
// 打開搜尋送 commute_input_started（AD-20，不帶 props；StationSearch.tsx 的 startSearch）。
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CommuteCard } from "../card/CommuteCard";
import { loadBasemap, loadMeta, loadMonths, loadStations } from "../data/load";
import { searchModel, type SearchModel } from "../data/stationSearch";
import type { Station } from "../data/types";
import { useMeta } from "../data/useMeta";
import { pickHour } from "../state/clock";
import { parseQuery, planLink } from "../state/url";
import {
  clearCommute,
  commuteReady,
  openCommute,
  restoreCommute,
  selectStation,
  setCommute,
  setDayType,
  setMonth,
  useView,
} from "../state/view";
import { CommuteInput, type CommuteData } from "./CommutePanel";
import { startSearch, StationSearch } from "./StationSearch";
import "./find.css";

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 下方面板的外框：標題、×、Esc 關閉；關掉時焦點回到打開它的按鈕。
 * Esc 只關面板：在捕獲階段先接住並 preventDefault，蓋在底下的車站卡（CardFrame 聽 window 的 keydown）就不跟著關。
 */
function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      // 分享面板（dialog）開著時 Esc 歸它
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      onClose();
    };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      const el = back.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <section className="hud find-sheet" data-wide={wide ? "" : undefined} role="dialog" aria-label={title}>
      <header className="find-sheet-head">
        <h2>{title}</h2>
        <button type="button" className="find-close" aria-label={`關閉${title}`} onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {children}
    </section>
  );
}

/**
 * 首頁的主按鈕與搜尋面板、通勤面板。model：首頁已載入的車站與路線；stations：同月 stations.json 的站。
 * hideMain：不放主按鈕（搭乘模式 8.6：停靠時從車站卡「從這站找通勤」照樣打開通勤面板）。
 */
export function FindStation({
  model,
  stations,
  month,
  hideMain = false,
}: {
  model?: SearchModel;
  stations?: readonly Station[];
  month?: string;
  hideMain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cardOpen = useView((s) => s.district !== null || s.station !== null);
  const commuteOpen = useView((s) => s.commute !== null);
  // 起訖選齊＝通勤卡（ScenePage 的 Bottom），通勤面板收起
  const commuteCard = useView((s) => commuteReady(s.commute));
  const close = useCallback(() => setOpen(false), []);
  const start = () => startSearch(() => setOpen(true));
  // 通勤面板打開（車站卡「從這站找通勤」）時收起搜尋
  useEffect(() => {
    if (commuteOpen) setOpen(false);
  }, [commuteOpen]);
  return (
    <>
      {!hideMain && !cardOpen && !open && !commuteOpen && (
        <button type="button" className="find-main" aria-haspopup="dialog" disabled={!model} onClick={start}>
          <PinIcon />
          找你的站
        </button>
      )}
      {open && model && (
        <Sheet title="找你的站" onClose={close}>
          <StationSearch
            model={model}
            mode="station"
            label="找車站"
            onPick={(id) => {
              setOpen(false);
              selectStation(id);
            }}
            footer={
              <button
                type="button"
                className="find-link"
                onClick={() => {
                  setOpen(false);
                  openCommute();
                }}
              >
                找通勤同路人：選起站和迄站 ›
              </button>
            }
          />
        </Sheet>
      )}
      {commuteOpen && !commuteCard && model && stations && month && <CommuteSheet model={model} stations={stations} month={month} />}
    </>
  );
}

/** 首頁的通勤面板：meta.json 第一次打開才載（時段選單要用；通勤卡與分享卡沿用同一份快取）。 */
function CommuteSheet({ model, stations, month }: { model: SearchModel; stations: readonly Station[]; month: string }) {
  const meta = useMeta(month);
  return (
    <Sheet title="每天有多少人跟你同路？" onClose={clearCommute} wide>
      {meta.status === "error" ? (
        <p role="alert">資料載入失敗：{meta.message}</p>
      ) : meta.status === "ok" ? (
        <CommuteInput data={{ month, stations, model, meta: meta.meta }} />
      ) : (
        <p className="commute-status">載入中…</p>
      )}
    </Sheet>
  );
}

/** 替代頁的通勤卡 ×：回到面板，起站與時段保留（替代頁一直開著通勤輸入）。 */
const closeFallbackCard = () => setCommute({ d: null });

/**
 * 不支援 3D 的替代頁（AD-11）：同一個通勤面板與搜尋，直接攤在頁面上。
 * 車站、路線與 meta 在這裡自己載（替代頁沒有場景的資料）。
 */
export function FallbackFind() {
  const [data, setData] = useState<CommuteData>();
  const [error, setError] = useState<string>();
  const commute = useView((s) => s.commute);
  useEffect(() => {
    let alive = true;
    loadMonths()
      .then(async ({ latest, months }) => {
        const [meta, st, basemap] = await Promise.all([loadMeta(latest), loadStations(latest), loadBasemap()]);
        if (!alive) return;
        const model = searchModel(st.stations, basemap.stationLines, basemap.lines);
        setMonth(latest);
        // 通勤卡的分享連結（4.2）：替代頁也回到同一張通勤卡（日型、起訖、時段）；連結看不懂就照常給空的面板
        const plan = planLink(parseQuery(location.search), {
          months,
          latest,
          hasDistrict: () => true,
          hasStation: (id) => model.byId.has(id),
          canBeDest: (id) => model.stations[model.byId.get(id) ?? -1]?.exitsRecorded === true,
        });
        if (plan.kind === "restore" && plan.commute) {
          const day = parseQuery(location.search).state.dayType;
          if (day) setDayType(day);
          pickHour(plan.commute.h);
          restoreCommute(plan.commute);
        }
        setData({ month: latest, meta, stations: st.stations, model });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  // 替代頁一直開著通勤輸入（起訖留空）
  useEffect(() => {
    if (!commute) openCommute(null);
  }, [commute]);
  if (error) return <p role="alert">資料載入失敗：{error}</p>;
  if (!data) return <p className="commute-status">載入車站中…</p>;
  return (
    <div className="find-inline">
      <CommuteInput data={data} />
      {/* 起訖選齊：同一張通勤卡從下方浮起（4.2）；面板留在頁面上，可以直接改起訖。
          掛在 body：替代頁的外框是玻璃面（backdrop-filter），在它裡面的卡片會被它框住，不會貼齊畫面下緣 */}
      {commuteReady(commute) &&
        createPortal(
          <div className="fallback-card-layer">
            <CommuteCard
              key={`${commute.o}>${commute.d}`}
              commute={commute}
              month={data.month}
              stations={data.stations}
              byId={data.model.byId}
              meta={data.meta}
              onClose={closeFallbackCard}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
