import { describe, expect, it } from "vitest";
import pkg from "../package.json";

// AD-11：場景只用 Three.js＋R3F，不用 maplibre-gl、deck.gl 與 pmndrs/postprocessing（3.5 移除骨架）。
describe("套件", () => {
  it("沒有 maplibre-gl、deck.gl、postprocessing", () => {
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(all.filter((n) => /maplibre|deck\.gl|^postprocessing$|@react-three\/postprocessing/.test(n))).toEqual([]);
  });
});
