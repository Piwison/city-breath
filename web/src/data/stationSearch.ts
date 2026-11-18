// 「找你的站」的搜尋模型（4.1，產品計畫 v2 決定 15）：清單依路線分組、站序照路線，轉乘站在每條線下都出現，不依行政區。
// 站屬於哪幾條線只看 basemap.json 的 stationLines（AD-21），路線順序與名稱看 basemap.json 的 lines；
// 資料沒有站序，所以同一條線的站用座標建最小生成樹、取最長的一條當主線（南端在前，和官方編號的方向一致），
// 支線（例如中和新蘆線往蘆洲）依接點接在主線後面。這只是清單的顯示順序，不是站名正規化（AD-2）也不是行政區（AD-9）。
// 打字比對只用資料裡本來就有的名字（顯示名、正規站名、「/」分開的每一段），不在前端寫暱稱表。
import type { LineId, Station } from "./types";

export interface SearchStation {
  id: string;
  display: string;
  /** 出站有紀錄（環狀線站為 false：不能當迄站） */
  exitsRecorded: boolean;
  /** 所屬路線（basemap.json stationLines，依 lines 的順序） */
  lines: LineId[];
  /** 比對用的名字（已正規化） */
  keys: string[];
}

export interface LineGroup {
  /** null＝不在任何路線上的站（資料若缺路線才會出現） */
  line: LineId | null;
  name: string;
  /** 依路線順序的站（SearchModel.stations 的索引） */
  stations: number[];
}

export interface SearchModel {
  stations: SearchStation[];
  byId: Map<string, number>;
  groups: LineGroup[];
}

/** 比對用的正規化：全形半形統一、小寫、臺→台、去掉空白與括號符號（括號裡的字留著）。 */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[\s()（）［］[\]【】「」・·]/g, "");
}

/** 使用者打的字：同上，另外去掉結尾的「站」（「大橋頭站」→「大橋頭」；只打「站」時保留）。 */
export function normalizeQuery(q: string): string {
  const n = normalizeName(q);
  return n.length > 1 ? n.replace(/站$/, "") : n;
}

function keysOf(s: Pick<Station, "display" | "name">): string[] {
  const out = new Set<string>();
  for (const name of [s.display, s.name]) {
    out.add(normalizeName(name));
    for (const part of name.split("/")) out.add(normalizeName(part));
  }
  out.delete("");
  return [...out];
}

/** 這一站符不符合打的字（空字串＝全部）。 */
export function matches(s: SearchStation, query: string): boolean {
  const q = normalizeQuery(query);
  return q === "" || s.keys.some((k) => k.includes(q));
}

const KX = Math.cos((25 * Math.PI) / 180);
const dist = (a: { lon: number; lat: number }, b: { lon: number; lat: number }) => Math.hypot((a.lon - b.lon) * KX, a.lat - b.lat);

/**
 * 一條線上各站的順序（站 ID）：座標的最小生成樹 → 樹上最長的路徑當主線，南端在前 → 其餘依接點往外接在後面。
 * 結果只由輸入決定（同距離時依站 ID 排序）。
 */
export function lineOrder(points: readonly { id: string; lon: number; lat: number }[]): string[] {
  const pts = [...points].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = pts.length;
  if (n <= 2) return pts.sort((a, b) => a.lat - b.lat).map((p) => p.id);
  // Prim
  const adj: { to: number; w: number }[][] = pts.map(() => []);
  const inTree = new Array<boolean>(n).fill(false);
  const best = new Array<number>(n).fill(Infinity);
  const from = new Array<number>(n).fill(-1);
  best[0] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0) {
      adj[u].push({ to: from[u], w: best[u] });
      adj[from[u]].push({ to: u, w: best[u] });
    }
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const w = dist(pts[u], pts[v]);
      if (w < best[v]) {
        best[v] = w;
        from[v] = u;
      }
    }
  }
  // 最長路徑：從任一點走到最遠的 a，再從 a 走到最遠的 b
  const walk = (src: number) => {
    const d = new Array<number>(n).fill(-1);
    const par = new Array<number>(n).fill(-1);
    d[src] = 0;
    const stack = [src];
    while (stack.length) {
      const u = stack.pop()!;
      for (const e of adj[u])
        if (d[e.to] < 0) {
          d[e.to] = d[u] + e.w;
          par[e.to] = u;
          stack.push(e.to);
        }
    }
    let far = src;
    for (let i = 0; i < n; i++) if (d[i] > d[far]) far = i;
    return { far, par };
  };
  const a = walk(0).far;
  const { far: b, par } = walk(a);
  const main: number[] = [];
  for (let u = b; u >= 0; u = par[u]) main.push(u);
  // main 是 b → a；南端（緯度小）在前
  if (pts[main[0]].lat > pts[main[main.length - 1]].lat) main.reverse();
  const seen = new Set(main);
  const out = [...main];
  const branch = (u: number) => {
    const next = adj[u].filter((e) => !seen.has(e.to)).sort((x, y) => x.w - y.w);
    for (const e of next) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      out.push(e.to);
      branch(e.to);
    }
  };
  for (const u of main) branch(u);
  return out.map((i) => pts[i].id);
}

/**
 * 建搜尋模型。stations：當月 stations.json（沒有的站不列）；stationLines、lines：basemap.json。
 * 路線依 lines 的順序；當月沒有站的路線不列。
 */
export function searchModel(
  stations: readonly Station[],
  stationLines: Readonly<Record<string, readonly LineId[]>>,
  lines: readonly { id: LineId; name: string }[],
): SearchModel {
  const list: SearchStation[] = stations.map((s) => ({
    id: s.id,
    display: s.display,
    exitsRecorded: s.exitsRecorded,
    lines: lines.filter((l) => stationLines[s.id]?.includes(l.id)).map((l) => l.id),
    keys: keysOf(s),
  }));
  const byId = new Map(list.map((s, i) => [s.id, i]));
  const groups: LineGroup[] = [];
  const placed = new Set<string>();
  for (const l of lines) {
    const on = stations.filter((s) => stationLines[s.id]?.includes(l.id));
    if (!on.length) continue;
    for (const s of on) placed.add(s.id);
    groups.push({ line: l.id, name: l.name, stations: lineOrder(on).map((id) => byId.get(id)!) });
  }
  const rest = stations.filter((s) => !placed.has(s.id));
  if (rest.length)
    groups.push({
      line: null,
      name: "其他車站",
      stations: [...rest].sort((a, b) => a.display.localeCompare(b.display, "zh-TW")).map((s) => byId.get(s.id)!),
    });
  return { stations: list, byId, groups };
}

/** 打字後的分組：只留符合的站，沒有站的路線不列。 */
export function filterGroups(model: SearchModel, query: string): LineGroup[] {
  if (normalizeQuery(query) === "") return model.groups;
  return model.groups
    .map((g) => ({ ...g, stations: g.stations.filter((i) => matches(model.stations[i], query)) }))
    .filter((g) => g.stations.length > 0);
}

/** 最近用過的站 → 當月有的站（索引），順序不變；當月沒有的站略過（AD-22）。 */
export function recentIn(ids: readonly string[], model: SearchModel, query = ""): number[] {
  const out: number[] = [];
  for (const id of ids) {
    const i = model.byId.get(id);
    if (i !== undefined && matches(model.stations[i], query)) out.push(i);
  }
  return out;
}
