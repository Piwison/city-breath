---
title: '微縮城市場景基底：台北盆地與天光'
type: 'feature'
ticket: '3'
created: '2026-11-10'
status: done
baseline_revision: 'd9743b0366376cee6e61afa0d6b6050dc885befc'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 天光只活在 `design/prototypes/2.1-diorama/` 的單一 HTML，讀的是原型自帶的 `layers.json`；網站沒有 Three.js 場景、沒有 `project()`／`elevation()`、沒有 `useTokenColor`，相位計算也還在 `styles/tokens.ts`（AD-8 要求只在 `scene/daylight.ts`）。

**Approach:** 用 R3F 把原型的「底層」移進 `web/src/scene/`：讀 `basemap.json` 與 `districts.json` 畫底座、地形台地、海、行政區薄片、河川、綠地、捷運路線，天空與光依 clock 的時刻由 `daylight.ts` 算；新場景先放在 `?scene=1` 預覽（React.lazy 分包），骨架不動。

## Boundaries & Constraints

**Always:** 經緯度只經 `project()`，真實高程只經 `elevation()`（`TERRAIN_EXAGGERATION`＝2，AD-12）；顏色只走 token（材質色經 `useTokenColor`／token reader，日夜只改光、天空、曝光，AD-8）；相位關鍵時刻、`phaseAt`、光的計算只在 `daylight.ts`；畫面狀態（時刻、播放、圖層）只在 `web/src/state/`，網址只經 `state/url.ts`（AD-16）；NeutralToneMapping、曝光 0.78–1.0、只有一盞會投影的方向光（PCF），不用後製；DPR ≤ 2，重複幾何合併（AD-6）；reduced-motion 時不自動播放、停在 8 點；WebGL 不可用時顯示靜態說明與通勤入口（AD-11）。

**Never:** 不做建築、樹、車站柱、流向、列車、雲、地標、徽章、音效；不拆 maplibre＋deck.gl 骨架（3.5）；不刪原型資料夾（3.7）；不讀 `layers.json`；不改資料契約與管線；不加 bloom／EffectComposer；不寫死色碼與數字。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 投影原點 | `project(LON0, LAT0)` | `[0, 0]`；21 區外框投影後最大邊長 100 | — |
| 已知點 | 台北車站 `project(121.5172, 25.0478)` | 東為 +x、北為 −z；`unproject(project(p))≈p` | — |
| 高程 | `elevation(850)` | `850 × 2 ÷ METERS_PER_UNIT`；`elevation(0)=0` | — |
| 等級格網 | `terrainLevelAt(lon, lat, grid)` 在格網外 | `0` | — |
| 相位 | `phaseAt(12)`／`phaseAt(0)` | `day`／`night`（夜晚程度 > 0.55） | — |
| 光 | `lightingAt(12)` vs `lightingAt(0)` | 白天太陽在南（+z）、高度 > 0；夜裡月光位置、曝光 0.78 | — |
| URL | `?scene=1&hour=6` | 預覽場景、停在 6 點不自動播放 | hour 不是 0–23 整數就忽略 |
| 無 WebGL | `getContext` 失敗或 Canvas 建立丟錯 | 靜態說明＋通勤入口 | ErrorBoundary 接住 |
| 資料失敗 | basemap 或 districts 載入失敗 | 可讀錯誤訊息，不是空白 | — |

</frozen-after-approval>

## Code Map

- `design/prototypes/2.1-diorama/index.html` -- 移植來源：`:394` sunState、`:564-588` renderer／相機／HOME、`:623-631` 光與陰影、`:673-703` 底座三層＋刻度＋影子、`:705-782` 行政區薄片（0.992 內縮、TILE_TOP 1.16）、河川綠地（polygonOffset）、路線（LineSegments2 0.3 worldUnits）、台地、`:844-852` 底座外台地與海、`:1503-1561` 圖層與區名、`:1875-1894` 天空（地平線＝底座遠端投影）、`:1942-1956` 每格的光與曝光（天光：sun 2.4、hemi 0.32–1.05、moon 0.55）
- `web/public/data/basemap.json` -- bbox、levels、districts[].{water,green,terrain}、outside.terrain、sea、outsideWater、grid、tracks（不讀 landmarks、headway、stationLines）
- `web/src/data/load.ts` `loadBasemap()`、`loadDistricts()`、`loadMonths()` -- 直接用，不改
- `web/src/styles/tokens.ts` -- 保留讀色工具；`PHASE_KEYS`、`phaseSpan`、`tokenAt`、`sunAt`、`hudPhase` 移到 `scene/daylight.ts`（hudPhase 改名 `phaseAt`）；內插改用匯出的線性空間 `mixRgba`
- `web/src/share/render.ts`、`render.test.ts`、`styles/tokens.test.ts` -- 改 import；相位測試搬到 `daylight.test.ts`
- `web/src/state/url.ts` -- 加 `readQuery(search)` 讀 `hour` 與 `scene`
- `web/src/main.tsx` -- `scene=1` 時 lazy 載入場景頁
- 21 區外框（districts.json 2026-09，有車站的區）＝ `[121.39265, 24.86175, 121.66586, 25.24438]`；1 單位約 424 公尺，850 公尺→約 4.0 單位（原型手調 3.0）

