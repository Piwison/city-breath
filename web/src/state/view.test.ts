import { beforeEach, describe, expect, it } from "vitest";
import { cardOpened, closeCard, getView, selectDistrict, selectStation, setFocus, setPlaying, setRange } from "./view";

describe("選取（3.6）", () => {
  beforeEach(() => {
    closeCard();
    setRange("hour");
    setPlaying(false);
  });

  it("選區清掉選站與聚焦；整天／這一小時保留", () => {
    selectDistrict("63000030");
    setRange("day");
    selectStation("s1");
    selectDistrict("65000150");
    expect(getView()).toMatchObject({ district: "65000150", station: null, focus: null, range: "day" });
  });

  it("選站保留行政區；回到行政區卡＝selectStation(null)", () => {
    selectDistrict("63000030");
    setFocus("63000030>63000050");
    selectStation("s1");
    expect(getView()).toMatchObject({ district: "63000030", station: "s1", focus: null });
    selectStation(null);
    expect(getView()).toMatchObject({ district: "63000030", station: null });
  });

  it("小卡打開就暫停；關卡後維持暫停（走查 F1）", () => {
    setPlaying(true);
    selectDistrict("63000030");
    cardOpened();
    expect(getView().playing).toBe(false);
    closeCard();
    expect(getView()).toMatchObject({ district: null, station: null, focus: null, playing: false });
  });

  it("沒有變化時不通知訂閱者", () => {
    selectDistrict("63000030");
    const before = getView();
    selectDistrict("63000030");
    setFocus(null);
    expect(getView()).toBe(before);
  });
});
