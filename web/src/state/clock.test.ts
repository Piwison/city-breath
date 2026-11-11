import { beforeEach, describe, expect, it } from "vitest";
import { advance, HOURS_PER_SECOND, PLAY_FROM, seek, setStillMode, startClock, STILL_AT, togglePlay } from "./clock";
import { getView, setPlaying, setSpeed, setStill, time } from "./view";

describe("clock", () => {
  beforeEach(() => {
    setPlaying(false);
    setStill(false);
    setSpeed(1);
    seek(0);
  });

  it("網址有 hour：停在那個時刻，不自動播放", () => {
    startClock({ hour: 6, reducedMotion: false });
    expect(time.t).toBe(6);
    expect(getView()).toMatchObject({ hour: 6, playing: false });
  });

  it("減少動態：開靜態模式、停在 8 點，不自動播放", () => {
    startClock({ reducedMotion: true });
    expect(time.t).toBe(STILL_AT);
    expect(getView()).toMatchObject({ playing: false, still: true });
  });

  it("減少動態＋網址有 hour：靜態模式、停在網址的時刻", () => {
    startClock({ hour: 14, reducedMotion: true });
    expect(time.t).toBe(14);
    expect(getView()).toMatchObject({ playing: false, still: true });
  });

  it("一般情況：從清晨自動播放，48 秒一天", () => {
    startClock({ reducedMotion: false });
    expect(time.t).toBe(PLAY_FROM);
    expect(getView().playing).toBe(true);
    advance(0.1);
    expect(time.t).toBeCloseTo(PLAY_FROM + 0.1 * HOURS_PER_SECOND, 9);
    expect(HOURS_PER_SECOND * 48).toBe(24);
  });

  it("暫停時 advance 不動；hour 跟著 t 取整、跨午夜繞回", () => {
    seek(23.99);
    advance(1);
    expect(time.t).toBe(23.99);
    setPlaying(true);
    for (let i = 0; i < 2; i++) advance(0.1);
    expect(time.t).toBeLessThan(1);
    expect(getView().hour).toBe(0);
  });

  it("單格 dt 上限 0.1 秒（切回分頁時不跳一大段）", () => {
    seek(10);
    setPlaying(true);
    advance(5);
    expect(time.t).toBeCloseTo(10 + 0.1 * HOURS_PER_SECOND, 9);
  });

  it("2x：同樣的時間走兩倍", () => {
    seek(10);
    setPlaying(true);
    setSpeed(2);
    advance(0.1);
    expect(time.t).toBeCloseTo(10 + 0.1 * HOURS_PER_SECOND * 2, 9);
  });
});

describe("靜態模式", () => {
  beforeEach(() => {
    setPlaying(false);
    setStill(false);
    setSpeed(1);
    seek(0);
  });

  it("開：停止播放、跳到 8 點、旗標開", () => {
    seek(14.3);
    setPlaying(true);
    setStillMode(true);
    expect(time.t).toBe(STILL_AT);
    expect(getView()).toMatchObject({ playing: false, still: true, hour: 8 });
  });

  it("靜態中 advance 不動；拖時間軸照樣換時刻", () => {
    setStillMode(true);
    setPlaying(true);
    advance(0.1);
    expect(time.t).toBe(STILL_AT);
    seek(3);
    expect(getView()).toMatchObject({ hour: 3, still: true });
  });

  it("關：只關旗標，維持暫停在原時刻", () => {
    setStillMode(true);
    seek(11);
    setStillMode(false);
    expect(time.t).toBe(11);
    expect(getView()).toMatchObject({ playing: false, still: false });
  });

  it("靜態中按播放：先關靜態再播放；一般時候切換播放／暫停", () => {
    setStillMode(true);
    togglePlay();
    expect(getView()).toMatchObject({ playing: true, still: false });
    togglePlay();
    expect(getView()).toMatchObject({ playing: false, still: false });
  });
});