## Tasks & Acceptance

**Execution:**
- [x] `web/package.json` -- three 0.186.1、@types/three 0.186.0、@react-three/fiber 9.8.2、@react-three/drei 10.7.9 -- 架構 Stack
- [x] `web/src/scene/projection.ts`＋`projection.test.ts` -- 常數、`project`／`unproject`、`METERS_PER_UNIT`、`TERRAIN_EXAGGERATION`、`elevation`、`terrainLevelAt`；測試比對已知點、外框、倍數、格網 -- AD-12
- [x] `web/src/scene/daylight.ts`＋`daylight.test.ts` -- 相位、`tokenAt`、`sunAt`、`phaseAt`、`lightingAt`（太陽／月亮位置與強度、半球光、曝光、天空色、日月星透明度）；純函式 -- AD-8、AD-11
- [x] `web/src/styles/tokens.ts`、`tokens.test.ts`、`share/render.ts`、`share/render.test.ts` -- 搬移後改 import，行為不變
- [x] `web/src/state/view.ts`、`state/clock.ts`、`state/url.ts`(+test) -- 最小 store（hour、playing、layers；`t` 為非 React 欄位）、clock 推進 `t`（48 秒一天）並寫 `data-phase`、讀 URL -- AD-16
- [x] `web/src/scene/useTokenColor.ts` -- token → `THREE.Color`（sRGB），`data-phase` 變動時重讀
- [x] `web/src/scene/geometry.ts` -- 多邊形 → Shape、擠出並依 group 填頂面／側面色、合併
- [x] `web/src/scene/{Scene,Sky,Daylight,Plinth,Terrain,Rails,DistrictLabels,LayerPanel,TimeBar,SceneFallback}.tsx`、`webgl.ts`、`scene.css` -- 場景與預覽 HUD
- [x] `web/src/main.tsx` -- `?scene=1` 分支
- [x] `DESIGN.md`、`docs/data-contract.md`（若需）-- 記下 daylight.ts、預覽入口
- [x] `design/reviews/2.3-scene-base/` -- 390×844 清晨、正午、黃昏、深夜四張＋原型同時刻對照

**Acceptance Criteria:**
- Given `npm run build` 後預覽 `?scene=1`，then 看得到台北盆地地形、海、河川、綠地與彩色捷運路線，不是空白。
- Given 拖動時間軸，then 太陽方位、陰影、天色、光色與曝光跟著變，材質顏色不變。
- Given `prefers-reduced-motion: reduce`，then 不自動播放、停在 8 點，拖時間仍換光。
- Given 圖層面板，when 關掉河川／綠地／路線／區名，then 對應圖層消失。
- Given `npm test`，then project 已知點、elevation 倍數、daylight 相位測試通過，且原有測試（含色碼掃描）不壞。

## Implementation Notes

