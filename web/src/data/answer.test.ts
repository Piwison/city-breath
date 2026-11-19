// 3.22 卡片第一行的一句答案：句子只由輸入的名次組出，寫明時段與日型，各種邊界都有句子（不留空白、不寫 0）。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import answerSource from "./answer.ts?raw";
import { commuteAnswer, districtAnswer, districtShort, LOOP_NOTE, stationAnswer } from "./answer";
import { districtRanks } from "./views";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, StationsFile } from "./types";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const districts = glob<DistrictsFile>(import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }), "districts.json");
const flows = glob<DistrictFlowsFile>(
  import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }),
  "district-flows.json",
);
const stations = glob<StationsFile>(import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }), "stations.json");
const names = new Map(districts.districts.map((d) => [d.id, d.name]));
const idOf = (name: string) => districts.districts.find((d) => d.name === name)!.id;

/** 一個人數 0–9 出現在句子裡（「少於 10 人」的 10 不算） */
const SMALL = /(?<![\d,.])\d(?![\d,.])\s*人/;

describe("行政區卡的一句答案", () => {
  it(`${month} 平日 8 點永和區：指向卡上去哪的第一名`, () => {
    const id = idOf("永和區");
    const ranks = districtRanks(flows, "weekday", "hour", 8, id);
    const out = ranks.out.map((r) => ({ name: names.get(r.id)!, value: r.value }));
    const s = districtAnswer({ name: "永和區", dayType: "weekday", hour: 8, operating: ranks.operating, out });
    expect(s).toBe(`平日 8 點，永和的人最常去${out[0].name}`);
    if (month === "2026-09") expect(out[0].name).toBe("中正區");
  });

  it("整天、假日都寫明時段與日型", () => {
    const out = [{ name: "乙區", value: 120 }];
    expect(districtAnswer({ name: "甲甲區", dayType: "holiday", hour: "day", operating: true, out })).toBe("假日整天，甲甲的人最常去乙區");
  });

  it("第一名少於 10 人（排名空或值 < 10）：換成少於 10 人的句子，不寫 0", () => {
    for (const out of [[], [{ name: "乙區", value: 4 }]]) {
      const s = districtAnswer({ name: "甲甲區", dayType: "weekday", hour: 5, operating: true, out });
      expect(s).toBe("平日 5 點，甲甲的人往別區的每個方向都少於 10 人");
      expect(s).not.toMatch(SMALL);
    }
  });

  it("停止營運：說停止營運，不寫 0 人", () => {
    const s = districtAnswer({ name: "甲甲區", dayType: "weekday", hour: 3, operating: false, out: [] });
    expect(s).toBe("平日 3 點捷運停止營運，甲甲沒有列車");
  });

  it("主詞去掉「區」只在名稱夠長時", () => {
    expect(districtShort("永和區")).toBe("永和");
    expect(districtShort("區")).toBe("區");
    expect(districtShort("某地")).toBe("某地");
  });
});

describe("車站卡的一句答案", () => {
  const base = { name: "甲站", dayType: "weekday" as const, hour: 8, operating: true, entriesOnly: false, volume: 1234 };

  it("有目的地：指向第一名", () => {
    const s = stationAnswer({ ...base, top: [{ name: "乙站", value: 300 }, { name: "丙站", value: 200 }] });
    expect(s).toBe("平日 8 點，從甲站出發的人最常去乙站");
  });

  it("第一名少於 10 人或沒有目的地", () => {
    for (const top of [[], [{ name: "乙站", value: 9 }]]) {
      const s = stationAnswer({ ...base, top });
      expect(s).toBe("平日 8 點，從甲站出發的每個方向都少於 10 人");
    }
  });

  it("停止營運", () => {
    expect(stationAnswer({ ...base, hour: 3, operating: false, volume: null, top: null })).toBe("平日 3 點捷運停止營運，甲站沒有列車");
  });

  it("環狀線站：照常寫第一名並註明出站未入檔；od 還沒到時只說進站", () => {
    const loop = { ...base, entriesOnly: true };
    expect(stationAnswer({ ...loop, top: [{ name: "乙站", value: 58 }] })).toBe(`平日 8 點，從甲站出發的人最常去乙站${LOOP_NOTE}`);
    // 3.15：括號縮短
    expect(LOOP_NOTE).toBe("（只算在北捷站下車的人）");
    expect(stationAnswer({ ...loop, top: null })).toBe("平日 8 點，甲站進站 1,234 人，出站未入檔");
  });

  it("od 載入中：用這小時進出；少於 10 人照規則寫", () => {
    expect(stationAnswer({ ...base, top: null })).toBe("平日 8 點，甲站進出 1,234 人");
    const s = stationAnswer({ ...base, hour: 5, volume: 3, top: null });
    expect(s).toBe("平日 5 點，甲站進出 少於 10 人");
    expect(s).not.toMatch(SMALL);
  });
});

describe("通勤卡的一句答案（4.2）", () => {
  const base = { origin: "甲站", dest: "乙站", dayType: "weekday" as const, hour: 8, operating: true };

  it("有數字：寫明日型、時段、約幾人與起訖", () => {
    expect(commuteAnswer({ ...base, companions: 1234.4 })).toBe("平日 8 點，約 1,234 人和你一樣從甲站到乙站");
    expect(commuteAnswer({ ...base, dayType: "holiday", hour: 0, companions: 10 })).toBe("假日 0 點，約 10 人和你一樣從甲站到乙站");
  });

  it("少於 10 人（null 或 0–9）：寫「少於 10 人」，不寫數字", () => {
    for (const companions of [null, 0, 3, 9.4]) {
      const s = commuteAnswer({ ...base, companions });
      expect(s).toBe("平日 8 點，和你一樣從甲站到乙站的人少於 10 人");
      expect(s).not.toMatch(SMALL);
      expect(s).not.toContain("約");
    }
  });

  it("停止營運：寫明沒有列車，不寫 0", () => {
    const s = commuteAnswer({ ...base, hour: 3, operating: false, companions: null });
    expect(s).toBe("平日 3 點捷運停止營運，甲站沒有列車");
    expect(s).not.toMatch(/\b0\b/);
  });
});

describe("句子的寫法", () => {
  it("原始碼沒有「此刻」「現在」，也沒有寫死的站名、區名或人數", () => {
    const code = answerSource.replace(/\/\/.*$/gm, "").replace(/\/\*\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/此刻|現在/);
    for (const s of stations.stations) expect(code.includes(s.display), s.display).toBe(false);
    for (const d of districts.districts) expect(code.includes(d.name), d.name).toBe(false);
    // 數字只有門檻常數（經 SUPPRESS_BELOW）與字串處理用的 0、1、2
    expect(code.match(/\b\d+\b/g)?.filter((n) => !["0", "1", "2"].includes(n)) ?? []).toEqual([]);
  });

  it("輸出的句子也沒有「此刻」「現在」", () => {
    const all = [
      districtAnswer({ name: "甲甲區", dayType: "weekday", hour: 8, operating: true, out: [{ name: "乙區", value: 20 }] }),
      stationAnswer({ name: "甲站", dayType: "holiday", hour: 8, operating: true, entriesOnly: false, volume: 20, top: null }),
      commuteAnswer({ origin: "甲站", dest: "乙站", dayType: "weekday", hour: 8, operating: true, companions: 20 }),
    ];
    for (const s of all) expect(s).not.toMatch(/此刻|現在/);
  });
});
