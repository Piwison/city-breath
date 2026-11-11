import { describe, expect, it } from "vitest";
import { deviceTier, MIN_FPS, tooSlow } from "./quality";

describe("deviceTier", () => {
  it("4 核以下或記憶體 4 GB 以下是 lite", () => {
    expect(deviceTier({ cores: 4, memory: 8 })).toBe("lite");
    expect(deviceTier({ cores: 8, memory: 4 })).toBe("lite");
    expect(deviceTier({ cores: 2 })).toBe("lite");
  });
  it("8 核、8 GB 或不知道（Safari 沒有 deviceMemory）是 full", () => {
    expect(deviceTier({ cores: 8, memory: 8 })).toBe("full");
    expect(deviceTier({ cores: 6 })).toBe("full");
    expect(deviceTier({})).toBe("full");
    expect(deviceTier({ cores: 0, memory: 0 })).toBe("full");
  });
});

describe("tooSlow", () => {
  it("平均低於 MIN_FPS 才降級", () => {
    expect(tooSlow(Array(90).fill(1 / 60))).toBe(false);
    expect(tooSlow(Array(90).fill(1 / 30))).toBe(false);
    expect(tooSlow(Array(90).fill(1 / (MIN_FPS - 4)))).toBe(true);
    expect(tooSlow([])).toBe(false);
  });
});
