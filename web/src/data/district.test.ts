// 3.6 選區：地圖上的去哪／誰來、卡片的排名（這一小時／整天）、展開的站。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import tokensCss from "../styles/tokens.css?raw";
import { cssTokenReader, parseColor } from "../styles/tokens";
import type { BasemapFile, DistrictFlowsFile, DistrictMatrix, DistrictsFile, StationsFile } from "./types";
import {
  DISTRICT_FLOWS,
  districtFlows,
  districtRanks,
  FLOW_KEYS,
  flowKey,
  flowSource,
  flowToken,
  stationFrames,
  stationIndex,
  stationLabel,
  twoWay,
} from "./views";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const districts = glob<DistrictsFile>(
  import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }),
  "districts.json",
);
const flows = glob<DistrictFlowsFile>(
  import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }),
  "district-flows.json",
);
const stations = glob<StationsFile>(
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }),
  "stations.json",
);
const idOf = (name: string) => districts.districts.find((d) => d.name === name)!.id;
const nameOf = (id: string) => districts.districts.find((d) => d.id === id)!.name;

/** 合成的 3 區檔：小時 0、1 有資料、小時 2 停止營運。 */
function synthetic(m0: DistrictMatrix, m1: DistrictMatrix): DistrictFlowsFile {
  return { v: 3, month: "2026-09", districts: ["A", "B", "C"], weekday: [m0, m1, null], holiday: [m0, m1, null] };
}
const f = synthetic(
  [
    [500, 120, null],
    [30, 900, 40],
    [null, 15, 70],
  ],
  [
    [600, null, 50],
    [null, 800, 20],
    [11, 25, 90],
  ],
);

describe("districtFlows（地圖：這區前 5 去哪、前 5 誰來）", () => {
  it("去哪 from＝這區、誰來 to＝這區，各自由大到小；區內與 null 不畫", () => {
    expect(districtFlows(f, "weekday", 0, "B")).toEqual([
      { from: "B", to: "C", value: 40, kind: "out" },
      { from: "B", to: "A", value: 30, kind: "out" },
      { from: "A", to: "B", value: 120, kind: "in" },
      { from: "C", to: "B", value: 15, kind: "in" },
    ]);
  });
  it("停止營運回傳 null（AD-5）；不在矩陣的區回傳空陣列", () => {
    expect(districtFlows(f, "weekday", 2, "B")).toBeNull();
    expect(districtFlows(f, "weekday", 0, "Z")).toEqual([]);
  });
  it(`每個方向最多 ${DISTRICT_FLOWS} 條`, () => {
    const all = districtFlows(flows, "weekday", 8, idOf("中正區"))!;
    expect(all.filter((x) => x.kind === "out")).toHaveLength(DISTRICT_FLOWS);
    expect(all.filter((x) => x.kind === "in")).toHaveLength(DISTRICT_FLOWS);
  });
  it("flowSource.district 帶光點換算，與全城同一個函式", () => {
    const h = flowSource(flows).district("weekday", 8, idOf("永和區"));
    expect(h.flows!.length).toBe(h.counts.length);
    expect(h.counts.every((c) => c >= 1)).toBe(true);
  });
});

describe("districtRanks（卡片：去哪、誰來，含區內）", () => {
  it("這一小時：直接讀矩陣，區內也列（標 self）", () => {
    const r = districtRanks(f, "weekday", "hour", 0, "B");
    expect(r.operating).toBe(true);
    expect(r.out).toEqual([
      { id: "B", value: 900, self: true },
      { id: "C", value: 40, self: false },
      { id: "A", value: 30, self: false },
    ]);
    expect(r.in.map((x) => x.id)).toEqual(["B", "A", "C"]);
  });
  it("整天：每格只加公開的小時，null 不當 0；全部 null 的格不列", () => {
    const r = districtRanks(f, "weekday", "day", 0, "A");
    // A→A 500+600、A→B 120（小時 1 為 null）、A→C 50（小時 0 為 null）
    expect(r.out).toEqual([
      { id: "A", value: 1100, self: true },
      { id: "B", value: 120, self: false },
      { id: "C", value: 50, self: false },
    ]);
    // B→A 30（小時 1 null）、C→A 11（小時 0 null）
    expect(r.in).toEqual([
      { id: "A", value: 1100, self: true },
      { id: "B", value: 30, self: false },
      { id: "C", value: 11, self: false },
    ]);
  });
  it("停止營運的小時：operating false、沒有排名；整天跳過停止營運的小時", () => {
    expect(districtRanks(f, "weekday", "hour", 2, "A")).toEqual({ operating: false, out: [], in: [] });
    expect(districtRanks(f, "weekday", "day", 2, "A").operating).toBe(true);
  });
  it("有營運但這區全是 null：空的排名（畫面寫每個方向都少於 10 人）", () => {
    const q = synthetic(
      [
        [null, null],
        [null, null],
      ] as DistrictMatrix,
      [[1]] as DistrictMatrix,
    );
    q.districts = ["A", "B"];
    expect(districtRanks(q, "weekday", "hour", 0, "A")).toEqual({ operating: true, out: [], in: [] });
  });
  it("2026-09 永和區平日 8 點，去哪前四名是中正、中山、大安、信義（1,505／1,411／1,026／756）", () => {
    const r = districtRanks(flows, "weekday", "hour", 8, idOf("永和區"));
    expect(r.out.slice(0, 4).map((x) => [nameOf(x.id), x.value])).toEqual([
      ["中正區", 1505],
      ["中山區", 1411],
      ["大安區", 1026],
      ["信義區", 756],
    ]);
  });
  it("2026-09 大安區假日整天，去哪前三名是中正、大安（區內）、信義", () => {
    const r = districtRanks(flows, "holiday", "day", 8, idOf("大安區"));
    expect(r.out.slice(0, 3).map((x) => nameOf(x.id))).toEqual(["中正區", "大安區", "信義區"]);
    expect(r.out[1].self).toBe(true);
    // 整天＝24 小時中有公開人數的小時加總
    const zz = idOf("中正區");
    const i = flows.districts.indexOf(idOf("大安區"));
    const j = flows.districts.indexOf(zz);
    const total = flows.holiday.reduce((s, m) => s + (m?.[i][j] ?? 0), 0);
    expect(r.out[0]).toEqual({ id: zz, value: total, self: false });
  });
});

