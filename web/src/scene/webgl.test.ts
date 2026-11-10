import { afterEach, describe, expect, it, vi } from "vitest";
import { SceneBoundary } from "./SceneFallback";
import { hasWebGL } from "./webgl";

const fakeCanvas = (getContext: (kind: string) => unknown) => ({ createElement: () => ({ getContext }) });

describe("hasWebGL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("拿得到 context 就是可用，並立刻釋放", () => {
    const lose = vi.fn();
    vi.stubGlobal("document", fakeCanvas((k) => (k === "webgl2" ? { getExtension: () => ({ loseContext: lose }) } : null)));
    expect(hasWebGL()).toBe(true);
    expect(lose).toHaveBeenCalled();
  });

  it("webgl2 與 webgl 都拿不到就不可用", () => {
    vi.stubGlobal("document", fakeCanvas(() => null));
    expect(hasWebGL()).toBe(false);
  });

  it("建立 context 丟錯也當成不可用", () => {
    vi.stubGlobal(
      "document",
      fakeCanvas(() => {
        throw new Error("blocked");
      }),
    );
    expect(hasWebGL()).toBe(false);
  });
});

describe("SceneBoundary", () => {
  it("Canvas 建立失敗時改顯示替代畫面（記下原因）", () => {
    expect(SceneBoundary.getDerivedStateFromError(new Error("Error creating WebGL context."))).toEqual({
      failed: "Error creating WebGL context.",
    });
  });
});
