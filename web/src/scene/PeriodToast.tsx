// 時段名浮出（3.3，原型 maybeToast 移植；diorama-game-juice「回饋的強度」中級）：播放中跨進新時段時，
// 上方浮出時段名與一句副標，約 1.7 秒後收起。開場第一次、暫停中（拖時間軸）不浮出。
// 只訂閱整數 hour、dayType、playing；進出用 CSS transition（--dur-enter，減少動態時歸零＝直接出現與消失）。
import { useEffect, useRef, useState } from "react";
import { periodHint, periodName, shouldToast } from "../data/periods";
import type { FlowSource } from "../data/views";
import { useView } from "../state/view";

/** 浮出後停留多久（毫秒）。 */
export const TOAST_MS = 1700;

export function PeriodToast({ source }: { source?: FlowSource }) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const playing = useView((s) => s.playing);
  const name = source ? periodName(hour, dayType, source.operating(dayType, hour)) : null;
  const prev = useRef<string | null>(null);
  const [shown, setShown] = useState<{ name: string } | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (name === null) return;
    const before = prev.current;
    prev.current = name;
    if (!shouldToast(before, name, playing)) return;
    setShown({ name });
    setOpen(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), TOAST_MS);
    // 只在時段名換了時判斷；playing 變了不補浮出，暫停也不提早收起已浮出的提示
  }, [name]);

  // 容器一直在（收起時看不見、不接手指），進場時 transition 才有起點
  const hint = shown ? periodHint(shown.name) : undefined;
  return (
    <div className="period-toast hud" data-open={open} role="status" aria-live="polite">
      {shown && <b>{shown.name}</b>}
      {hint && <small>{hint}</small>}
    </div>
  );
}
