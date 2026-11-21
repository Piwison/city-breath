---
title: '首頁減法：三條路'
type: 'feature'
ticket: '24'
created: '2026-11-21'
status: 'built'
baseline_revision: 'dbb820b5116f0caaf94bce31e63333e02bdc4ca0'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/design/prototypes/3.24-home-paths/README.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 首頁同時有分享這一刻、回到全景、圖層、播放、平日／假日、1x、靜態、時間軸、找你的站、搭板南線（8.6 暫時入口）與時間軸下兩行說明，第一次來的人沒有明確的路（體驗原則 9、10）。

**Approach:** 照 Piwi 2026-11-21 選的原型 C「一個底座」：畫面下方一張玻璃底座，上半是看城市呼吸（播放、時間＋月份日型、平日／假日、細拖曳條保留停駛斜紋），分隔線，下排「找你的站｜搭板南線（最大、置中）｜⋯更多」。按 ⋯ 底座就地翻成更多清單（分享這一刻、圖層、播放速度、靜態模式、怎麼看這張圖），再按翻回。「回到全景」是貼在底座（或小卡）右上方的膠囊，只在鏡頭被移動過或選了區、站、流向時出現。搭乘到終點或按下車時出現分享鈕，開 3.15 分享面板（只有複製連結），連結回到那一站、暫停中。

## Decisions（Piwi 2026-11-21，經協調者轉達）

- 版本 C；「待你確認」標籤拿掉；文字圖例（FlowLegend）收進「怎麼看這張圖」。
- 「關於」：3.17 還沒做、沒有任何關於內容，清單裡先不放這一項，記給 3.17（不自己寫關於內容）。
- DESIGN.md 版面記下版本 C（2026-11-21，Piwi），取代「原型先行」的寫法。

## Boundaries & Constraints

**Always:** 顏色與字型只用 `:root` token；每個動畫有 reduced-motion 版本（時長 token 歸零＝直接切換，不滑不彈）；三條路與 ⋯更多、回到全景點擊目標 ≥ `--tap`；沒開卡時 HUD ≤ 390×844 畫面的 35%；跨元件的畫面狀態在 `web/src/state/`、網址只由 `state/url.ts` 讀寫（AD-16）；沿用現有元件（TimeBar、LayerPanel 的清單、FlowLegend、SharePanel、FindStation、8.6 的搭乘）。

**Never:** 不改場景、卡片、管線與資料契約；不加新的計數事件或 kind（AD-20）；不寫關於頁內容；卡片底部的圖例照留；不做提示（3.11）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 首頁沒動過 | 開場、沒選東西、鏡頭沒動 | 只有搭板南線、找你的站、播放、時間＋月份日型、平日／假日、⋯更多 | 資料未到：按鈕 disabled |
| 動過鏡頭 | 拖曳／捏合／滾輪 | 回到全景膠囊出現；按了飛回開場構圖並收起 | 減少動態：直接切回 |
| 選了東西 | 選區、站、聚焦流向（含連結還原） | 回到全景在卡片右上方出現 | — |
| ⋯更多 | 按 ⋯ | 底座翻成清單；再按 ⋯ 或 Esc、點場景翻回 | 開卡、上車時自動收起 |
| 下車 | 搭乘中按下車 | 控制換成「在 X 下車」小卡：分享＋回到首頁；分享面板只有複製連結，連結 `ride=BL&station=X` | — |
| 到終點 | 停在路線端點（暫停） | 控制列多一顆「分享」 | — |

</frozen-after-approval>

## Code Map

