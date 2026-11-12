// 城市睡覺提示（3.4）：停駛的小時，上方常駐一句安靜的提示「捷運停駛中・約 6 點第一班車」，
// 和時段名浮出（PeriodToast）同一個位置；停駛時段名不浮出，兩個不會疊在一起。
// 停駛只看資料（state/service.ts，AD-5）；第一班車只看官方班距，推不出就只寫「捷運停駛中」。
// 只訂閱整點；進出用 CSS transition（--dur-enter，減少動態時歸零＝直接出現與消失）。
import { useRef } from "react";
import { sleepHint } from "../data/periods";
import { firstTrainAt, useClosed } from "../state/service";
import { useView } from "../state/view";

export function SleepHint() {
  const closed = useClosed();
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  // 收起時保留上一次的文字，淡出時還看得到內容
  const last = useRef<ReturnType<typeof sleepHint> | null>(null);
  if (closed) last.current = sleepHint(firstTrainAt(dayType, hour));
  const hint = last.current;
  return (
    <div className="sleep-hint hud" data-open={closed} role="status" aria-live="polite" aria-hidden={!closed}>
      {hint && (
        <>
          <i className="moon" aria-hidden="true" />
          <b>{hint.title}</b>
          {hint.sub && <small>・{hint.sub}</small>}
        </>
      )}
    </div>
  );
}
