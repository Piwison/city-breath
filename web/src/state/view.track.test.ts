import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as unknown[][]);
vi.mock("../track", () => ({ track: (...a: unknown[]) => calls.push(a) }));

import { copiedKind } from "../share/SharePanel";
import { closeCard, restoreSelection, selectDistrict, selectStation, setFocus } from "./view";

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
