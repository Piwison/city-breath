// 依裝置降級（AD-6：DPR ≤ 2、中階手機 30 fps 以上）。目前只有街廓與樹（3.13）跟著降級；之後的列車、雲可共用。
// full：圓角積木（每棟 108 個三角形）、樹冠＋樹幹、DPR 照 Canvas 的 [1, 2]。
// lite：方塊（12 個三角形）、只有樹冠、樹少四成、DPR ≤ 1.5。
// 一開始依裝置規格猜；之後實測幾秒，太慢就降一次（不再升回，避免來回切換）。
import { useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";

export type Tier = "full" | "lite";

export interface DeviceInfo {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory（GB，Chrome 才有；Safari 沒有） */
  memory?: number;
}

/** 依裝置規格猜等級：4 核以下或記憶體 4 GB 以下＝lite（多數中低階 Android）。不知道就當 full，靠實測降級。 */
export function deviceTier({ cores, memory }: DeviceInfo): Tier {
  if (cores !== undefined && cores > 0 && cores <= 4) return "lite";
  if (memory !== undefined && memory > 0 && memory <= 4) return "lite";
  return "full";
}

/** lite 的 DPR 上限。 */
export const LITE_DPR = 1.5;
/** 實測：略過開頭幾格（著色器編譯、佈局），之後量這麼多格。 */
const WARMUP_FRAMES = 30;
const SAMPLE_FRAMES = 90;
/** 平均 fps 低於這個就降級（目標 30 fps，留一點餘裕）。 */
export const MIN_FPS = 26;

/** 一段時間的每格秒數 → 要不要降級。 */
export function tooSlow(frameSeconds: readonly number[], minFps: number = MIN_FPS): boolean {
  if (!frameSeconds.length) return false;
  const avg = frameSeconds.reduce((a, b) => a + b, 0) / frameSeconds.length;
  return avg > 1 / minFps;
}

function initialTier(): Tier {
  if (typeof navigator === "undefined") return "full";
  const nav = navigator as Navigator & { deviceMemory?: number };
  return deviceTier({ cores: nav.hardwareConcurrency, memory: nav.deviceMemory });
}

// 等級是畫面效能設定，不是畫面狀態（不進網址、不保存）；模組層一份，Canvas 內外都讀得到
let tier: Tier = initialTier();
const listeners = new Set<() => void>();
function setTier(t: Tier) {
  if (t === tier) return;
  tier = t;
  for (const fn of listeners) fn();
}

export function useTier(): Tier {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => tier,
    () => tier,
  );
}

/**
 * 掛在 Canvas 裡：lite 時把 DPR 壓到 1.5；full 時實測一次，太慢就降成 lite。
 * 自動化瀏覽器（navigator.webdriver，例如截圖用的無頭軟體渲染約 1–2 fps）不實測，免得截圖都變 lite。
 */
export function QualityGovernor({ measure = true }: { measure?: boolean }) {
  const current = useTier();
  const samples = useRef<number[]>([]);
  const seen = useRef(0);
  const skip = !measure || current === "lite" || (typeof navigator !== "undefined" && navigator.webdriver);
  useFrame((state, dt) => {
    // Canvas 重新設定時（ScenePage 重繪、換螢幕）R3F 會把 DPR 設回 [1, 2]，所以每格檢查、超過就壓回來
    if (current === "lite") {
      if (state.viewport.dpr > LITE_DPR) state.setDpr(LITE_DPR);
      return;
    }
    if (skip || samples.current.length >= SAMPLE_FRAMES) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (++seen.current <= WARMUP_FRAMES) return;
    samples.current.push(dt);
    if (samples.current.length === SAMPLE_FRAMES && tooSlow(samples.current)) setTier("lite");
  });
  return null;
}
