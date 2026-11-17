// 城市睡覺提示（3.4）：停駛的小時常駐一句安靜的提示「捷運停駛中・約 6 點發車」（產品計畫 v2 決定 8），
// 在時間軸（或小卡）正上方，不蓋住天上的月亮；路線變暗照舊（Rails）。
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
