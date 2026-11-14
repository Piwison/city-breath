// 站的指標只有這一個出處（AD-26）。3.6 先放「此刻進出」與「這區最忙」；
// 3.12 車站卡的個性（全日人次、假日倍數、早上進出比、晚上與清晨占比，全線排名與「前 20 的特質」）在這裡；
// 3.10 此刻最忙皇冠、3.9 徽章也加在這裡，大日子時改餵那天的 daily 資料、用同一個函式。
// 都是純函式，不寫死站名或數字：換月份就從那個月的 stations.json 重算。
import type { DayType, Station } from "./types";

/** 一站在某日型某小時（或整天）的進出人數。 */
export interface StationVolume {
  /** 進站＋出站（環狀線站只有進站）；停止營運（AD-5）為 null */
  value: number | null;
  entries: number | null;
  /** 出站；環狀線站出站未入檔時為 null */
  exits: number | null;
  /** 出站未入檔（環狀線，exitsRecorded=false）：value 只算進站 */
  entriesOnly: boolean;
}

const sum = (xs: (number | null)[]) => {
  let s = 0;
  let any = false;
  for (const x of xs)
    if (x !== null) {
      s += x;
      any = true;
    }
  return any ? s : null;
};

/**
 * 此刻進出（車站卡、行政區卡、站珠共用）：hour 為 "day" 時加總整天（停止營運的小時跳過）。
 * 站的進出是站層級總量，不受少於 10 人的限制（AD-3）；整小時 null 就是停止營運，不當 0。
 */
export function stationVolume(s: Station, dayType: DayType, hour: number | "day"): StationVolume {
  const p = s[dayType];
  const pick = (arr: (number | null)[]) => (hour === "day" ? sum(arr) : (arr[((Math.floor(hour) % 24) + 24) % 24] ?? null));
  const entries = pick(p.entries);
  const exits = s.exitsRecorded ? pick(p.exits) : null;
  const value = entries === null && exits === null ? null : (entries ?? 0) + (exits ?? 0);
  return { value, entries, exits, entriesOnly: !s.exitsRecorded };
}

/** 一組站（例如一區的站，stations.json 索引）依此刻進出由多到少；停止營運的站排在最後。 */
export function busiestStations(
  stations: readonly Station[],
  indices: readonly number[],
  dayType: DayType,
  hour: number | "day",
): { index: number; volume: StationVolume }[] {
  return indices
    .filter((i) => stations[i])
    .map((index) => ({ index, volume: stationVolume(stations[index], dayType, hour) }))
    .sort((a, b) => (b.volume.value ?? -1) - (a.volume.value ?? -1) || a.index - b.index);
}

/** 一站整天 24 格的進出（車站卡的整天長條）：每格同 stationVolume；停止營運為 null。 */
export function daySeries(s: Station, dayType: DayType): (number | null)[] {
  return Array.from({ length: 24 }, (_, h) => stationVolume(s, dayType, h).value);
}

// ── 個性（3.12，原型 MET／TRAITS／traitsOf 移植）：每站的指標、全線排名與「前 20 的特質」 ──

/** 指標的鍵。W＝平日全日進出；ratio＝假日÷平日；office／bed＝平日早上出站÷進站與反過來；evening、late、early＝占比。 */
export type MetricKey = "W" | "ratio" | "office" | "bed" | "evening" | "late" | "early";

/** 一站的指標（都由 stations.json 的每小時平均算出；停止營運的小時不加）。 */
export interface StationMetrics {
  /** 參與全線排名：出站有紀錄（環狀線不算，進出只有一半）且平日有進出 */
  ranked: boolean;
  /** 平日全日進出（人次） */
  W: number;
  /** 假日全日進出（人次） */
  H: number;
  /** 假日一天是平日的幾倍 */
  ratio: number;
  /** 平日早上 7–10 點（7、8、9 點進站時段）出站 ÷ 進站：大於 1＝一早大家在這裡下車 */
  office: number;
  /** 平日早上 7–10 點進站 ÷ 出站：大於 1＝大家從這裡出門 */
  bed: number;
  /** 平日晚上 6–10 點（18–21 點）出站占全天出站 */
  evening: number;
  /** 平日晚上 10 點以後（22、23 點）進出占全天進出 */
  late: number;
  /** 平日清晨 5、6 點進站占全天進站 */
  early: number;
}

/** 特質的順序（名次相同時照這個順序挑；也是原型 TRAITS 的順序）。 */
export const METRIC_KEYS: readonly MetricKey[] = ["W", "ratio", "office", "bed", "evening", "late", "early"];

/** 「突出」的門檻：全線名次在前幾名才算特質（DESIGN.md 原則 5、AD-26）。 */
export const TRAIT_TOP = 20;
/** 車站卡最多列幾個特質。 */
export const TRAIT_MAX = 2;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const AM = [7, 8, 9];
const EVENING = [18, 19, 20, 21];
const LATE = [22, 23];
const EARLY = [5, 6];

function total(arr: (number | null)[], hours: readonly number[]): number {
  let s = 0;
  for (const h of hours) s += arr[h] ?? 0;
  return s;
}

/** 一站的指標。分母是 0 時以 1 代替（原型 Math.max(1, …)），不會出現無限大。 */
export function stationMetrics(s: Station): StationMetrics {
  const wd = s.weekday;
  const enT = total(wd.entries, HOURS);
  const exT = total(wd.exits, HOURS);
  const W = enT + exT;
  const H = total(s.holiday.entries, HOURS) + total(s.holiday.exits, HOURS);
  const amIn = total(wd.exits, AM);
  const amOut = total(wd.entries, AM);
  return {
    ranked: s.exitsRecorded && W > 0,
    W,
    H,
    ratio: H / Math.max(1, W),
    office: amIn / Math.max(1, amOut),
    bed: amOut / Math.max(1, amIn),
    evening: total(wd.exits, EVENING) / Math.max(1, exT),
    late: (total(wd.entries, LATE) + total(wd.exits, LATE)) / Math.max(1, W),
    early: total(wd.entries, EARLY) / Math.max(1, enT),
  };
}

