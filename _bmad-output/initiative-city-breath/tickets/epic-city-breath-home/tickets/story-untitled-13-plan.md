---
title: '街廓建築與樹（示意）'
type: 'feature'
ticket: '13'
created: '2026-11-11'
status: 'built'
baseline_revision: '9be96ae70a388a68b0b729dc877277915b7e6044'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 首頁場景只有地形、河川與流向，沒有原型裡「街廓跟著人潮呼吸」的城市感；DESIGN.md 把街廓與樹列為示意層，票 3.13 要把它移植成正式版。

**Approach:** 照原型（`design/prototypes/2.1-diorama/index.html` 705–841、1966–1975）移植：整座城一張 1.05 單位方格，每格疏密依附近車站全日進出（gaussian σ=1.5）、整區高度隨此刻該區進出人數起伏；山上（等級格網 ≥ 1）、河上、站前、地標周圍與大街不蓋；公園與山上種樹；矮胖圓角積木、三種牆色、屋頂點綴、世界座標窗戶入夜亮、深夜漸少。全部 InstancedMesh（4 個 draw call），依裝置降級。

## Boundaries & Constraints

**Always:** 疏密與高度只用 `stations.json`（全日＝平日各時段進＋出，`null` 不算）與 `basemap.json`（等級格網、河川、綠地、地標位置），不編造（AD-1）；經緯度只經 `project()`／`unproject()`，地形基座只經 `levelHeight()`／`elevation()`，人數決定的高度不乘地形倍數（AD-12）；顏色只走 token（`useTokenColor`），日夜只改窗光強度與亮燈比例，由 `daylight.ts` 從時刻算出（AD-8、AD-11）；不顯示數字、不可點（`raycast` 關掉）、不進分享卡，圖層面板標「示意」（AD-23）；減少動態或靜態模式：沒有待機波、高度直接切換、沒有長出動畫；佈局與人數換算是純函式並有 vitest。

**Never:** 不改 tickets.toml、DESIGN.md、SKILL.md、資料契約；不做選區抬起本身（3.6，只留接口）、車站柱與廣場造型（3.1）、地標造型（3.8）、列車與雲（3.14）；不刪原型資料夾；不讀網址（AD-16）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 密集區 | 格子旁有一站權重 1、距 0.6 | 一棟建築，高 `0.28 + 1.3·score^0.8·(0.75+0.5r)` | — |
| 山上 | 格子等級 ≥ 1 | 不蓋；依成片機率種樹，基座＝`TILE_TOP + levelHeight(L)` | — |
| 河上 | 格子在該區 water 多邊形內 | 不蓋、不種 | — |
| 公園 | 在 green 多邊形內 | 不蓋；85% 種樹 | — |
| 站前／地標 | 距站 < 0.55；距地標 < clear | 空地 | — |
| 大街 | gx 或 gz 為 4 的倍數 | 空地 | — |
| 疏處 | score < 0.03、距站 > 2.4 | 8% 種樹 | — |
| 呼吸 | 區此刻進出 a、當月最大 M | 高度倍數 `0.7 + 0.5·√(a/M)`，整點間內插 | 停止營運（null）當 0 |
| 降級 | 核心 ≤ 4 或記憶體 ≤ 4 GB；或實測 < 26 fps | lite：方塊幾何、無樹幹、樹 ×0.6、DPR ≤ 1.5 | 自動化瀏覽器不做實測降級 |

</frozen-after-approval>

## Code Map

