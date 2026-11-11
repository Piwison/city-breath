import { describe, expect, it } from "vitest";
import { EDGE, placeLabel, type SafeArea } from "./labelPlace";

// 390×844：上方 HUD 到 60px、時間軸從 690px 開始
const area: SafeArea = { width: 390, height: 844, top: 60, bottom: 690 };
const W = 100;
const H = 34;

describe("placeLabel（前三大人數標籤避開 HUD 與畫面邊緣）", () => {
  it("安全區中間：標在弧頂正上方", () => {
    expect(placeLabel(200, 400, W, H, area, [])).toMatchObject({ x: 200, y: 400 });
  });
  it("靠左右邊緣：往內挪，整個標籤留在畫面內", () => {
    const l = placeLabel(10, 400, W, H, area, [])!;
    expect(l.x - W / 2).toBe(EDGE);
    const r = placeLabel(385, 400, W, H, area, [])!;
    expect(r.x + W / 2).toBe(390 - EDGE);
  });
  it("弧頂在上方 HUD 底下：往下挪到 HUD 之下", () => {
    const p = placeLabel(200, 50, W, H, area, [])!;
    expect(p.y - H).toBeGreaterThanOrEqual(area.top);
  });
  it("弧頂在時間軸後面：往上挪到時間軸之上", () => {
    const p = placeLabel(200, 760, W, H, area, [])!;
    expect(p.y).toBeLessThanOrEqual(area.bottom);
  });
  it("和已放的標籤重疊時上下挪開", () => {
    const first = placeLabel(200, 400, W, H, area, [])!;
    const second = placeLabel(210, 405, W, H, area, [first.rect])!;
    expect(Math.abs(second.y - first.y)).toBeGreaterThanOrEqual(H);
  });
  it("弧頂在畫面外不標", () => {
    expect(placeLabel(-5, 400, W, H, area, [])).toBeNull();
    expect(placeLabel(200, 900, W, H, area, [])).toBeNull();
  });
});
