// 首頁上方的「找你的通勤」入口（epic 的 Touch point）：先打開搬來的通勤同路人表單與分享卡（4.3），
// 正式的搜尋式入口與通勤卡由 4.1 換掉。開關是元件內的暫時 UI 狀態，不是畫面狀態（不進網址、不保存）。
import { useId, useState } from "react";
import { CommuteForm } from "../commute/CommuteForm";

export function CommuteEntry() {
  const [open, setOpen] = useState(false);
  // 第一次打開才載表單與車站資料；之後關起來只是藏著，結果不會不見
  const [loaded, setLoaded] = useState(false);
  if (open && !loaded) setLoaded(true);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="hud commute-pill"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="12.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="12.5" cy="3.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M5.3 11.4C8 9.5 6 6.5 10.7 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        找你的通勤
      </button>
      <div id={id} className="hud commute-panel" hidden={!open}>
        <button type="button" className="close" aria-label="關閉" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {loaded && <CommuteForm />}
      </div>
    </>
  );
}
