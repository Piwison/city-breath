import { beforeEach, describe, expect, it } from "vitest";
import { advance, HOURS_PER_SECOND, PLAY_FROM, seek, startClock, STILL_AT } from "./clock";
import { getView, setPlaying, time } from "./view";

describe("clock", () => {
  beforeEach(() => {
    setPlaying(false);
    seek(0);
  });

  it("網址有 hour：停在那個時刻，不自動播放", () => {
    startClock({ hour: 6, reducedMotion: false });
    expect(time.t).toBe(6);
    expect(getView()).toMatchObject({ hour: 6, playing: false });
  });

  it("減少動態：停在 8 點，不自動播放", () => {
    startClock({ reducedMotion: true });
    expect(time.t).toBe(STILL_AT);
    expect(getView().playing).toBe(false);
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
});
