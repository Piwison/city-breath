import { describe, expect, it } from "vitest";
import tokensCss from "./tokens.css?raw";
import designMd from "../../../DESIGN.md?raw";
import { canvasColor, cssTokenReader, mixRgba, parseColor, tokenRgb, type TokenReader } from "./tokens";

const reader = (vars: Record<string, string>): TokenReader => (name) => vars[name] ?? "";

/** 取出 tokens.css 某個選擇器區塊裡的 --name: value。 */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css 沒有 ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const root = block(tokensCss, ":root");
const night = block(tokensCss, ':root[data-phase="night"]');

describe("parseColor", () => {
  it("解析建置後壓縮成 8／4 碼 hex 的 rgba token", () => {
    expect(parseColor("#ffcd788c")).toEqual([255, 205, 120, 0x8c / 255]);
    expect(parseColor("#0008")).toEqual([0, 0, 0, 0x88 / 255]);
  });
  it("解析 hex 與 rgb()/rgba()", () => {
    expect(parseColor("#abc")).toEqual([170, 187, 204, 1]);
    expect(parseColor("#AABBCC")).toEqual([170, 187, 204, 1]);
    expect(parseColor("rgba(14,18,38,.80)")).toEqual([14, 18, 38, 0.8]);
    expect(parseColor(" rgb(1, 2, 3) ")).toEqual([1, 2, 3, 1]);
  });
  it("無法解析回 null", () => {
    expect(parseColor("")).toBeNull();
    expect(parseColor("oklch(0.5 0.1 200)")).toBeNull();
    expect(parseColor("#abcd1")).toBeNull();
    expect(parseColor("rgb(300, 0, 0)")).toBeNull();
  });
});

describe("tokenRgb 與 mixRgba", () => {
  it("token 不存在時丟錯", () => {
    expect(() => tokenRgb("--nope", reader({}))).toThrow("--nope");
  });
  it("讀 tokens.css 的全天 token", () => {
    expect(tokenRgb("--flow-in", reader(Object.fromEntries(root)))).toEqual(parseColor(root.get("--flow-in")!)!.slice(0, 3));
  });
  it("在線性 sRGB 內插：線性 0.5 → sRGB 188", () => {
    expect(mixRgba([0, 0, 0, 1], [255, 255, 255, 1], 0.5)).toEqual([188, 188, 188, 1]);
    expect(mixRgba([0, 0, 0, 0.2], [0, 0, 0, 0.6], 0.5)[3]).toBeCloseTo(0.4);
    expect(mixRgba([10, 20, 30, 1], [200, 100, 0, 1], 0)).toEqual([10, 20, 30, 1]);
  });
});

describe("cssTokenReader", () => {
  it("白天讀 :root，夜晚以 data-phase=night 覆寫，與目前頁面無關", () => {
    const day = cssTokenReader(tokensCss, "day");
    const nightRead = cssTokenReader(tokensCss, "night");
    expect(day("--hud-ink")).toBe(root.get("--hud-ink"));
    expect(nightRead("--hud-ink")).toBe(night.get("--hud-ink"));
    expect(nightRead("--commute")).toBe(root.get("--commute"));
    expect(day("--nope")).toBe("");
  });
  it("展開 var() 參照", () => {
    expect(cssTokenReader(tokensCss, "day")("--page-bg")).toBe(root.get("--sky-horizon-day"));
    expect(cssTokenReader(tokensCss, "night")("--page-bg")).toBe(root.get("--sky-horizon-night"));
  });
  it("不受 reduced-motion 區塊影響", () => {
    expect(cssTokenReader(tokensCss)("--dur-press")).toBe(root.get("--dur-press"));
  });
});

describe("canvasColor", () => {
  it("輸出 8 碼 hex，含 alpha", () => {
    expect(canvasColor([255, 252, 246, 0.86])).toBe(`#${"fffcf6db"}`);
    expect(canvasColor([0, 0, 0, 1])).toBe(`#${"000000ff"}`);
  });
});

