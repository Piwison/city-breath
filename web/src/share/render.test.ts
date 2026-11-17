import { describe, expect, it } from "vitest";
import tokensCss from "../styles/tokens.css?raw";
import { canvasColor, cssTokenReader, parseColor } from "../styles/tokens";
import { tokenAt } from "../scene/daylight";
import { computeCommute } from "../data/commute";
import { CONTRACT_VERSION } from "../data/load";
import type { MetaFile, OdShard } from "../data/types";
import { cardFileName, commuteCard, type CommuteCard } from "./card";
import {
  CARD_H, CARD_W, CONTENT_BOX, PANEL, PREVIEW_H, PREVIEW_HOUR, PREVIEW_W, SAFE_BOTTOM, SAFE_TOP, drawLinkPreview, drawShareCard, fitText,
  resolveTheme, wrapText, type Ctx, type Theme,
} from "./render";

const meta: Pick<MetaFile, "month" | "source" | "dayCounts"> = {
  month: "2026-09",
  source: {
    name: "臺北捷運每日分時各站 OD 流量統計資料",
    publisher: "臺北大眾捷運股份有限公司",
    url: "https://data.gov.tw/dataset/128506",
    license: "政府資料開放授權條款－第1版",
    coordinates: "",
  },
  dayCounts: { weekday: 20, holiday: 10 },
};
const URL_ = "https://example.test/?month=2026-09&from=sA&to=sB&at=8";

/** 記錄 fillText 的假 context；字寬：中文一個字級，英數 0.55 個字級。 */
function fakeCtx() {
  const texts: { text: string; x: number; y: number; size: number; width: number; color: unknown; font: string }[] = [];
  const gradients: string[][] = [];
  const fills: unknown[] = [];
  const sizeOf = (font: string) => Number(/([\d.]+)px/.exec(font)![1]);
  const measure = (font: string, t: string) =>
    [...t].reduce((w, c) => w + (/[\x00-\x7f]/.test(c) ? 0.55 : 1) * sizeOf(font), 0);
  const ctx = {
    fillStyle: "" as unknown, strokeStyle: "" as unknown, font: "10px sans-serif",
    textAlign: "left", textBaseline: "alphabetic", lineWidth: 1, lineCap: "butt",
    shadowColor: "", shadowBlur: 0, shadowOffsetY: 0,
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {}, closePath() {}, stroke() {},
    fill() { fills.push(this.fillStyle); },
    fillRect() {},
    measureText(t: string) { return { width: measure(this.font, t) }; },
    fillText(t: string, x: number, y: number) {
      texts.push({ text: t, x, y, size: sizeOf(this.font), width: measure(this.font, t), color: this.fillStyle, font: this.font });
    },
    createLinearGradient() {
      const stops: string[] = [];
      gradients.push(stops);
      return { addColorStop: (_: number, c: string) => stops.push(c) };
    },
  };
  return { ctx: ctx as unknown as Ctx, texts, gradients, fills, all: () => texts.map((t) => t.text).join("\n") };
}

// 起站 0、迄站 1–3；8 點：迄站 1 有 214 人、2 有 50 人、3 少於 10 人（null）
const shard: OdShard = {
  v: CONTRACT_VERSION, origin: "sA", month: "2026-09",
  weekday: Array.from({ length: 24 }, (_, h) => (h >= 2 && h <= 4 ? null : [null, 214, 50, null])),
  holiday: Array.from({ length: 24 }, () => null),
  weekdayDepartures: Array.from({ length: 24 }, () => 400),
  holidayDepartures: Array.from({ length: 24 }, () => null),
};

function card(dest: number, hour = 8, names: [string, string] = ["板橋", "台北車站"]): CommuteCard {
  const result = computeCommute(shard, 0, dest, "weekday", hour)!;
  return commuteCard({ meta, origin: { display: names[0] }, dest: { display: names[1] }, dayType: "weekday", hour, result, url: URL_ });
}

function draw(c: CommuteCard, theme: Theme = resolveTheme(c.hour)) {
  const f = fakeCtx();
  drawShareCard(f.ctx, c, theme);
  return f;
}

describe("版型", () => {
  it("是 IG 限動的 9:16，安全區在畫面內", () => {
    expect(CARD_W / CARD_H).toBeCloseTo(9 / 16);
    expect(CONTENT_BOX.y).toBe(SAFE_TOP);
    expect(CONTENT_BOX.y + CONTENT_BOX.h).toBe(CARD_H - SAFE_BOTTOM);
  });

  it("檔名帶種類、月份、日型、時段", () => {
    expect(cardFileName(card(1))).toBe("city-breath-commute-2026-09-weekday-08.png");
  });
});

