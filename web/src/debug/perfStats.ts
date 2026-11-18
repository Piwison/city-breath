// 6.4 真機實測（關卡 1）的 fps 計算：純函式，效能面板（PerfPanel.tsx）與測試共用。
// 只被 PerfPanel 匯入，跟面板一起在 `?debug=perf` 才載入的分包裡。
// 定義（測試步驟 design/reviews/6.4-device-check.md 照這個寫）：
// - 目前 fps：最近 1 秒畫了幾格；
// - 平均 fps：最近 30 秒內的格數 ÷ 第一格到最後一格的秒數；
// - 最低 fps：最近 30 秒切成完整的 1 秒區段（從 now 往回切），格數最少的那一段。

/** 統計視窗：最近 30 秒（AD-6 實測每個情境跑 30 秒）。 */
export const WINDOW_MS = 30_000;
const SECOND = 1000;

export interface FpsStats {
  /** 最近 1 秒的格數；取樣還不到 1 秒＝null */
  current: number | null;
  /** 視窗內的平均 fps；不到兩格＝null */
  avg: number | null;
  /** 視窗內完整 1 秒區段裡最少的格數；還沒有完整的 1 秒＝null */
  min: number | null;
  /** 視窗涵蓋了幾秒（0–30），面板顯示「取樣 N 秒」 */
  seconds: number;
}

/**
 * times：每格的時間戳（毫秒，遞增，例如 performance.now()）；now：量測當下的時間戳。
 * 只看 [now - windowMs, now] 之間的格。
 */
export function fpsStats(times: readonly number[], now: number, windowMs: number = WINDOW_MS): FpsStats {
  const from = now - windowMs;
  let i = 0;
  while (i < times.length && times[i] < from) i++;
  const win = times.slice(i).filter((t) => t <= now);
  if (!win.length) return { current: null, avg: null, min: null, seconds: 0 };
  const first = win[0];
  const span = now - first;
  const seconds = Math.min(windowMs, span) / SECOND;
  const last = win[win.length - 1];
  const avg = win.length >= 2 && last > first ? (win.length - 1) / ((last - first) / SECOND) : null;
  // 從 now 往回切完整的 1 秒區段 (end - 1000, end]；區段起點要在第一格（含）之後，才算完整取樣
  const buckets: number[] = [];
  for (let end = now; end - SECOND >= first - 1e-6 && end - SECOND >= from - 1e-6; end -= SECOND) {
    const start = end - SECOND;
    let n = 0;
    for (const t of win) if (t > start && t <= end) n++;
    buckets.push(n);
  }
  return {
    current: buckets.length ? buckets[0] : null,
    avg,
    min: buckets.length ? Math.min(...buckets) : null,
    seconds,
  };
}

/** 每格記一次時間；只留視窗內的格。切到背景再回來時 reset()，免得把空白的秒數算成 0 fps。 */
export class FpsMeter {
  private times: number[] = [];
  constructor(private readonly windowMs: number = WINDOW_MS) {}

  push(t: number): void {
    this.times.push(t);
    const from = t - this.windowMs;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] < from) drop++;
    if (drop) this.times.splice(0, drop);
  }

  reset(): void {
    this.times = [];
  }

  stats(now: number): FpsStats {
    return fpsStats(this.times, now, this.windowMs);
  }
}

/** 固定小數位數；null 顯示「—」。 */
export const fmt = (v: number | null, digits = 0): string => (v === null ? "—" : v.toFixed(digits));

export interface PerfSnapshot {
  stats: FpsStats;
  /** 畫面實際用的 DPR（renderer.getPixelRatio()） */
  dpr: number;
  /** 裝置的 devicePixelRatio */
  deviceDpr: number;
  tier: "full" | "lite";
  /** 上一格的 draw call 與三角形（renderer.info.render，含陰影） */
  calls: number;
  triangles: number;
  /** 流向光點（粒子）與列車的數量（InstancedMesh.count） */
  dots: number;
  trains: number;
  /** 首次載入秒數（開始導航 → 品牌載入畫面收起＝場景第一格）；還沒收起＝null */
  bootSeconds: number | null;
}

export interface SceneSnapshot {
  hour: number;
  dayType: "weekday" | "holiday";
  playing: boolean;
  district: string | null;
  station: string | null;
}

export interface Env {
  userAgent: string;
  width: number;
  height: number;
  href: string;
  date: Date;
}

/** 「複製」的純文字摘要：Piwi 貼回 design/reviews/6.4-device-check.md 或傳給 Claude。 */
export function perfSummary(p: PerfSnapshot, s: SceneSnapshot, env: Env): string {
  const d = env.date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const day = s.dayType === "holiday" ? "假日" : "平日";
  return [
    "城市呼吸 效能紀錄（?debug=perf）",
    `時間：${local}（${d.toISOString()}）`,
    `網址：${env.href}`,
    `瀏覽器：${env.userAgent}`,
    `視窗：${env.width}×${env.height}，裝置 DPR ${fmt(p.deviceDpr, 2)}，畫面 DPR ${fmt(p.dpr, 2)}`,
    `畫質：${p.tier}`,
    `首次載入：${p.bootSeconds === null ? "—" : `${fmt(p.bootSeconds, 1)} 秒`}`,
    `fps：目前 ${fmt(p.stats.current)}，30 秒平均 ${fmt(p.stats.avg, 1)}，最低 ${fmt(p.stats.min)}（取樣 ${fmt(p.stats.seconds)} 秒）`,
    `draw call：${p.calls}，三角形：${p.triangles}`,
    `粒子（流向光點）：${p.dots}，列車：${p.trains}`,
    `畫面：${day} ${s.hour} 點（${s.playing ? "播放中" : "暫停"}），行政區 ${s.district ?? "無"}，車站 ${s.station ?? "無"}`,
  ].join("\n");
}
