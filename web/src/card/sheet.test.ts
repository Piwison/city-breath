// 3.22 小卡兩段高度：放開手指後停在哪（投射＋最近的一段）、減少動態只看方向、CSS 與常數同值。
import { describe, expect, it } from "vitest";
import cardCss from "./card.css?raw";
import tokensCss from "../styles/tokens.css?raw";
import { peekOffset, project, reducedTarget, rubberband, SHEET_FULL_VH, SHEET_PEEK_VH, sheetTarget } from "./sheet";

const H = 590; // 844 的 70%
const P = peekOffset(H);

describe("小卡兩段高度", () => {
  it("摘要露出約三分之一、完整約七成（card.css 與 sheet.ts 同值）", () => {
    expect(cardCss).toContain(`--sheet-full: ${SHEET_FULL_VH}dvh;`);
    expect(cardCss).toContain(`--sheet-peek: ${SHEET_PEEK_VH}dvh;`);
    expect(H - P).toBeCloseTo((844 * SHEET_PEEK_VH) / 100, 0);
  });

  it("慢慢拉：停在較近的一段", () => {
    expect(sheetTarget("peek", P - 200, 0, P, H)).toBe("full");
    expect(sheetTarget("peek", P - 40, 0, P, H)).toBe("peek");
    expect(sheetTarget("full", 60, 0, P, H)).toBe("full");
    expect(sheetTarget("full", P - 30, 0, P, H)).toBe("peek");
  });

  it("輕甩：依速度投射，短距離也會切換", () => {
    expect(sheetTarget("peek", P - 20, -1, P, H)).toBe("full");
    expect(sheetTarget("full", 20, 1, P, H)).toBe("peek");
  });

  it("從完整往下只回到摘要；從摘要再往下才關閉", () => {
    expect(sheetTarget("full", P + 200, 3, P, H)).toBe("peek");
    expect(sheetTarget("peek", P + 120, 0, P, H)).toBe("close");
    expect(sheetTarget("peek", P + 30, 0.8, P, H)).toBe("close");
    expect(sheetTarget("peek", P + 20, 0, P, H)).toBe("peek");
  });

  it("投射與阻尼", () => {
    expect(project(0)).toBe(0);
    expect(project(1)).toBeGreaterThan(project(0.5));
    expect(Math.abs(rubberband(-300, H))).toBeLessThan(300);
    expect(rubberband(-300, H)).toBeLessThan(0);
  });

  it("減少動態：只看方向與距離，不投射", () => {
    expect(reducedTarget("peek", -60)).toBe("full");
    expect(reducedTarget("full", 60)).toBe("peek");
    expect(reducedTarget("peek", 60)).toBe("close");
    expect(reducedTarget("peek", 10)).toBe("peek");
  });

  it("滑動時長用 token，減少動態時歸零", () => {
    expect(cardCss).toMatch(/transform var\(--dur-sheet\) var\(--ease-drawer\)/);
    const reduced = tokensCss.slice(tokensCss.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/--dur-sheet:\s*0ms/);
  });
});
