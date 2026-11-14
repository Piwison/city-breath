// 3.12 車站卡：長條點了跳時段並停播放、環狀線顯示、少於 10 人、數字與 stations.json／od 分片一致。
// 測試環境沒有 DOM：用 react-dom/server 輸出卡片的 HTML 檢查內容（effect 不跑，od 分片從外面給）。
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import stationTypesJson from "../../public/data/station-types.json";
import type { StationTypesState } from "../data/stationType";
import { stationTraits, stationVolume } from "../data/traits";
import type { BasemapFile, DistrictFlowsFile, DistrictsFile, OdShard, StationsFile, StationTypesFile } from "../data/types";
import type { OdState } from "../data/useOdShard";
import { flowSource, stationDestinations, stationIndex } from "../data/views";
import { seek } from "../state/clock";
import { closeCard, getView, selectStation, setDayType, setFocus, setPlaying } from "../state/view";
import { barRatios, pickHour, StationCardView } from "./StationCard";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const file = (
  import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>
)[`../../public/data/${month}/stations.json`];
const flows = (
  import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }) as Record<string, DistrictFlowsFile>
)[`../../public/data/${month}/district-flows.json`];
const odFiles = import.meta.glob("../../public/data/*/od/*.json", { import: "default" }) as Record<string, () => Promise<OdShard>>;
const index = stationIndex(file, basemap.stationLines);
const source = flowSource(flows);
const lineNames = new Map(basemap.lines.map((l) => [l.id, l.name]));
const districts = (
  import.meta.glob("../../public/data/*/districts.json", { import: "default", eager: true }) as Record<string, DistrictsFile>
)[`../../public/data/${month}/districts.json`];
const districtNames = new Map(districts.districts.map((d) => [d.id, d.name]));
const idOf = (display: string) => file.stations.find((s) => s.display === display)!.id;
const num = (n: number) => Math.round(n).toLocaleString("zh-TW");

async function card(display: string, od?: OdState, yearly?: StationTypesState) {
  const id = idOf(display);
  const state: OdState = od ?? { status: "ok", id, shard: await odFiles[`../../public/data/${month}/od/${id}.json`]() };
  return renderToStaticMarkup(
    <StationCardView
      id={id}
      stations={index}
      source={source}
      lineNames={lineNames}
      districtNames={districtNames}
      od={state}
      yearly={yearly}
    />,
  );
}
const yearlyOk: StationTypesState = { status: "ok", file: stationTypesJson as unknown as StationTypesFile };
const typeTag = (html: string) => html.match(/<span class="card-type-tag">([^<]*)<\/span>/)?.[1] ?? null;

