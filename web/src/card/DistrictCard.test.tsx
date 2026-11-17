// 3.21 行政區卡：排名只列跨區、另一行「留在區內」（決定 12）；「這個時段最忙」（決定 2）。
// 測試環境沒有 DOM：用 react-dom/server 輸出卡片的 HTML 檢查內容。
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, StationsFile } from "../data/types";
import { flowSource, stationIndex } from "../data/views";
import { seek } from "../state/clock";
import { closeCard, selectDistrict, setDayType, setPlaying, setRange } from "../state/view";
import { DistrictCard } from "./DistrictCard";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T,>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const flows = glob<DistrictFlowsFile>(import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }), "district-flows.json");
const districts = glob<DistrictsFile>(import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }), "districts.json");
const stationsFile = glob<StationsFile>(import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }), "stations.json");
const index = stationIndex(stationsFile, basemap.stationLines);
const source = flowSource(flows);
const idOf = (name: string) => districts.districts.find((d) => d.name === name)!.id;
const num = (n: number) => Math.round(n).toLocaleString("zh-TW");
const text = (html: string) => html.replace(/<[^>]+>/g, "");

function card(id: string) {
  selectDistrict(id);
  return renderToStaticMarkup(
    <DistrictCard id={id} flows={flows} districts={districts} source={source} stations={index} legend={{ bars: [], px: 6, k: 1 }} />,
  );
}

describe("行政區卡（3.21）", () => {
  beforeEach(() => {
    closeCard();
    setDayType("weekday");
    setRange("hour");
    setPlaying(false);
    seek(8);
  });

  it("永和區平日 8 點：去哪、誰來的排名裡沒有永和，另有「留在區內 N 人」＝對角線", () => {
    const id = idOf("永和區");
    const html = card(id);
    const ranks = [...html.matchAll(/<span class="n">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(ranks.length).toBeGreaterThan(0);
    expect(ranks).not.toContain("永和區");
    expect(ranks).not.toContain("永和區內");
    const i = flows.districts.indexOf(id);
    const diag = flows.weekday[8]![i][i];
    expect(diag).not.toBeNull();
    expect(text(html)).toContain(`留在區內 ${num(diag!)} 人`);
  });

  it("整天：留在區內＝對角線各小時（有公開人數的）加總", () => {
    setRange("day");
    const id = idOf("大安區");
    const i = flows.districts.indexOf(id);
    const total = flows.weekday.reduce((s, m) => s + (m?.[i][i] ?? 0), 0);
    expect(text(card(id))).toContain(`留在區內 ${num(total)} 人`);
  });

  it("對角線少於 10 人（null）：寫「少於 10 人」，不寫 0", () => {
    // 找一個平日 8 點對角線是 null、但有營運的區（沒有就跳過這一格）
    const i = flows.districts.findIndex((_, k) => flows.weekday[8]![k][k] === null);
    if (i < 0) return;
    const html = text(card(flows.districts[i]));
    expect(html).toMatch(/留在區內 少於 10 人/);
  });

  it("最忙的站標「這個時段最忙」，整天標「整天最忙」；卡上沒有「此刻」", () => {
    const html = card(idOf("大安區"));
    expect(html).toContain("這個時段最忙");
    expect(html).not.toContain("此刻");
    setRange("day");
    expect(card(idOf("大安區"))).toContain("整天最忙");
  });

  it("停止營運的小時：沒有排名也沒有留在區內那一行", () => {
    seek(3);
    const html = text(card(idOf("永和區")));
    expect(html).toContain("停止營運");
    expect(html).not.toContain("留在區內 ");
  });
});
