// 直式分享卡：依資料在離屏 canvas 重畫，不讀主場景畫面（AD-17）。
// 外框（天空、面板、頁尾的月份／來源／網址）三種卡共用，只換內容區：CONTENT[kind]。
// 3.15（決定 16、18、19）：網站名放在上方天空帶、下方天空留白（IG 介面會蓋住）；只印短網址、不放 QR code；
// 數字與英文用自帶的 Manrope 子集（--font-num，public/fonts/），中文逐字回退到系統字型。
// 同一組天空、面板與字型也畫全站固定的連結預覽圖（drawLinkPreview，1200×630，決定 20）。
// 顏色、字型、字級、圓角都從 tokens.css 讀（AD-8）；卡片的日夜跟卡片時段走，不跟目前頁面。
// 不畫任何示意物件（街廓、樹、地標造型、列車、雲；AD-23）。
import tokensCss from "../styles/tokens.css?raw";
import { canvasColor, cssTokenReader, tokenRgba, type Rgba, type TokenReader } from "../styles/tokens";
import { phaseAt, tokenAt } from "../scene/daylight";
import { formatCount } from "../data/commute";
import { DAY_LABEL, cardFileName, type CommuteCard, type ShareCard } from "./card";

/** IG／Threads 限動的 9:16。 */
export const CARD_W = 1080;
export const CARD_H = 1920;
/** 限動上下會被帳號列與回覆框蓋住的高度；文字只放在這之間。 */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 250;
/** 390px 手機稿放大到卡片寬度的倍率，字級與圓角照 token 換算。 */
export const SCALE = CARD_W / 390;

const MARGIN = Math.round(16 * SCALE);
const PAD = Math.round(24 * SCALE);
export const PANEL = { x: MARGIN, y: SAFE_TOP - PAD, w: CARD_W - 2 * MARGIN, h: CARD_H - SAFE_TOP - SAFE_BOTTOM + 2 * PAD };
/** 文字可以出現的範圍。 */
export const CONTENT_BOX = { x: PANEL.x + PAD, y: SAFE_TOP, w: PANEL.w - 2 * PAD, h: CARD_H - SAFE_TOP - SAFE_BOTTOM };

type Size = "2xs" | "xs" | "sm" | "md" | "lg" | "xl";
export interface Theme {
  phase: "day" | "night";
  /** 天空漸層：上、地平線 */
  sky: [string, string];
  panel: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  commute: string;
  station: string;
  shadow: string;
  /** 天空帶上的字色：依天空亮暗選白天或夜晚的 HUD 字色 */
  skyInk: string;
  /** --font-num：數字與英文是自帶字型，中文回退到系統字 */
  font: string;
  size: Record<Size, number>;
  radius: number;
}

const tok = (name: string, read: TokenReader) => canvasColor(tokenRgba(name, read));

/** "2.5rem"／"14px" → 卡片上的 px。 */
function tokenPx(name: string, read: TokenReader): number {
  const m = /^([\d.]+)(rem|px)$/.exec(read(name));
  if (!m) throw new Error(`token ${name} 不是 rem 或 px`);
  return Math.round(Number(m[1]) * (m[2] === "rem" ? 16 : 1) * SCALE);
}

/** 天空上的字：天空亮就用白天的深色字，暗就用夜晚的淺色字（相對亮度 0.18 為界，兩邊對比都在 4.5 以上）。 */
function skyInkFor([r, g, b]: Rgba, css: string): string {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return tok("--hud-ink", cssTokenReader(css, lum > 0.18 ? "day" : "night"));
}

/** 卡片時段的配色；整天的卡（hour 為 null）用正午。取該小時的中點，例如 8 點的卡看 8:30 的天色。 */
export function resolveTheme(hour: number | null, css: string = tokensCss): Theme {
  const t = hour === null ? 12 : hour + 0.5;
  const phase = phaseAt(t);
  const read = cssTokenReader(css, phase);
  const sizes = ["2xs", "xs", "sm", "md", "lg", "xl"] as const;
  return {
    phase,
    sky: [canvasColor(tokenAt("--sky-top", t, read)), canvasColor(tokenAt("--sky-horizon", t, read))],
    panel: tok("--hud-bg", read),
    ink: tok("--hud-ink", read),
    muted: tok("--hud-muted", read),
    line: tok("--hud-line", read),
    accent: tok("--hud-accent", read),
    commute: tok("--commute", read),
    station: tok("--station", read),
    shadow: tok("--hud-shadow", read),
    skyInk: skyInkFor(tokenAt("--sky-top", t, read), css),
    font: read("--font-num"),
    size: Object.fromEntries(sizes.map((s) => [s, tokenPx(`--text-${s}`, read)])) as Record<Size, number>,
    radius: tokenPx("--radius", read),
  };
}

