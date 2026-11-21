// 3.24 首頁減法：三條路（原型 C「一個底座」）。首頁沒動過時看得到的只有搭板南線、找你的站、播放、時間軸與月份日型、
// 平日／假日、⋯更多；分享這一刻、圖層、1x、靜態、回到全景與時間軸下的說明都不在首頁，而在更多清單裡；
// 回到全景只在鏡頭動過或選了東西時出現；搭乘到終點或下車時有分享鈕，連結回到那一站、暫停中。
// 測試環境沒有 DOM：用 react-dom/server 輸出 HTML 檢查（點擊、翻面與截圖由 Playwright 在 design/reviews/3.24-home-paths/ 驗）。
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import basemapJson from "../../public/data/basemap.json";
import type { BasemapFile, DistrictFlowsFile, StationsFile } from "../data/types";
import { flowSource, stationIndex } from "../data/views";
import { copiedKind } from "../share/SharePanel";
import { cssTokenReader } from "../styles/tokens";
import tokensCss from "../styles/tokens.css?raw";
import { seek, setStillMode } from "../state/clock";
import { atLineEnd, endRide, leaveRide, nextStop, restoreRide, setRideRoute, startRide } from "../state/ride";
import { parseQuery, planLink, shareLink, urlStateOf } from "../state/url";
import { closeCard, getView, selectDistrict, setAway, setDayType, setFocus, setPlaying, setSpeed } from "../state/view";
import { HomeDeck, MoreMenu, RecenterButton, RideEnd, rideTarget, showRecenter } from "./HomeDeck";

const basemap = basemapJson as unknown as BasemapFile;
const month = basemap.stationsMonth;
const glob = <T,>(files: Record<string, unknown>, name: string) => files[`../../public/data/${month}/${name}`] as T;
const flows = glob<DistrictFlowsFile>(import.meta.glob("../../public/data/*/district-flows.json", { import: "default", eager: true }), "district-flows.json");
const stationsFile = glob<StationsFile>(import.meta.glob("../../public/data/*/stations.json", { import: "default", eager: true }), "stations.json");
const stations = stationIndex(stationsFile, basemap.stationLines);
const source = flowSource(flows);
const legend = { bars: [], px: 6, k: 1 };
const noop = () => {};

/** 畫面上讀得到的字（標籤之間用 | 隔開）與每顆按鈕的名字（aria-label 或字）。 */
const text = (html: string) => html.replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, inner]) => {
    const label = /aria-label="([^"]+)"/.exec(attrs)?.[1];
    return label ?? inner.replace(/<[^>]+>/g, "").trim();
  });

const deck = (menu = false) => (
  <HomeDeck
    month={month}
    source={source}
    stations={stations}
    legend={legend}
    rideReady
    findReady
    onRide={noop}
    onFind={noop}
    menu={menu}
    onMenu={noop}
  />
);
const home = (el: ReactElement = deck()) =>
  renderToStaticMarkup(
    <>
      {el}
      <RecenterButton onHome={noop} />
    </>,
  );

const ROUTE = {
  line: "BL" as const,
  len: 30,
  stops: [
    { id: "a", s: 1 },
    { id: "b", s: 6 },
    { id: "c", s: 7.5 },
    { id: "d", s: 29 },
  ],
};

// 時間軸的天色漸層從 :root 讀 token：測試沒有 DOM，改從 tokens.css 原文讀
const read = cssTokenReader(tokensCss);
vi.stubGlobal("document", { documentElement: { dataset: {} } });
vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: read }));

beforeEach(() => {
  setRideRoute(null);
  leaveRide();
  closeCard();
  setAway(false);
  setDayType("weekday");
  setSpeed(1);
  setStillMode(false);
  setPlaying(false);
  seek(8);
});
afterEach(() => {
  setRideRoute(null);
  leaveRide();
  closeCard();
  setAway(false);
  setStillMode(false);
  setSpeed(1);
});

