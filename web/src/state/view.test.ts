import { beforeEach, describe, expect, it } from "vitest";
import {
  cardOpened,
  clearCommute,
  commuteReady,
  restoreCommute,
  writeTime,
  closeCard,
  getView,
  openCommute,
  selectDistrict,
  selectStation,
  setFocus,
  setPlaying,
  setRange,
  setCommute,
  setSheet,
  startCommute,
} from "./view";

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

  it("小卡兩段高度（3.22）：開卡是摘要；行政區卡↔車站卡維持；關卡回到摘要", () => {
    selectDistrict("63000030");
    expect(getView().sheet).toBe("peek");
    setSheet("full");
    selectStation("s1");
    expect(getView().sheet).toBe("full");
    selectStation(null);
    expect(getView().sheet).toBe("full");
    closeCard();
    expect(getView().sheet).toBe("peek");
  });

  it("從這站找通勤（3.12）：寫起站；每按一次都是新的值（入口再打開）；收起清掉", () => {
    selectStation("s1");
    startCommute("s1");
    const a = getView().commute;
    expect(a).toEqual({ o: "s1", d: null, h: getView().hour });
    startCommute("s1");
    expect(getView().commute).not.toBe(a);
    expect(getView().station).toBe("s1");
    clearCommute();
    expect(getView().commute).toBeNull();
  });

  it("打開通勤（4.1）：沒選站時起訖都是空的；已選一站就帶入當起站；改迄站與時段", () => {
    closeCard();
    openCommute();
    expect(getView().commute).toEqual({ o: null, d: null, h: getView().hour });
    selectStation("s2");
    openCommute();
    expect(getView().commute).toMatchObject({ o: "s2", d: null });
    setCommute({ d: "s3", h: 7 });
    expect(getView().commute).toEqual({ o: "s2", d: "s3", h: 7 });
    clearCommute();
    setCommute({ d: "s4" });
    expect(getView().commute).toBeNull();
  });

  it("沒有變化時不通知訂閱者", () => {
    selectDistrict("63000030");
    const before = getView();
    selectDistrict("63000030");
    setFocus(null);
    expect(getView()).toBe(before);
  });
});

describe("通勤卡（4.2）", () => {
  beforeEach(() => {
    closeCard();
    writeTime(8);
  });

  it("起訖都選好、不同站才是通勤卡", () => {
    expect(commuteReady(null)).toBe(false);
    expect(commuteReady({ o: "a", d: null, h: 8 })).toBe(false);
    expect(commuteReady({ o: null, d: "b", h: 8 })).toBe(false);
    expect(commuteReady({ o: "a", d: "a", h: 8 })).toBe(false);
    expect(commuteReady({ o: "a", d: "b", h: 8 })).toBe(true);
  });

  it("時段只有一份：通勤開著時 commute.h 跟著畫面的時刻；沒開時不建通勤", () => {
    writeTime(7.5);
    expect(getView().commute).toBeNull();
    openCommute("a");
    setCommute({ d: "b" });
    writeTime(9.2);
    expect(getView().hour).toBe(9);
    expect(getView().commute).toEqual({ o: "a", d: "b", h: 9 });
  });

  it("打開通勤面板與還原通勤卡都暫停播放", () => {
    setPlaying(true);
    openCommute("a");
    expect(getView().playing).toBe(false);
    setPlaying(true);
    restoreCommute({ o: "a", d: "b", h: 7 });
    expect(getView().playing).toBe(false);
    expect(getView().commute).toEqual({ o: "a", d: "b", h: 7 });
  });

  it("關卡（點空白處、×）與在地圖上選別的區或站都收起通勤卡；回上一層不收", () => {
    restoreCommute({ o: "a", d: "b", h: 8 });
    closeCard();
    expect(getView().commute).toBeNull();
    selectStation("a");
    startCommute("a");
    setCommute({ d: "b" });
    selectStation("a"); // 同一站：不算選了別站
    expect(getView().commute).not.toBeNull();
    selectStation("c");
    expect(getView().commute).toBeNull();
    startCommute("c");
    selectDistrict("63000030");
    expect(getView().commute).toBeNull();
  });
});
