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
//   >內容</CardFrame>
// 位置與大小照 DESIGN.md「版面」：取代時間軸的位置、最高 34vh、內容超過就在卡內捲動。
// 進場：由下往上 24px＋淡入（--dur-enter、--ease-out，@starting-style）；減少動態時 --dur-* 歸零＝直接出現。
import { useEffect, useId, type ReactNode } from "react";
import type { DayType } from "../data/types";
import { seek } from "../state/clock";
import { cardOpened, setDayType, setPlaying, useView } from "../state/view";
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
      <span className="card-hm num" aria-live="polite">
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

export function CardFrame({ title, kicker, when, actions, back, timeRow = true, footer, onClose, kind, children }: CardFrameProps) {
  const titleId = useId();
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
  const row = timeRow === false ? null : <CardTimeRow {...(timeRow === true ? {} : timeRow)} />;
  return (
    <section className="hud card" role="region" aria-labelledby={titleId} data-kind={kind}>
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
      {row}
      <div className="card-body">{children}</div>
      {footer && <footer className="card-foot">{footer}</footer>}
    </section>
  );
}
