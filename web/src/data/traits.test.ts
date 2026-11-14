import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import {
  busiestStations,
  daySeries,
  METRIC_KEYS,
  percent,
  stationMetrics,
  stationTraits,
  stationVolume,
  times,
  traitBoard,
  TRAIT_MAX,
  TRAIT_TOP,
} from "./traits";
import type { BasemapFile, Station, StationsFile } from "./types";

// 2026-09（底圖的車站月份＝最新月份）的真實資料：排名與倍數都由 stations.json 實算，換月份就重算
const month = (basemapJson as unknown as BasemapFile).stationsMonth;
const real = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`].stations;
const at = (display: string) => {
  const i = real.findIndex((s) => s.display === display);
  if (i < 0) throw new Error(`${month} 沒有 ${display}`);
  return i;
};
/** 直接從 stations.json 加總（和 traits.ts 分開寫，用來對數字）。 */
const add = (arr: (number | null)[], hours: number[]) => hours.reduce((a, h) => a + (arr[h] ?? 0), 0);
const ALL = Array.from({ length: 24 }, (_, h) => h);

const hours = (f: (h: number) => number | null) => Array.from({ length: 24 }, (_, h) => f(h));
const closed = (h: number) => h >= 2 && h <= 4;

function station(over: Partial<Station> = {}): Station {
  return {
    id: "s1",
    name: "A",
    display: "A",
    lon: 121.5,
    lat: 25,
    exitsRecorded: true,
    district: "X",
    type: null,
    weekday: { entries: hours((h) => (closed(h) ? null : 100)), exits: hours((h) => (closed(h) ? null : 50)) },
    holiday: { entries: hours((h) => (closed(h) ? null : 10)), exits: hours((h) => (closed(h) ? null : 5)) },
    topDestinations: { weekday: [], holiday: [] },
    ...over,
  };
}

describe("stationVolume（此刻進出）", () => {
  it("這一小時＝進＋出", () => {
    expect(stationVolume(station(), "weekday", 8)).toEqual({ value: 150, entries: 100, exits: 50, entriesOnly: false });
  });
  it("停止營運是 null，不是 0（AD-5）", () => {
    expect(stationVolume(station(), "weekday", 3).value).toBeNull();
  });
  it("整天：只加有營運的小時", () => {
    expect(stationVolume(station(), "holiday", "day")).toMatchObject({ value: 21 * 15, entries: 210, exits: 105 });
  });
  it("環狀線（出站未入檔）只算進站並標出來", () => {
    const v = stationVolume(station({ exitsRecorded: false }), "weekday", 8);
    expect(v).toEqual({ value: 100, entries: 100, exits: null, entriesOnly: true });
  });
});

describe("busiestStations（這區最忙）", () => {
  const list = [
    station({ id: "a" }),
    station({ id: "b", weekday: { entries: hours(() => 900), exits: hours(() => 900) } }),
    station({ id: "c", exitsRecorded: false }),
  ];
  it("由多到少；不在清單的索引略過", () => {
    expect(busiestStations(list, [0, 1, 2, 9], "weekday", 8).map((x) => x.index)).toEqual([1, 0, 2]);
  });
  it("停止營運的站排最後（null 不當 0 參與比較）", () => {
    const r = busiestStations(list, [0, 1], "weekday", 3);
    expect(r.map((x) => x.volume.value)).toEqual([900 * 2, null]);
  });
});

describe("daySeries（整天長條）", () => {
  it("24 格＝每小時的此刻進出；停止營運是 null", () => {
    const s = daySeries(station(), "weekday");
    expect(s).toHaveLength(24);
    expect(s[8]).toBe(150);
    expect(s[3]).toBeNull();
  });
  it("真實資料：和 stationVolume 每一格相同", () => {
    const s = real[at("台北車站")];
    expect(daySeries(s, "holiday")).toEqual(ALL.map((h) => stationVolume(s, "holiday", h).value));
  });
});

describe("stationMetrics（指標）", () => {
  it("合成站：早上進出比、占比、假日倍數", () => {
    const m = stationMetrics(station());
    // 平日每小時進 100 出 50、21 個營運小時
    expect(m.W).toBe(21 * 150);
    expect(m.H).toBe(21 * 15);
    expect(m.ratio).toBeCloseTo(0.1);
    expect(m.office).toBeCloseTo(0.5);
    expect(m.bed).toBeCloseTo(2);
    expect(m.evening).toBeCloseTo(4 / 21);
    expect(m.late).toBeCloseTo(2 / 21);
    expect(m.early).toBeCloseTo(2 / 21);
    expect(m.ranked).toBe(true);
  });
  it("環狀線（出站未入檔）與平日沒有進出的站不排名", () => {
    expect(stationMetrics(station({ exitsRecorded: false })).ranked).toBe(false);
    const zero = hours(() => 0);
    expect(stationMetrics(station({ weekday: { entries: zero, exits: zero } })).ranked).toBe(false);
  });
  it("分母是 0 時不會出現無限大", () => {
    const zero = hours(() => 0);
    const m = stationMetrics(station({ weekday: { entries: zero, exits: zero } }));
    for (const k of METRIC_KEYS) expect(Number.isFinite(m[k])).toBe(true);
  });
});

describe("traitBoard（全線排名）", () => {
  const list = [
    station({ id: "a", weekday: { entries: hours(() => 100), exits: hours(() => 100) } }),
    station({ id: "b", weekday: { entries: hours(() => 300), exits: hours(() => 300) } }),
    station({ id: "c", weekday: { entries: hours(() => 100), exits: hours(() => 100) } }),
    station({ id: "d", exitsRecorded: false, weekday: { entries: hours(() => 9999), exits: hours(() => 0) } }),
  ];
  it("名次＝比這站大的站數＋1，同分同名次；環狀線不在排名池、名次 null", () => {
    const b = traitBoard(list);
    expect(b.pool).toEqual([0, 1, 2]);
    expect(b.rank("W", 1)).toBe(1);
    expect(b.rank("W", 0)).toBe(2);
    expect(b.rank("W", 2)).toBe(2);
    expect(b.rank("W", 3)).toBeNull();
  });
  it("同一份陣列只算一次", () => {
    expect(traitBoard(list)).toBe(traitBoard(list));
  });
});

describe(`stationTraits（${month} 實算：個性＝全線前 ${TRAIT_TOP} 的特質，最多 ${TRAIT_MAX} 個）`, () => {
  const board = traitBoard(real);
  const ranked = real.filter((s) => s.exitsRecorded).length;

  it("排名池＝出站有紀錄且平日有進出的站（環狀線不算）", () => {
    expect(board.pool.length).toBe(real.filter((s) => s.exitsRecorded && stationMetrics(s).W > 0).length);
    expect(board.pool.length).toBeLessThanOrEqual(ranked);
    expect(board.pool.every((i) => real[i].exitsRecorded)).toBe(true);
  });

  it("蘆洲：早上進站是出站的幾倍，全線第 1（大家從這裡出門）", () => {
    const i = at("蘆洲");
    const s = real[i];
    const bed = add(s.weekday.entries, [7, 8, 9]) / add(s.weekday.exits, [7, 8, 9]);
    const t = stationTraits(real, i);
    expect(t.traits[0]).toMatchObject({ key: "bed", rank: 1 });
    expect(t.traits[0].value).toBeCloseTo(bed);
    // 全線最高：沒有任何站的早上進出比比它大
    expect(board.pool.every((j) => board.metrics[j].bed <= bed)).toBe(true);
    expect(t.traits[0].text).toBe(`平日早上 7–10 點，進站是出站的 ${times(bed)} 倍（全線第 1）——大家從這裡出門。`);
    expect(t.traits.length).toBeLessThanOrEqual(TRAIT_MAX);
  });

  it("台大醫院：早上出站是進站的幾倍，全線第 1（一早大家在這裡下車）", () => {
    const i = at("台大醫院");
    const s = real[i];
    const office = add(s.weekday.exits, [7, 8, 9]) / add(s.weekday.entries, [7, 8, 9]);
    const t = stationTraits(real, i);
    expect(t.traits[0]).toMatchObject({ key: "office", rank: 1 });
    expect(t.traits[0].value).toBeCloseTo(office);
    expect(t.traits[0].text).toContain(`出站是進站的 ${times(office)} 倍（全線第 1）`);
  });

  it("動物園：假日一天的人次是平日的幾倍，全線第 1", () => {
    const i = at("動物園");
    const s = real[i];
    const ratio = (add(s.holiday.entries, ALL) + add(s.holiday.exits, ALL)) / (add(s.weekday.entries, ALL) + add(s.weekday.exits, ALL));
    const t = stationTraits(real, i);
    expect(t.traits[0]).toMatchObject({ key: "ratio", rank: 1 });
    expect(t.traits[0].text).toBe(`假日一天的人次是平日的 ${times(ratio)} 倍，全線第 1 高。`);
  });

  it("台北車站：平日一天進出全線第 1", () => {
    const t = stationTraits(real, at("台北車站"));
    expect(t.traits[0]).toMatchObject({ key: "W", rank: 1 });
    expect(t.traits[0].text).toMatch(/^平日一天約 [\d,]+ 人次進出，全線第 1 名。$/);
  });

  it("每一站的特質都在前 20、最多 2 個、名次由小到大；早上進出比只列大於 1 的方向", () => {
    for (const i of board.pool) {
      const t = stationTraits(real, i);
      expect(t.traits.length).toBeLessThanOrEqual(TRAIT_MAX);
      expect(t.traits.every((x) => x.rank >= 1 && x.rank <= TRAIT_TOP)).toBe(true);
      expect(t.traits.map((x) => x.rank)).toEqual([...t.traits.map((x) => x.rank)].sort((a, b) => a - b));
      for (const x of t.traits) if (x.key === "office" || x.key === "bed") expect(x.value).toBeGreaterThan(1);
      // 沒有前 20 的特質：只給平日一天人次與名次（不硬湊）
      expect(t.fallback === null).toBe(t.traits.length > 0);
      if (t.fallback) expect(t.fallback).toMatchObject({ key: "W", rank: board.rank("W", i) });
    }
  });

  it("占比的文案帶全線平均", () => {
    const i = board.pool.find((j) => stationTraits(real, j).traits.some((t) => t.key === "evening"))!;
    const t = stationTraits(real, i).traits.find((x) => x.key === "evening")!;
    expect(t.text).toContain(`（平均 ${percent(board.avg("evening"))}）`);
  });

  it("環狀線站：不排名、沒有個性", () => {
    const i = real.findIndex((s) => !s.exitsRecorded);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(stationTraits(real, i)).toEqual({ ranked: false, traits: [], fallback: null });
  });
});

describe("格式", () => {
  it("倍數：10 以上整數、2 以上一位、其餘兩位；百分比一位", () => {
    expect(times(12.77)).toBe("13");
    expect(times(7.669)).toBe("7.7");
    expect(times(1.271)).toBe("1.27");
    expect(percent(0.0491)).toBe("4.9%");
  });
});
