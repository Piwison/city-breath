// 4.2 通勤卡：一句答案、同路人數與名次、早晚一小時三格、少於 10 人、停止營運，以及分享面板的圖（含同路人數、月份、來源、短網址）。
// 用最新月份的真實 od 分片；測試環境沒有 DOM，用 react-dom/server 輸出 HTML 檢查（點擊在 design/reviews/4.2-commute-card/ 用 Playwright 驗）。
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import { commuteAnswer } from "../data/answer";
import { computeCommute } from "../data/commute";
import type { BasemapFile, DayType, MetaFile, OdShard, StationsFile } from "../data/types";
import type { OdState } from "../data/useOdShard";
import { pickHour, seek } from "../state/clock";
import { siteLabel } from "../state/url";
import { closeCard, getView, restoreCommute, setDayType } from "../state/view";
import { CommuteCardView, commuteShareTarget } from "./CommuteCard";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T,>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const file = glob<StationsFile>(import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }), "stations.json");
const meta = glob<MetaFile>(import.meta.glob("../../public/data/*/meta.json", { import: "default", eager: true }), "meta.json");
const odFiles = import.meta.glob("../../public/data/*/od/*.json", { import: "default" }) as Record<string, () => Promise<OdShard>>;
const stations = file.stations;
const byId = new Map(stations.map((s, i) => [s.id, i]));
const at = (display: string) => stations.findIndex((s) => s.display === display);
const shardOf = (id: string) => odFiles[`../../public/data/${month}/od/${id}.json`]();

const SMALL_PEOPLE = /(?<![\d,.])\d(?![\d,.])\s*人/;
const SMALL_CELL = /<b class="num">\d<\/b>/;
const visible = (html: string) => {
  const attrs = [...html.matchAll(/(?:aria-label|title)="([^"]*)"/g)].map((m) => m[1]);
  return `${html.replace(/<[^>]+>/g, " ")}\n${attrs.join("\n")}`;
};

function render(o: number, d: number, h: number, shard: OdShard, extra: { meta?: MetaFile; od?: OdState } = {}) {
  restoreCommute({ o: stations[o].id, d: stations[d].id, h });
  seek(h);
  const od = extra.od ?? ({ status: "ok", id: stations[o].id, shard } as OdState);
  return renderToStaticMarkup(
    <CommuteCardView commute={{ o: stations[o].id, d: stations[d].id, h }} month={month} stations={stations} byId={byId} meta={extra.meta ?? meta} od={od} />,
  );
}

beforeEach(() => {
  closeCard();
  setDayType("weekday");
});
afterAll(() => {
  closeCard();
  setDayType("weekday");
  seek(8);
});