/** 繪製用到的 2D context 子集；測試用記錄用的假 context。 */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | "fillStyle" | "strokeStyle" | "font" | "textAlign" | "textBaseline" | "lineWidth" | "lineCap"
  | "shadowColor" | "shadowBlur" | "shadowOffsetY"
  | "save" | "restore" | "fillRect" | "fillText" | "measureText" | "createLinearGradient"
  | "beginPath" | "moveTo" | "lineTo" | "arc" | "arcTo" | "closePath" | "fill" | "stroke"
>;

// ── 文字排版 ──

const LEADING = 1.3;
/** 中文字身的上緣到基線約 0.88 個字級。 */
const ASCENT = 0.88;

export interface Run {
  text: string;
  size: number;
  weight: 400 | 700;
  color: string;
}
/** 一行可以有不同字級（例如大數字＋「人」），共用基線。 */
export interface Line {
  runs: Run[];
  height: number;
}

const fontOf = (theme: Theme, size: number, weight: number) => `${weight} ${size}px ${theme.font}`;

function width(ctx: Ctx, theme: Theme, run: Pick<Run, "text" | "size" | "weight">): number {
  ctx.font = fontOf(theme, run.size, run.weight);
  return ctx.measureText(run.text).width;
}

/** 不斷行的空白：數字與單位之間用它（例如「第 3 熱門」），換行時不會拆開。 */
export const NBSP = "\u00a0";

/** 斷行單位：英數與網址連在一起不拆，中文一字一斷；句讀與右括號黏在前一個字、左括號黏在後一個字；NBSP 兩側黏在一起。 */
function tokens(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z0-9.:/_\-%]+|[ \t]+|./gu)) {
    const t = m[0];
    const prev = out[out.length - 1];
    if (prev !== undefined && (/^[，。、；：）〉」』！？・\u00a0]/.test(t) || /[（〈「『\u00a0]$/.test(prev))) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
}

/** 依寬度斷行；超過 maxLines 時最後一行以「…」結尾。 */
export function wrapText(ctx: Ctx, theme: Theme, text: string, size: number, weight: 400 | 700, maxWidth: number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const tok of tokens(text)) {
    const next = cur + tok;
    if (cur && width(ctx, theme, { text: next.trimEnd(), size, weight }) > maxWidth) {
      lines.push(cur.trimEnd());
      cur = tok.trimStart();
    } else cur = next;
  }
  if (cur.trim()) lines.push(cur.trimEnd());
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && width(ctx, theme, { text: `${last}…`, size, weight }) > maxWidth) last = [...last].slice(0, -1).join("");
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

/** 先縮字（到 min 為止），還是太寬就換行。 */
export function fitText(
  ctx: Ctx, theme: Theme, text: string,
  o: { max: number; min: number; weight: 400 | 700; maxWidth: number; maxLines: number },
): { size: number; lines: string[] } {
  for (let size = o.max; size > o.min; size -= 2) {
    if (width(ctx, theme, { text, size, weight: o.weight }) <= o.maxWidth) return { size, lines: [text] };
  }
  return { size: o.min, lines: wrapText(ctx, theme, text, o.min, o.weight, o.maxWidth, o.maxLines) };
}

const line = (runs: Run[], leading = LEADING): Line => ({ runs, height: Math.round(Math.max(...runs.map((r) => r.size)) * leading) });
const lines = (texts: string[], r: Omit<Run, "text">, leading = LEADING): Line[] => texts.map((text) => line([{ ...r, text }], leading));
/** 空白行：段落之間的間距。 */
const space = (height: number): Line => ({ runs: [], height });
const heightOf = (ls: Line[]) => ls.reduce((s, l) => s + l.height, 0);

