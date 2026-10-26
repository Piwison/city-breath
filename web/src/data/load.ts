import type { FlowsFile, MetaFile, MonthsFile, OdShard, StationsFile } from "./types";

export const CONTRACT_VERSION = 1;
const BASE = `${import.meta.env.BASE_URL}data`;

const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${BASE}/${path}`).then(async (r) => {
      if (!r.ok) throw new Error(`載入 ${path} 失敗：${r.status}`);
      const body = (await r.json()) as T & { v?: number };
      if (body.v !== undefined && body.v !== CONTRACT_VERSION) {
        throw new Error(`${path} 的資料契約版本 ${body.v} 與網站 ${CONTRACT_VERSION} 不符`);
      }
      return body;
    });
    cache.set(path, p);
    p.catch(() => cache.delete(path));
  }
  return p;
}

export const loadMonths = () => getJson<MonthsFile>("months.json");
export const loadMeta = (month: string) => getJson<MetaFile>(`${month}/meta.json`);
export const loadStations = (month: string) => getJson<StationsFile>(`${month}/stations.json`);
export const loadFlows = (month: string) => getJson<FlowsFile>(`${month}/flows.json`);
/** 只有使用者選了起站才載入（約 25 KB） */
export const loadOdShard = (month: string, stationId: string) =>
  getJson<OdShard>(`${month}/od/${stationId}.json`);