/** 全線的指標表：每站指標、排名池（ranked 的站）、某指標的名次與全線平均。 */
export interface TraitBoard {
  metrics: StationMetrics[];
  /** 參與排名的站（stations.json 索引） */
  pool: number[];
  /** 名次：比這站大的站數＋1（同分同名次）；不在排名池回傳 null */
  rank(key: MetricKey, i: number): number | null;
  /** 排名池的平均 */
  avg(key: MetricKey): number;
}

const boards = new WeakMap<readonly Station[], TraitBoard>();

/** 一個月份的指標表（同一份 stations 陣列只算一次）。 */
export function traitBoard(stations: readonly Station[]): TraitBoard {
  const cached = boards.get(stations);
  if (cached) return cached;
  const metrics = stations.map(stationMetrics);
  const pool = metrics.flatMap((m, i) => (m.ranked ? [i] : []));
  const avgs = new Map<MetricKey, number>();
  const b: TraitBoard = {
    metrics,
    pool,
    rank(key, i) {
      const m = metrics[i];
      if (!m?.ranked) return null;
      let r = 1;
      for (const j of pool) if (metrics[j][key] > m[key]) r++;
      return r;
    },
    avg(key) {
      let v = avgs.get(key);
      if (v === undefined) {
        v = pool.reduce((a, j) => a + metrics[j][key], 0) / Math.max(1, pool.length);
        avgs.set(key, v);
      }
      return v;
    },
  };
  boards.set(stations, b);
  return b;
}

/** 一個特質：哪個指標、全線第幾、值，以及畫面上的一句話。 */
export interface Trait {
  key: MetricKey;
  rank: number;
  value: number;
  text: string;
}

export interface StationTraits {
  /** 參與排名（環狀線與當月平日沒有進出的站為 false：沒有個性與名次） */
  ranked: boolean;
  /** 名次在前 TRAIT_TOP 的特質，最多 TRAIT_MAX 個，名次小的在前 */
  traits: Trait[];
  /** 沒有任何前 20 的特質時：平日一天的人次與名次（不稱為特質）；有特質時為 null */
  fallback: Trait | null;
}

const fmtInt = (n: number) => Math.round(n).toLocaleString("zh-TW");
/** 倍數：10 以上取整數、2 以上一位小數、其餘兩位（原型 x2）。 */
export const times = (v: number) => v.toFixed(v >= 10 ? 0 : v >= 2 ? 1 : 2);
/** 百分比：一位小數。 */
export const percent = (v: number) => `${(v * 100).toFixed(1)}%`;

/** 特質的一句話（原型 TRAITS 的文案；數字都從指標與名次帶入）。 */
export function traitText(key: MetricKey, m: StationMetrics, rank: number, avg: number): string {
  switch (key) {
    case "W":
      return `平日一天約 ${fmtInt(m.W)} 人次進出，全線第 ${rank} 名。`;
    case "ratio":
      return `假日一天的人次是平日的 ${times(m.ratio)} 倍，全線第 ${rank} 高。`;
    case "office":
      return `平日早上 7–10 點，出站是進站的 ${times(m.office)} 倍（全線第 ${rank}）——一早大家在這裡下車。`;
    case "bed":
      return `平日早上 7–10 點，進站是出站的 ${times(m.bed)} 倍（全線第 ${rank}）——大家從這裡出門。`;
    case "evening":
      return `平日晚上 6–10 點的出站占全天出站 ${percent(m.evening)}，全線第 ${rank}（平均 ${percent(avg)}）。`;
    case "late":
      return `平日晚上 10 點以後的進出占全天 ${percent(m.late)}，全線第 ${rank}（平均 ${percent(avg)}）。`;
    case "early":
      return `平日清晨 5、6 點進站的人占全天進站 ${percent(m.early)}，全線第 ${rank}（平均 ${percent(avg)}）。`;
  }
}

/**
 * 這一站的個性（原型 traitsOf）：每個指標的全線名次，挑名次在前 TRAIT_TOP 的、最多 TRAIT_MAX 個。
 * 早上進出比只在大於 1 時才算那個方向（office＝下車多、bed＝出門多，兩者不會同時大於 1）。
 * 沒有任何前 20 時不硬湊特質（票面「排名前 20 的特質」），改給平日一天人次與名次（fallback）。
 */
export function stationTraits(stations: readonly Station[], i: number, top: number = TRAIT_TOP, max: number = TRAIT_MAX): StationTraits {
  const b = traitBoard(stations);
  const m = b.metrics[i];
  if (!m?.ranked) return { ranked: false, traits: [], fallback: null };
  const make = (key: MetricKey): Trait => {
    const rank = b.rank(key, i) ?? 0;
    return { key, rank, value: m[key], text: traitText(key, m, rank, b.avg(key)) };
  };
  const all = METRIC_KEYS.filter((k) => (k !== "office" && k !== "bed") || m[k] > 1)
    .map(make)
    .sort((a, c) => a.rank - c.rank || METRIC_KEYS.indexOf(a.key) - METRIC_KEYS.indexOf(c.key));
  const traits = all.filter((t) => t.rank <= top).slice(0, max);
  return { ranked: true, traits, fallback: traits.length ? null : make("W") };
}