/** 由上往下畫幾行，回傳每行基線。 */
function drawLines(ctx: Ctx, theme: Theme, ls: Line[], x: number, top: number): number[] {
  const baselines: number[] = [];
  let y = top;
  for (const l of ls) {
    if (!l.runs.length) {
      y += l.height;
      continue;
    }
    const size = Math.max(...l.runs.map((r) => r.size));
    const base = Math.round(y + (l.height - size) / 2 + size * ASCENT);
    let cx = x;
    for (const r of l.runs) {
      ctx.font = fontOf(theme, r.size, r.weight);
      ctx.fillStyle = r.color;
      ctx.fillText(r.text, cx, base);
      cx += ctx.measureText(r.text).width;
    }
    baselines.push(base);
    y += l.height;
  }
  return baselines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── 內容區：每種卡一個函式，在 box 內畫完，不碰外框 ──

const count = (n: number) => n.toLocaleString("zh-TW");

function drawCommute(ctx: Ctx, box: Box, card: CommuteCard, theme: Theme) {
  const { size } = theme;
  const dot = Math.round(8 * SCALE);
  const nameX = box.x + dot * 2 + Math.round(12 * SCALE);
  const nameW = box.x + box.w - nameX;
  const fit = (name: string) => fitText(ctx, theme, name, { max: Math.round(size.xl * 0.8), min: size.md, weight: 700, maxWidth: nameW, maxLines: 2 });
  const o = fit(card.origin);
  const d = fit(card.dest);
  const origin = lines(o.lines, { size: o.size, weight: 700, color: theme.ink }, 1.2);
  const via = lines([`${DAY_LABEL[card.dayType]} ${card.hour} 點出發`], { size: size.sm, weight: 400, color: theme.muted }, 2.4);
  const dest = lines(d.lines, { size: d.size, weight: 700, color: theme.ink }, 1.2);

  // 大數字用字色：通勤色在夜晚面板上只有約 3:1，留給路線與站珠
  const big = card.companions === null
    ? line([{ text: formatCount(null), size: size.xl, weight: 700, color: theme.ink }], 1.2)
    : line([
        { text: count(card.companions), size: Math.round(size.xl * 1.5), weight: 700, color: theme.ink },
        { text: " 人", size: size.lg, weight: 700, color: theme.ink },
      ], 1.1);
  const number = [
    ...lines([`${DAY_LABEL[card.dayType]}平均每天`], { size: size.md, weight: 400, color: theme.muted }),
    big,
    ...lines(["和你同一個小時、同起訖"], { size: size.md, weight: 400, color: theme.ink }),
  ];
  const rankText = card.companions === null
    ? "人數太少，依資料規則不顯示確切數字。"
    : card.rank === null
      ? ""
      : `是${card.origin} ${card.hour}${NBSP}點出發的第${NBSP}${card.rank}${NBSP}熱門目的地（共${NBSP}${card.rankedOf}${NBSP}站）。`;
  const rank = rankText ? lines(wrapText(ctx, theme, rankText, size.sm, 400, box.w), { size: size.sm, weight: 400, color: theme.ink }, 1.5) : [];
  const note = lines(wrapText(ctx, theme, "起訖是進出站配對，不是實際乘車路徑。", size.xs, 400, box.w), { size: size.xs, weight: 400, color: theme.muted }, 1.5);
  const tail = rank.length ? [...rank, space(Math.round(4 * SCALE)), ...note] : note;

  // 路線在上、說明貼底，多的空間平分給兩段間距
  const route = heightOf(origin) + heightOf(via) + heightOf(dest);
  const free = Math.max(0, box.h - route - heightOf(number) - heightOf(tail));
  const gap = Math.floor(free / 2);

  // 路線：起站與迄站兩顆站珠，中間一條通勤色的線
  const oBase = drawLines(ctx, theme, origin, nameX, box.y);
  drawLines(ctx, theme, via, nameX, box.y + heightOf(origin));
  const dTop = box.y + heightOf(origin) + heightOf(via);
  const dBase = drawLines(ctx, theme, dest, nameX, dTop);
  const cx = box.x + dot;
  const oy = oBase[0] - Math.round(o.size * 0.36);
  const dy = dBase[0] - Math.round(d.size * 0.36);
  ctx.strokeStyle = theme.commute;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.round(3.5 * SCALE);
  ctx.beginPath();
  ctx.moveTo(cx, oy);
  ctx.lineTo(cx, dy);
  ctx.stroke();
  for (const y of [oy, dy]) {
    ctx.beginPath();
    ctx.arc(cx, y, dot, 0, Math.PI * 2);
    ctx.fillStyle = theme.station;
    ctx.fill();
    ctx.lineWidth = Math.round(3 * SCALE);
    ctx.stroke();
  }

  drawLines(ctx, theme, number, box.x, box.y + route + gap);
  drawLines(ctx, theme, tail, box.x, box.y + box.h - heightOf(tail));
}

/** 每種卡的內容區。4.5、7.7 在這裡加 district、event。 */
export const CONTENT: { [K in ShareCard["kind"]]: (ctx: Ctx, box: Box, card: Extract<ShareCard, { kind: K }>, theme: Theme) => void } = {
  commute: drawCommute,
};

// ── 共用外框 ──

/** 頁尾：月份與日型基準、資料來源、授權與資料集、網址；由下往上貼齊安全區。 */
function footerLines(ctx: Ctx, card: ShareCard, theme: Theme, w: number): Line[] {
  const { size } = theme;
  const f = card.footer;
  return [
    ...lines([`${f.month}・${f.basis}`], { size: size.sm, weight: 700, color: theme.ink }, 1.6),
    ...lines(wrapText(ctx, theme, `資料來源：${f.source}`, size.xs, 400, w), { size: size.xs, weight: 400, color: theme.muted }, 1.45),
    ...lines(wrapText(ctx, theme, f.license, size.xs, 400, w), { size: size.xs, weight: 400, color: theme.muted }, 1.45),
    ...lines(wrapText(ctx, theme, f.site, size.md, 700, w, 1), { size: size.md, weight: 700, color: theme.accent }, 1.9),
  ];
}

/** 天空帶上的網站名：貼在面板上緣上方（下方天空留白，決定 18）。 */
function drawBrand(ctx: Ctx, theme: Theme, x: number, panelTop: number, sizes: { name: number; sub: number } = { name: theme.size.lg, sub: theme.size.sm }) {
  const brand = line([
    { text: "城市呼吸", size: sizes.name, weight: 700, color: theme.skyInk },
    { text: "  北捷人流脈搏", size: sizes.sub, weight: 400, color: theme.skyInk },
  ]);
  drawLines(ctx, theme, [brand], x, panelTop - brand.height - Math.round(14 * SCALE));
}

/** 連結預覽圖（Open Graph、Twitter card，決定 20）：1200×630。 */
export const PREVIEW_W = 1200;
export const PREVIEW_H = 630;
/** 預覽圖的天色：傍晚（暖色天空，和開場的清晨分開）。 */
export const PREVIEW_HOUR = 17;

/**
 * 全站一張固定的連結預覽圖：天空、玻璃面板、網站名、「上個月的台北捷運」與一句話，右邊是網站圖示。
 * 不放任何數字（不是某個月的資料）。mark 是已載入的圖示圖片（markSvg），測試可不給。
 */
export function drawLinkPreview(ctx: Ctx & Partial<Pick<CanvasRenderingContext2D, "drawImage">>, theme: Theme, mark?: CanvasImageSource): void {
  const k = PREVIEW_W / CARD_W;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const sky = ctx.createLinearGradient(0, 0, 0, PREVIEW_H);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, PREVIEW_W, PREVIEW_H);

  const pad = 64;
  const panel = { x: pad, y: pad, w: PREVIEW_W - pad * 2, h: PREVIEW_H - pad * 2 };
  ctx.save();
  ctx.shadowColor = theme.shadow;
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, theme.radius * k * 1.6);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  roundRect(ctx, panel.x, panel.y, panel.w, panel.h, theme.radius * k * 1.6);
  ctx.stroke();

  const markSize = 300;
  const markX = panel.x + panel.w - markSize - 56;
  const markY = panel.y + (panel.h - markSize) / 2;
  if (mark && ctx.drawImage) ctx.drawImage(mark, markX, markY, markSize, markSize);

  const x = panel.x + 64;
  const w = markX - 40 - x;
  const text: Line[] = [
    line([{ text: "城市呼吸", size: 112, weight: 700, color: theme.ink }], 1.15),
    space(8),
    line([{ text: "上個月的台北捷運", size: 52, weight: 700, color: theme.ink }], 1.3),
    space(20),
    ...lines(wrapText(ctx, theme, "台北捷運的一天：每小時誰去了哪", 34, 400, w), { size: 34, weight: 400, color: theme.muted }, 1.45),
    space(12),
    ...lines(["北捷人流脈搏・公開資料・每月更新"], { size: 26, weight: 400, color: theme.muted }, 1.4),
  ];
  drawLines(ctx, theme, text, x, panel.y + (panel.h - heightOf(text)) / 2);
}

