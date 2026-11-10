// Three.js 材質的顏色只從 :root token 讀（AD-8）。天光的材質 token 整天固定，日夜只靠光；
// 仍訂閱 data-phase，萬一 token 在夜晚被覆寫（像 HUD 那組），材質會跟著重讀，不自行快取舊值。
import { useMemo, useSyncExternalStore } from "react";
import { Color, SRGBColorSpace } from "three";
import { readCssToken, tokenRgba, type Rgba, type TokenReader } from "../styles/tokens";

/** token → THREE.Color（值是 sRGB，轉成 three 的線性工作色彩空間）。 */
export function tokenColor(name: string, read: TokenReader = readCssToken, out: Color = new Color()): Color {
  return rgbaToColor(tokenRgba(name, read), out);
}

/** tokens.ts／daylight.ts 的 sRGB Rgba → THREE.Color。 */
export function rgbaToColor([r, g, b]: Rgba, out: Color = new Color()): Color {
  return out.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
}

function subscribePhase(fn: () => void): () => void {
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-phase"] });
  return () => mo.disconnect();
}
const readPhase = () => document.documentElement.dataset.phase ?? "";

/** 目前的 data-phase；變了就重繪，讓 useTokenColor 重讀 token。 */
export function usePhaseAttr(): string {
  return useSyncExternalStore(subscribePhase, readPhase, () => "");
}

/** 一個 token 的 THREE.Color。 */
export function useTokenColor(name: string): Color {
  const phase = usePhaseAttr();
  return useMemo(() => tokenColor(name), [name, phase]);
}

/** 多個 token 的 THREE.Color（順序同 names）；給要把多種顏色烘進頂點色的合併幾何用。 */
export function useTokenColors(names: readonly string[]): Color[] {
  const phase = usePhaseAttr();
  const key = names.join("|");
  return useMemo(() => names.map((n) => tokenColor(n)), [key, phase]);
}