- `web/src/data/blocks.ts`（新）-- 街廓的檢視模型（AD-19 家族；為與 3.6 並行時少衝突暫不放進 views.ts，3.7 可併回）：`blockSource(stations, basemap, districtIds)` → 站的位置與權重 √(全日/最大)、每區每日型每小時進出、當月最大、地標 clear；`buildingHeight(score, r)`、`breathScale(a, max)`、`activityAt(src, day, t, out)`。
- `web/src/scene/blockLayout.ts`（新）-- 純佈局：`layoutBlocks(input)` 走全底座方格，回傳 buildings／crowns／trees 與 district 索引；`cellAt(gx, gz, ctx)` 回答每格蓋什麼（含原因）；`hash01(gx,gz,k)` 決定性亂數；點在多邊形內（bbox 預篩）。
- `web/src/scene/Blocks.tsx`（新）-- 載入 stations＋basemap（`load.ts` 有快取）、建 4 個 InstancedMesh（建築、屋頂小塔、樹冠、樹幹）；`onBeforeCompile` 在 begin_vertex 依 `aDistrict` 套呼吸與抬起（同一段給 `customDepthMaterial`，陰影跟著動），fragment 畫世界座標窗戶與屋頂色；`useFrame` 更新 uniforms。prop `lift?: MutableRefObject<Record<string, number>>` 留給 3.6（區 ID → 抬起高度）。
- `web/src/scene/quality.ts`（新）-- `deviceTier()` 純函式、`QualityGovernor`（lite 時 `setDpr(≤1.5)`；暖機 30 格後量 90 格，平均 fps 不足降成 lite 一次）。
- `web/src/scene/daylight.ts` -- 加 `windowsAt(h)`：窗光強度 `2.2·smooth(0.25,0.9,night)+0.15·golden`、亮燈比例 0.62 → 深夜降到 0.30（原型 1966–1967）。
- `web/src/state/view.ts` -- `LayerKey` 加 `building`，預設開。
- `web/src/scene/LayerPanel.tsx`、`scene.css` -- 「建築與樹 示意」開關、色塊、來源說明一句。
- `web/src/scene/ScenePage.tsx` -- Canvas 內掛 `<Blocks>`、aria-label 補「建築與樹為示意」；其餘不動（3.6 也改這檔）。
- 重用：`Terrain.TILE_TOP`、`projection.{project,unproject,terrainLevelAt,levelHeight}`、`Plinth.plinthBox`、`useTokenColor(s)`、`three/addons/geometries/RoundedBoxGeometry.js`。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/blocks.ts`、`blocks.test.ts` -- 權重、全日（null 不算）、每區進出、呼吸、建築高度、內插
- [x] `web/src/scene/blockLayout.ts`、`blockLayout.test.ts` -- 佈局：山上、河上、公園、站前、地標、大街、疏處種樹、決定性
- [x] `web/src/scene/daylight.ts`、`daylight.test.ts` -- windowsAt
- [x] `web/src/scene/quality.ts`、`quality.test.ts` -- deviceTier
- [x] `web/src/scene/Blocks.tsx`、`state/view.ts`、`LayerPanel.tsx`、`scene.css`、`ScenePage.tsx` -- 場景與開關
- [x] `design/reviews/3.13-blocks/` -- Playwright 390×844：正午、黃昏、深夜、放大市中心、關建築，和原型同時刻並排；記 draw call、三角形、instance、建置耗時（full 與 lite）

**Acceptance Criteria:**
- Given 首頁, then 看得到街廓與樹，山區（台地）上沒有房子、有成片的樹，河面沒有建築。
- Given 拖時間軸 4 點 → 8 點, then 各區建築整體升高（平日 8 點大安、中正等區最明顯）。
- Given 圖層面板, then 有「建築與樹 示意」開關，關掉後建築與樹全部消失。
- Given 黃昏 18:30, then 窗戶亮暖色；凌晨 2 點亮的窗比 22 點少。
- Given 點建築, then 沒有任何數字或卡片（點擊穿過到下面）。
- Given reduced-motion, then 沒有待機波，換時段高度直接切換。

## Implementation Notes

- 沒有 subagent 工具：實作直接在這個 session 做，review 也由本 session 依 Quick lens 自審（見 Triage Log），和 3.3、3.5 相同。這份 plan 約 2,300 tokens，超過 1,600 的建議值；由主 session 委派、一次做完，沒有拆。
- 佈局模組原訂 `scene/blocks.ts`，和 `Blocks.tsx` 只差大小寫，macOS 不分大小寫的檔案系統上容易混淆，改名 `scene/blockLayout.ts`。
- 數量（2026-09）：建築 344、屋頂小塔 66、樹 1,172（lite 737）；instance 共 1,582（lite 1,147）。原型的建築數量相近（盆地平地本來就只有約 1,200 格，其餘是山、河、大街、站前與地標）。
- 三角形：圓角積木每棟 108、樹冠 20、樹幹 24 → full 95,848；lite 用方塊（12）、沒有樹幹 → 19,660。draw call：主畫面 +4（lite +3）；光在動（播放、拖時間）時陰影 pass 再 +4。Playwright 實測整個畫面（正午、暫停）：關建築 66 call／141,041 三角形 → 開建築 70 call／236,889 三角形；原型同一刻 1,572 call／623,870 三角形。
- 首次建置：佈局 36–80 ms、建 InstancedMesh 5–36 ms（無頭 Chromium、桌機 CPU，`performance.getEntriesByName('blocks:layout'|'blocks:build')`，`blocks:build` 的 detail 帶等級與數量）；vitest（node）31–52 ms。真機 fps 沒量（無頭軟體渲染 1–2 fps 沒有參考價值；DESIGN.md 已改由 6.2 預覽部署後 Piwi 用 iPhone 實測）。
- 降級：`deviceTier()` 依 `hardwareConcurrency ≤ 4` 或 `deviceMemory ≤ 4` 開場就 lite；其餘開場 full，暖機 30 格後量 90 格平均 < 26 fps 就降成 lite 一次（不升回）。lite 時每格檢查 DPR，超過 1.5 就壓回（R3F 在 Canvas 重新設定時會把 DPR 設回 `[1, 2]`）。`navigator.webdriver` 時不實測，截圖才不會全是 lite；截圖腳本用 `hardwareConcurrency` 覆寫分別拍 full 與 lite。
- 實作時 Playwright 抓到：r186 的 `vColor` 是 vec4，屋頂色要用 `vColor.rgb`，否則牆的 shader 編譯失敗（已修）。
- 陰影：陰影圖只在光移動時重畫（2.3），所以換日型、整區高度還在追目標、抬起、開關圖層時由 Blocks 補 `shadowMap.needsUpdate`；待機波（±2%）不補。清晨低太陽時建築的長影子有顆粒感，是 PCF `radius 5` 的雜訊取樣（和原型同設定），試過把 normalBias 0.03 → 0.08 沒有差別，已還原。
- 3.6 的接口：`<Blocks lift={ref}>`，`ref.current[行政區 ID] = 抬起高度（場景單位）`，每格讀；建築與樹跟著抬，陰影跟著重畫。選取狀態與動畫本身留給 3.6。
- 截圖：`design/reviews/3.13-blocks/`（`compare-*` 左正式版、右原型；`site-*` 只有正式版）。正午、黃昏 18:40、23 點、凌晨 2 點、放大市中心、關建築、lite、reduced-motion，以及同構圖平日 5 點 vs 8 點的呼吸對照。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審）：high 0、medium 1、low 2、false 1、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| medium | patch | lite 的 DPR 只在等級改變時 `setDpr(1.5)` 一次；R3F 每次 Canvas 重新設定（ScenePage 重繪，例如切區名圖層）時 `state.viewport.dpr !== calculateDpr([1,2])` 會設回 2。改成 `QualityGovernor` 每格檢查、超過就壓回。 |
| low | patch | `scene/blocks.ts` 與 `scene/Blocks.tsx` 只差大小寫：在 macOS 上搜尋與 import 容易拿錯。改名 `blockLayout.ts`。 |
| low | patch | 矩陣「疏處 8% 種樹」沒有測試；補 `blockLayout.test.ts` 遠離車站的格子只會是 sparse 的空地或樹、樹少於四成。 |
| false | reject | 疑慮：樹的 `aDistrict` 指到「21 區以外」（索引 n−1）時會套到呼吸。實際上樹的著色器 `cbB` 固定 1.0，且 `uBreath[n−1]`、`uLift[n−1]` 每格寫成 1 與 0。 |

## Design Notes

- 一個 draw call 一種網格：四面牆與屋頂同一材質，屋頂在 shader 依法向換 `--roof`（原型是 6 個 group＝6 個 draw call）；21 區合成一個 InstancedMesh，區的呼吸與抬起用 `uniform float uBreath[N]`、`uLift[N]` 由 `aDistrict` 索引，CPU 每格只寫 2×22 個 float。
- 呼吸在 begin_vertex 換算回物件座標（`y' = base + (y − base)·b + lift`，再除 instanceMatrix 的 y 縮放），後面的 worldpos、陰影接收、窗戶世界座標都一致。
- 預設做法（待 Piwi 確認）：山上「成片」用低頻雜訊分片（片內 45%、片外 4%），比原型零星的 7% 密；疏處與公園照原型。
- 預設做法：待機正弦波（±2%）播放與暫停都有，不另觸發陰影重畫（光沒動時陰影誤差 2%，看不出來）。
- 疏密只看平日全日（原型相同），切到假日時佈局不變、只有整區高度換成假日的進出。
- 地標周圍的空地半徑依 `basemap.json` 地標的 `kind` 查表（原型的 clear 值），暫放 `data/blocks.ts`；3.8 做地標造型時可移過去。
- 降級門檻（4 核或 4 GB、26 fps、lite 的 DPR 1.5）是推估值，6.2 預覽部署實測後再調。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright（swiftshader）390×844 五張截圖與原型並排；`drawElementsInstanced` 攔截記 draw call／三角形；`performance.getEntriesByName('blocks:layout')` 記建置耗時。
