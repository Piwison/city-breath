import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";

// 首頁就是微縮城市場景（3.5）。three／R3F 另外分包，先畫出載入提示。
const ScenePage = lazy(() => import("./scene/ScenePage"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<p className="boot-status">載入場景中…</p>}>
      <ScenePage />
    </Suspense>
  </StrictMode>,
);
