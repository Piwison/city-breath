import { describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import tokensCss from "../styles/tokens.css?raw";
import { cssTokenReader, parseColor } from "../styles/tokens";
import type { BasemapFile, DistrictsFile } from "./types";
import { baseView, lineToken } from "./views";

const basemap = basemapJson as unknown as BasemapFile;
const districtFiles = import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }) as Record<
  string,
  DistrictsFile
>;
const latest = districtFiles[`../../public/data/${basemap.stationsMonth}/districts.json`];

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
