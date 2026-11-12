import { describe, expect, it } from "vitest";
import { busiestStations, stationVolume } from "./traits";
import type { Station } from "./types";

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
