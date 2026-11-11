// WebGL 不可用（或場景建立失敗）時的替代畫面：靜態說明＋通勤同路人（AD-11）。
// 首頁就是場景（3.5），所以通勤表單直接放在這裡，不再連回首頁。
import { Component, type ReactNode } from "react";
import { CommuteForm } from "../commute/CommuteForm";

export function SceneFallback({ reason }: { reason?: string }) {
  return (
    <main className="scene-fallback">
      <div className="hud scene-fallback-card">
        <h1>城市呼吸</h1>
        <p>這個瀏覽器沒辦法顯示 3D 的台北盆地模型（WebGL 無法使用）。可能是瀏覽器關掉了硬體加速，或裝置不支援。</p>
        <p>每天有多少人跟你同一站上車、同一站下車，一樣查得到。</p>
        <CommuteForm />
        {reason && <p className="scene-fallback-note">{reason}</p>}
      </div>
    </main>
  );
}

/** 接住 Canvas 建立失敗（例如 context 建不起來），改顯示替代畫面，不留空白。 */
export class SceneBoundary extends Component<{ children: ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { failed: e instanceof Error ? e.message : String(e) };
  }
  render() {
    return this.state.failed !== null ? <SceneFallback reason={`場景建立失敗：${this.state.failed}`} /> : this.props.children;
  }
}