describe("FLOW_KEYS 選區模式與顏色 token", () => {
  it("圖例寫藍＝這區的人去哪、橘紅＝誰來這裡", () => {
    expect(FLOW_KEYS.district.map((k) => k.label)).toEqual(["藍＝這區的人去哪", "橘紅＝誰來這裡"]);
    const read = cssTokenReader(tokensCss);
    for (const k of FLOW_KEYS.district) expect(parseColor(read(k.token)), k.token).not.toBeNull();
  });
  it("flowToken：去哪 --flow-out、誰來 --flow-in、全城 --flow-neutral", () => {
    expect(flowToken("out")).toBe("--flow-out");
    expect(flowToken("in")).toBe("--flow-in");
    expect(flowToken()).toBe("--flow-neutral");
    expect(flowKey({ from: "A", to: "B" })).toBe("A>B");
  });
});

describe("twoWay（雙向車道，Piwi 2026-11-12）", () => {
  it("只有兩個方向都要畫的才分車道；null 與區內不算", () => {
    const k = twoWay([
      { from: "A", to: "B", value: 10 },
      { from: "B", to: "A", value: 20 },
      { from: "A", to: "C", value: 30 },
      { from: "C", to: "A", value: null },
      { from: "D", to: "D", value: 5 },
    ]);
    expect([...k].sort()).toEqual(["A>B", "B>A"]);
  });
  it("2026-09 平日 18 點全城前 12 有大安⇄中正兩個方向", () => {
    const k = twoWay(flowSource(flows).at("weekday", 18).flows!);
    expect(k.has(`${idOf("大安區")}>${idOf("中正區")}`)).toBe(true);
    expect(k.has(`${idOf("中正區")}>${idOf("大安區")}`)).toBe(true);
  });
  it("選區模式：去哪與誰來同一對區時也分車道", () => {
    const zz = idOf("中正區");
    const k = twoWay(districtFlows(flows, "weekday", 8, zz)!);
    expect(k.size).toBeGreaterThan(0);
    for (const key of k) expect(key.split(">")).toContain(zz);
  });
});

describe("stationFrames（展開一區的站）", () => {
  const index = stationIndex(stations, basemap.stationLines);
  it("只列 stations.json 標在這區的站（AD-9），數量與 districts.json 一致", () => {
    for (const d of districts.districts) {
      const frames = stationFrames(index, d.id, "weekday", 8);
      expect(frames.map((x) => x.index).sort((a, b) => a - b)).toEqual([...d.stations].sort((a, b) => a - b));
      for (const s of frames) expect(stations.stations[s.index].district).toBe(d.id);
    }
  });
  it("站珠的值＝此刻進＋出；停止營運為 null；路線色 token 都有定義", () => {
    const read = cssTokenReader(tokensCss);
    const daan = stationFrames(index, idOf("大安區"), "weekday", 8);
    for (const s of daan) {
      const st = stations.stations[s.index];
      expect(s.value).toBe(st.weekday.entries[8]! + st.weekday.exits[8]!);
      expect(parseColor(read(s.token)), s.token).not.toBeNull();
    }
    expect(stationFrames(index, idOf("大安區"), "weekday", 3).every((s) => s.value === null)).toBe(true);
  });
  it("站名去掉括號裡的路線", () => {
    expect(stationLabel("板橋（板南線）")).toBe("板橋");
    expect(stationLabel("大安森林公園")).toBe("大安森林公園");
  });
});
