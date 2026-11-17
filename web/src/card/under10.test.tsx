// 3.22 規則修正：卡片上任何給人看的人數（畫面文字、aria-label、title）都不得出現 0–9；小於 10 一律「少於 10 人」，
// 停止營運寫「停止營運」（CLAUDE.md「少於 10 人不顯示數字」）。掃最新月份每一個行政區卡與車站卡、平日假日 24 小時的輸出。
// 只改顯示：資料照舊（站的進出是站層級總量，凌晨會有個位數）。
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import { formatCount, formatNumber } from "../data/format";
import type { BasemapFile, DayType, DistrictFlowsFile, DistrictsFile, OdShard, StationsFile } from "../data/types";
import { flowSource, stationIndex } from "../data/views";
import { seek } from "../state/clock";
import { closeCard, selectDistrict, selectStation, setDayType, setPlaying, setRange } from "../state/view";
import { DistrictCard } from "./DistrictCard";
import { StationCardView } from "./StationCard";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T,>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const flows = glob<DistrictFlowsFile>(import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }), "district-flows.json");
const districts = glob<DistrictsFile>(import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }), "districts.json");
const file = glob<StationsFile>(import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }), "stations.json");
const odFiles = import.meta.glob("../../public/data/*/od/*.json", { import: "default" }) as Record<string, () => Promise<OdShard>>;
const index = stationIndex(file, basemap.stationLines);
const source = flowSource(flows);
const lineNames = new Map(basemap.lines.map((l) => [l.id, l.name]));
const districtNames = new Map(districts.districts.map((d) => [d.id, d.name]));
const DAYS: DayType[] = ["weekday", "holiday"];

/** 一個 0–9 的人數：前後不是數字、逗號、小數點，後面接「人」（含「人次」）或在「（人）」欄位的數字格裡。 */
const SMALL_PEOPLE = /(?<![\d,.])\d(?![\d,.])\s*人/;
const SMALL_CELL = /<b class="num">\d<\/b>/;
/** 畫面文字＋屬性（aria-label、title）一起掃 */
const visible = (html: string) => {
  const attrs = [...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]);
  return `${html.replace(/<[^>]+>/g, " ")}\n${attrs.join("\n")}`;
};
function check(html: string, where: string) {
  const text = visible(html);
  expect(text.match(SMALL_PEOPLE)?.[0] ?? null, where).toBeNull();
  expect(html.match(SMALL_CELL)?.[0] ?? null, where).toBeNull();
}

afterAll(() => closeCard());

describe("少於 10 人不顯示數字（3.22）", () => {
  it("共用格式：0–9 寫「少於 10 人」，null 依情境給字，10 以上照寫", () => {
    for (const n of [0, 1, 5, 9, 9.4]) {
      expect(formatCount(n)).toBe("少於 10 人");
      expect(formatNumber(n)).toBe("少於 10");
    }
    expect(formatCount(null)).toBe("少於 10 人");
    expect(formatCount(null, "停止營運")).toBe("停止營運");
    expect(formatCount(10)).toBe("10 人");
    expect(formatCount(12345.4)).toBe("12,345 人");
  });

  it("資料裡真的有個位數（掃描不是空轉）", () => {
    const small = file.stations.some((s) => DAYS.some((d) => s[d].entries.some((v) => v !== null && v < 10)));
    expect(small).toBe(true);
  });

  it("每一個行政區卡：平日假日 × 24 小時，這一小時與整天", () => {
    setPlaying(false);
    for (const d of districts.districts) {
      selectDistrict(d.id);
      for (const day of DAYS) {
        setDayType(day);
        setRange("day");
        check(
          renderToStaticMarkup(<DistrictCard id={d.id} flows={flows} districts={districts} source={source} stations={index} legend={{ bars: [], px: 6, k: 1 }} />),
          `${d.name} ${day} 整天`,
        );
        setRange("hour");
        for (let h = 0; h < 24; h++) {
          seek(h);
          check(
            renderToStaticMarkup(<DistrictCard id={d.id} flows={flows} districts={districts} source={source} stations={index} legend={{ bars: [], px: 6, k: 1 }} />),
            `${d.name} ${day} ${h} 點`,
          );
        }
      }
    }
  });

  it("每一個車站卡：平日假日 × 24 小時（含整天長條的 aria-label、目的地、去哪幾區）", { timeout: 60000 }, async () => {
    setPlaying(false);
    for (const s of file.stations) {
      const shard = await odFiles[`../../public/data/${month}/od/${s.id}.json`]?.();
      selectStation(s.id);
      for (const day of DAYS) {
        setDayType(day);
        for (let h = 0; h < 24; h++) {
          seek(h);
          check(
            renderToStaticMarkup(
              <StationCardView
                id={s.id}
                stations={index}
                source={source}
                lineNames={lineNames}
                districtNames={districtNames}
                od={shard ? { status: "ok", id: s.id, shard } : { status: "loading", id: s.id }}
              />,
            ),
            `${s.display} ${day} ${h} 點`,
          );
        }
      }
    }
  });
});
