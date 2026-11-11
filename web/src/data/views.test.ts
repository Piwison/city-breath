import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import tokensCss from "../styles/tokens.css?raw";
import { cssTokenReader, parseColor } from "../styles/tokens";
import type { BasemapFile, DistrictFlowsFile, DistrictMatrix, DistrictsFile } from "./types";
import {
  baseView,
  dotScale,
  flowMax,
  legendValues,
  lineToken,
  PEOPLE_PER_DOT,
  RIBBON_MAX_PX,
  ribbonScale,
  ribbonWidth,
  TOP_FLOWS,
  topFlows,
  W_MAX,
  W_MIN,
} from "./views";

const basemap = basemapJson as unknown as BasemapFile;
const districtFiles = import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }) as Record<
  string,
  DistrictsFile
>;
const latest = districtFiles[`../../public/data/${basemap.stationsMonth}/districts.json`];
const flowFiles = import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }) as Record<
  string,
  DistrictFlowsFile
>;
const flows = flowFiles[`../../public/data/${basemap.stationsMonth}/district-flows.json`];
const idOf = (name: string) => latest.districts.find((d) => d.name === name)!.id;

/** 合成的 3 區檔：小時 0 有資料、小時 1 停止營運、小時 2 全少於 10 人。 */
function synthetic(m0: DistrictMatrix, holiday0: DistrictMatrix = m0): DistrictFlowsFile {
  const quiet: DistrictMatrix = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
  return {
    v: 3,
    month: "2026-09",
    districts: ["A", "B", "C"],
    weekday: [m0, null, quiet],
    holiday: [holiday0, null, quiet],
  };
}

describe("lineToken", () => {
  it("小寫、去連字號（AD-21）", () => {
    expect(lineToken("R-3")).toBe("--line-r3");
    expect(lineToken("BL")).toBe("--line-bl");
    expect(lineToken("G-3")).toBe("--line-g3");
  });
  it("每條路線的 token 都定義在 tokens.css", () => {
    const read = cssTokenReader(tokensCss);
    for (const l of basemap.lines) expect(parseColor(read(lineToken(l.id))), l.id).not.toBeNull();
  });
});

describe("baseView", () => {
  it("21 區都對上 districts.json 的界線與名稱", () => {
    const v = baseView(basemap, latest);
    expect(v.districts).toHaveLength(21);
    for (const d of v.districts) {
      expect(d.polygon.length).toBeGreaterThan(0);
      expect(d.terrain).toHaveLength(6);
      expect(d.label).not.toMatch(/區$/);
    }
    expect(v.tracks.length).toBe(basemap.tracks.length);
    expect(v.tracks.every((t) => t.token.startsWith("--line-"))).toBe(true);
  });
  it("對不上的行政區丟錯", () => {
    expect(() => baseView(basemap, { ...latest, districts: latest.districts.slice(1) })).toThrow(basemap.districts[0].id);
  });
});

describe("ribbonWidth（線寬與人數成正比）", () => {
  it("0 人最細、當月最大最粗、中間線性", () => {
    expect(ribbonWidth(0, 6000)).toBe(W_MIN);
    expect(ribbonWidth(6000, 6000)).toBeCloseTo(W_MAX, 10);
    expect(ribbonWidth(3000, 6000)).toBeCloseTo((W_MIN + W_MAX) / 2, 10);
  });
  it("超過最大或負數時夾住", () => {
    expect(ribbonWidth(12000, 6000)).toBeCloseTo(W_MAX, 10);
    expect(ribbonWidth(-5, 6000)).toBe(W_MIN);
  });
});

describe("ribbonScale（放大時線寬上限以螢幕像素計）", () => {
  it("拉遠時不縮（k＝1），場景單位就是線寬", () => {
    expect(ribbonScale(4)).toBe(1);
  });
  it("放大到最粗的緞帶會超過上限時，所有緞帶等比縮，最粗的剛好是上限", () => {
    const px = 60;
    const k = ribbonScale(px);
    expect(k).toBeLessThan(1);
    expect(W_MAX * px * k).toBeCloseTo(RIBBON_MAX_PX, 10);
    // 比例不變：兩條的像素寬之比＝線寬之比
    const a = ribbonWidth(1000, 6000) * px * k;
    const b = ribbonWidth(3000, 6000) * px * k;
    expect(a / b).toBeCloseTo(ribbonWidth(1000, 6000) / ribbonWidth(3000, 6000), 10);
  });
  it("量不到像素比例時不縮", () => {
    expect(ribbonScale(0)).toBe(1);
    expect(ribbonScale(Number.NaN)).toBe(1);
  });
});

