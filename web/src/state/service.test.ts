import { afterEach, describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import type { BasemapFile, DistrictFlowsFile } from "../data/types";
import { flowSource } from "../data/views";
import { closedAt, closedRangesOf, firstTrainAt, firstTrainCrossed, setService, sleepAt } from "./service";

// 用最新月份的實際檔（AD-5：停駛只看資料），不寫死 2–4 點
const basemap = basemapJson as unknown as BasemapFile;
const flowFiles = import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }) as Record<
  string,
  DistrictFlowsFile
>;
const flows = flowFiles[`../../public/data/${basemap.stationsMonth}/district-flows.json`];
const source = flowSource(flows);

describe("營運時段（3.4）", () => {
  afterEach(() => setService(null));

  it("資料還沒載入：一律當作營運中、不推第一班車", () => {
    expect(closedAt("weekday", 3)).toBe(false);
    expect(firstTrainAt("weekday", 3)).toBeNull();
    expect(sleepAt(3, "weekday")).toBe(0);
  });

  it(`${basemap.stationsMonth}：平日 1 點營運、3 點停駛、5 點營運（整小時 null 才算停駛）`, () => {
    setService({ isOpen: source.operating, headway: basemap.headway });
    expect(closedAt("weekday", 1)).toBe(false);
    expect(closedAt("weekday", 3)).toBe(true);
    expect(closedAt("weekday", 5)).toBe(false);
    expect(closedRangesOf("weekday")).toEqual([[2, 5]]);
    expect(closedRangesOf("holiday")).toEqual([[2, 5]]);
  });

  it("停駛時第一班車取官方班距：平日、假日都是 6 點", () => {
    setService({ isOpen: source.operating, headway: basemap.headway });
    expect(firstTrainAt("weekday", 3)).toBe(6);
    expect(firstTrainAt("holiday", 2)).toBe(6);
  });

  it("第一班車波紋（3.14）：播放中走過 firstTrainAt 的整點才觸發；資料沒載入不觸發", () => {
    expect(firstTrainCrossed("weekday", 5.98, 6.01)).toBe(false);
    setService({ isOpen: source.operating, headway: basemap.headway });
    const first = firstTrainAt("weekday", 3)!;
    expect(firstTrainCrossed("weekday", first - 0.02, first + 0.01)).toBe(true);
    expect(firstTrainCrossed("weekday", first + 0.98, first + 1.01)).toBe(false);
  });

  it("沒有班距：只知道停駛，不推時間", () => {
    setService({ isOpen: source.operating });
    expect(closedAt("weekday", 3)).toBe(true);
    expect(firstTrainAt("weekday", 3)).toBeNull();
  });

  it("入睡程度：停駛中 1、白天 0；減少動態直接切換", () => {
    setService({ isOpen: source.operating, headway: basemap.headway });
    expect(sleepAt(3, "weekday")).toBe(1);
    expect(sleepAt(14, "weekday")).toBe(0);
    expect(sleepAt(1.9, "weekday")).toBeGreaterThan(0);
    expect(sleepAt(1.9, "weekday", true)).toBe(0);
    expect(sleepAt(2, "weekday", true)).toBe(1);
  });
});