describe("首頁沒動過（3.24 verify）", () => {
  it("只看得到三條路、播放、時間與月份日型、平日／假日、⋯更多", () => {
    const html = home();
    expect(buttons(html)).toEqual(["播放一整天", "平日", "假日", "找你的站", "搭板南線", "更多"]);
    // 時間旁的月份與日型（體驗原則 3）
    expect(text(html)).toContain(`${Number(month.slice(5))} 月平日平均`);
    // 時間軸還在：拖曳條＋停駛斜紋
    expect(html).toContain('aria-label="時間"');
    expect(html).toContain("scrub-closed");
  });

  it("找不到分享這一刻、圖層、1x、靜態、回到全景與時間軸下方的說明", () => {
    const t = text(home());
    for (const s of ["分享這一刻", "圖層", "1x", "2x", "靜態", "回到全景", "柱子越高人越多", "少於 10 人", "線寬", "光點", "停駛", "關於", "待你確認"])
      expect(t, s).not.toContain(s);
  });

  it("播放中按鈕寫暫停；三顆主次：搭板南線在中間、最大（主），找你的站與更多在兩側", () => {
    setPlaying(true);
    const html = home();
    expect(buttons(html)[0]).toBe("暫停");
    expect(html).toMatch(/deck-side deck-find[\s\S]*deck-ride[\s\S]*deck-side deck-more/);
  });

  it("搜尋或通勤面板蓋著時底座收起（hidden）", () => {
    const html = renderToStaticMarkup(
      <HomeDeck month={month} legend={legend} rideReady findReady onRide={noop} onFind={noop} menu={false} onMenu={noop} hidden />,
    );
    expect(html).toMatch(/<section[^>]*hidden=""/);
  });
});

