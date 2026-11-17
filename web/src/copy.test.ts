// 文案（產品計畫 v2 體驗原則 3、決定 2）：畫面上不出現「此刻」「現在」這種會被當成即時的字。
// 掃 web/src 所有會進建置的原始碼（含註解，避免日後從註解複製進畫面）；「出現在」不算。
import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["./**/*.{ts,tsx,css}", "!./**/*.test.{ts,tsx}"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const LIVE = /此刻|(?<!出)現在/;

describe("不用「此刻」「現在」（決定 2、體驗原則 3）", () => {
  it("web/src 的原始碼找不到", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    for (const [file, text] of Object.entries(sources)) {
      const lines = text.split("\n").filter((l) => LIVE.test(l));
      expect(lines, file).toEqual([]);
    }
  });
  it("「出現在」不算，「此刻」「現在」會被擋", () => {
    expect(LIVE.test("名牌只出現在點得到的站")).toBe(false);
    expect(LIVE.test("此刻最忙")).toBe(true);
    expect(LIVE.test("現在幾點")).toBe(true);
  });
});