- `web/src/scene/ScenePage.tsx` -- 首頁組裝：刪 RideStart、ShareMoment、上方回到全景與 LayerPanel；Bottom 沒卡時改放 HomeDeck；RideControls 加終點分享、下車改成 endRide；安全區量測改量底座與膠囊（`.scene-dock:not([hidden]), .card`）。
- `web/src/scene/TimeBar.tsx` -- 拿掉 1x、靜態鍵、刻度與 children（圖例），只留兩排（播放／時間／日型＋拖曳條）；匯出 `Sub` 給圖例項用。
- `web/src/scene/LayerPanel.tsx` -- 改成 `LayerList`（開關清單＋來源註記），放進更多清單；按鈕與浮層刪掉。
- `web/src/scene/FlowLegend.tsx` -- 文字照用；「流向已關閉」改指「⋯更多」的「圖層」。
- 新 `web/src/scene/HomeDeck.tsx` -- 底座（TimeBar 或 MoreMenu ＋ 三顆）、`MoreMenu`、`RecenterButton`、`RideEnd`／分享目標組法。
- `web/src/find/FindStation.tsx` -- 搜尋面板開關改由呼叫端控制（open/onOpenChange），不再畫自己的 find-main。
- `web/src/state/view.ts` -- 加 `away`（鏡頭離開開場構圖）與 setAway；Ride 加 `left?`（下車了）。
- `web/src/state/ride.ts` -- 加 `endRide()`、`atLineEnd()`。
- `web/src/scene/CameraRig.tsx` -- 'control' 事件 → setAway(true)；home() 與直橫切換回開場 → setAway(false)。
- `web/src/scene/Selection.tsx` -- 飛向選取時 setAway(true)。
- `web/src/share/SharePanel.tsx` -- ShareTarget 加選填 `heading`；copiedKind 搭乘中回 "station"（是站的連結，不加新 kind）。
- `web/src/scene/scene.css`、`web/src/find/find.css`、`web/src/share/share.css` -- 底座、清單、膠囊、下車小卡的樣式；刪舊的上方按鈕、ride-start、find-main。
- `DESIGN.md` -- 互動與版面改寫成版本 C。

## Tasks & Acceptance

**Execution:**
- [ ] `web/src/state/view.ts`, `web/src/state/ride.ts` -- away、left、endRide、atLineEnd -- 狀態在 state/。
- [ ] `web/src/scene/CameraRig.tsx`, `Selection.tsx` -- 設 away -- 回到全景的出現條件。
- [ ] `web/src/scene/TimeBar.tsx`, `LayerPanel.tsx`, `FlowLegend.tsx` -- 拆小、重用 -- 收進底座與清單。
- [ ] `web/src/scene/HomeDeck.tsx` -- 底座、更多清單、回到全景膠囊、下車小卡 -- 三條路。
- [ ] `web/src/find/FindStation.tsx`, `web/src/scene/ScenePage.tsx` -- 組裝 -- 取代 8.6 暫時入口與上方按鈕。
- [ ] CSS 三檔 -- 樣式（token、reduced-motion）。
- [ ] `web/src/scene/HomeDeck.test.tsx` -- 首頁 DOM、更多清單、回到全景條件、endRide／atLineEnd、分享連結 -- verify 的 vitest。
- [ ] `DESIGN.md` -- 記版本 C。
- [ ] `design/reviews/3.24-home-paths/impl-*.png` -- Playwright 截圖與檢查。

**Acceptance Criteria:**
- Given 建置版首頁沒開卡、鏡頭沒動，when 看 DOM，then 只有搭板南線、找你的站、播放、時間軸與月份日型、平日／假日、⋯更多；沒有分享這一刻、圖層、1x、靜態、回到全景與兩行說明。
- Given ⋯更多，when 按分享這一刻、圖層、播放速度、靜態模式、怎麼看這張圖，then 各自功能和改之前相同。
- Given 按搭板南線，when 到終點或按下車，then 看得到分享鈕；複製的連結新分頁打開回到同一站、暫停中。
- Given 按找你的站，when 選一站，then 開車站卡（摘要一句答案、上滑看完整、可查通勤）。
- Given 390×844，then 首頁 HUD ≤ 35%，點擊目標 ≥ 44px；reduced-motion 時沒有滑動、彈出。

