// 3.12 類型標籤（決定 13）：標籤是 station-types.json 的整年最常見的型，名稱查當月 types[]；
// 當月歸到別型時多一行；環狀線站、檔還沒到、檔裡沒有的站不顯示。用 12 個月的實檔驗。
import { describe, expect, it } from "vitest";
import stationTypesJson from "../../public/data/station-types.json";
import { fitRangeLabel, stationTypeLabel } from "./stationType";
import type { StationsFile, StationTypesFile } from "./types";

const yearly = stationTypesJson as unknown as StationTypesFile;
const files = import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<
  string,
  StationsFile
>;
const byMonth = new Map(Object.values(files).map((f) => [f.month, f]));
const at = (month: string, display: string) => {
  const f = byMonth.get(month)!;
  return { f, s: f.stations.find((x) => x.display === display)! };
};

describe("類型標籤", () => {
  it("station-types.json 涵蓋擬合的 12 個月", () => {
    expect(yearly.fitMonths).toHaveLength(12);
    expect(yearly.fitMonths.every((m) => byMonth.has(m))).toBe(true);
    expect(fitRangeLabel(yearly)).toBe("2025 年 10 月～2026 年 9 月");
  });

  it("每個月、每個有類型的站：標籤＝整年最常見的型在當月 types[] 的名稱與一句話；當月型不同才有小字", () => {
    let shown = 0;
    let monthly = 0;
    for (const f of byMonth.values()) {
      for (const s of f.stations) {
        const got = stationTypeLabel(s, f.types, yearly);
        const row = yearly.stations[s.id];
        if (!s.exitsRecorded || !row) {
          expect(got).toBeNull();
          continue;
        }
        shown++;
        expect(got).toMatchObject({ id: row.type, label: f.types[row.type].label, description: f.types[row.type].description });
        const differs = s.type !== null && s.type !== row.type;
        expect(got!.monthly).toBe(differs ? f.types[s.type!].label : null);
        if (differs) monthly++;
      }
    }
    expect(shown).toBeGreaterThan(1000);
    expect(monthly).toBeGreaterThan(0);
  });

  it("跨型站：三重整年 臥室站與住商站各 6 個月，同票取較近月份 → 臥室站；2026-08 歸到住商站時多一行、標籤不變", () => {
    const { f, s } = at("2026-08", "三重");
    expect(yearly.stations[s.id]).toEqual({ type: 0, votes: 6, months: 12 });
    expect(stationTypeLabel(s, f.types, yearly)).toEqual({
      id: 0,
      label: "臥室站",
      description: f.types[0].description,
      monthly: "住商站",
    });
    const sep = at("2026-09", "三重");
    expect(stationTypeLabel(sep.s, sep.f.types, yearly)).toMatchObject({ label: "臥室站", monthly: null });
  });

  it("中正紀念堂 2026-09 歸到辦公站，整年是人氣站", () => {
    const { f, s } = at("2026-09", "中正紀念堂");
    expect(stationTypeLabel(s, f.types, yearly)).toMatchObject({ label: "人氣站", monthly: "辦公站" });
  });

  it("環狀線站沒有標籤（即使資料檔誤列也不顯示）", () => {
    const f = byMonth.get("2026-09")!;
    const ring = f.stations.filter((s) => !s.exitsRecorded);
    expect(ring.length).toBe(11);
    for (const s of ring) {
      expect(yearly.stations[s.id]).toBeUndefined();
      const forged = { ...yearly, stations: { ...yearly.stations, [s.id]: { type: 0, votes: 12, months: 12 } } };
      expect(stationTypeLabel(s, f.types, forged)).toBeNull();
    }
  });

  it("檔還沒到、檔裡沒有這站、型超出 types[]：不顯示（不拿當月的型代替）", () => {
    const { f, s } = at("2026-09", "台北車站");
    expect(stationTypeLabel(s, f.types, null)).toBeNull();
    expect(stationTypeLabel(s, f.types, { ...yearly, stations: {} })).toBeNull();
    expect(stationTypeLabel(s, f.types, { ...yearly, stations: { [s.id]: { type: 9, votes: 12, months: 12 } } })).toBeNull();
  });
});
