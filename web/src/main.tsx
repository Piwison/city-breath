import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { readQuery } from "./state/url";
import "./styles/app.css";

// `?scene=1`：預覽微縮城市場景（2.3）。three／R3F 另外分包，骨架首頁不多載；3.5 換成首頁後拿掉這個開關。
const ScenePage = lazy(() => import("./scene/ScenePage"));
const { scene } = readQuery(location.search);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {scene ? (
      <Suspense fallback={<p className="scene-status">載入場景中…</p>}>
        <ScenePage />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
