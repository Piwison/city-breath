// meta.json（服務時段、資料來源、各日型天數）用到才載（決定 29）：通勤面板的時段選單、通勤卡與分享卡的頁尾共用。
// load.ts 依路徑快取，只抓一次；換月份或卸載後，舊的請求回來也不寫入。
import { useEffect, useState } from "react";
import { loadMeta } from "./load";
import type { MetaFile } from "./types";

export type MetaState = { status: "loading" } | { status: "ok"; meta: MetaFile } | { status: "error"; message: string };

export function useMeta(month: string | undefined): MetaState {
  const [state, setState] = useState<{ month: string; value: MetaState } | null>(null);
  useEffect(() => {
    if (!month) return;
    let alive = true;
    loadMeta(month)
      .then((meta) => alive && setState({ month, value: { status: "ok", meta } }))
      .catch((e: Error) => alive && setState({ month, value: { status: "error", message: e.message } }));
    return () => {
      alive = false;
    };
  }, [month]);
  // 換月份後、新的回來之前：不拿舊月份的 meta
  return state && state.month === month ? state.value : { status: "loading" };
}
