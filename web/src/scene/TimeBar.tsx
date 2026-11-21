// 時間軸（3.5 最小版，3.3 補齊；3.24 收進首頁底座的上半）：播放／暫停、時間與月份日型＋時段名、平日／假日、
// 天色漸層的細拖曳條（標出停止營運）。播放速度、靜態模式與流向圖例 3.24 起在「⋯更多」（HomeDeck.tsx），刻度拿掉
// （Piwi 選的原型 C：只留停駛斜紋，螢幕閱讀器仍讀得到「停止營運」）。「大日子」由 7.4 加在日子切換。
// 拖動時呼叫 clock 的 seek()；時間文字與滑桿位置每格直接從 time.t 寫進 DOM，不讓 React 每格重繪（AD-16）；
// 時段名只訂閱整數 hour，播放中一天只重繪 24 次。
import { useEffect, useMemo, useRef } from "react";
import { closedRanges, periodName } from "../data/periods";
import type { DayType } from "../data/types";
import type { FlowSource } from "../data/views";
import { seek, togglePlay } from "../state/clock";
import { setDayType, setPlaying, time, useView } from "../state/view";
import { canvasColor, mixRgba } from "../styles/tokens";
import { sunAt, tokenAt } from "./daylight";

const DAYS: { key: DayType; name: string }[] = [
  { key: "weekday", name: "平日" },
  { key: "holiday", name: "假日" },
];

/** 拖曳條的值域（時）；停止營運斜紋依滑桿圓鈕中心的位置換算，和圓鈕對齊。 */
const MAX_T = 23.95;
/** 位置：圓鈕寬 18px（scene.css .scrub 的 thumb），中心從 9px 走到 寬−9px。 */
const at = (h: number) => `calc(9px + (100% - 18px) * ${(Math.min(h, MAX_T) / MAX_T).toFixed(4)})`;
const span = (a: number, b: number) => `calc((100% - 18px) * ${((Math.min(b, MAX_T) - a) / MAX_T).toFixed(4)})`;

const pad = (n: number) => String(n).padStart(2, "0");

/** 一天的天色（每半小時一格，上緣與地平線色的 45% 混合），給拖曳條當底色（原型 scrub）。 */
function skyGradient(): string {
  const stops: string[] = [];
  for (let k = 0; k <= 48; k++) {
    const h = k / 2;
    stops.push(`${canvasColor(mixRgba(tokenAt("--sky-top", h), tokenAt("--sky-horizon", h), 0.45))} ${((k / 48) * 100).toFixed(1)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

const monthLabel = (month?: string) => (month ? `${Number(month.slice(5))} 月` : "");

/** 副標：「9 月平日平均・早晨通勤尖峰」。只訂閱 hour 與 dayType。「怎麼看這張圖」也用（圖例是哪一刻的）。 */
export function Sub({ month, source }: { month?: string; source?: FlowSource }) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const name = DAYS.find((d) => d.key === dayType)!.name;
  const period = source ? periodName(hour, dayType, source.operating(dayType, hour)) : "";
  return (
    <span className="sub">
      {monthLabel(month)}
      {name}平均{period && `・${period}`}
    </span>
  );
}

export function TimeBar({ month, source }: { month?: string; source?: FlowSource }) {
  const playing = useView((s) => s.playing);
  const dayType = useView((s) => s.dayType);
  const hm = useRef<HTMLSpanElement>(null);
  const orb = useRef<HTMLElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const background = useMemo(skyGradient, []);
  const closed = useMemo(() => (source ? closedRanges((h) => source.operating(dayType, h)) : []), [source, dayType]);
  const closedRef = useRef(closed);
  closedRef.current = closed;

  useEffect(() => {
    let raf = 0;
    let shown = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = time.t;
      const text = `${pad(Math.floor(t) % 24)}:${pad(Math.floor(((t % 1) * 60) / 10) * 10)}`;
      if (text !== shown && hm.current && orb.current) {
        shown = text;
        hm.current.textContent = text;
        const off = closedRef.current.some(([a, b]) => t >= a && t < b);
        scrub.current?.setAttribute("aria-valuetext", off ? `${text} 停止營運` : text);
        orb.current.className = `orb ${sunAt(t).isDay ? "sun" : "moon"}`;
      }
      if (scrub.current && document.activeElement !== scrub.current) scrub.current.value = t.toFixed(2);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="timebar" role="group" aria-label="時間軸">
      <div className="row">
        <button type="button" className="play" aria-label={playing ? "暫停" : "播放一整天"} onClick={togglePlay}>
          {playing ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="when">
          <span className="clock num">
            <i ref={orb} className="orb sun" aria-hidden="true" />
            <span ref={hm} />
          </span>
          <Sub month={month} source={source} />
        </div>
        <div className="seg" role="group" aria-label="日子">
          {DAYS.map((d) => (
            <button key={d.key} type="button" aria-pressed={dayType === d.key} onClick={() => setDayType(d.key)}>
              {d.name}
            </button>
          ))}
        </div>
      </div>
      <div className="scrub-wrap" style={{ ["--scrub-bg" as string]: background }}>
        <input
          ref={scrub}
          className="scrub"
          type="range"
          min={0}
          max={MAX_T}
          step={0.05}
          defaultValue={time.t}
          aria-label="時間"
          onChange={(e) => {
            setPlaying(false);
            seek(Number(e.target.value));
          }}
        />
        {closed.map(([a, b]) => (
          <i key={a} className="scrub-closed" aria-hidden="true" style={{ left: at(a), width: span(a, b) }} />
        ))}
      </div>
    </div>
  );
}