describe("flowMax（當月最大流向）", () => {
  it("取兩日型、所有小時的跨區最大值；區內、null、停止營運不算", () => {
    const f = synthetic(
      [
        [9999, 120, null],
        [30, 9999, 40],
        [null, 15, 9999],
      ],
      [
        [9999, 80, 200],
        [null, 9999, null],
        [null, null, 9999],
      ],
    );
    expect(flowMax(f)).toBe(200);
  });
  it("2026-09 的當月最大是平日 18 點大安→中正", () => {
    const max = flowMax(flows);
    const top = topFlows(flows, "weekday", 18, 1)![0];
    expect(top).toEqual({ from: idOf("大安區"), to: idOf("中正區"), value: max });
  });
});

describe("topFlows（全市只畫前 12 大）", () => {
  const f = synthetic([
    [5000, 120, null],
    [30, 5000, 40],
    [null, 15, 5000],
  ]);
  it("排除區內與 null，由大到小", () => {
    expect(topFlows(f, "weekday", 0)).toEqual([
      { from: "A", to: "B", value: 120 },
      { from: "B", to: "C", value: 40 },
      { from: "B", to: "A", value: 30 },
      { from: "C", to: "B", value: 15 },
    ]);
  });
  it("只取前 n 條", () => {
    expect(topFlows(f, "weekday", 0, 2)!.map((x) => x.value)).toEqual([120, 40]);
  });
  it("停止營運的小時回傳 null，不是空陣列（AD-5）", () => {
    expect(topFlows(f, "weekday", 1)).toBeNull();
  });
  it("有營運但各區之間都少於 10 人：空陣列", () => {
    expect(topFlows(f, "weekday", 2)).toEqual([]);
  });
  it("2026-09 平日 8 點：12 條、由大到小、都是跨區且有數字", () => {
    const top = topFlows(flows, "weekday", 8)!;
    expect(top).toHaveLength(TOP_FLOWS);
    expect(top[0]).toMatchObject({ from: idOf("板橋區"), to: idOf("中正區") });
    for (let k = 1; k < top.length; k++) expect(top[k].value!).toBeLessThanOrEqual(top[k - 1].value!);
    for (const x of top) expect(x.from).not.toBe(x.to);
  });
  it("2026-09 平日 8 點：永和往中正、中山、大安、信義的流向在資料裡，但不在全市前 12（verify 對照）", () => {
    const all = topFlows(flows, "weekday", 8, Infinity)!;
    const yonghe = all.filter((x) => x.from === idOf("永和區")).slice(0, 4);
    expect(new Set(yonghe.map((x) => x.to))).toEqual(new Set(["中正區", "中山區", "大安區", "信義區"].map(idOf)));
    const twelfth = all[TOP_FLOWS - 1].value!;
    for (const x of yonghe) expect(x.value!).toBeLessThan(twelfth);
  });
  it("2026-09 假日的組合和平日不同", () => {
    const key = (xs: { from: string; to: string }[]) => xs.map((x) => `${x.from}>${x.to}`).join(",");
    expect(key(topFlows(flows, "holiday", 8)!)).not.toBe(key(topFlows(flows, "weekday", 8)!));
  });
  it("2026-09 停止營運的 2–4 點回傳 null", () => {
    for (const h of [2, 3, 4]) expect(topFlows(flows, "weekday", h)).toBeNull();
  });
});

describe("dotScale（一顆光點＝固定人數）", () => {
  it(`預設一顆＝${PEOPLE_PER_DOT} 人，每條至少 1 顆`, () => {
    expect(dotScale([{ value: 1000 }, { value: 20 }])).toEqual({ perDot: 50, counts: [20, 1] });
  });
  it("總數超過上限的 9 成就加倍，直到放得下", () => {
    const { perDot, counts } = dotScale([{ value: 6000 }, { value: 4000 }], 100);
    expect(perDot).toBe(200); // 10,000 ÷ 100 = 100 > 90；÷ 200 = 50 ≤ 90
    expect(counts).toEqual([30, 20]);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(100);
  });
  it("null（少於 10 人）不畫光點，也不算進總數", () => {
    expect(dotScale([{ value: null }, { value: 100 }])).toEqual({ perDot: 50, counts: [0, 2] });
  });
  it("2026-09 每個小時的前 12 大都不超過上限", () => {
    for (const day of ["weekday", "holiday"] as const)
      for (let h = 0; h < 24; h++) {
        const top = topFlows(flows, day, h);
        if (!top) continue;
        const { counts } = dotScale(top);
        expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(2600);
      }
  });
});

describe("legendValues（圖例用同一個線寬公式）", () => {
  it("6,582 → 1,000、3,000、6,000", () => {
    expect(legendValues(6582)).toEqual([1000, 3000, 6000]);
  });
  it("圖例最粗的一段不超過當月最大", () => {
    const max = flowMax(flows);
    const [, , top] = legendValues(max);
    expect(top).toBeLessThanOrEqual(max);
  });
});
