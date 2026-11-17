import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ track: vi.fn(), inject: vi.fn() }));
vi.mock("@vercel/analytics", () => sent);

import { ENABLED, EVENTS, isAllowed, startAnalytics, track } from "./track";

// AD-20：事件名稱固定，props 只有 share_* 的 kind，值也固定。
const AD20 = [
  "commute_input_started",
  "commute_result_shown",
  "share_card_downloaded",
  "share_link_copied",
  "station_opened",
  "district_opened",
  "event_day_opened",
];

describe("track.ts 只接受 AD-20 的事件（6.2）", () => {
  beforeEach(() => {
    sent.track.mockClear();
    sent.inject.mockClear();
  });

  it("名單就是 AD-20 列的事件", () => {
    expect(Object.keys(EVENTS).sort()).toEqual([...AD20].sort());
  });

  it("不帶 props 的事件：不帶或空物件可以，多帶任何鍵不行", () => {
    for (const name of ["station_opened", "district_opened", "commute_input_started", "commute_result_shown", "event_day_opened"]) {
      expect(isAllowed(name)).toBe(true);
      expect(isAllowed(name, {})).toBe(true);
      expect(isAllowed(name, { station: "BL12" })).toBe(false);
    }
  });

  it("share_card_downloaded 的 kind 只能是 commute／district／event", () => {
    for (const kind of ["commute", "district", "event"]) expect(isAllowed("share_card_downloaded", { kind })).toBe(true);
    expect(isAllowed("share_card_downloaded", { kind: "station" })).toBe(false);
    expect(isAllowed("share_card_downloaded", { kind: "home" })).toBe(false);
    expect(isAllowed("share_card_downloaded")).toBe(false);
  });

  it("share_link_copied 的 kind 只能是 station／district／commute／event／home", () => {
    for (const kind of ["station", "district", "commute", "event", "home"]) expect(isAllowed("share_link_copied", { kind })).toBe(true);
    expect(isAllowed("share_link_copied", { kind: "BL12" })).toBe(false);
    expect(isAllowed("share_link_copied", { kind: "home", station: "BL12" })).toBe(false);
    expect(isAllowed("share_link_copied", { kind: 1 })).toBe(false);
  });

  it("不在名單的事件名一律不行（含原型鏈上的名字）", () => {
    for (const name of ["page_view", "Station_Opened", "toString", "__proto__", "", "station_opened "]) expect(isAllowed(name)).toBe(false);
  });

  it("測試與本機建置不是 Vercel：不送事件、不掛腳本", () => {
    expect(ENABLED).toBe(false);
    track("station_opened");
    track("share_link_copied", { kind: "home" });
    startAnalytics();
    expect(sent.track).not.toHaveBeenCalled();
    expect(sent.inject).not.toHaveBeenCalled();
  });

  it("不在名單的呼叫丟掉、不丟錯", () => {
    // @ts-expect-error 型別也擋：不在名單的事件名
    expect(() => track("page_view")).not.toThrow();
    // @ts-expect-error 型別也擋：kind 不在名單
    expect(() => track("share_link_copied", { kind: "BL12" })).not.toThrow();
    expect(sent.track).not.toHaveBeenCalled();
  });
});