/** 把 `--a-1..3`、`--a-1`…`--a-6` 展開成個別 token。 */
function tokensIn(cell: string): string[] {
  const expanded = cell
    .replace(/`(--[\w-]*?)(\d+)\.\.(\d+)`/g, (_m, p, a, b) => range(p, +a, +b))
    .replace(/`(--[\w-]*?)(\d+)`…`--[\w-]*?(\d+)`/g, (_m, p, a, b) => range(p, +a, +b));
  return [...expanded.matchAll(/`(--[\w-]+)`/g)].map((m) => m[1]);
}
const range = (p: string, a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => `\`${p}${a + i}\``).join(" ");
const colorsIn = (cell: string) => cell.match(/#[0-9a-fA-F]{3,6}\b|rgba?\([^)]*\)/g) ?? [];

describe("tokens.css 與 DESIGN.md 一致", () => {
  const rows = designMd.split("\n").filter((l) => l.startsWith("| ") && !l.startsWith("| ---"));

  it("全天色票表的每個 token 值相同", () => {
    let checked = 0;
    let prev: string[] = [];
    for (const row of rows) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length !== 3) continue;
      const names = cells[1] === "同上" ? prev : tokensIn(cells[1]);
      const values = colorsIn(cells[2]);
      if (!names.length || names.length !== values.length) continue;
      const source = cells[0].includes("夜晚") ? night : root;
      names.forEach((n, i) => {
        expect(source.get(n), `${n}`).toBeDefined();
        expect(parseColor(source.get(n)!), `${n}`).toEqual(parseColor(values[i]));
        checked++;
      });
      prev = names;
    }
    expect(checked).toBeGreaterThanOrEqual(50);
  });

  it("相位表的四組值相同", () => {
    const phases = ["night", "dawn", "day", "dusk"];
    let checked = 0;
    for (const row of rows) {
      const cells = row.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length !== 5) continue;
      const [name] = tokensIn(cells[0]);
      if (!name) continue;
      phases.forEach((p, i) => {
        expect(parseColor(root.get(`${name}-${p}`) ?? ""), `${name}-${p}`).toEqual(parseColor(cells[i + 1]));
        checked++;
      });
    }
    expect(checked).toBe(20);
  });

  it("字型 token 照 DESIGN.md 的順序", () => {
    const families = root.get("--font")!.split(",").map((f) => f.trim().replace(/"/g, ""));
    expect(families.slice(0, 4)).toEqual(["Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "system-ui"]);
  });

  it("相位 token 四組齊全", () => {
    const bases = new Set([...root.keys()].filter((k) => /-(night|dawn|day|dusk)$/.test(k)).map((k) => k.replace(/-(night|dawn|day|dusk)$/, "")));
    for (const b of bases) for (const p of ["night", "dawn", "day", "dusk"]) expect(root.has(`${b}-${p}`), `${b}-${p}`).toBe(true);
  });

  it("HUD 夜晚覆寫的 token 白天都有", () => {
    for (const k of night.keys()) expect(root.has(k), k).toBe(true);
  });
});

describe("只有 tokens.css 定義顏色（CLAUDE.md 規則 5）", () => {
  const sources = import.meta.glob(["../**/*.{ts,tsx,css}", "!../**/*.test.ts", "!./tokens.css"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(/;

  it("其他原始碼沒有色碼", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
    for (const [file, text] of Object.entries(sources)) {
      const lines = text.split("\n").filter((l) => COLOR.test(l.replace(/\/\/.*$/, "")));
      expect(lines, file).toEqual([]);
    }
  });

  it("transition 與 animation 的時長都用 token（reduced-motion 時歸零）", () => {
    for (const [file, text] of Object.entries(sources)) {
      if (!file.endsWith(".css")) continue;
      const decls = text.match(/\b(?:transition|animation)(?:-duration)?\s*:[^;]+;/g) ?? [];
      for (const d of decls) expect(d, file).not.toMatch(/\d+m?s\b/);
    }
  });
});
