// 所有小卡共用的卡框與卡內時間列（3.6；之後 3.12 車站卡、4.2 通勤卡、7.4 活動卡、3.8 地標卡沿用）。
// 走查共通問題 1：小卡蓋住時間軸時，卡內有「‹ 時間 ›＋平日／假日」；走查 2026-11-11 F1：任何小卡打開就暫停播放、
// 關掉後維持暫停，卡上標明正在看的時段與日型（「平日 8 點」「假日整天」）。
//
// API（擴充點都是 props，不用改這個檔）：
//   <CardFrame
//     kicker="行政區"                  標題上方的小字（卡的種類）
//     title="大安區"                   h2
//     when="平日 8 點"                 正在看的時段與日型（periods.ts whenLabel），標題列右側的膠囊
//     actions={<ShareButton />}        標題列、關閉鈕左邊的按鈕槽（3.15 分享鈕）
//     back={{ label: "大安區", onClick }} 標題上方的「‹ 回到上一層」
//     timeRow                          true＝卡內時間列；或 { days: [...] } 換日子選項（7.4 加「大日子」）、{ day: false } 只留時間
//     footer={<SourceLine />}          卡底：一行來源（3.17「資料：2026 年 9 月・來源 ›」）、圖例等
//     onClose                          × 與 Esc
//     answer="平日 8 點，永和的人最常去中正區"   第一行的一句答案（data/answer.ts；3.22，決定 11）
//   >內容</CardFrame>
// 兩段高度（3.22，決定 10、體驗原則 5）：摘要露出約三分之一、完整約七成（sheet.ts 的常數，card.css 同值）。
// 把手點按、上滑到完整、下滑回摘要、在摘要再往下就關閉（往下滑出）；拖曳時卡片跟著手指（只動 transform），
// 放開依速度投射到最近的一段，CSS transition 接手（可中途再抓住）。鍵盤：把手 Enter／Space 切換、↑ 完整、↓ 摘要，
// 鍵盤切換直接到位、不播滑動；摘要時 Tab 到看不到的元素自動展開。減少動態時 --dur-sheet 歸零、拖曳不跟手，放開直接切換。
// 高度狀態在 state/view.ts（sheet），不進網址。進場：由下往上 24px＋淡入（translate 屬性，和 sheet 的 transform 分開）。
import {
  useEffect,
  useId,
  useRef,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { DayType } from "../data/types";
import { seek } from "../state/clock";
import { cardOpened, getView, setDayType, setPlaying, setSheet, useView, type SheetDetent } from "../state/view";
import { DRAG_SLOP, peekOffset, reducedTarget, rubberband, sheetTarget, type SheetTarget } from "./sheet";
import "./card.css";

export interface DayOption {
  key: DayType;
  name: string;
}

export const DAY_OPTIONS: DayOption[] = [
  { key: "weekday", name: "平日" },
  { key: "holiday", name: "假日" },
];

export interface TimeRowOptions {
  /** 顯示平日／假日（預設 true） */
  day?: boolean;
  /** 日子選項（預設平日、假日） */
  days?: DayOption[];
}

export interface CardFrameProps {
  title: ReactNode;
  kicker?: ReactNode;
  /** 正在看的時段與日型，例如「平日 8 點」 */
  when?: string;
  actions?: ReactNode;
  back?: { label: string; onClick: () => void };
  timeRow?: boolean | TimeRowOptions;
  footer?: ReactNode;
  onClose: () => void;
  /** 卡的種類（CSS hook：data-kind） */
  kind?: string;
  /** 第一行的一句答案（data/answer.ts），表格在它下面（決定 11） */
  answer?: ReactNode;
  children?: ReactNode;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 卡內時間列：‹ 前一小時、時間、› 後一小時，與平日／假日。按了都停止播放（時間軸被卡片蓋住時的替身）。 */
export function CardTimeRow({ day = true, days = DAY_OPTIONS }: TimeRowOptions) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const step = (d: number) => {
    setPlaying(false);
    seek((((hour + d) % 24) + 24) % 24);
  };
  return (
    <div className="card-time">
      <button type="button" className="card-step" aria-label="前一小時" onClick={() => step(-1)}>
        ‹
      </button>
      <span className="card-hm num">
        {pad(hour)}:00
      </span>
      <button type="button" className="card-step" aria-label="後一小時" onClick={() => step(1)}>
        ›
      </button>
      {day && (
        <div className="card-seg" role="group" aria-label="日子">
          {days.map((d) => (
            <button key={d.key} type="button" aria-pressed={dayType === d.key} onClick={() => setDayType(d.key)}>
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 減少動態（拖曳不跟手、放開直接切換）。測試環境沒有 matchMedia 時當作沒有。 */
const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 卡片目前往下推了幾 px（動畫進行中也讀得到畫面上的值，抓住時從這裡接著拖）。 */
function currentOffset(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  return !t || t === "none" ? 0 : new DOMMatrixReadOnly(t).m42;
}

/** 這一次切換不播滑動（鍵盤）：兩格之後拿掉。 */
function instant(el: HTMLElement | null) {
  if (!el) return;
  el.dataset.instant = "";
  requestAnimationFrame(() => requestAnimationFrame(() => delete el.dataset.instant));
}

interface Drag {
  id: number;
  x: number;
  y: number;
  from: SheetDetent;
  base: number;
  height: number;
  active: boolean;
  reduced: boolean;
  /** 最近幾次的位置與時間，放開時算速度 */
  trail: { y: number; t: number }[];
}

export function CardFrame({ title, kicker, when, actions, back, timeRow = true, footer, onClose, kind, answer, children }: CardFrameProps) {
  const titleId = useId();
  const sheet = useView((s) => s.sheet);
  const ref = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swallowClick = useRef(false);
  // 打開就暫停（F1）；關掉不恢復播放
  useEffect(() => {
    cardOpened();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onClose]);
  // 回到摘要時內容捲回頂端：摘要露出的永遠是答案與表格的開頭
  useEffect(() => {
    if (sheet === "peek" && scroll.current) scroll.current.scrollTop = 0;
  }, [sheet]);

  const settle = (target: SheetTarget, el: HTMLElement, height: number, reduced: boolean) => {
    el.style.transition = "";
    if (target === "close") {
      // 往下滑出再關（進來與離開同一條路）；減少動態直接關
      if (reduced) {
        el.style.transform = "";
        onClose();
        return;
      }
      el.style.transform = `translateY(${Math.ceil(height)}px)`;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        onClose();
      };
      // 只認卡片自己的 transform（子元素的 transitionend 會冒泡上來）
      const end = (e: TransitionEvent) => {
        if (e.target !== el || e.propertyName !== "transform") return;
        el.removeEventListener("transitionend", end);
        finish();
      };
      el.addEventListener("transitionend", end);
      setTimeout(finish, 500);
      return;
    }
    el.style.transform = "";
    setSheet(target);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // 完整時內容自己捲；從把手、標題、答案、時間列拖
    if (getView().sheet === "full" && (e.target as Element).closest(".card-scroll")) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      from: getView().sheet,
      base: currentOffset(el),
      height: el.offsetHeight,
      active: false,
      reduced: prefersReduced(),
      trail: [{ y: e.clientY, t: e.timeStamp }],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) < DRAG_SLOP) return;
      // 橫向為主的移動不是拉卡片
      if (Math.abs(e.clientX - d.x) > Math.abs(dy)) {
        drag.current = null;
        return;
      }
      d.active = true;
      el.setPointerCapture(e.pointerId);
      if (!d.reduced) el.style.transition = "none";
    }
    d.trail.push({ y: e.clientY, t: e.timeStamp });
    if (d.trail.length > 6) d.trail.shift();
    if (d.reduced) return;
    const raw = d.base + dy;
    const y = raw < 0 ? rubberband(raw, d.height) : raw;
    el.style.transform = `translateY(${y}px)`;
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.active || !el) return;
    swallowClick.current = true;
    setTimeout(() => (swallowClick.current = false), 0);
    const dy = e.clientY - d.y;
    if (e.type === "pointercancel") {
      el.style.transition = "";
      el.style.transform = "";
      return;
    }
    if (d.reduced) {
      settle(reducedTarget(d.from, dy), el, d.height, true);
      return;
    }
    const first = d.trail[0];
    const last = d.trail[d.trail.length - 1];
    const dt = last.t - first.t;
    const velocity = dt > 0 ? (last.y - first.y) / dt : 0;
    const peek = peekOffset(d.height);
    const offset = d.base + dy;
    settle(sheetTarget(d.from, offset, velocity, peek, d.height), el, d.height, false);
  };

  const toggle = (keyboard: boolean) => {
    if (keyboard) instant(ref.current);
    setSheet(getView().sheet === "full" ? "peek" : "full");
  };
  const onGripKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const to = e.key === "ArrowUp" ? "full" : e.key === "ArrowDown" ? "peek" : null;
    if (!to) return;
    e.preventDefault();
    instant(ref.current);
    setSheet(to);
  };
  // 摘要時 Tab 到畫面外的內容：直接展開（不播滑動）
  const onFocus = (e: ReactFocusEvent<HTMLElement>) => {
    if (getView().sheet !== "peek" || !(e.target as Element).closest(".card-scroll")) return;
    const r = (e.target as Element).getBoundingClientRect();
    if (r.bottom > innerHeight) {
      instant(ref.current);
      setSheet("full");
    }
  };

  const row = timeRow === false ? null : <CardTimeRow {...(timeRow === true ? {} : timeRow)} />;
  const full = sheet === "full";
  return (
    <section
      ref={ref}
      className="hud card"
      role="region"
      aria-labelledby={titleId}
      data-kind={kind}
      data-sheet={sheet}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onClickCapture={(e) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onFocus={onFocus}
    >
      <button
        type="button"
        className="card-grip"
        aria-expanded={full}
        aria-label={full ? "收合卡片（↓）" : "展開卡片（↑）"}
        onClick={(e) => toggle(e.detail === 0)}
        onKeyDown={onGripKey}
      >
        <i aria-hidden="true" />
      </button>
      <header className="card-head">
        <div className="card-titles">
          {back && (
            <button type="button" className="card-back" onClick={back.onClick}>
              ‹ {back.label}
            </button>
          )}
          {kicker && <span className="card-kicker">{kicker}</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        {when && <span className="card-when">{when}</span>}
        {actions}
        <button type="button" className="card-close" aria-label="關閉" onClick={onClose}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {answer && (
        <p className="card-answer" aria-live="polite">
          {answer}
        </p>
      )}
      {row}
      <div ref={scroll} className="card-scroll">
        <div className="card-body">{children}</div>
        {footer && <footer className="card-foot">{footer}</footer>}
      </div>
    </section>
  );
}
