// 預覽用的最小時間軸（下方）：播放／暫停、時間、天色漸層的拖曳條。正式的時間軸（平日／假日、圖例）在 3.x。
// 拖動時呼叫 clock 的 seek()；時間文字與滑桿位置每格直接從 time.t 寫進 DOM，不讓 React 每格重繪（AD-16）。
import { useEffect, useMemo, useRef } from "react";
import { seek } from "../state/clock";
import { setPlaying, time, useView } from "../state/view";
import { canvasColor, mixRgba } from "../styles/tokens";
import { sunAt, tokenAt } from "./daylight";

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

export function TimeBar() {
  const playing = useView((s) => s.playing);
  const hm = useRef<HTMLSpanElement>(null);
  const orb = useRef<HTMLElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const background = useMemo(skyGradient, []);

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
        scrub.current?.setAttribute("aria-valuetext", text);
        orb.current.className = `orb ${sunAt(t).isDay ? "sun" : "moon"}`;
      }
      if (scrub.current && document.activeElement !== scrub.current) scrub.current.value = t.toFixed(2);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="hud scene-dock" aria-label="時間軸">
      <button type="button" className="play" aria-label={playing ? "暫停" : "播放一整天"} onClick={() => setPlaying(!playing)}>
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
      <span className="clock num">
        <i ref={orb} className="orb sun" aria-hidden="true" />
        <span ref={hm} />
      </span>
      <input
        ref={scrub}
        className="scrub"
        type="range"
        min={0}
        max={23.95}
        step={0.05}
        defaultValue={time.t}
        aria-label="時間"
        style={{ background }}
        onChange={(e) => {
          setPlaying(false);
          seek(Number(e.target.value));
        }}
      />
    </section>
  );
}
