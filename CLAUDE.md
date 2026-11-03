# 城市呼吸｜北捷人流脈搏

用北捷每月公開的「每日分時各站起訖人次」，做一個手機優先、可分享的城市作息網站。非商業 side project。

## 文件在哪

BMAD v7 的 initiative 是 `_bmad-output/initiative-city-breath/`（已設為 active initiative）：

- Initiative（需求 R1–R16、限制、完成條件；2026-11-03 replan 的來源是 `user-stories-city-breath-2026-11-03/`）：`_bmad-output/initiative-city-breath/initiative-city-breath.md`
- PRD：`_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/`（原文在 Claude Docs：https://claude.ai/artifact/S46QYMugL6cKGNZK9ePN7r）
- 架構：`_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/`
- Epics 與 stories：`_bmad-output/initiative-city-breath/tickets/`（`tickets.toml` 是建置順序；狀態寫在各 story 的 `*-plan.md`）
- 資料契約：`docs/data-contract.md`

## 工作方式

- 開發流程用 BMAD v7 預覽版（`.claude/skills/bmad*`，6.13.0-next）。不確定下一步就問 `bmad`。
- 需求、切票、看板、中途改需求都找 Sofia（`bmad-agent-po`）。看進度：`uv run _bmad/method/scripts/tickets.py status`；下一張可做的：`tickets.py next`。
- 實作一張 story 用 `bmad-build`（直接給 ref，例如「build 3.1」，不需要先寫 story 檔）；審查用 `bmad-code-review`；epic 結束跑 `bmad-retrospective`。
- 視覺設計的分工見下一節。不論用哪個 skill，這幾條不可違反：顏色與字型只能用 `:root` token、每個動畫要有 reduced-motion 版本、不編造任何數字、少於 10 人不顯示數字。
- 跟 Piwi 溝通用繁體中文。

## 設計與技術 skill 的分工

都放在 `.claude/skills/`，每個資料夾的 `SOURCE.txt` 記著來源與版本（已審過內容；只有 impeccable 帶執行腳本，見其 SOURCE.txt）。

- **視覺方向與新畫面**：先用 `prototype` 做多個可切換的版本給 Piwi 選；方向定案（2026-11-03 起偏向「微縮城市」：等角視角、發光路線、日夜光影）後照該方向實作。
- **打磨、稽核、評論**：`impeccable`（audit、polish、critique、animate 等指令）。
- **`hallmark` 已移除**（2026-11-03 Piwi 決定）：它的規則以一般網頁為前提，跟滿版地圖與 3D 場景衝突。保留的底線規則已寫在上方「工作方式」。
- `prototype` 與 `review-animations` 只在明確呼叫時執行（例如 `/prototype`），不會自動觸發。
- **動畫與手感**（Emil Kowalski）：`animate` 做新動畫、`review-animations` 審查、`animation-performance` 守 60fps、`emil-design-eng` 細節打磨、`apple-design` 彈簧與手勢、`mobile-native` 讓網頁在手機上像 app、`prototype` 同一元件做多版切換比較、`animation-vocabulary` 把模糊描述翻成正確術語。
- **遊戲感**：`game-feel`（回饋、緩動、juice）、`game-ui-ux`（HUD、控制列、狀態流程）。
- **地圖**（MapLibre 官方；渲染已改 Three.js，只在移除骨架或日後需要真地圖時參考）：`maplibre-v6-migration`（含打包後 worker 問題）、`maplibre-cartography`、`maplibre-terrain-rendering`、`maplibre-pmtiles-patterns`（靜態網站自帶底圖）、`maplibre-source-wiring`、`maplibre-tile-sources`、`maplibre-sprites-icons`、`maplibre-fonts-glyphs`。
- **3D**（2026-11-03 定案走 Three.js＋React Three Fiber，AD-11）：`threejs-*` 十個，`threejs-react-three-fiber` 為主。

## GitHub 流程

- `main` 是可部署的狀態，不直接 commit 到 `main`。
- 一張 story 一個分支，命名 `story/<ref>-<slug>`（例如 `story/3.3-share-card`），做完開 PR，標題帶票號（例如 `3.3 直式分享卡輸出`）。
- PR 要通過 CI（`.github/workflows/ci.yml`：管線測試、網站測試與建置、ticket tree 檢查）才合併。
- 合併後由 Piwi 把票標成 done：`uv run _bmad/method/scripts/tickets.py mark <ref> done`，跟著下一個 PR 一起 commit。
- 新 clone 下來要先設定 active initiative（個人設定，不進版控）：在 `_bmad/custom/config.user.toml` 加上
  `[core]` 與 `active_initiative = "initiative-city-breath"`。
- 原始 OD 月檔（`data/raw/`）不進版控，需要時跑 `uv run city-breath fetch`。

## 不可違反的規則（摘自架構 AD）

1. 網站只讀 `web/public/data/` 的 JSON，不讀原始 CSV（AD-1）。改欄位要同時改 `export.py`、`types.ts`、`docs/data-contract.md`。
2. 站名正規化只在 `pipeline/stations.py` 與 `pipeline/config/`（AD-2）。
3. 起訖人次 < 10 在管線端輸出 `null`，畫面顯示「少於 10 人」，前端不得反推；能用總量減出來的格子要再隱藏，只在 `pipeline/suppress.py` 做（AD-3）。
4. 停止營運時段是 `null` 不是 0（AD-5）。
5. 顏色只走 `:root` token；Three.js 材質用 `useTokenColor('--token')` 從 CSS 讀、跟著日夜相位更新，不寫死（AD-8）。
6. 站屬於哪個行政區只在管線判定（`pipeline/config/station_districts.csv`），前端不得自己推算（AD-9）。
7. 場景用 Three.js＋React Three Fiber，經緯度一律經 `web/src/scene/projection.ts` 的 `project()` 轉換（AD-11、AD-12）。
8. 異常日與活動原因只來自管線輸出的 `events.json`，前端只查表（AD-13、AD-14）。
9. 畫面狀態只在 `web/src/state/`，網址只由 `state/url.ts` 讀寫（AD-16）；分享圖用資料重畫，不截場景（AD-17）。

## 常用指令

```bash
# 管線（Python 3.12+、uv）
cd pipeline
uv run city-breath fetch --month 2026-09    # 下載約 300 MB 月檔到 data/raw/
uv run city-breath build --month 2026-09    # 彙總到 web/public/data/（約 8 秒）
uv run --group dev pytest

# 網站
cd web
npm install
npm run dev
npm test
npm run build
```

## 已知狀況

- 環狀線 11 站只有進站紀錄（出站由新北捷運營運、未入檔）；這些站不分群、不能當迄站。
- 原始資料迄站欄位有路線前綴（O景安、G大坪林、O頭前庄），已在別名表處理；新月份若出現新前綴，`build` 會報錯提醒。
- 假日表 `pipeline/config/holidays.csv` 要每月補；`daily.json` 的 anomalyCandidates（契約 v2 起改在 `events.json` 的全市級異常日）可幫忙找漏列的假日。
- 骨架目前還用 maplibre-gl＋deck.gl；架構已改成 Three.js（AD-11），在首頁換成場景的那張票（3.5）移除。
- `web/src/App.tsx` 是驗證資料與效能的開發骨架，不是設計稿。
