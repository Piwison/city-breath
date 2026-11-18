// 4.1 找你的站：清單依路線分組（中山在兩條線下）、環狀線不能當迄站的標示與說明、最近用過的站在最上面、
// 時段選單 2–4 點標停止營運、沒選站時起訖是空的、打開搜尋送 commute_input_started。
// 測試環境沒有 DOM：用 react-dom/server 輸出 HTML 檢查（點擊與鍵盤由 Playwright 在 design/reviews/4.1-find-your-station/ 驗）。
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../track", () => ({ track: (...a: unknown[]) => calls.push(a) }));

import basemapJson from "../../public/data/basemap.json";
import { searchModel } from "../data/stationSearch";
import type { BasemapFile, MetaFile, StationsFile } from "../data/types";
import { rememberStation, resetProgressForTest } from "../state/progress";
import { commuteCard } from "../share/card";
import { shareUrl } from "../state/url";
import { clearCommute, closeCard, openCommute, setCommute } from "../state/view";
import { CommuteInput, hourOptions, serviceHour } from "./CommutePanel";
import { startSearch, StationSearch } from "./StationSearch";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const file = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`];
const meta = (import.meta.glob("../../public/data/*/meta.json", { import: "default", eager: true }) as Record<string, MetaFile>)[
  `../../public/data/${month}/meta.json`
];
const model = searchModel(file.stations, basemap.stationLines, basemap.lines);
const idOf = (display: string) => file.stations.find((s) => s.display === display)!.id;
const text = (html: string) => html.replace(/<[^>]+>/g, "|");

beforeEach(() => {
  vi.stubGlobal("localStorage", undefined);
  resetProgressForTest();
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetProgressForTest();
  clearCommute();
});

const search = (mode: "station" | "dest" = "station") =>
  renderToStaticMarkup(<StationSearch model={model} mode={mode} label="找車站" onPick={() => {}} autoFocus={false} />);

describe("搜尋清單（4.1）", () => {
  it("依路線分組，中山在淡水信義線與松山新店線下都有", () => {
    const html = search();
    const sections = [...html.matchAll(/<section aria-label="([^"]+)">([\s\S]*?)<\/section>/g)];
    expect(sections.map((m) => m[1])).toEqual(basemap.lines.map((l) => l.name));
    const withZs = sections.filter((m) => />中山<\/span>/.test(m[2])).map((m) => m[1]);
    expect(withZs).toEqual(["淡水信義線", "松山新店線"]);
  });

  it("環狀線組標明沒有出站紀錄；挑迄站時出站未入檔的站標「不能當迄站」，挑起站時不標", () => {
    expect(search()).toContain("沒有出站紀錄，不能當迄站");
    const dest = search("dest");
    expect(text(dest)).toMatch(/板橋（環狀線）\|*不能當迄站/);
    expect(text(search())).not.toMatch(/板橋（環狀線）\|*不能當迄站/);
  });

  it("最近用過的站排在最上面（新的在前），當月沒有的站不列", () => {
    rememberStation(idOf("淡水"));
    rememberStation("sdeadbeef");
    rememberStation(idOf("頂溪"));
    const html = search();
    const first = /<section aria-label="([^"]+)">([\s\S]*?)<\/section>/.exec(html)!;
    expect(first[1]).toBe("最近用過");
    expect([...first[2].matchAll(/class="find-name">([^<]+)</g)].map((m) => m[1])).toEqual(["頂溪", "淡水"]);
  });

  it("打開搜尋送 commute_input_started，不帶 props", () => {
    const open = vi.fn();
    startSearch(open);
    expect(open).toHaveBeenCalledOnce();
    expect(calls).toEqual([["commute_input_started"]]);
  });

  it("最近用過的站不送 track()、不進分享卡", () => {
    rememberStation(idOf("淡水"));
    rememberStation(idOf("象山"));
    expect(calls).toEqual([]);
    const [o, d] = [file.stations.find((s) => s.display === "頂溪")!, file.stations.find((s) => s.display === "台北車站")!];
    const result = { companions: 120, companionsLabel: "120 人", departures: 900, rank: 1, rankedOf: 40, top: [] };
    const url = shareUrl({ month, dayType: "weekday", commute: { o: o.id, d: d.id, h: 8 } }, "https://example.test/");
    const card = JSON.stringify(commuteCard({ meta, origin: o, dest: d, dayType: "weekday", hour: 8, result, url }));
    for (const s of ["淡水", "象山", idOf("淡水"), idOf("象山")]) expect(card).not.toContain(s);
  });
});

describe("通勤輸入（4.1）", () => {
  it("時段選單列出 0–23 點；資料裡停駛的 2–4 點標停止營運且不能選", () => {
    const opts = hourOptions(meta.serviceHours);
    expect(opts.map((o) => o.h)).toEqual([...Array(24).keys()]);
    for (const h of [2, 3, 4]) expect(opts[h]).toEqual({ h, label: `${h} 點・停止營運`, disabled: true });
    expect(opts[8]).toEqual({ h: 8, label: "8 點出發", disabled: false });
    expect(serviceHour(3, meta.serviceHours)).toBe(8);
    expect(serviceHour(17, meta.serviceHours)).toBe(17);
  });

  it("沒選站時起訖是空的，時段選單的 2–4 點 disabled", () => {
    closeCard();
    openCommute();
    setCommute({ h: 8 });
    const html = renderToStaticMarkup(<CommuteInput data={{ month, stations: file.stations, model, meta }} />);
    expect(html).toContain('data-empty="">選起站');
    expect(html).toContain('data-empty="">選迄站');
    for (const h of [2, 3, 4]) expect(html).toContain(`<option value="${h}" disabled="">${h} 點・停止營運</option>`);
    expect(html).toContain("環狀線車站沒有出站紀錄，不能當迄站");
  });

  it("帶入起站：起站是那一站、迄站空的", () => {
    openCommute(idOf("頂溪"));
    setCommute({ h: 8 });
    const html = renderToStaticMarkup(<CommuteInput data={{ month, stations: file.stations, model, meta }} />);
    expect(html).toMatch(/<span class="v">頂溪<\/span>/);
    expect(html).toContain('data-empty="">選迄站');
  });
});
