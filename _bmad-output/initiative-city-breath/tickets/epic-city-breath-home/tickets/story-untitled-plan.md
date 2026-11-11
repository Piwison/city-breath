---
title: '行政區流向緞帶'
type: 'feature'
ticket: '5'
created: '2026-11-11'
status: done
baseline_revision: 'a9628fc970c584ccd84f90b7b3cf3980071ea5f9'
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

**Problem:** 首頁還是驗證用的 maplibre＋deck.gl 骨架（站點散布圖），2.3 的微縮城市只在 `?scene=1`；行政區流向（district-flows.json）在網站上完全看不到。

**Approach:** 首頁換成 2.3 場景並自動播放一天；從天光原型移植「全城前 12 大行政區流向」：等比例線寬的緞帶＋尾端箭頭、脈衝光點、前三大弧頂人數標籤，時間軸下方加平日／假日切換與同公式的圖例；拆掉骨架與 maplibre-gl、deck.gl，通勤同路人與分享卡（4.3）入口搬到場景 HUD 保持可用。

**Piwi 2026-11-11 追加（第一次使用者測試後）：**
1. 開場維持從清晨開始自動播放。
2. 鏡頭改成地圖習慣：單指拖曳＝平移；雙指＝縮放＋旋轉／傾斜；傾角有上下限（不翻到接近水平）；縮放朝手指（或滾輪游標）位置；加「回到全景」按鈕（40px、token 顏色，減少動態時直接切回、不飛）。滑鼠：左鍵平移、右鍵或 Ctrl＋拖曳旋轉。
3. 放大後緞帶不能粗到蓋住街區：線寬上限以螢幕像素計、放大時不無限變粗（圖例仍與畫面一致）；前三大標籤避開上方 HUD、下方時間軸與左右邊緣，不被切掉或壓住。
4. 這三點只寫進 plan 與 PR，不改 DESIGN.md、diorama-game-juice SKILL.md、tickets.toml（另有人在改）。

## Boundaries & Constraints

**Always:** 線寬＝`W_MIN + (W_MAX − W_MIN) × 人數 ÷ 當月最大流向`（W_MIN 0.28、W_MAX 2.9，當月最大＝兩日型、所有小時、跨區格的最大值），公式與挑選、光點換算在 `views.ts` 的純函式並有 vitest；場景圖層只吃 `FlowFrame`（AD-19）；`null` 不畫、不排名、不當 0，標籤顯示「少於 10 人」；整小時 `null`＝停止營運（AD-5）；經緯度只經 `project()`、端點高度取 `elevation()` 系列（AD-12）；顏色只走 token（`--flow-neutral`、`--particle-hi`，AD-8）；dayType 與播放狀態只在 `web/src/state/`（AD-16）；光點與緞帶各自合併成少數 draw call（InstancedMesh／合併幾何，粒子上限 ≤ 3,000，AD-6）；reduced-motion 時不自動播放、箭紋不捲動、光點靜止、鏡頭不飛。

**Never:** 不做點行政區、去哪誰來、緞帶畫出動畫（3.6）；不做時段名浮出、網址回寫、速度鍵、大日子（3.3、7.x）；不做落點漣漪、車站柱、建築、列車；不改資料契約與管線；不刪原型資料夾（3.7）；不加 gsap 或後製；不寫死色碼與數字；不改 DESIGN.md、diorama-game-juice SKILL.md、tickets.toml、CLAUDE.md。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 線寬 | 人數＝當月最大 / 0 / 超過最大 | W_MAX / W_MIN / 夾在 W_MAX | — |
| 前 12 大 | 一小時 21×21 矩陣 | 排除 from==to 與 null，依人數由大到小取 12 | — |
| 停止營運 | 該小時整格 null | 回傳 null（畫面「停止營運」），不畫緞帶 | — |
| 有營運但全少於 10 人 | 矩陣全 null／0 | 空陣列，圖例說明「各區之間都少於 10 人」 | — |
| 光點換算 | 總人數 ÷ 50 ≤ 上限×0.9 | 一顆＝50 人；超過就加倍到符合，每條至少 1 顆；null 0 顆 | — |
| 網址 | `?hour=8&day=holiday` | 停在 8 點、假日、不播放 | 不合法值忽略 |
| 放大 | 一場景單位＝60 像素 | 所有緞帶等比縮，最粗＝RIBBON_MAX_PX；拉遠時不縮 | 量不到比例時不縮 |
| 標籤 | 弧頂靠邊、在 HUD 或時間軸後面、彼此重疊 | 整個標籤留在安全區內並上下挪開；弧頂在畫面外不標 | — |

</frozen-after-approval>

## Code Map

