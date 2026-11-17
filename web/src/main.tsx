import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { bootStep } from "./boot";
import { preloadHome } from "./data/load";
import { startAnalytics } from "./track";
import "./styles/app.css";

// 首頁就是微縮城市場景（3.5）。品牌載入畫面已經在 index.html（6.2）；這裡一啟動就同時開始抓首頁資料與
// three／R3F 場景分包（AD-6：不一先一後），兩邊都算進載入畫面的進度。ScenePage 拿到的資料是 load.ts 的快取。
const scene = bootStep(import("./scene/ScenePage"));
for (const p of preloadHome()) bootStep(p);
const ScenePage = lazy(() => scene);

// 計數（AD-20）：只有 Vercel 上的建置會掛上
startAnalytics();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* 等場景分包時畫面由品牌載入畫面蓋著，這裡不另外顯示 */}
    <Suspense fallback={null}>
      <ScenePage />
    </Suspense>
  </StrictMode>,
);
