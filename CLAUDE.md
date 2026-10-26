# 城市呼吸｜北捷人流脈搏

用北捷每月公開的「每日分時各站起訖人次」，做一個手機優先、可分享的城市作息網站。非商業 side project。

## 文件在哪

- PRD：`_bmad-output/planning-artifacts/prds/prd-city-breath-2026-10-26/prd.md`（原文在 Claude Docs：https://claude.ai/artifact/S46QYMugL6cKGNZK9ePN7r）
- 架構：`_bmad-output/planning-artifacts/architecture/architecture-city-breath-2026-10-26/ARCHITECTURE-SPINE.md`
- Epics／進度：`_bmad-output/planning-artifacts/epics.md`
- 資料契約：`docs/data-contract.md`

## 工作方式

- 開發流程用 BMAD v6（`.claude/skills/bmad-*`）。不確定下一步就呼叫 `bmad-help`。實作單一 story 用 `bmad-build`，審查用 `bmad-code-review`。
- **所有視覺設計一律用 hallmark skill**（`.claude/skills/hallmark`）。做新畫面前先跑它的 Flow；改既有畫面時說「hallmark redesign <path>」。它的 Floor 規則不可違反：顏色與字型只能用 `:root` token、不用 eyebrow 或全大寫追蹤字距標籤、每個動畫要有 reduced-motion 版本、不編造任何數字。
- 跟 Piwi 溝通用繁體中文。

## 不可違反的規則（摘自架構 AD）

1. 網站只讀 `web/public/data/` 的 JSON，不讀原始 CSV（AD-1）。改欄位要同時改 `export.py`、`types.ts`、`docs/data-contract.md`。
2. 站名正規化只在 `pipeline/stations.py` 與 `pipeline/config/`（AD-2）。
3. 起訖人次 < 10 在管線端輸出 `null`，畫面顯示「少於 10 人」，前端不得反推（AD-3）。
4. 停止營運時段是 `null` 不是 0（AD-5）。
5. deck.gl 顏色用 `tokenRgb('--token')` 從 CSS 讀，不寫死 RGB（AD-8）。

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
- 假日表 `pipeline/config/holidays.csv` 要每月補；`daily.json` 的 anomalyCandidates 可幫忙找漏列的假日。
- maplibre-gl v6 在 Vite 打包後 worker 載入失敗；目前用空白底圖不受影響，加底圖圖磚前要先修。
- `web/src/App.tsx` 是驗證資料與效能的開發骨架，不是設計稿。