describe("通勤卡（4.2）", () => {
  it(`${month} 頂溪→台北車站平日 8 點：一句答案、同路人數、名次與起站前 5 目的地`, async () => {
    const [o, d] = [at("頂溪"), at("台北車站")];
    const shard = await shardOf(stations[o].id);
    const res = computeCommute(shard, o, d, "weekday", 8)!;
    expect(res.companions).toBeGreaterThanOrEqual(10);
    const html = render(o, d, 8, shard);
    const answer = commuteAnswer({ origin: "頂溪", dest: "台北車站", dayType: "weekday", hour: 8, operating: true, companions: res.companions });
    expect(answer).toBe(`平日 8 點，約 ${Math.round(res.companions!).toLocaleString("zh-TW")} 人和你一樣從頂溪到台北車站`);
    expect(html).toContain(`<p class="card-answer" aria-live="polite">${answer}</p>`);
    expect(html).toContain('<span class="card-when">平日 8 點</span>');
    expect(html).toContain(`<b class="num">第 ${res.rank}</b><span>熱門目的地（共 ${res.rankedOf} 站）</span>`);
    // 前 5 目的地：名次順序、你的迄站標出（在前 5 時）
    const top = [...html.matchAll(/<li[^>]*><span class="n"><span class="k num">\d<\/span>([^<]+)/g)].map((m) => m[1]);
    expect(top).toEqual(res.top.map((t) => stations[t.station].display));
    if (res.top.some((t) => t.station === d)) expect(html).toContain("你的迄站");
    // 標題、換起訖、分享鈕
    expect(html).toMatch(/<h2[^>]*>頂溪<span aria-hidden="true"> → <\/span><span class="card-sr">到<\/span>台北車站<\/h2>/);
    expect(html).toContain("‹ 換起訖站");
    expect(html).toContain('aria-label="分享"');
  });

  it("早一點、晚一點出門呢？三格是 7、8、9 點；這個時段標 aria-current；點 7 點那格＝時段換成 7 點、數字更新", async () => {
    const [o, d] = [at("頂溪"), at("台北車站")];
    const shard = await shardOf(stations[o].id);
    const html = render(o, d, 8, shard);
    const cells = [...html.matchAll(/<button type="button"( aria-current="true")?( disabled="")? aria-label="([^"]+)"/g)]
      .filter((m) => /出發：/.test(m[3]))
      .map((m) => ({ current: !!m[1], label: m[3] }));
    const v = (h: number) => `${Math.round(computeCommute(shard, o, d, "weekday", h)!.companions!).toLocaleString("zh-TW")} 人`;
    expect(cells).toEqual([
      { current: false, label: `早一小時，7 點出發：${v(7)}` },
      { current: true, label: `這個時段，8 點出發：${v(8)}` },
      { current: false, label: `晚一小時，9 點出發：${v(9)}` },
    ]);
    // 那一格的動作：停止播放、跳到 7 點；通勤的時段跟著換，卡上的答案與三格都是 7 點的數字
    pickHour(7);
    expect(getView().hour).toBe(7);
    expect(getView().commute?.h).toBe(7);
    expect(getView().playing).toBe(false);
    const after = render(o, d, getView().commute!.h, shard);
    expect(after).toContain(`平日 7 點，約 ${v(7)}和你一樣從頂溪到台北車站`);
    expect(after).toContain(`這個時段，7 點出發：${v(7)}`);
    expect(after).toContain(`早一小時，6 點出發：`);
  });

  it("少於 10 人：答案、名次、分享圖都不寫數字", async () => {
    const [o, d] = [at("台北101/世貿"), at("南港軟體園區")];
    const shard = await shardOf(stations[o].id);
    const res = computeCommute(shard, o, d, "weekday", 8)!;
    expect(res.companions).toBeNull();
    const html = render(o, d, 8, shard);
    expect(html).toContain("平日 8 點，和你一樣從台北101/世貿到南港軟體園區的人少於 10 人");
    expect(html).toContain('<b class="num">不排名</b><span>少於 10 人不排名</span>');
    expect(html).toContain('<b class="num">少於 10</b><span>平均同路（人）</span>');
    const text = visible(html);
    expect(text.match(SMALL_PEOPLE)?.[0] ?? null).toBeNull();
    // 分享圖的資料：同路人數是 null（render.ts 畫「少於 10 人」），沒有名次
    const target = commuteShareTarget({ origin: stations[o], dest: stations[d], dayType: "weekday", hour: 8, when: "平日 8 點", answer: "x", result: res, meta });
    const card = target.image!("https://city.example/?from=a&to=b&at=8");
    expect(card.companions).toBeNull();
    expect(card.rank).toBeNull();
  });

  it("停止營運：答案寫明沒有列車、不寫 0；停駛的鄰格寫「停止營運」且不能點；沒有圖可存", async () => {
    const [o, d] = [at("頂溪"), at("台北車站")];
    const shard = await shardOf(stations[o].id);
    const html = render(o, d, 3, shard);
    expect(html).toContain("平日 3 點捷運停止營運，頂溪沒有列車");
    expect(html).toContain('<span class="card-when">平日 3 點・停止營運</span>');
    expect(html).toContain("這個時段停止營運，沒有列車。");
    expect(html).toMatch(/disabled="" aria-label="早一小時，2 點出發：停止營運"/);
    expect(html).not.toMatch(/\b0 人/);
    const target = commuteShareTarget({ origin: stations[o], dest: stations[d], dayType: "weekday", hour: 3, when: "", answer: "", result: null, meta });
    expect(target.image).toBeUndefined();
  });

  it("od 分片載入中、失敗：沒有答案，寫載入中或錯誤", () => {
    const [o, d] = [at("頂溪"), at("台北車站")];
    const shard = {} as OdShard;
    expect(render(o, d, 8, shard, { od: { status: "loading", id: stations[o].id } })).toContain("載入頂溪的起訖資料中…");
    const err = render(o, d, 8, shard, { od: { status: "error", id: stations[o].id, message: "404" } });
    expect(err).toContain('role="alert"');
    expect(err).not.toContain("card-answer");
  });

  it("分享圖的資料：同路人數、月份、來源與短網址；meta 還沒到時只有複製連結", async () => {
    const [o, d] = [at("頂溪"), at("台北車站")];
    const shard = await shardOf(stations[o].id);
    const res = computeCommute(shard, o, d, "weekday", 8)!;
    const args = { origin: stations[o], dest: stations[d], dayType: "weekday" as DayType, hour: 8, when: "平日 8 點", answer: "答案", result: res, meta };
    const url = `https://city.example/?month=${month}&day=weekday&hour=8&from=${stations[o].id}&to=${stations[d].id}&at=8`;
    const target = commuteShareTarget(args);
    expect(target).toMatchObject({ kicker: "通勤同路人", title: "頂溪 → 台北車站", when: "平日 8 點", summary: "答案" });
    const card = target.image!(url);
    expect(card).toMatchObject({ kind: "commute", origin: "頂溪", dest: "台北車站", hour: 8, companions: res.companions, rank: res.rank });
    expect(card.footer.month).toBe(`${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`);
    expect(card.footer.source).toContain(meta.source.publisher);
    expect(card.footer.site).toBe(siteLabel(url));
    expect(card.footer.site).toBe("city.example");
    expect(commuteShareTarget({ ...args, meta: undefined }).image).toBeUndefined();
  });

  it(`${month} 兩個起站到每一站、平日假日 5／8／23 點：畫面文字與 aria-label 沒有 0–9 的人數`, async () => {
    const DAYS: DayType[] = ["weekday", "holiday"];
    for (const name of ["頂溪", "台北101/世貿"]) {
      const o = at(name);
      const shard = await shardOf(stations[o].id);
      for (const day of DAYS) {
        setDayType(day);
        for (const h of [5, 8, 23])
          for (let d = 0; d < stations.length; d++) {
            if (d === o || !stations[d].exitsRecorded) continue;
            const html = render(o, d, h, shard);
            const where = `${name}→${stations[d].display} ${day} ${h}`;
            expect(visible(html).match(SMALL_PEOPLE)?.[0] ?? null, where).toBeNull();
            expect(html.match(SMALL_CELL)?.[0] ?? null, where).toBeNull();
          }
      }
    }
  });
});