- `web/src/main.tsx` -- 直接 lazy 載 ScenePage（拿掉 `?scene=1`）。
- `web/src/App.tsx`、`web/src/map/CityMap.tsx` -- 骨架；刪除。通勤表單搬到 `web/src/commute/CommuteForm.tsx`。
- `web/src/state/view.ts` -- 加 `dayType`／`setDayType`、圖層 `flow`。`state/url.ts` 讀 `day`、拿掉 scene。`state/clock.ts` 照用。
- `web/src/data/views.ts` -- `FlowFrame`、`flowMax`、`ribbonWidth`、`ribbonScale`、`topFlows`、`dotScale`、`legendValues`、`flowSource`。
- `web/src/scene/Flows.tsx` -- 緞帶（本體、箭頭各一個合併幾何，位置＝中心＋偏移×k）、光點（InstancedMesh）、前三標籤投影。
- `web/src/scene/labelPlace.ts` -- 標籤擺放純函式（安全區、左右留邊、彼此不重疊）。
- `web/src/scene/FlowLegend.tsx` -- 圖例 DOM 與 `ScaleProbe`（每格量像素比例與 k，緞帶、光點、圖例共用）。
- `web/src/scene/CameraRig.tsx` -- 地圖式鏡頭操作、傾角上下限、平移範圍＝底座、`home()`。
- `web/src/scene/ScenePage.tsx` -- 載入 district-flows、掛各層；上方 HUD（通勤入口、回到全景、圖層）與標籤安全區量測。
- `web/src/scene/DistrictLabels.tsx` -- `LabelBoard`：區名避開流向標籤，帶安全區上下界。
- `web/src/scene/TimeBar.tsx`、`LayerPanel.tsx`、`SceneFallback.tsx`、`CommuteEntry.tsx`、`scene.css` -- 平日／假日、圖例列、流向開關、替代畫面內嵌通勤表單、左上通勤入口。
- `design/prototypes/2.1-diorama/index.html` 1185–1349、2072–2129 -- 移植來源（不刪）。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/views.ts`、`views.test.ts` -- 流向檢視模型與純函式＋測試
- [x] `web/src/state/view.ts`、`url.ts`、`url.test.ts` -- dayType、flow 圖層、讀 `day`、拿掉 scene
- [x] `web/src/scene/Flows.tsx`、`labelPlace.ts`、`labelPlace.test.ts` -- 緞帶、光點、標籤
- [x] `web/src/scene/FlowLegend.tsx`、`TimeBar.tsx`、`scene.css` -- 平日／假日、圖例、停止營運說明
- [x] `web/src/scene/CameraRig.tsx`、`ScenePage.tsx` -- 地圖式鏡頭、回到全景、標籤安全區
- [x] `web/src/commute/CommuteForm.tsx`、`CommuteEntry.tsx`、`SceneFallback.tsx` -- 通勤表單搬家
- [x] `web/src/main.tsx`、刪 `App.tsx`、`map/`、`package.json`、`app.css`、`deps.test.ts` -- 移除骨架與套件
- [x] `design/reviews/3.5-flows/` -- 截圖與原型同時刻對照

**Acceptance Criteria:**
- Given 首頁、未設減少動態, when 開啟, then 從清晨自動播放、碰到沙盤就暫停。
- Given 平日 8 點, when 看畫面, then 前 12 大緞帶粗細與人數成正比、前三有人數標籤，圖例三段粗細與畫面一致。
- Given 切到假日, when 同一小時, then 緞帶組合改變。
- Given reduced-motion, when 開啟, then 停在 8 點不播放、箭紋與光點靜止；按「回到全景」直接切回。
- Given 放大到街區, when 看緞帶, then 最粗不超過 18 像素，圖例同步；標籤不壓在 HUD 與時間軸上。
- Given 滑鼠或觸控, when 左鍵／單指拖曳, then 平移；右鍵／Ctrl＋拖曳或雙指, then 旋轉傾斜且不翻到接近水平；滾輪／捏合朝游標縮放。
- Given `web/package.json`, then 沒有 maplibre-gl 與 deck.gl，`npm test`、`npm run build` 通過。

## Implementation Notes

- 沒有 subagent 工具，實作直接在這個 session 做；review 也由本 session 依 Quick lens 的要求自審（見 Triage Log）。
- `FlowSource`（views.ts）把當月最大、圖例值與每小時前 12 大包好並快取，場景層與圖例共用，場景不 import 契約型別（AD-19）。
- 緞帶：所有本體一個 mesh、所有箭頭一個 mesh、所有光點一個 InstancedMesh。雙面透明材質預設畫兩次，改 `forceSinglePass`。實測 390×844：每格 66 個 draw call，關掉流向圖層 63（2.3 基底），流向＋3。
- 放大上限：`ScaleProbe` 每格用鏡頭到目標點的距離算一單位幾像素，`ribbonScale` 得 k＝min(1, 18 ÷ (W_MAX × 像素))；緞帶頂點存中心與側向偏移，k 變超過 1% 才就地改寫位置；光點大小也乘 k；圖例 bar＝ribbonWidth × 像素 × k（下限 1.5px，拿掉原型的 16px 上限）。手機首頁一單位約 6.2px，最粗 18px，k＝1，所以首頁和原型一樣；放大後最粗維持 18px。
- 鏡頭（CameraRig）：左鍵 TRUCK、右鍵 ROTATE、滾輪 DOLLY、單指 TOUCH_TRUCK、雙指 TOUCH_DOLLY_ROTATE、`verticalDragToForward`（平移貼地）、`dollyToCursor`；傾角 0.12–1.1 rad（原 2.3 上限 1.32）；`setBoundary` 讓目標點留在底座內。camera-controls 沒有修飾鍵設定，Ctrl／⌘＋左鍵在 window capture 階段換成 ROTATE。雙指扭轉不旋轉（camera-controls 不支援），雙指一起拖動才旋轉／傾斜。
- 標籤：`placeLabel` 純函式，安全區＝`.scene-top` 下緣＋6px 到 `.scene-dock` 上緣−6px（ResizeObserver 量），左右留 8px；標籤大小只在文字換了之後量一次。
- 停止營運（2–4 點）圖例顯示「停止營運：這個時段沒有列車」；5 點有營運但各區之間都少於 10 人，圖例照實說。
- 「8 點平日永和往中山、中正、大安、信義」：資料有（2026-09 平日 8 點永和→中正 1,505、中山 1,411、大安 1,026、信義 756），但全市前 12 的第 12 名是 3,143，首頁全城畫面不會畫；vitest 記錄了這個對照。待 Piwi 決定是否把這條 verify 移到 3.6。
- 骨架的車站個性面板（點站看類型、進出、前 5 目的地）不搬，留給 3.12 車站卡；通勤表單＋存成圖片搬到左上「找你的通勤」與替代畫面。
- bundle：改前 assets 合計 3,158 KB（gzip 859 KB），首頁骨架 index 1,911 KB（gzip 532 KB）；改後合計 1,274 KB（gzip 356 KB），index 222 KB＋場景 1,038 KB。
- CLAUDE.md「已知狀況」最後兩條（骨架還用 maplibre、App.tsx 是骨架）已過時；依指示不改 CLAUDE.md，記在 deferred-work。

## Plan Change Log

- 2026-11-11 Piwi 追加（使用者測試後）三點：開場維持清晨自動播放；地圖式鏡頭與回到全景；放大時線寬像素上限與標籤安全區。加進 Intent、Matrix、Tasks 與 AC。已先改的 DESIGN.md 依指示還原（不改 DESIGN.md）。KEEP：流向的 draw call 結構（本體、箭頭、光點各一）、views.ts 的純函式與測試、通勤表單搬家。

## Review Triage Log

Quick lens（本 session 自審）：high 0、medium 3、low 3、false 0、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| medium | patch | 雙面透明的緞帶本體與箭頭各畫兩次（draw call 68，比預期多 2）；加 `forceSinglePass`，實測回到 66。 |
| medium | patch | 前三標籤每次重算都先顯示再量 `offsetWidth`，鏡頭移動時每格強迫重排 3 次；改成文字換了才量，文字寫入改 layout effect。 |
| medium | patch | 標籤在鏡頭後面（P.z > 1）時仍佔位，會擠走後面的標籤；改由 `placeLabel` 先判斷可見再佔位。 |
| low | patch | 圖例 bar 以人數當 React key，值重複時 key 重複；改用索引。 |
| low | patch | 圖層面板的流向出處名稱與 meta.json 不一致；改成「每日分時各站 OD 流量統計資料」。 |
| low | defer | CLAUDE.md「已知狀況」兩條已過時；屬 agent-context 檔，記在 deferred-work。 |

## Design Notes

- 緞帶畫出動畫原型用 gsap；AD-11 規定一次性動作只用 GSAP，3.5 沒有選取情境，留到 3.6 一起加 gsap。換日型時直接切換。
- 落點漣漪原型用 16 個獨立 mesh；為守 draw call 預算不在本張做。
- A→B 與 B→A 的緞帶走同一條曲線、互相疊住（原型也是）；之後可分左右車道。

## Verification

**Commands:**
- `cd web && npm test` -- 通過（132 項）
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright（swiftshader）390×844：平日 8、平日 18、假日 14、平日 0 點與原型並排（`design/reviews/3.5-flows/compare-*.png`）；自動播放 5 秒前進 30 分、點畫面暫停；reduced-motion 停在 08:00；切假日前三改變；流向圖層關閉時 draw call 63、開啟 66；放大、傾角上限、Ctrl 旋轉、單指平移、雙指捏合、回到全景（含 reduced-motion）；停止營運與全少於 10 人的圖例；無 WebGL 的替代畫面可查通勤。
