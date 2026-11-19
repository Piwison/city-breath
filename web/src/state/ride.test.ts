// 搭乘模式（8.6）的時鐘與動作：速度曲線、停靠開卡、行進中不開卡、終點停住、暫停、下一站、減少動態一站一站跳、
// 網址（ride＋station 只在暫停或到站時寫、連結還原到同一站且暫停）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceRide,
  canRide,
  CRUISE,
  DWELL,
  hopAt,
  hopDuration,
  leaveRide,
  nextStop,
  pauseRide,
  RAMP,
  restoreRide,
  setRideRoute,
  startRide,
  STOP_BACK,
  toggleRide,
  takeRejoin,
} from "./ride";
import { parseQuery, planLink, syncUrl, URL_WRITE_MS, urlStateOf } from "./url";
import { closeCard, getView, openCommute, rideMotion, setPlaying, setDayType } from "./view";
import { seek } from "./clock";

const ROUTE = {
  line: "BL" as const,
  len: 30,
  stops: [
    { id: "a", s: 1 },
    { id: "b", s: 6 },
    { id: "c", s: 7.5 },
    { id: "d", s: 29 },
  ],
};

/** 跑 sec 秒（每格 1/60）。 */
function run(sec: number, calm = false) {
  for (let t = 0; t < sec; t += 1 / 60) advanceRide(1 / 60, calm);
}

/** 跑到停靠為止（最多 max 秒），回傳行進中有沒有出現卡片。 */
function runToDock(calm = false, max = 60): { sawCard: boolean } {
  let sawCard = false;
  for (let t = 0; t < max; t += 1 / 60) {
    advanceRide(1 / 60, calm);
    const v = getView();
    if (v.ride && !v.ride.docked && v.station !== null) sawCard = true;
    if (v.ride?.docked && v.station !== null) return { sawCard };
  }
  return { sawCard };
}

describe("速度曲線", () => {
  it("等速段的速度是 CRUISE、全程不倒退、走完剛好 L", () => {
    const L = 10;
    const T = hopDuration(L);
    expect(T).toBeCloseTo(RAMP + L / CRUISE);
    let prev = 0;
    for (let t = 0; t <= T + 0.5; t += 0.01) {
      const s = hopAt(L, t);
      expect(s).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = s;
    }
    expect(hopAt(L, T)).toBeCloseTo(L);
    expect((hopAt(L, T / 2 + 0.05) - hopAt(L, T / 2 - 0.05)) / 0.1).toBeCloseTo(CRUISE, 3);
  });
  it("到站前減速：最後 0.1 秒走得比等速少很多（停得穩）", () => {
    const L = 10;
    const T = hopDuration(L);
    expect(L - hopAt(L, T - 0.1)).toBeLessThan(CRUISE * 0.1 * 0.1);
  });
  it("很短的一段只有加減速，時間縮短；長度 0 不動", () => {
    expect(hopDuration(0.5)).toBeLessThan(2 * RAMP);
    expect(hopAt(0.5, hopDuration(0.5))).toBeCloseTo(0.5);
    expect(hopDuration(0)).toBe(0);
    expect(hopAt(0, 1)).toBe(0);
  });
});