describe("⋯更多（3.24）", () => {
  it("底座翻成清單：分享這一刻、圖層、播放速度、靜態模式、怎麼看這張圖（沒有關於、沒有待你確認）；三顆照留", () => {
    const html = home(deck(true));
    const t = text(html);
    const order = ["分享這一刻", "圖層", "播放速度", "靜態模式", "怎麼看這張圖"].map((s) => t.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).not.toContain("關於");
    expect(t).not.toContain("待你確認");
    // 時間軸那一面換成清單；下排三顆還在、⋯ 標成展開
    expect(html).not.toContain('aria-label="時間"');
    expect(html).toMatch(/aria-expanded="true"[^>]*>[\s\S]*?更多<\/button>/);
    expect(buttons(html)).toEqual(expect.arrayContaining(["找你的站", "搭板南線", "更多"]));
  });

  it("播放速度與靜態模式和原本的鍵同一份狀態（1x／2x、開／關）", () => {
    let html = renderToStaticMarkup(<MoreMenu month={month} source={source} stations={stations} legend={legend} onShare={noop} />);
    expect(html).toContain('aria-label="播放速度 1 倍，按一下換成 2 倍"');
    expect(text(html)).toContain("|1x|");
    expect(html).toMatch(/aria-pressed="false"[^>]*>[\s\S]*?靜態模式[\s\S]*?關/);
    setSpeed(2);
    setStillMode(true);
    html = renderToStaticMarkup(<MoreMenu month={month} source={source} stations={stations} legend={legend} onShare={noop} />);
    expect(html).toContain('aria-label="播放速度 2 倍，按一下換成 1 倍"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>[\s\S]*?靜態模式[\s\S]*?開/);
    expect(getView().hour).toBe(8);
    expect(getView().playing).toBe(false);
  });

  it("怎麼看這張圖：原本時間軸下方的文字圖例（線寬、顏色、光點、柱高）", () => {
    const t = text(renderToStaticMarkup(<MoreMenu month={month} source={source} stations={stations} legend={legend} onShare={noop} initial="legend" />));
    expect(t).toContain("線寬＝每小時人次");
    expect(t).toContain("一顆光點＝");
    expect(t).toContain("柱子越高人越多");
    expect(t).toContain(`${Number(month.slice(5))} 月平日平均`);
  });

  it("圖層：同一份開關清單與來源註記", () => {
    const html = renderToStaticMarkup(<MoreMenu month={month} source={source} stations={stations} legend={legend} onShare={noop} initial="layers" />);
    for (const s of ["行政區流向", "捷運路線", "車站", "河川", "公園綠地", "建築與樹", "列車", "雲", "區名"]) expect(text(html)).toContain(s);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(9);
    expect(html).toContain("每日分時各站 OD 流量統計資料");
  });
});

describe("回到全景（3.24）", () => {
  it("鏡頭動過或選了區、站、流向才出現；搭乘中不出", () => {
    expect(text(home())).not.toContain("回到全景");
    setAway(true);
    expect(text(home())).toContain("回到全景");
    setAway(false);
    selectDistrict("63000010");
    expect(text(home())).toContain("回到全景");
    closeCard();
    expect(showRecenter({ ride: null, away: false, district: null, station: null, focus: "a>b" })).toBe(true);
    expect(showRecenter({ ride: null, away: false, district: null, station: "s1", focus: null })).toBe(true);
    expect(showRecenter({ ride: { line: "BL" }, away: true, district: null, station: null, focus: null })).toBe(false);
    expect(showRecenter({ ride: null, away: false, district: null, station: null, focus: null })).toBe(false);
  });

  it("聚焦流向後也出現；hidden（更多清單、搜尋面板開著）時不出", () => {
    setFocus("a>b");
    expect(text(home())).toContain("回到全景");
    expect(renderToStaticMarkup(<RecenterButton onHome={noop} hidden />)).toBe("");
  });
});

describe("搭乘結束的分享（3.24）", () => {
  beforeEach(() => setRideRoute(ROUTE));

  it("上車的起點站不算終點；到終點（暫停）才算", () => {
    startRide(undefined, true);
    expect(atLineEnd()).toBe(false);
    nextStop(true);
    nextStop(true);
    expect(atLineEnd()).toBe(false);
    nextStop(true);
    const v = getView();
    expect(v.ride).toMatchObject({ station: "d", docked: true, playing: false });
    expect(atLineEnd()).toBe(true);
  });

  it("下車：搭乘停住、收起車站卡；分享連結是 ride＋station，新分頁打開回到那一站、暫停中", () => {
    startRide(undefined, true);
    nextStop(true);
    expect(getView().station).toBe("b");
    endRide();
    const v = getView();
    expect(v.ride).toMatchObject({ line: "BL", station: "b", playing: false, left: true });
    expect(v.station).toBeNull();
    expect(atLineEnd()).toBe(false);
    expect(urlStateOf(v)).toMatchObject({ ride: "BL", station: "b" });
    expect(copiedKind(v)).toBe("station");
    const link = shareLink(v, "https://example.test/");
    expect(link).toContain("station=b");
    expect(link).toContain("ride=BL");
    // 新分頁：讀這個連結 → 還原搭乘，停在 b、暫停、車站卡開著
    leaveRide();
    const plan = planLink(parseQuery(new URL(link).search), {
      months: [month],
      latest: month,
      hasDistrict: () => true,
      hasStation: (id) => ROUTE.stops.some((s) => s.id === id),
      canRide: (line, id) => line === "BL" && ROUTE.stops.some((s) => s.id === id),
    });
    expect(plan).toMatchObject({ kind: "restore", ride: { line: "BL", station: "b" } });
    restoreRide("BL", "b");
    expect(getView().ride).toMatchObject({ station: "b", docked: true, playing: false });
    expect(getView().ride?.left).toBeUndefined();
    expect(getView().station).toBe("b");
  });

  it("下車小卡：在哪一站下車、分享、回到首頁；分享面板標題「分享這趟搭乘」", () => {
    const html = renderToStaticMarkup(<RideEnd line="板南線" station="台北車站" docked onHome={noop} />);
    expect(text(html)).toContain("在台北車站下車");
    expect(buttons(html)).toEqual(["分享", "回到首頁"]);
    expect(rideTarget("板南線", "台北車站")).toMatchObject({ heading: "分享這趟搭乘", kicker: "板南線", title: "台北車站" });
  });
});
