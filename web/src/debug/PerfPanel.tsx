// 6.4 真機實測（關卡 1）的效能面板：只在網址帶 `?debug=perf` 時由 ScenePage 動態載入（state/url.ts perfDebug，AD-16），
// 首包與場景分包都不含這段程式（scripts/check-build.mjs 檢查 data-perf-panel 只出現在自己的分包）。
// PerfProbe 掛在 Canvas 裡：每格記時間（fps）、每半秒讀 renderer.info、DPR、光點與列車數；
// PerfPanel 在 Canvas 外：左上角收合成一顆 fps 按鈕，點開看全部數值，「複製」把文字摘要放進剪貼簿。
// 不送 track()、不寫網址、不進分享網址。測試步驟在 design/reviews/6.4-device-check.md。
import { useFrame } from "@react-three/fiber";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { InstancedMesh } from "three";
import { bootSeconds } from "../boot";
import { useTier } from "../scene/quality";
import { getView } from "../state/view";
import { FpsMeter, fmt, perfSummary, type PerfSnapshot } from "./perfStats";
import "./perf.css";

/** 面板更新間隔：每半秒，免得面板本身吃掉效能。 */
const UPDATE_MS = 500;

const meter = new FpsMeter();
let snapshot: Omit<PerfSnapshot, "tier"> | null = null;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const getSnapshot = () => snapshot;

/** 重新計時：清掉 30 秒視窗（換情境、準備好再開始量）。 */
function restart() {
  meter.reset();
  snapshot = snapshot && { ...snapshot, stats: meter.stats(performance.now()) };
  for (const fn of listeners) fn();
}

const countOf = (o: unknown) => (o && typeof (o as InstancedMesh).count === "number" ? (o as InstancedMesh).count : 0);

/** 掛在 Canvas 裡（不畫任何東西）。 */
export function PerfProbe() {
  const last = useRef(0);
  useEffect(() => {
    // 切到背景時不畫格；回來時重新計時，免得把空白的秒數算成 0 fps
    const onVisible = () => document.visibilityState === "visible" && restart();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  useFrame((state) => {
    const now = performance.now();
    meter.push(now);
    if (now - last.current < UPDATE_MS) return;
    last.current = now;
    // useFrame 在這一格 render 之前跑：renderer.info 是上一格（含陰影）的數字
    const info = state.gl.info.render;
    snapshot = {
      stats: meter.stats(now),
      dpr: state.gl.getPixelRatio(),
      deviceDpr: window.devicePixelRatio || 1,
      calls: info.calls,
      triangles: info.triangles,
      dots: countOf(state.scene.getObjectByName("flow-dots")),
      trains: countOf(state.scene.getObjectByName("trains")),
      bootSeconds: bootSeconds(),
    };
    for (const fn of listeners) fn();
  });
  return null;
}

type CopyState = "idle" | "done" | "manual";

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 畫在 Canvas 外的面板。 */
export function PerfPanel() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const tier = useTier();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<CopyState>("idle");
  const [manualText, setManualText] = useState("");
  const bodyId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (copy !== "done") return;
    const t = setTimeout(() => setCopy("idle"), 1600);
    return () => clearTimeout(t);
  }, [copy]);
  useEffect(() => {
    if (copy === "manual") textRef.current?.select();
  }, [copy]);

  const s = snap?.stats;
  const summary = () => {
    const v = getView();
    return perfSummary(
      snap ? { ...snap, tier } : { stats: { current: null, avg: null, min: null, seconds: 0 }, dpr: 0, deviceDpr: window.devicePixelRatio || 1, tier, calls: 0, triangles: 0, dots: 0, trains: 0, bootSeconds: bootSeconds() },
      { hour: v.hour, dayType: v.dayType, playing: v.playing, district: v.district, station: v.station },
      { userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, href: location.href, date: new Date() },
    );
  };
  const onCopy = async () => {
    const text = summary();
    if (await copyText(text)) setCopy("done");
    else {
      // 剪貼簿不能用（例如非 https 或瀏覽器拒絕）：露出文字框，長按全選複製
      setManualText(text);
      setCopy("manual");
    }
  };

  return (
    <section className="hud perf-panel" data-perf-panel="" aria-label="效能面板" data-open={open ? "" : undefined}>
      <button
        type="button"
        className="perf-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`效能面板：目前 ${fmt(s?.current ?? null)} fps，${open ? "收起" : "展開"}`}
        onClick={() => setOpen((o) => !o)}
      >
        <b>{fmt(s?.current ?? null)}</b>
        <span>fps</span>
      </button>
      <div id={bodyId} className="perf-body" hidden={!open}>
        <dl>
          <dt>30 秒平均</dt>
          <dd>{fmt(s?.avg ?? null, 1)}</dd>
          <dt>最低</dt>
          <dd>{fmt(s?.min ?? null)}</dd>
          <dt>取樣</dt>
          <dd>{fmt(s?.seconds ?? null)} 秒</dd>
          <dt>DPR</dt>
          <dd>
            {snap ? fmt(snap.dpr, 2) : "—"}
            <small>（裝置 {snap ? fmt(snap.deviceDpr, 2) : "—"}）</small>
          </dd>
          <dt>畫質</dt>
          <dd>{tier}</dd>
          <dt>draw call</dt>
          <dd>{snap?.calls ?? "—"}</dd>
          <dt>粒子</dt>
          <dd>{snap?.dots ?? "—"}</dd>
          <dt>列車</dt>
          <dd>{snap?.trains ?? "—"}</dd>
          <dt>首次載入</dt>
          <dd>{snap?.bootSeconds != null ? `${fmt(snap.bootSeconds, 1)} 秒` : "—"}</dd>
        </dl>
        <div className="perf-actions" aria-live="polite">
          <button type="button" onClick={onCopy}>
            {copy === "done" ? "已複製" : "複製"}
          </button>
          <button type="button" onClick={restart}>
            重新計時
          </button>
        </div>
        {copy === "manual" && (
          <>
            <p className="perf-note">沒辦法自動複製，請長按下面的文字全選後複製。</p>
            <textarea ref={textRef} readOnly rows={6} value={manualText} aria-label="效能紀錄文字" />
          </>
        )}
      </div>
    </section>
  );
}
