// 3.12 選站：od 分片的前 5 目的地、去哪幾區、地圖上的站對站緞帶。
import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import type { BasemapFile, OdShard, Station, StationsFile } from "./types";
import { destinationDistricts, dotScale, STATION_DESTINATIONS, stationDestinations, stationFlows } from "./views";

const month = (basemapJson as unknown as BasemapFile).stationsMonth;
const real = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`].stations;
const odFiles = import.meta.glob("../../public/data/*/od/*.json", { import: "default" }) as Record<string, () => Promise<OdShard>>;
const shardOf = (id: string) => odFiles[`../../public/data/${month}/od/${id}.json`]();
const at = (display: string) => real.findIndex((s) => s.display === display);

/** 合成分片：3 站；8 點 [自己 50, 120, null]、9 點全 null、3 點停止營運。 */
function synthetic(): Pick<OdShard, "weekday" | "holiday"> {
  const day = Array.from({ length: 24 }, (_, h): (number | null)[] | null => (h === 3 ? null : [0, 0, 0]));
  day[8] = [50, 120, null];
  day[9] = [null, null, null];
  return { weekday: day, holiday: day };
}

describe("stationDestinations（前 5 目的地）", () => {
  it("排除同站進出與少於 10 人（null 不排名、不當 0，AD-3）", () => {
    expect(stationDestinations(synthetic(), 0, "weekday", 8)).toEqual({ operating: true, top: [{ index: 1, value: 120 }] });
  });
  it("每個方向都少於 10 人：有營運、沒有目的地", () => {
    expect(stationDestinations(synthetic(), 0, "weekday", 9)).toEqual({ operating: true, top: [] });
  });
  it("停止營運（整格 null）不是 0（AD-5）", () => {
    expect(stationDestinations(synthetic(), 0, "weekday", 3)).toEqual({ operating: false, top: [] });
  });

  it(`${month} 蘆洲平日 8 點：和 od 分片那一列一致、由多到少、前 ${STATION_DESTINATIONS}`, async () => {
    const o = at("蘆洲");
    const shard = await shardOf(real[o].id);
    const row = shard.weekday[8]!;
    const d = stationDestinations(shard, o, "weekday", 8);
    expect(d.top).toHaveLength(STATION_DESTINATIONS);
    for (const x of d.top) expect(row[x.index]).toBe(x.value);
    expect(d.top.map((x) => x.value)).toEqual([...d.top.map((x) => x.value)].sort((a, b) => b - a));
    // 沒列出的公開格都不比第 5 名大
    const listed = new Set(d.top.map((x) => x.index));
    const fifth = d.top[d.top.length - 1].value;
    row.forEach((v, j) => {
      if (j !== o && v !== null && !listed.has(j)) expect(v).toBeLessThanOrEqual(fifth);
    });
    expect(listed.has(o)).toBe(false);
  });
});

describe("destinationDistricts（去哪幾區＝這 5 站依所在區加總）", () => {
  const st = (district: string) => ({ district }) as Station;
  it("同區的站加在一起，由多到少；加總等於列出的 5 站", () => {
    const stations = [st("A"), st("B"), st("A"), st("C")];
    const top = [
      { index: 1, value: 300 },
      { index: 0, value: 200 },
      { index: 2, value: 150 },
      { index: 3, value: 20 },
    ];
    const r = destinationDistricts(top, stations);
    expect(r).toEqual([
      { id: "A", value: 350, stations: 2 },
      { id: "B", value: 300, stations: 1 },
      { id: "C", value: 20, stations: 1 },
    ]);
    expect(r.reduce((a, x) => a + x.value, 0)).toBe(670);
  });
  it(`${month} 台北車站平日 8 點：區的加總等於 5 站的加總，區碼來自 stations.json（AD-9）`, async () => {
    const o = at("台北車站");
    const d = stationDestinations(await shardOf(real[o].id), o, "weekday", 8);
    const r = destinationDistricts(d.top, real);
    expect(r.reduce((a, x) => a + x.value, 0)).toBeCloseTo(d.top.reduce((a, x) => a + x.value, 0));
    for (const a of r) expect(d.top.some((x) => real[x.index].district === a.id)).toBe(true);
  });
});

describe("stationFlows（地圖上的站對站緞帶）", () => {
  it("from/to 是站 ID、藍色（out）；光點換算同一個函式（AD-19）", () => {
    const stations = [{ id: "s0" }, { id: "s1" }, { id: "s2" }] as Station[];
    const d = { operating: true, top: [{ index: 1, value: 120 }] };
    const f = stationFlows(d, 0, stations);
    expect(f.flows).toEqual([{ from: "s0", to: "s1", value: 120, kind: "out" }]);
    expect(f.counts).toEqual(dotScale(f.flows!).counts);
  });
  it("停止營運沒有緞帶（null，不是空陣列）", () => {
    expect(stationFlows({ operating: false, top: [] }, 0, [{ id: "s0" }] as Station[]).flows).toBeNull();
  });
});