describe("搭乘", () => {
  beforeEach(() => {
    setRideRoute(ROUTE);
    leaveRide();
    closeCard();
  });

  it("從首頁上車：起點站、往另一端；行進中沒有卡片，到站停住並開那站的卡（摘要高度）", () => {
    setPlaying(true);
    startRide();
    let v = getView();
    expect(v.ride).toEqual({ line: "BL", station: "a", docked: true, playing: true });
    expect(v.station).toBeNull();
    expect(v.playing).toBe(false);
    expect(rideMotion.dir).toBe(1);
    expect(takeRejoin()).toBe(1);
    advanceRide(1 / 60, false);
    v = getView();
    expect(v.ride?.docked).toBe(false);
    expect(v.station).toBeNull();
    const { sawCard } = runToDock();
    expect(sawCard).toBe(false);
    v = getView();
    expect(v.ride).toMatchObject({ station: "b", docked: true, playing: true });
    expect(v.station).toBe("b");
    expect(v.sheet).toBe("peek");
    // 停在站前 STOP_BACK
    expect(rideMotion.s).toBeCloseTo(6 - STOP_BACK);
  });

  it("停靠 DWELL 秒後自動出發（卡片收起），到終點停住並暫停；再按繼續就反向", () => {
    startRide();
    runToDock();
    run(DWELL - 0.2);
    expect(getView().ride?.docked).toBe(true);
    run(0.4);
    expect(getView().ride?.docked).toBe(false);
    expect(getView().station).toBeNull();
    runToDock();
    run(DWELL + 0.1);
    runToDock();
    expect(getView().ride).toMatchObject({ station: "d", docked: true, playing: false });
    run(DWELL * 2);
    expect(getView().ride?.station).toBe("d");
    toggleRide();
    expect(getView().ride?.playing).toBe(true);
    expect(takeRejoin()).toBe(1);
    run(0.1);
    expect(rideMotion.dir).toBe(-1);
    runToDock();
    expect(getView().ride?.station).toBe("c");
  });

  it("暫停：停在原地；碰畫面（pauseRide）也暫停；繼續就接著走", () => {
    startRide();
    run(1);
    const s = rideMotion.s;
    pauseRide();
    run(2);
    expect(rideMotion.s).toBe(s);
    expect(getView().ride?.playing).toBe(false);
    toggleRide();
    run(0.5);
    expect(rideMotion.s).toBeGreaterThan(s);
  });

  it("下一站：行進中直接到下一站；停靠中暫停時按，走完一段後維持暫停", () => {
    startRide();
    run(0.5);
    nextStop();
    expect(getView().ride).toMatchObject({ station: "b", docked: true, playing: true });
    pauseRide();
    nextStop();
    expect(getView().ride?.docked).toBe(false);
    runToDock();
    expect(getView().ride).toMatchObject({ station: "c", docked: true, playing: false });
    run(DWELL * 2);
    expect(getView().ride?.station).toBe("c");
  });

  it("停靠時從卡上開了通勤面板：出發時跟著收起（行進中沒有卡片）", () => {
    startRide();
    runToDock();
    openCommute("b");
    expect(getView().commute).not.toBeNull();
    run(DWELL + 0.5);
    expect(getView().ride?.docked).toBe(false);
    expect(getView().commute).toBeNull();
    expect(getView().station).toBeNull();
  });

  it("從車站卡上車：從那站往比較遠的端點", () => {
    startRide("c");
    expect(getView().ride?.station).toBe("c");
    expect(rideMotion.dir).toBe(-1);
    startRide("b");
    expect(rideMotion.dir).toBe(1);
    startRide("zzz");
    expect(getView().ride?.station).toBe("b");
  });

  it("減少動態：沒有連續移動，停靠時間到了直接切到下一站", () => {
    startRide(undefined, true);
    expect(takeRejoin()).toBe(2);
    const seen: number[] = [];
    for (let t = 0; t < DWELL * 2.5; t += 1 / 60) {
      advanceRide(1 / 60, true);
      seen.push(rideMotion.s);
      // 每一格都停在某一站的停靠點（沒有兩站之間的位置）
      const v = getView();
      expect(v.ride?.docked).toBe(true);
    }
    const distinct = [...new Set(seen.map((s) => s.toFixed(6)))];
    expect(distinct.length).toBeGreaterThanOrEqual(2);
    for (const s of distinct) expect(ROUTE.stops.some((p) => Math.abs(p.s - STOP_BACK - Number(s)) < 1e-6 || Math.abs(Number(s)) < 1e-6)).toBe(true);
  });

  it("下車：回到沒在搭、卡片收起、一天的播放維持暫停", () => {
    startRide();
    runToDock();
    leaveRide();
    const v = getView();
    expect(v.ride).toBeNull();
    expect(v.station).toBeNull();
    expect(v.playing).toBe(false);
  });

  it("canRide：只有登記的線與路線上的站", () => {
    expect(canRide("BL")).toBe(true);
    expect(canRide("BL", "c")).toBe(true);
    expect(canRide("BL", "x")).toBe(false);
    expect(canRide("R", "a")).toBe(false);
  });
});

describe("搭乘的網址（AD-16）", () => {
  let search = "";
  const writes: string[] = [];
  let stop = () => {};
  beforeEach(() => {
    vi.useFakeTimers();
    setRideRoute(ROUTE);
    leaveRide();
    closeCard();
    setPlaying(false);
    setDayType("weekday");
    seek(8);
    search = "";
    writes.length = 0;
    stop = syncUrl(
      (s) => {
        writes.push(s);
        search = `?${s}`;
      },
      () => search,
    );
    vi.advanceTimersByTime(URL_WRITE_MS);
    writes.length = 0;
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it("到站與暫停時寫 ride＋station；行進中不寫", () => {
    startRide();
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toContain("ride=BL");
    expect(search).toContain("station=a");
    advanceRide(1 / 60, false);
    writes.length = 0;
    // 行進中
    for (let k = 0; k < 60; k++) {
      advanceRide(1 / 60, false);
      vi.advanceTimersByTime(20);
    }
    expect(writes).toEqual([]);
    runToDock();
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toContain("station=b");
    expect(search).toContain("ride=BL");
    expect(search).toContain("hour=8");
    leaveRide();
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).not.toContain("ride=");
    expect(search).not.toContain("station=");
  });

  it("暫停在兩站之間：記剛離開的那一站", () => {
    startRide();
    run(1);
    pauseRide();
    vi.advanceTimersByTime(URL_WRITE_MS);
    expect(search).toContain("station=a");
  });

  it("連結還原：同一站、暫停、卡開著；線或站不對就退回全景", () => {
    const parsed = parseQuery("?day=weekday&hour=8&station=c&ride=BL");
    const data = { months: ["2026-09"], latest: "2026-09", hasDistrict: () => true, hasStation: () => true, canRide };
    const plan = planLink(parsed, data);
    expect(plan).toEqual({ kind: "restore", district: null, station: "c", commute: null, ride: { line: "BL", station: "c" }, staleMonth: null });
    restoreRide("BL", "c");
    const v = getView();
    expect(v.ride).toEqual({ line: "BL", station: "c", docked: true, playing: false });
    expect(v.station).toBe("c");
    expect(takeRejoin()).toBe(2);
    run(DWELL * 2);
    expect(getView().ride?.station).toBe("c");
    expect(urlStateOf(getView())).toMatchObject({ ride: "BL", station: "c", hour: 8 });
    expect(planLink(parseQuery("?ride=BL&station=x"), data)).toEqual({ kind: "fallback", invalid: ["ride"] });
    expect(planLink(parseQuery("?ride=R&station=c"), data)).toEqual({ kind: "fallback", invalid: ["ride"] });
    expect(planLink(parseQuery("?ride=BL"), data)).toEqual({ kind: "fallback", invalid: ["ride"] });
    expect(planLink(parseQuery("?ride=XX&station=c"), data)).toEqual({ kind: "fallback", invalid: ["ride"] });
  });
});
