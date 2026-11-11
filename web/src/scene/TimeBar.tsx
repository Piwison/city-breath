// 下方時間軸（3.5 最小版，3.3 補齊）：播放／暫停、時間與時段名、平日／假日、天色漸層的拖曳條（標出停止營運）、
// 刻度、播放速度、靜態模式、流向圖例。「大日子」由 7.4 加在日子切換。
// 拖動時呼叫 clock 的 seek()；時間文字與滑桿位置每格直接從 time.t 寫進 DOM，不讓 React 每格重繪（AD-16）；
// 時段名只訂閱整數 hour，播放中一天只重繪 24 次。
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { closedRanges, periodName } from "../data/periods";
import type { DayType } from "../data/types";
import type { FlowSource } from "../data/views";
import { seek, setStillMode, togglePlay } from "../state/clock";
import { setDayType, setPlaying, setSpeed, time, useView } from "../state/view";
import { canvasColor, mixRgba } from "../styles/tokens";
import { sunAt, tokenAt } from "./daylight";

const DAYS: { key: DayType; name: string }[] = [
  { key: "weekday", name: "平日" },
  { key: "holiday", name: "假日" },
];

/** 拖曳條的值域（時）；刻度與停止營運斜紋依滑桿圓鈕中心的位置換算，和圓鈕對齊。 */
const MAX_T = 23.95;
/** 位置：圓鈕寬 22px（scene.css .scrub 的 thumb），中心從 11px 走到 寬−11px。 */
const at = (h: number) => `calc(11px + (100% - 22px) * ${(Math.min(h, MAX_T) / MAX_T).toFixed(4)})`;
const span = (a: number, b: number) => `calc((100% - 22px) * ${((Math.min(b, MAX_T) - a) / MAX_T).toFixed(4)})`;
const TICKS = [0, 6, 12, 18];

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

/** 副標：「9 月平日平均・早晨通勤尖峰」。只訂閱 hour 與 dayType。 */
function Sub({ month, source }: { month?: string; source?: FlowSource }) {
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

export function TimeBar({ month, source, children }: { month?: string; source?: FlowSource; children?: ReactNode }) {
  const playing = useView((s) => s.playing);
  const dayType = useView((s) => s.dayType);
  const speed = useView((s) => s.speed);
  const still = useView((s) => s.still);
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
    <section className="hud scene-dock" aria-label="時間軸">
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
      <div className="row scrub-row">
        <div className="scrub-wrap">
          <input
            ref={scrub}
            className="scrub"
            type="range"
            min={0}
            max={MAX_T}
            step={0.05}
            defaultValue={time.t}
            aria-label="時間"
            style={{ background }}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />
          {closed.map(([a, b]) => (
            <i key={a} className="scrub-closed" aria-hidden="true" style={{ left: at(a), width: span(a, b) }} />
          ))}
          <div className="ticks" aria-hidden="true">
            {TICKS.map((h) => (
              <span key={h} className="num" style={{ left: at(h) }}>
                {h}
              </span>
            ))}
            {closed.map(([a, b]) => (
              <span key={`c${a}`} className="off" style={{ left: at((a + b) / 2) }}>
                停駛
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="mini num"
          aria-label={`播放速度 ${speed} 倍，按一下換成 ${speed === 1 ? 2 : 1} 倍`}
          onClick={() => setSpeed(speed === 1 ? 2 : 1)}
        >
          {speed}x
        </button>
        <button
          type="button"
          className="mini still"
          aria-pressed={still}
          aria-label="靜態模式"
          title={still ? "靜態模式開：停在 8 點、光點換成光帶" : "靜態模式關"}
          onClick={() => setStillMode(!still)}
        >
          靜態<b>{still ? "開" : "關"}</b>
        </button>
      </div>
      {children}
    </section>
  );
}