- 本次由 bmad-build 的子代理執行，環境沒有可再派發的子代理：step-03 直接依計畫實作，step-04 的 quick lens 改由實作者自查（見 Review Triage Log）。
- 2.2 的 `parseColor` 只認 3／6 碼 hex，但建置時 CSS 壓縮把 `rgba()` token 改寫成 8 碼 hex（例：`--sun-glow:#ffcd788c`），正式版的 `tokenRgba('--sun-glow')` 會丟錯；開發與測試讀原文所以沒發現。已擴充成 3／4／6／8 碼並加測試。
- `PHASE_KEYS`、`phaseSpan`、`tokenAt`、`sunAt` 從 `styles/tokens.ts` 搬到 `scene/daylight.ts`，`hudPhase` 改名 `phaseAt`（AD-8 的名字）；`tokens.ts` 只留讀色與 `mixRgba`。分享卡改 import，輸出不變（render.test 通過）。
- 新增 `data/views.ts` 的 `baseView()`（AD-19：場景圖層不 import 契約型別）、`state/view.ts`（hour、playing、layers；`time.t` 非 React 欄位）、`state/clock.ts`（48 秒一天、寫 `data-phase`）、`url.ts` 的 `readQuery()`（`hour`、`scene`）。
- 投影常數：21 區外框寫死在 `projection.ts`，測試逐月比對 districts.json（12 個月相同）與 basemap bbox（各加 8%）。1 單位約 424 公尺；`elevation(850)` 約 4.0（原型手調 3.0）。
- 天空改成全螢幕 shader（sRGB 混色、不 tone map），太陽、月亮、星星也在裡面；原型是 DOM 漸層＋70 顆 DOM 星星。
- 地面每區一個頂點色 mesh（薄片＋六層台地），水、綠地各一；路線一個 LineSegments2。實測每格 63 個 draw call（陰影圖不重畫時）。
- 陰影：`shadowMap.autoUpdate=false`，光的位置變了或剛掛上才重畫；短邊 < 600px 用 1024 陰影圖（原型 2048）。
- 預覽入口 `?scene=1`（React.lazy 分包）；主 chunk gzip +1.2 KB（537.29 → 538.53 KB），場景 chunk 1,001 KB／gzip 267 KB（three＋R3F＋camera-controls）。
- 驗證：`npm test` 100 項、`npm run build` 通過；Playwright（swiftshader）390×844 截 6／12／18／23 時並與原型並排（`design/reviews/2.3-scene-base/`）；reduced-motion 停在 08:00 不播放；一般情況 5 秒前進 30 分；圖層全關後區名隱藏；`--disable-webgl` 顯示替代畫面；basemap 404 顯示「底圖載入失敗」。

## Plan Change Log

## Review Triage Log

- 2026-11-10 第 1 輪（quick）：環境無法啟動獨立的審查子代理，quick lens 未能以無上下文的方式執行，`lenses_ran` 留空；由實作者依 quick lens 的檢查項目（驗收條件、CLAUDE.md 規則、bug）自行檢視 diff。建議在 PR 上另跑 `bmad-code-review`。
  - 自查結果：high 0／medium 1／low 2／false 0／maybe-false 0，全部 patch。
  - medium｜`web/src/scene/Daylight.tsx` 陰影圖尺寸在畫面跨過 600px 時改變，舊的 shadow map 沒丟，新尺寸不生效｜patch：改尺寸前 dispose 並清掉 `shadow.map`。
  - low｜`web/src/scene/scene.css` 圖層面板「字」圖示寫死 10px 字級，沒走 token｜patch：改 `var(--text-2xs)`。
  - low｜`web/src/scene/TimeBar.tsx` 滑桿只報 0–23.95 的數字，螢幕閱讀器聽不到時間｜patch：同步寫 `aria-valuetext`（HH:MM）。

## Design Notes

- 天空不再用 DOM 漸層：用一個全螢幕四邊形 shader 在 sRGB 空間畫上／地平線／下緣三段漸層、太陽、月亮與程序星星（不 tone map、不經色彩轉換，與原型 CSS 一致），一個 draw call、每格不動 DOM。
- 地面依區合併：每區「薄片＋六層台地」一個頂點色 mesh（顏色由 token 讀出寫進頂點色），水、綠地各一個；行政區保持各自的 group，留給之後選區彈起。
- 陰影圖只在太陽／月亮位置改變或場景剛掛上時重畫（`shadowMap.autoUpdate=false`），暫停時不耗 GPU。
- 計畫核准（CHECKPOINT 1）以呼叫端的委派指示代替：本次由子代理執行，無人可即時回答。

## Verification

**Commands:**
- `cd web && npm test` -- expected: 全部通過
- `cd web && npm run build` -- expected: tsc 與 vite build 成功，場景為獨立 chunk

**Manual checks (if no CLI):**
- Playwright（swiftshader）390×844 截 `?scene=1&hour=6|12|18|23`，與原型同時刻並排
