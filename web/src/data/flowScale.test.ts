// 3.21 決定 7：選區、選站時線寬改以畫面上最大的那條當最粗；全城比例（當月最大）不變。
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import { arcsOf } from "../scene/flowGeometry";
import type { BasemapFile, DistrictFlowsFile, OdShard, StationsFile } from "./types";
import {
  districtFlows,
  flowMax,
  flowScale,
  flowSource,
  legendValues,
  ribbonWidth,
  stationDestinations,
  stationFlows,
  topFlows,
  W_MAX,
  W_MIN,
} from "./views";

const month = (basemapJson as unknown as BasemapFile).stationsMonth;
const flows = (
  import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }) as Record<string, DistrictFlowsFile>
)[`../../public/data/${month}/district-flows.json`];
const stations = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`].stations;
const odFiles = import.meta.glob("../../public/data/*/od/*.json", { import: "default" }) as Record<string, () => Promise<OdShard>>;
const YONGHE = "65000040";
const source = flowSource(flows);

/** 每區、每站一個端點（只為了讓 arcsOf 畫得出來；線寬與位置無關）。 */
const anchors = (ids: string[]) => new Map(ids.map((id, k) => [id, new Vector3(k * 3, 1, k % 5)]));

describe("flowScale（線寬比例）", () => {
  it("全城：當月最大與圖例三值不變", () => {
    const s = flowScale("city", source.at("weekday", 8).flows, source.max, source.legend);
    expect(s).toEqual({ max: flowMax(flows), legend: legendValues(flowMax(flows)), local: false });
    expect(s.max).toBe(6582);
  });

  it("2026-09 平日 8 點全城前 12 大與線寬和改之前相同（W_MIN + (W_MAX − W_MIN) × 人數 ÷ 當月最大）", () => {
    const top = topFlows(flows, "weekday", 8)!;
    expect(top.map((f) => f.value)).toEqual([5912, 5070, 4732, 4604, 4217, 4185, 3881, 3630, 3560, 3417, 3280, 3143]);
    const s = flowScale("city", top, source.max, source.legend);
    const arcs = arcsOf(top, top.map(() => 1), s.max, anchors(flows.districts), s.legend);
    expect(arcs).toHaveLength(12);
    arcs.forEach((a, k) => expect(a.w).toBeCloseTo(W_MIN + ((W_MAX - W_MIN) * top[k].value!) / 6582, 10));
  });

  it("選永和區平日 8 點：最粗＝永和這一小時最大的流向（永和→中正 1,505），圖例最後一值相同", () => {
    const f = districtFlows(flows, "weekday", 8, YONGHE)!;
    const s = flowScale("district", f, source.max, source.legend);
    expect(s.local).toBe(true);
    expect(s.max).toBe(1505);
    expect(s.legend[2]).toBe(1505);
    expect(s.legend[0]).toBeLessThanOrEqual(s.legend[1]);
    expect(s.legend[1]).toBeLessThanOrEqual(1505);
    const arcs = arcsOf(f, f.map(() => 1), s.max, anchors(flows.districts), s.legend);
    const thickest = arcs.reduce((a, b) => (b.w > a.w ? b : a));
    expect(thickest.w).toBeCloseTo(W_MAX, 10);
    expect(thickest.flow).toMatchObject({ from: YONGHE, to: "63000050", value: 1505 });
    for (const a of arcs) expect(a.w).toBeCloseTo(ribbonWidth(a.flow.value!, 1505), 10);
  });

  it("選站：最粗＝這站這一小時最大的目的地（3.12 問題 3）", async () => {
    const o = stations.findIndex((s) => s.display === "蘆洲");
    const shard = await odFiles[`../../public/data/${month}/od/${stations[o].id}.json`]();
    const h = stationFlows(stationDestinations(shard, o, "weekday", 8), o, stations);
    const s = flowScale("station", h.flows, source.max, source.legend);
    const top = Math.max(...h.flows!.map((f) => f.value!));
    expect(s).toMatchObject({ max: top, local: true });
    expect(s.legend[2]).toBe(top);
  });

  it("畫面上沒有有人數的流向（全是 null、停止營運、還沒載到）：照全城比例", () => {
    expect(flowScale("district", null, 6582, [1000, 3000, 6000])).toEqual({ max: 6582, legend: [1000, 3000, 6000], local: false });
    expect(flowScale("station", [], 6582, [1000, 3000, 6000]).local).toBe(false);
    expect(flowScale("district", [{ value: null }], 6582, [1000, 3000, 6000]).local).toBe(false);
  });

  it("很小的最大值：圖例三值不超過最大、由小到大", () => {
    const s = flowScale("district", [{ value: 42 }, { value: 15 }], 6582, [1000, 3000, 6000]);
    expect(s.max).toBe(42);
    expect(s.legend[2]).toBe(42);
    expect(s.legend[0]).toBeLessThanOrEqual(s.legend[1]);
    expect(s.legend[1]).toBeLessThanOrEqual(42);
  });
});
