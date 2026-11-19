import { formatCount } from "./format";
import type { DayType, OdShard } from "./types";

// 人數格式與「少於 10 人」的門檻在 format.ts（3.22 共用）；這裡沿用原本的匯出名。
export { formatCount, SUPPRESS_BELOW } from "./format";

export interface CommuteResult {
  /** 平均同路人數；null 表示少於 10 人 */
  companions: number | null;
  /** 顯示用文字，少於 10 人一律「少於 10 人」 */
  companionsLabel: string;
  /** 這個時段從起站出發的總人次 */
  departures: number | null;
  /** 你的迄站在起站該時段所有目的地中的名次（1 起算）；少於 10 人時為 null */
  rank: number | null;
  /** 該時段有數字可顯示的目的地數 */
  rankedOf: number;
  /** 該時段從起站出發最常去的 5 站（不含起站本身） */
  top: { station: number; avg: number }[];
}

export function computeCommute(
  shard: OdShard,
  originIndex: number,
  destIndex: number,
  dayType: DayType,
  hour: number,
): CommuteResult | null {
  const row = shard[dayType][hour];
  if (!row) return null; // 停止營運
  const companions = row[destIndex] ?? null;
  const ranked = row
    .map((avg, station) => ({ station, avg }))
    .filter((x): x is { station: number; avg: number } => x.avg !== null && x.station !== originIndex)
    .sort((a, b) => b.avg - a.avg);
  const pos = companions === null ? -1 : ranked.findIndex((x) => x.station === destIndex);
  return {
    companions,
    companionsLabel: formatCount(companions),
    departures: shard[`${dayType}Departures`][hour] ?? null,
    rank: pos >= 0 ? pos + 1 : null,
    rankedOf: ranked.length,
    top: ranked.slice(0, 5),
  };
}

export interface NearbyHour {
  /** 出發時段 0–23 */
  hour: number;
  /** -1＝早一小時、0＝這個時段、1＝晚一小時 */
  offset: -1 | 0 | 1;
  /** 這小時從起站有列車（od 分片該小時不是整列 null，AD-5） */
  operating: boolean;
  /** 平均同路人數；null＝少於 10 人或停止營運（看 operating） */
  companions: number | null;
}

/**
 * 「早一點、晚一點出門呢？」（4.2，走查 A3）：前一小時、這小時、後一小時的同路人數。
 * 時段繞回（0 點的前一格是 23 點），和卡內時間列的 ‹ › 一樣。只讀 od 分片的格，不反推（AD-3）。
 */
export function nearbyHours(shard: OdShard, originIndex: number, destIndex: number, dayType: DayType, hour: number): NearbyHour[] {
  return ([-1, 0, 1] as const).map((offset) => {
    const h = (((hour + offset) % 24) + 24) % 24;
    const res = computeCommute(shard, originIndex, destIndex, dayType, h);
    return { hour: h, offset, operating: res !== null, companions: res?.companions ?? null };
  });
}
