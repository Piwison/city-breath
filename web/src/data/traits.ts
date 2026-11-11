// 站的指標只有這一個出處（AD-26）。3.6 先放「此刻進出」與「這區最忙」；
// 3.12 車站卡的個性（假日倍數、早上進出比……與全線排名前 20）、3.10 此刻最忙皇冠、3.9 徽章都加在這裡，
// 大日子時改餵那天的 daily 資料、用同一個函式。都是純函式，不寫死站名或數字。
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