export function drawShareCard(ctx: Ctx, card: ShareCard, theme: Theme): void {
  const box = CONTENT_BOX;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // 天空：卡片時段的天色（真實時刻，不是裝飾）
  const sky = ctx.createLinearGradient(0, 0, 0, CARD_H);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 面板：與畫面上的 HUD 同一組玻璃色
  ctx.save();
  ctx.shadowColor = theme.shadow;
  ctx.shadowBlur = Math.round(16 * SCALE);
  ctx.shadowOffsetY = Math.round(5 * SCALE);
  roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, theme.radius);
  ctx.fillStyle = theme.panel;
  ctx.fill();
  ctx.restore();
  // 與 .hud 相同的細框，夜裡面板和夜空才分得開
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = Math.max(2, Math.round(SCALE / 2));
  roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, theme.radius);
  ctx.stroke();

  // 網站名：上方天空帶（決定 18）；面板裡不再有品牌列
  drawBrand(ctx, theme, box.x, PANEL.y);
  const rule = (y: number) => {
    ctx.fillStyle = theme.line;
    ctx.fillRect(box.x, y, box.w, Math.max(2, Math.round(SCALE / 2)));
  };
  const gap = Math.round(14 * SCALE);

  const foot = footerLines(ctx, card, theme, box.w);
  const footTop = box.y + box.h - heightOf(foot);
  drawLines(ctx, theme, foot, box.x, footTop);
  rule(footTop - gap / 2);

  const inner: Box = { x: box.x, y: box.y, w: box.w, h: footTop - gap * 1.5 - box.y };
  (CONTENT[card.kind] as (ctx: Ctx, box: Box, card: ShareCard, theme: Theme) => void)(ctx, inner, card, theme);
}