describe("通勤卡", () => {
  it("一般數字：寫出人數、名次與起訖站", () => {
    const { all } = draw(card(1));
    expect(all()).toContain("214");
    expect(all()).toContain("板橋");
    expect(all()).toContain("台北車站");
    expect(all().replace(/\n/g, "").replace(/\u00a0/g, " ")).toContain("第 1 熱門目的地（共 2 站）");
    expect(all()).toContain("平日 8 點出發");
  });

  it("少於 10 人：圖上寫「少於 10 人」，不出現人數與名次", () => {
    const c = card(3);
    expect(c.companions).toBeNull();
    expect(c.rank).toBeNull();
    const { all, texts } = draw(c);
    expect(all()).toContain("少於 10 人");
    expect(all()).not.toMatch(/熱門目的地/);
    // 卡上出現的數字只有門檻 10、時段 8 與頁尾的月份、天數、資料集與網址
    const numbers = texts.flatMap((t) => t.text.match(/\d[\d,]*/g) ?? []);
    expect(new Set(numbers)).toEqual(new Set(["10", "8", "2026", "9", "20", "1", "128506"]));
  });

  it("頁尾有資料月份、來源與網址，而且在安全區內", () => {
    const { all, texts } = draw(card(1));
    expect(all()).toContain("2026 年 9 月・20 個平日平均");
    expect(all()).toContain("臺北大眾捷運股份有限公司");
    expect(all().replace(/\n/g, "")).toContain("臺北捷運每日分時各站 OD 流量統計資料");
    expect(all()).toContain("data.gov.tw/dataset/128506");
    expect(all()).toContain("example.test");
    const site = texts.find((t) => t.text === "example.test")!;
    expect(site.y).toBeLessThanOrEqual(CARD_H - SAFE_BOTTOM);
  });

  it.each([
    ["一般", card(1)],
    ["少於 10 人", card(3)],
    ["夜間", card(1, 23)],
    ["長站名", card(1, 8, ["很長很長很長很長很長很長很長很長很長很長很長很長的起站", "另一個也非常非常非常非常非常非常長的迄站名稱"])],
  ])("%s：每行字都在內容區內、不互相重疊", (_name, c) => {
    // 網站名在面板外的天空帶（決定 18），其餘每行字都在內容區
    const texts = draw(c).texts.filter((t) => t.y > PANEL.y);
    const box = CONTENT_BOX;
    for (const t of texts) {
      expect(t.x, t.text).toBeGreaterThanOrEqual(box.x);
      expect(t.x + t.width, t.text).toBeLessThanOrEqual(box.x + box.w + 0.5);
      expect(t.y - t.size * 0.9, t.text).toBeGreaterThanOrEqual(box.y - 0.5);
      expect(t.y + t.size * 0.2, t.text).toBeLessThanOrEqual(box.y + box.h + 0.5);
    }
    // 依基線排序後，相鄰兩行（不同基線）不重疊
    const rows = [...new Map(texts.map((t) => [t.y, t])).values()].sort((a, b) => a.y - b.y);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].y - rows[i].size * 0.9, `${rows[i - 1].text} / ${rows[i].text}`).toBeGreaterThanOrEqual(rows[i - 1].y + rows[i - 1].size * 0.2 - 0.5);
    }
  });

  it("長站名縮字後換行，字都還在", () => {
    const long = "很長很長很長很長很長很長很長很長很長很長很長很長的起站";
    const { texts } = draw(card(1, 8, [long, "台北車站"]));
    const nameLines = texts.filter((t) => long.includes(t.text) && t.text.length > 1);
    expect(nameLines.length).toBe(2);
    expect(nameLines.map((t) => t.text).join("")).toBe(long);
  });
});

describe("日夜跟著卡片時段", () => {
  const night = cssTokenReader(tokensCss, "night");
  const day = cssTokenReader(tokensCss, "day");
  const hex = (raw: string) => canvasColor(parseColor(raw)!);

  it("23 點用夜晚的天空與 HUD 色", () => {
    const t = resolveTheme(23);
    expect(t.phase).toBe("night");
    expect(t.ink).toBe(hex(night("--hud-ink")));
    expect(t.panel).toBe(hex(night("--hud-bg")));
    expect(t.sky[0]).toBe(canvasColor(tokenAt("--sky-top", 23.5, night)));
    const { gradients } = draw(card(1, 23), t);
    expect(gradients[0]).toEqual(t.sky);
  });

  it("8 點用白天；整天的卡用正午", () => {
    expect(resolveTheme(8).phase).toBe("day");
    expect(resolveTheme(8).ink).toBe(hex(day("--hud-ink")));
    expect(resolveTheme(null).sky[0]).toBe(hex(day("--sky-top-day")));
  });

  it("字級與字型取自 token：數字與英文用自帶字型（--font-num），中文回退到系統字", () => {
    const t = resolveTheme(8);
    expect(t.font).toBe(day("--font-num"));
    expect(t.font.startsWith('"Manrope Num"')).toBe(true);
    expect(t.font).toContain(day("--font"));
    expect(t.size.xl).toBe(Math.round(40 * (1080 / 390)));
  });
});

