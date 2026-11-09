import { describe, expect, it } from "vitest";
import tokensCss from "./tokens.css?raw";
import designMd from "../../../DESIGN.md?raw";
import { hudPhase, parseColor, phaseSpan, PHASE_KEYS, tokenAt, tokenRgb, type TokenReader } from "./tokens";

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

describe("phaseSpan", () => {
  it("同相位的關鍵點之間維持該相位", () => {
    expect(phaseSpan(0)).toMatchObject({ from: "night", to: "night" });
    expect(phaseSpan(6)).toMatchObject({ from: "dawn", to: "dawn" });
    expect(phaseSpan(12)).toMatchObject({ from: "day", to: "day" });
    expect(phaseSpan(18)).toMatchObject({ from: "dusk", to: "dusk" });
    expect(phaseSpan(23)).toMatchObject({ from: "night", to: "night" });
  });
  it("相鄰相位之間給比例", () => {
    expect(phaseSpan(5.25)).toEqual({ from: "night", to: "dawn", t: 0.5 });
    expect(phaseSpan(19.3)).toMatchObject({ from: "night", to: "night", t: 0 });
  });
  it("超出 0–24 時繞回", () => {
    expect(phaseSpan(24)).toEqual(phaseSpan(0));
    expect(phaseSpan(-1)).toEqual(phaseSpan(23));
    expect(phaseSpan(29.25)).toEqual(phaseSpan(5.25));
  });
  it("關鍵時刻與 DESIGN.md 一致", () => {
    const listed = /關鍵時刻 ([\d.／]+) 時/.exec(designMd)![1].split("／").map(Number);
    expect(PHASE_KEYS.map(([h]) => h).filter((h) => h > 0 && h < 24)).toEqual(listed.filter((h) => h > 0));
  });
});

describe("tokenAt", () => {
  const read = reader({
    "--sky-night": "#000000",
    "--sky-dawn": "#ffffff",
    "--sky-day": "#ffffff",
    "--sky-dusk": "#000000",
    "--water": "#7db3dc",
    "--hud-bg-night": "rgba(0, 0, 0, 0.2)",
    "--hud-bg-dawn": "rgba(0, 0, 0, 0.6)",
  });
  it("相位內等於該相位的值", () => {
    expect(tokenAt("--sky", 12, read)).toEqual([255, 255, 255, 1]);
    expect(tokenAt("--sky", 2, read)).toEqual([0, 0, 0, 1]);
  });
  it("相位間在線性 sRGB 內插", () => {
    // 線性 0.5 → sRGB 0.7354 → 188
    expect(tokenAt("--sky", 5.25, read)).toEqual([188, 188, 188, 1]);
    expect(tokenAt("--hud-bg", 5.25, read)[3]).toBeCloseTo(0.4);
  });
  it("超出 0–24 的時刻繞回", () => {
    expect(tokenAt("--sky", 24, read)).toEqual(tokenAt("--sky", 0, read));
    expect(tokenAt("--sky", -1, read)).toEqual(tokenAt("--sky", 23, read));
  });
  it("沒有相位版本時用全天值", () => {
    expect(tokenAt("--water", 5.25, read)).toEqual([125, 179, 220, 1]);
  });
  it("token 不存在時丟錯", () => {
    expect(() => tokenAt("--nope", 8, read)).toThrow("--nope");
    expect(() => tokenRgb("--nope", read)).toThrow("--nope");
  });
  it("讀 tokens.css 的天空色：正午就是 day 值", () => {
    const css = reader(Object.fromEntries(root));
    expect(tokenAt("--sky-top", 12, css)).toEqual(parseColor(root.get("--sky-top-day")!));
    expect(tokenRgb("--flow-in", css)).toEqual(parseColor(root.get("--flow-in")!)!.slice(0, 3));
  });
});

describe("hudPhase", () => {
  it("依太陽高度切換 HUD 日夜", () => {
    expect(hudPhase(12)).toBe("day");
    expect(hudPhase(0)).toBe("night");
    expect(hudPhase(5)).toBe("night");
    expect(hudPhase(6)).toBe("day");
    expect(hudPhase(19)).toBe("night");
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
