import type { DayType, OdShard } from "./types";

export const SUPPRESS_BELOW = 10;

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

export function formatCount(n: number | null): string {
  if (n === null) return `少於 ${SUPPRESS_BELOW} 人`;
  return `${n.toLocaleString("zh-TW")} 人`;
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
