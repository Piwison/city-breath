// 「存成圖片」：按下才依資料重畫分享卡（AD-17）。通勤卡、行政區卡（4.5）、活動卡（7.7）共用。
import { useState } from "react";
import type { ShareCard } from "./card";
import { renderShareCard, saveShareCard } from "./render";

export function ShareButton({ card }: { card: () => ShareCard }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  async function onClick() {
    setState("busy");
    try {
      const c = card();
      await saveShareCard(c, await renderShareCard(c));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="share">
      <button type="button" className="share-button" onClick={onClick} disabled={state === "busy"} aria-busy={state === "busy"}>
        {state === "busy" ? "產生圖片中…" : "存成圖片"}
      </button>
      {state === "error" && <p role="alert" className="share-error">圖片產生失敗，請再試一次</p>}
    </div>
  );
}