// ── 瀏覽器：產生圖片、存檔 ──

/** 等字型可用：自帶的數字字型（--font-num）畫之前一定要先載好，系統字也要等 fonts.ready 才保證量得準。 */
async function fontsReady(theme: Theme, sample: string): Promise<void> {
  if (!("fonts" in document)) return;
  await document.fonts.ready;
  await Promise.all([400, 700].map((w) => document.fonts.load(fontOf(theme, 40, w), `0123456789${sample}`).catch(() => [])));
}

/** 卡上會出現的字（各種卡通用：直接取資料模型的所有字串）。 */
const sampleText = (card: ShareCard) => `${JSON.stringify(card)}城市呼吸北捷人流脈搏少於人平均每天和你同一個小時起訖`;

/** 連結預覽圖（給 scripts/brand-assets.mjs 用）：畫在 canvas 上回傳 PNG。 */
export async function renderLinkPreview(mark?: CanvasImageSource): Promise<Blob> {
  const theme = resolveTheme(PREVIEW_HOUR);
  await fontsReady(theme, "城市呼吸上個月的台北捷運的一天：每小時誰去了哪北捷人流脈搏・公開資料・每月更新");
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_W;
  canvas.height = PREVIEW_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器無法產生圖片");
  drawLinkPreview(ctx, theme, mark);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖片產生失敗"))), "image/png"));
}

/** 依資料在離屏 canvas 畫出卡片，回傳 PNG。 */
export async function renderShareCard(card: ShareCard): Promise<Blob> {
  const theme = resolveTheme(card.hour);
  await fontsReady(theme, sampleText(card));
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("這個瀏覽器無法產生圖片");
  drawShareCard(ctx, card, theme);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("圖片產生失敗"))), "image/png"),
  );
}

/**
 * 手機上用系統分享面板（可直接存到相簿或貼到限動），其他情況直接下載。
 * 使用者自己取消分享回傳 "cancelled"，不算失敗。
 */
export async function saveShareCard(card: ShareCard, blob: Blob): Promise<"shared" | "downloaded" | "cancelled"> {
  const name = cardFileName(card);
  const file = new File([blob], name, { type: "image/png" });
  const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "城市呼吸" });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  return "downloaded";
}