## Implementation Notes

- 沒有可用的子代理，直接照 plan 實作（step-03 允許）。CHECKPOINT 1 由協調者轉達的 Piwi 決定（2026-11-21）視為已核准。
- 新檔 `web/src/scene/HomeDeck.tsx`（HomeDeck、MoreMenu、RecenterButton、RideShare、RideEnd、momentTarget、rideTarget）與 `HomeDeck.test.tsx`（13 條）。舊的 ShareMoment、RideStart、上方回到全景與 LayerPanel 按鈕、find-main、ride-start、時間軸刻度與 1x／靜態鍵都拿掉，樣式一併刪。
- 「回到全景」的條件最後只看 `away`：選取時 SelectionCamera 飛走也設 away，所以「選了東西」照樣出現；按了 home() 清掉 away，卡片還開著也收起（票面「按了…收起」；原型 C 也是同一個旗標）。
- 到終點的判斷用 rideMotion 的 i／dir（`atLineEnd()`）：上車的起點站不算；restore 的連結停在端點站時方向朝另一頭，也不算。
- 下車改成 `endRide()`：ride 留著並標 `left`，搭乘停住、收起停靠的車站卡；網址照 8.6 寫 ride＋station。按「回到首頁」才 leaveRide()＋回到全景。行進中按下車時小卡寫「在 X 附近下車」（X＝剛離開的站，連結也回到 X）。
- share_link_copied 的 kind：搭乘中（含下車後）回 "station"（是站的連結），沒有新增 AD-20 的 kind。
- 底座在搜尋、通勤面板開著時用 hidden 收起（元素留著，面板關掉時焦點回到「找你的站」）；ScenePage 量安全區改量 `.scene-dock:not([hidden]), .card` 與膠囊。
- 「關於」：3.17 還沒做、程式裡沒有任何關於內容，清單不放這一項；3.17 要把它加進 `MoreMenu`。
- 測試沒有 DOM：HomeDeck.test 用 tokens.css 原文 stub `getComputedStyle`（時間軸的天色漸層讀 token）。

## Plan Change Log

## Review Triage Log

- 2026-11-21 第 1 輪（quick）：這個環境沒有子代理，quick lens 由實作者自己逐檔檢查 diff（相對 baseline）代替；建議合併前另開 session 跑 bmad-code-review。high 0／medium 0／low 2／false 0／maybe-false 0。
  - low（reject）：`.scene-top` 仍保留 56px 高，流向標籤的上方安全區沒有因為拿掉上方按鈕而放大——只影響天空那一帶，不擋任何東西；改了要動標籤量測，不值得。
  - low（reject）：更多清單打開時 HUD 約占 39.5%（Playwright `2-more-open`），超過首頁的 35%——是暫時翻開的清單（原型 C 一樣），沒動過的首頁 19.5%；碰到場景就翻回。

## Design Notes

「⋯更多」清單與搜尋面板的開關是暫時的 UI 狀態，照 4.1 FindStation、舊 LayerPanel 的前例放在元件（ScenePage）裡，不進網址、不保存；`away` 跨 Canvas 內外（CameraRig、Selection 寫，膠囊讀），放 state/view.ts。下車後 ride 不清掉（`left: true`），分享連結才會是 `ride=BL&station=X`；按「回到首頁」才 leaveRide()。

## Verification

**Commands:**
- `cd web && npm ci && npm test && npm run build` -- expected: 全部通過
- `uv run _bmad/method/scripts/tickets.py --project-root . status _bmad-output/initiative-city-breath` -- expected: 沒有 undeclared/unpinned（已知 order_conflict 可）

**Manual checks (if no CLI):**
- Playwright 390×844 DPR 2：首頁、更多翻開、拖鏡頭與選區後的回到全景、搭乘下車分享面板、找你的站、reduced-motion、無 console error；截圖 `design/reviews/3.24-home-paths/impl-*.png` 對照原型 C。
