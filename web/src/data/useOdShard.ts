// 選了一站才載它的起訖分片（AD-6，約 25 KB）：車站卡與地圖上的站對站緞帶共用，load.ts 依路徑快取，只抓一次。
// 換站或關卡時，舊的請求回來也不寫入（alive 旗標）。
import { useEffect, useState } from "react";
import { loadOdShard } from "./load";
import type { OdShard } from "./types";

export type OdState =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ok"; id: string; shard: OdShard }
  | { status: "error"; id: string; message: string };

export function useOdShard(month: string, stationId: string | null): OdState {
  const [state, setState] = useState<OdState>({ status: "idle" });
  useEffect(() => {
    if (!stationId) {
      setState({ status: "idle" });
      return;
    }
    let alive = true;
    setState({ status: "loading", id: stationId });
    loadOdShard(month, stationId)
      .then((shard) => alive && setState({ status: "ok", id: stationId, shard }))
      .catch((e: Error) => alive && setState({ status: "error", id: stationId, message: e.message }));
    return () => {
      alive = false;
    };
  }, [month, stationId]);
  // 換站後、effect 跑之前的那一次繪製：舊站的分片不能拿來當新站的
  if (state.status !== "idle" && state.id !== stationId) return stationId ? { status: "loading", id: stationId } : { status: "idle" };
  return state;
}
