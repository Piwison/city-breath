// 卡片第一行的一句答案（3.22；產品計畫 v2 決定 11、體驗原則 2）：「平日 8 點，永和的人最常去中正區」。
// 純函式，只用卡上已有的名次與數字（行政區卡的去哪排名、車站卡的前 5 目的地與這小時進出）組句子；
// 寫明時段與日型（periods.ts whenLabel，與卡上的膠囊同一種寫法），不用表示即時的字眼（體驗原則 3）。
// 第一名少於 10 人、停止營運、環狀線站出站未入檔各有對應的句子，不留空白、不寫 0。
// 通勤卡（4.2）的句子在最後；之後的假日卡（3.18）、活動卡（7.4）、地標卡（8.1）在這裡加自己的句子。
import { formatCount, SUPPRESS_BELOW } from "./format";
import { whenLabel } from "./periods";
import type { DayType } from "./types";

/** 行政區當主詞時去掉「區」（「永和的人」）；只剩一個字或不是以「區」結尾就照原名。 */
export function districtShort(name: string): string {
  return name.length > 2 && name.endsWith("區") ? name.slice(0, -1) : name;
}

export interface DistrictAnswerInput {
  /** 行政區名（districts.json） */
  name: string;
  dayType: DayType;
  /** 這一小時，或 "day"＝整天 */
  hour: number | "day";
  /** 這個時段有營運（整天模式永遠 true） */
  operating: boolean;
  /** 去哪排名（只列跨區，由大到小；views.ts districtRanks().out），name 是別區的名稱 */
  out: readonly { name: string; value: number }[];
}

export function districtAnswer({ name, dayType, hour, operating, out }: DistrictAnswerInput): string {
  const when = whenLabel(dayType, hour);
  const who = districtShort(name);
  if (!operating) return `${when}捷運停止營運，${who}沒有列車`;
  const top = out[0];
  if (!top || top.value < SUPPRESS_BELOW) return `${when}，${who}的人往別區的每個方向都少於 ${SUPPRESS_BELOW} 人`;
  return `${when}，${who}的人最常去${top.name}`;
}

export interface StationAnswerInput {
  /** 站名（stations.json display） */
  name: string;
  dayType: DayType;
  hour: number;
  /** 這小時有營運（流向資料該小時不是整格 null，且這站有進出） */
  operating: boolean;
  /** 環狀線站：出站未入檔（exitsRecorded=false） */
  entriesOnly: boolean;
  /** 這小時進出（環狀線只有進站）；od 分片還沒到時用它組句子 */
  volume: number | null;
  /** 這小時從這站出發的前 5 目的地（由多到少）；null＝od 分片載入中或失敗 */
  top: readonly { name: string; value: number }[] | null;
}

// 括號縮短（3.15 預設，Piwi 可推翻）：未入檔的說明在卡內另一行
export const LOOP_NOTE = "（只算在北捷站下車的人）";

export function stationAnswer({ name, dayType, hour, operating, entriesOnly, volume, top }: StationAnswerInput): string {
  const when = whenLabel(dayType, hour);
  if (!operating) return `${when}捷運停止營運，${name}沒有列車`;
  if (top === null) {
    const what = entriesOnly ? "進站" : "進出";
    return `${when}，${name}${what} ${formatCount(volume)}${entriesOnly ? "，出站未入檔" : ""}`;
  }
  const first = top[0];
  if (!first || first.value < SUPPRESS_BELOW) return `${when}，從${name}出發的每個方向都少於 ${SUPPRESS_BELOW} 人`;
  return `${when}，從${name}出發的人最常去${first.name}${entriesOnly ? LOOP_NOTE : ""}`;
}

export interface CommuteAnswerInput {
  /** 起站、迄站名（stations.json display） */
  origin: string;
  dest: string;
  dayType: DayType;
  /** 出發（進站）時段（AD-15） */
  hour: number;
  /** 這小時從起站有列車（od 分片該小時不是整列 null，AD-5） */
  operating: boolean;
  /** 平均同路人數；null＝少於 10 人（AD-3） */
  companions: number | null;
}

/** 通勤卡（4.2）：「平日 8 點，約 1,234 人和你一樣從頂溪到台北車站」；少於 10 人不寫數字。 */
export function commuteAnswer({ origin, dest, dayType, hour, operating, companions }: CommuteAnswerInput): string {
  const when = whenLabel(dayType, hour);
  if (!operating) return `${when}捷運停止營運，${origin}沒有列車`;
  if (companions === null || !Number.isFinite(companions) || companions < SUPPRESS_BELOW)
    return `${when}，和你一樣從${origin}到${dest}的人少於 ${SUPPRESS_BELOW} 人`;
  return `${when}，約 ${formatCount(companions)}和你一樣從${origin}到${dest}`;
}
