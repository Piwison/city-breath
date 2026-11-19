import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../track", () => ({ track: (...a: unknown[]) => calls.push(a) }));

import type { ShareCard } from "../share/card";
import { copiedKind, saveAndCount } from "../share/SharePanel";
import { seek } from "./clock";
import {
  clearCommute,
  closeCard,
  commuteResultShown,
  openCommute,
  restoreCommute,
  restoreSelection,
  selectDistrict,
  selectStation,
  setCommute,
  setFocus,
} from "./view";

// 6.2：開車站卡、開行政區卡經 track()（AD-20），不帶站或區。
describe("開卡的計數（6.2）", () => {
  beforeEach(() => {
    closeCard();
    calls.length = 0;
  });

  it("選一區送 district_opened，選一站送 station_opened，都不帶 props", () => {
    selectDistrict("63000030");
    selectStation("BL12");
    expect(calls).toEqual([["district_opened"], ["station_opened"]]);
  });

  it("同一區、同一站再點不重送；回到行政區卡、關卡、只改聚焦都不送", () => {
    selectDistrict("63000030");
    selectDistrict("63000030");
    selectStation("BL12");
    setFocus("a>b");
    selectStation("BL12"); // 只清聚焦
    selectStation(null); // 回到行政區卡
    selectDistrict("63000030"); // 已在這區
    closeCard();
    expect(calls).toEqual([["district_opened"], ["station_opened"]]);
  });

  it("分享連結還原：有站算車站卡，只有區算行政區卡，都沒有不送", () => {
    restoreSelection("63000030", "BL12");
    restoreSelection("63000030", null);
    restoreSelection(null, null);
    expect(calls).toEqual([["station_opened"], ["district_opened"]]);
  });

  it("複製連結的 kind 是開著的卡", () => {
    expect(copiedKind({ station: "BL12", district: "63000030" })).toBe("station");
    expect(copiedKind({ station: null, district: "63000030" })).toBe("district");
    expect(copiedKind({ station: null, district: null })).toBe("home");
  });
});

// 4.2：通勤卡的三個事件（AD-20），各在對的時機送出、不帶站名或人數。
describe("通勤卡的計數（4.2）", () => {
  beforeEach(() => {
    closeCard();
    calls.length = 0;
  });

  it("commute_result_shown：每組起訖一次；換時段、換日型（卡片重繪）不重送；換起訖、關卡再開再送", () => {
    restoreCommute({ o: "sa", d: "sb", h: 8 });
    commuteResultShown("sa", "sb");
    seek(7); // 點 7 點那格
    commuteResultShown("sa", "sb");
    commuteResultShown("sa", "sb"); // StrictMode 的第二次 effect
    expect(calls).toEqual([["commute_result_shown"]]);
    setCommute({ d: null }); // ‹ 換起訖站
    setCommute({ d: "sc" });
    commuteResultShown("sa", "sc");
    clearCommute();
    restoreCommute({ o: "sa", d: "sc", h: 8 });
    commuteResultShown("sa", "sc");
    openCommute("sa");
    setCommute({ d: "sc" });
    commuteResultShown("sa", "sc");
    expect(calls).toEqual(Array.from({ length: 4 }, () => ["commute_result_shown"]));
  });

  it("打開與還原通勤卡本身不送事件（等結果出現才送）；也不重送 commute_input_started", () => {
    openCommute("sa");
    setCommute({ d: "sb" });
    restoreCommute({ o: "sa", d: "sb", h: 8 });
    expect(calls).toEqual([]);
  });

  it("share_link_copied 的 kind：通勤卡開著＝commute（蓋在車站卡上面也是）；還在選的通勤面板照底下的卡", () => {
    expect(copiedKind({ station: "sa", district: null, commute: { o: "sa", d: "sb", h: 8 } })).toBe("commute");
    expect(copiedKind({ station: null, district: null, commute: { o: "sa", d: "sb", h: 8 } })).toBe("commute");
    expect(copiedKind({ station: "sa", district: null, commute: { o: "sa", d: null, h: 8 } })).toBe("station");
    expect(copiedKind({ station: null, district: null, commute: null })).toBe("home");
  });

  it("share_card_downloaded：存檔或系統分享成功送 { kind: commute }；取消、失敗不送", async () => {
    const card = { kind: "commute" } as ShareCard;
    const blob = {} as Blob;
    await saveAndCount(card, blob, async () => "downloaded");
    await saveAndCount(card, blob, async () => "shared");
    await saveAndCount(card, blob, async () => "cancelled");
    await expect(
      saveAndCount(card, blob, async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([
      ["share_card_downloaded", { kind: "commute" }],
      ["share_card_downloaded", { kind: "commute" }],
    ]);
  });
});