describe("排版工具", () => {
  const f = fakeCtx();
  const theme = resolveTheme(8);

  it("fitText 先縮字，放得下就不換行", () => {
    const r = fitText(f.ctx, theme, "台北101/世貿", { max: 100, min: 50, weight: 700, maxWidth: 600, maxLines: 2 });
    expect(r.lines).toEqual(["台北101/世貿"]);
    expect(r.size).toBeLessThanOrEqual(100);
  });

  it("wrapText 網址不拆開、句讀不放行首、超過行數加「…」", () => {
    const l = wrapText(f.ctx, theme, "資料來源：臺北大眾捷運股份有限公司，data.gov.tw/dataset/128506", 40, 400, 400);
    expect(l.some((s) => s.includes("data.gov.tw/dataset/128506"))).toBe(true);
    expect(l.every((s) => !/^[，。、]/.test(s))).toBe(true);
    const cut = wrapText(f.ctx, theme, "一二三四五六七八九十一二三四五六七八九十", 40, 400, 200, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith("…")).toBe(true);
  });
});

describe("3.15 版型：天空帶、短網址、自帶字型（決定 16、18、19）", () => {
  it("網站名在上方天空帶（面板上緣之上、IG 頂端安全區內），面板裡沒有品牌列", () => {
    const { texts } = draw(card(1));
    const brand = texts.filter((t) => t.text === "城市呼吸" || t.text.includes("北捷人流脈搏"));
    expect(brand).toHaveLength(2);
    for (const t of brand) {
      expect(t.y).toBeLessThan(PANEL.y);
      expect(t.y - t.size).toBeGreaterThan(0);
    }
    expect(texts.filter((t) => t.y > PANEL.y && t.text.includes("城市呼吸"))).toHaveLength(0);
  });

  it("下方天空留白：面板下緣以下沒有任何字", () => {
    for (const c of [card(1), card(3), card(1, 23)]) {
      const { texts } = draw(c);
      expect(texts.every((t) => t.y <= PANEL.y + PANEL.h)).toBe(true);
      expect(PANEL.y + PANEL.h).toBeLessThan(CARD_H - SAFE_BOTTOM + 100);
    }
  });

  it("只印短網址：沒有協定與 query（不放 QR code，圖上只有字與幾何）", () => {
    const { all } = draw(card(1));
    expect(all()).toContain("example.test");
    expect(all()).not.toContain("https://");
    expect(all()).not.toContain("month=");
    expect(all()).not.toMatch(/QR/i);
  });

  it("數字用自帶字型的字族", () => {
    const { texts } = draw(card(1));
    const digits = texts.filter((t) => /\d/.test(t.text));
    expect(digits.length).toBeGreaterThan(0);
    for (const t of digits) expect(t.font).toContain('"Manrope Num"');
  });

  it("天空上的字色依天色選深或淺", () => {
    const hex = (raw: string) => canvasColor(parseColor(raw)!);
    expect(resolveTheme(12).skyInk).toBe(hex(cssTokenReader(tokensCss, "day")("--hud-ink")));
    expect(resolveTheme(23).skyInk).toBe(hex(cssTokenReader(tokensCss, "night")("--hud-ink")));
  });
});

describe("連結預覽圖（決定 20）", () => {
  it("1200×630，有網站名與「上個月的台北捷運」，沒有數字，字都在畫面內", () => {
    const f = fakeCtx();
    drawLinkPreview(f.ctx, resolveTheme(PREVIEW_HOUR));
    expect([PREVIEW_W, PREVIEW_H]).toEqual([1200, 630]);
    expect(f.all()).toContain("城市呼吸");
    expect(f.all()).toContain("上個月的台北捷運");
    expect(f.all()).not.toMatch(/\d/);
    for (const t of f.texts) {
      expect(t.x + t.width).toBeLessThanOrEqual(PREVIEW_W);
      expect(t.y).toBeLessThanOrEqual(PREVIEW_H);
      expect(t.y - t.size).toBeGreaterThanOrEqual(0);
    }
  });
});
