// 分享卡的資料模型（AD-17）：共用外框（品牌、月份、日型、來源、網址）＋依 kind 換的內容區。
// 4.3 先做通勤卡；4.5 行政區卡、7.7 活動卡只要在 ShareCard 加一個成員、在 render.ts 的 CONTENT 加一個繪製函式。
// 卡上每個字都由這裡從資料組出，數字只來自契約資料，少於 10 人一律是 null（AD-3）。
import type { CommuteResult } from "../data/commute";
import type { DayType, MetaFile, Station } from "../data/types";
import { siteLabel } from "../state/url";

export type CardKind = "commute"; // 4.5 加 "district"、7.7 加 "event"

/** 每張卡共用的頁尾：資料月份、日型基準、資料來源、網址（C6）。 */
export interface CardFooter {
  /** 例：2026 年 9 月 */
  month: string;
  /** 例：20 個平日平均 */
  basis: string;
  /** 例：臺北大眾捷運股份有限公司〈臺北捷運每日分時各站 OD 流量統計資料〉 */
  source: string;
  /** 授權與資料集網址（去掉協定） */
  license: string;
  /** 印在卡上的短網址（state/url.ts 的 siteLabel） */
  site: string;
  /** 完整分享網址（state/url.ts 的 shareUrl） */
  url: string;
}

interface CardBase {
  kind: CardKind;
  /** YYYY-MM，用在檔名 */
  month: string;
  dayType: DayType;
  /** 卡片代表的進站時段（AD-15），決定天空與日夜；整天的卡為 null（用白天） */
  hour: number | null;
  footer: CardFooter;
}

export interface CommuteCard extends CardBase {
  kind: "commute";
  hour: number;
  origin: string;
  dest: string;
  /** 平均同路人數；null＝少於 10 人，畫面不得出現數字 */
  companions: number | null;
  /** 迄站在起站該時段的名次；少於 10 人時為 null */
  rank: number | null;
  /** 該時段有數字的目的地數 */
  rankedOf: number;
}

export type ShareCard = CommuteCard;

export const DAY_LABEL: Record<DayType, string> = { weekday: "平日", holiday: "假日" };

const stripProtocol = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/+$/, "");

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

/** 頁尾的四行文字，全部來自 meta.json（AD-17）與分享網址（AD-16）。 */
export function cardFooter(meta: Pick<MetaFile, "month" | "source" | "dayCounts">, dayType: DayType, url: string): CardFooter {
  return {
    month: monthLabel(meta.month),
    basis: `${meta.dayCounts[dayType]} 個${DAY_LABEL[dayType]}平均`,
    source: `${meta.source.publisher}〈${meta.source.name}〉`,
    license: `${meta.source.license}・${stripProtocol(meta.source.url)}`,
    site: siteLabel(url),
    url,
  };
}

export function commuteCard(args: {
  meta: Pick<MetaFile, "month" | "source" | "dayCounts">;
  origin: Pick<Station, "display">;
  dest: Pick<Station, "display">;
  dayType: DayType;
  hour: number;
  result: CommuteResult;
  url: string;
}): CommuteCard {
  const { meta, origin, dest, dayType, hour, result, url } = args;
  return {
    kind: "commute",
    month: meta.month,
    dayType,
    hour,
    footer: cardFooter(meta, dayType, url),
    origin: origin.display,
    dest: dest.display,
    companions: result.companions,
    rank: result.companions === null ? null : result.rank,
    rankedOf: result.rankedOf,
  };
}

/** 下載檔名，例：city-breath-commute-2026-09-weekday-08.png */
export function cardFileName(card: ShareCard): string {
  const h = card.hour === null ? "all" : String(card.hour).padStart(2, "0");
  return `city-breath-${card.kind}-${card.month}-${card.dayType}-${h}.png`;
}