describe("車站卡", () => {
  beforeEach(() => {
    closeCard();
    setDayType("weekday");
    setPlaying(false);
    seek(8);
  });

  it("點整天長條的一格：停止播放、跳到那個時段（卡與緞帶跟著 hour 換）", () => {
    setPlaying(true);
    pickHour(17);
    expect(getView()).toMatchObject({ hour: 17, playing: false });
  });

  it("長條高度：當天最大為 1；有人但很少時留一點；停止營運是 null（和 0 分得出來）", () => {
    expect(barRatios([null, 0, 50, 200])).toEqual([null, 0.04, 0.25, 1]);
  });

  it(`蘆洲平日 8 點：時段、個性、進出、前 5 目的地與去哪幾區，數字和 stations.json、od 分片一致`, async () => {
    const id = idOf("蘆洲");
    const i = index.byId.get(id)!;
    selectStation(id);
    const html = await card("蘆洲");
    expect(html).toContain("平日 8 點");
    expect(html).toContain("這一站的個性");
    for (const t of stationTraits(file.stations, i).traits) expect(html).toContain(t.text);
    const v = stationVolume(file.stations[i], "weekday", 8);
    expect(html).toContain(`>${num(v.entries!)}<`);
    expect(html).toContain(`>${num(v.exits!)}<`);
    const shard = await odFiles[`../../public/data/${month}/od/${id}.json`]();
    for (const d of stationDestinations(shard, i, "weekday", 8).top) {
      expect(html).toContain(file.stations[d.index].display);
      expect(html).toContain(`${num(d.value)} 人`);
    }
    expect(html).toContain("去哪幾區：");
    expect(html).toContain("從這站找通勤");
    // 24 格長條，8 點是目前的那一格
    expect(html.match(/aria-label="\d+ 點 /g)).toHaveLength(24);
    expect(html).toMatch(/aria-label="8 點 [\d,]+ 人" aria-current="true"/);
  });

  it("環狀線站：出站寫「未入檔」並附說明，沒有個性", async () => {
    const loop = file.stations.find((s) => !s.exitsRecorded)!;
    const html = await card(loop.display);
    expect(html).toContain("未入檔");
    expect(html).toContain("環狀線的出站由新北捷運營運");
    expect(html).not.toContain("這一站的個性");
  });

  it("這一小時每個方向都少於 10 人：寫「少於 10 人」，不列數字", async () => {
    const id = idOf("台北車站");
    const empty = Array.from({ length: 24 }, () => file.stations.map(() => null));
    const shard = { weekday: empty, holiday: empty } as unknown as OdShard;
    const html = await card("台北車站", { status: "ok", id, shard });
    expect(html).toContain("每個方向都少於 10 人");
  });

  it("停止營運的時段：卡上寫停止營運（AD-5）", async () => {
    seek(3);
    const html = await card("台北車站");
    expect(html).toContain("停止營運");
  });

  it("點了一個目的地（聚焦那條緞帶）：那一列標成按下，下面出現「看這站」", async () => {
    const id = idOf("蘆洲");
    const i = index.byId.get(id)!;
    const shard = await odFiles[`../../public/data/${month}/od/${id}.json`]();
    const second = file.stations[stationDestinations(shard, i, "weekday", 8).top[1].index];
    selectStation(id);
    setFocus(`${id}>${second.id}`);
    const html = await card("蘆洲");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2); // 平日鈕＋那一列
    expect(html).toContain(`看「${second.display}」這一站`);
  });

  it("分片載入失敗：寫出失敗，卡片其他部分照常", async () => {
    const html = await card("台北車站", { status: "error", id: idOf("台北車站"), message: "載入失敗：404" });
    expect(html).toContain("目的地資料載入失敗");
    expect(html).toContain("這小時進站");
  });

  it("分片還在載入：卡片其他部分照常", async () => {
    const html = await card("台北車站", { status: "loading", id: idOf("台北車站") });
    expect(html).toContain("載入這站的起訖資料中");
    expect(html).toContain("這一站的個性");
  });
});

describe("車站卡的類型標籤（決定 13）", () => {
  const yearly = yearlyOk.status === "ok" ? yearlyOk.file : null!;

  it("標籤與一句話等於 station-types.json 裡這站整年最常見的型；當月相同就沒有小字", async () => {
    const s = file.stations[index.byId.get(idOf("台北車站"))!];
    const t = file.types[yearly.stations[s.id].type];
    expect(s.type).toBe(t.id);
    const html = await card("台北車站", undefined, yearlyOk);
    expect(typeTag(html)).toBe(t.label);
    expect(html).toContain(t.description);
    expect(html).not.toContain("這個月偏");
    expect(html).toContain("類型是 2025 年 10 月～2026 年 9 月 這站最常歸到的那一型");
  });

  it("當月歸到別型（中正紀念堂 2026-09 是辦公站）：標籤照整年的人氣站，多一行「這個月偏辦公站」", async () => {
    const html = await card("中正紀念堂", undefined, yearlyOk);
    expect(typeTag(html)).toBe("人氣站");
    expect(html).toContain('<p class="card-type-month">這個月偏辦公站</p>');
  });

  it("跨型站三重：2026-08 歸到住商站時標籤仍是臥室站、多一行；2026-09 歸回臥室站就沒有那行", () => {
    const render = (m: string) => {
      const f = Object.values(
        import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }) as Record<string, StationsFile>,
      ).find((x) => x.month === m)!;
      const ix = stationIndex(f, basemap.stationLines);
      const id = f.stations.find((s) => s.display === "三重")!.id;
      return renderToStaticMarkup(
        <StationCardView
          id={id}
          stations={ix}
          source={source}
          lineNames={lineNames}
          districtNames={districtNames}
          od={{ status: "loading", id }}
          yearly={yearlyOk}
        />,
      );
    };
    const aug = render("2026-08");
    expect(typeTag(aug)).toBe("臥室站");
    expect(aug).toContain("這個月偏住商站");
    const sep = render("2026-09");
    expect(typeTag(sep)).toBe("臥室站");
    expect(sep).not.toContain("這個月偏");
  });

  it("環狀線站沒有類型標籤", async () => {
    const loop = file.stations.find((s) => !s.exitsRecorded)!;
    const html = await card(loop.display, undefined, yearlyOk);
    expect(html).not.toContain("card-type");
    expect(html).not.toContain("類型是");
  });

  it("station-types.json 還沒到或載入失敗：不顯示標籤（不拿當月的型代替），卡片其他部分照常", async () => {
    for (const y of [{ status: "loading" }, { status: "error", message: "404" }] as StationTypesState[]) {
      const html = await card("台北車站", undefined, y);
      expect(html).not.toContain("card-type");
      expect(html).toContain("這一站的個性");
    }
  });
});
