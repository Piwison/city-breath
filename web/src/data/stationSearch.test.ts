// 4.1 找你的站：打字比對、依路線分組與站序、轉乘站在每條線下、最近用過的站略過當月沒有的站。用真實的最新月份資料。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import { filterGroups, lineOrder, normalizeQuery, recentIn, searchModel } from "./stationSearch";
import type { BasemapFile, StationsFile } from "./types";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const file = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`];
const model = searchModel(file.stations, basemap.stationLines, basemap.lines);
const names = (idx: number[]) => idx.map((i) => model.stations[i].display);
const group = (line: string) => model.groups.find((g) => g.line === line)!;
const found = (q: string) => [...new Set(filterGroups(model, q).flatMap((g) => names(g.stations)))];

describe("打字找站（4.1）", () => {
  it("打「忠孝」列出忠孝復興、忠孝新生、忠孝敦化", () => {
    expect(found("忠孝").sort()).toEqual(["忠孝復興", "忠孝敦化", "忠孝新生"].sort());
  });
  it("臺／台、結尾的「站」、空白與全形都找得到", () => {
    expect(found("臺北車站")).toEqual(["台北車站"]);
    expect(found("大橋頭站")).toEqual(["大橋頭"]);
    expect(found(" 中 山 國 中 ")).toEqual(["中山國中"]);
    expect(found("１０１")).toEqual(["台北101/世貿"]);
  });
  it("「/」分開的每一段都找得到", () => {
    expect(found("世貿")).toEqual(["台北101/世貿"]);
    expect(found("奉天宮")).toEqual(["廣慈/奉天宮"]);
  });
  it("板橋兩站（板南線、環狀線）都列出", () => {
    expect(found("板橋").sort()).toEqual(["板橋（板南線）", "板橋（環狀線）"].sort());
  });
  it("找不到時沒有任何路線", () => {
    expect(filterGroups(model, "不存在的站")).toEqual([]);
  });
  it("只打「站」不去掉", () => {
    expect(normalizeQuery("站")).toBe("站");
  });
});

describe("依路線分組（決定 15）", () => {
  it("路線照 basemap.json 的順序，不依行政區", () => {
    expect(model.groups.map((g) => g.line)).toEqual(basemap.lines.map((l) => l.id));
    expect(model.groups.map((g) => g.name)).toEqual(basemap.lines.map((l) => l.name));
  });
  it("每站至少在一條線下；轉乘站在每條線下都出現（中山在淡水信義線與松山新店線）", () => {
    const listed = new Set(model.groups.flatMap((g) => g.stations));
    expect(listed.size).toBe(file.stations.length);
    const zs = model.byId.get(file.stations.find((s) => s.display === "中山")!.id)!;
    expect(group("R").stations).toContain(zs);
    expect(group("G").stations).toContain(zs);
    const hits = filterGroups(model, "中山").filter((g) => g.stations.includes(zs));
    expect(hits.map((g) => g.name)).toEqual(["淡水信義線", "松山新店線"]);
  });
  it("站序照路線：淡水信義線象山到淡水、文湖線動物園到南港展覽館、板南線頂埔到南港展覽館", () => {
    const r = names(group("R").stations);
    expect(r[0]).toBe("象山");
    expect(r.at(-1)).toBe("淡水");
    expect(r.slice(r.indexOf("中正紀念堂"), r.indexOf("中正紀念堂") + 4)).toEqual(["中正紀念堂", "台大醫院", "台北車站", "中山"]);
    const br = names(group("BR").stations);
    expect([br[0], br.at(-1)]).toEqual(["動物園", "南港展覽館"]);
    const bl = names(group("BL").stations);
    expect([bl[0], bl.at(-1)]).toEqual(["頂埔", "南港展覽館"]);
    expect(bl.slice(bl.indexOf("台北車站") - 1, bl.indexOf("台北車站") + 2)).toEqual(["西門", "台北車站", "善導寺"]);
  });
  it("中和新蘆線：南勢角到迴龍是主線，蘆洲支線依序接在後面", () => {
    const o = names(group("O").stations);
    expect(o[0]).toBe("南勢角");
    expect(o.indexOf("迴龍")).toBeLessThan(o.indexOf("三重國小"));
    expect(o.slice(o.indexOf("三重國小"))).toEqual(["三重國小", "三和國中", "徐匯中學", "三民高中", "蘆洲"]);
  });
  it("環狀線的站出站未入檔（不能當迄站）", () => {
    const y = group("Y").stations.map((i) => model.stations[i]);
    expect(y.some((s) => !s.exitsRecorded)).toBe(true);
  });
  it("lineOrder 只由輸入決定：打亂輸入順序結果相同", () => {
    const pts = file.stations.filter((s) => basemap.stationLines[s.id]?.includes("G"));
    expect(lineOrder([...pts].reverse())).toEqual(lineOrder(pts));
  });
});

describe("最近用過的站對照當月（AD-22）", () => {
  it("當月沒有的站 ID 被略過，順序不變", () => {
    const a = file.stations[3].id;
    const b = file.stations[7].id;
    expect(recentIn([b, "sdeadbeef", a], model)).toEqual([model.byId.get(b), model.byId.get(a)]);
  });
  it("打字時只留符合的", () => {
    const zx = file.stations.find((s) => s.display === "忠孝新生")!.id;
    const ds = file.stations.find((s) => s.display === "淡水")!.id;
    expect(names(recentIn([ds, zx], model, "忠孝"))).toEqual(["忠孝新生"]);
  });
});
