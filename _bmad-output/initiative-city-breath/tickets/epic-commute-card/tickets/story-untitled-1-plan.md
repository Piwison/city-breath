---
title: '找你的站：搜尋車站與起訖站輸入'
type: 'feature'
ticket: '1'
created: '2026-11-19'
status: done
baseline_revision: '5dd31183acd9d42df04bbdf71f86aaa8981ce548'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 主要入口還是左上角的「找你的通勤」與三個原生下拉選單：拇指搆不到、不能打字、依筆畫排序找不到自己的站，也不記得上次用過哪站（產品計畫 v2 決定 1、15；走查 F3、A1、A4、A7）。

**Approach:** 下方一顆主按鈕「找你的站」打開可打字、依路線分組的搜尋（最近用過的 5 站在最上面，經新的 `state/progress.ts` 記在瀏覽器）；選站＝`selectStation()`（鏡頭飛過去、開車站卡）。通勤輸入改成下方面板：起站、迄站用同一個搜尋挑，時段選單列 0–23 點、停駛時段標「停止營運」不能選；起訖都選好就直接顯示結果（沿用現有結果文字與存成圖片，4.2 換成通勤卡）。不支援 WebGL 的替代頁用同一個通勤面板與搜尋。

## Boundaries & Constraints

**Always:** 顏色字型只用 `:root` token，transition／animation 只用 `--dur-*`；人數經 `formatCount`（少於 10 人寫「少於 10 人」，含 aria-label）；畫面狀態只在 `web/src/state/`，網址只經 `state/url.ts`；最近用過的站只經 `state/progress.ts`、鍵 `city-breath:progress:v1`、只存站 ID 字串、最多 5 個、新的在前不重複，寫入時保留不認得的欄位，壞欄位當空的，localStorage 不能用、讀到壞 JSON 或寫入失敗時退回記憶體；讀出時略過當月 `stations.json` 沒有的站；打開搜尋送 `track("commute_input_started")`；點擊目標 ≥ 44px（`--tap`）；畫面上不用「此刻」「現在」。

**Never:** 不把最近用過的站寫進網址、分享卡或 `track()`；不改資料契約、管線或 `basemap.json`；不在前端推算行政區；不做通勤卡、通勤網址、`commute_result_shown`（4.2）與計數驗證（4.4）；不改車站卡內容（只沿用它的「從這站找通勤」）；不寫死站名清單或暱稱表。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 打字找站 | 輸入「忠孝」 | 列出忠孝復興、忠孝新生、忠孝敦化（各自在所屬路線下） | — |
| 臺／台、尾字「站」 | 「臺北車站」「大橋頭站」 | 找到台北車站、大橋頭 | — |
| 轉乘站 | 不輸入 | 中山出現在淡水信義線與松山新店線兩組；路線依 basemap 順序，站依路線順序 | — |
| 最近用過 | 依序選 A…F 六站 | 清單最上面是 F E D C B，A 被擠掉；重選 C 移到最前 | — |
| 其他欄位 | 儲存裡已有 `{seenTips:[…]}` | 寫入最近用過的站後 `seenTips` 原樣保留 | — |
| 壞資料 | 儲存值不是 JSON，或 `recentStations` 不是字串陣列 | 當成空的，不丟錯 | 壞 JSON 時改用記憶體，不覆寫儲存 |
| 封鎖 localStorage | 存取丟錯 | 這次選過的站照樣列在最上面 | 不丟錯、不保存 |
| 當月沒有的站 | 最近用過含不存在的站 ID | 不列出 | — |
| 環狀線當迄站 | 迄站挑了出站未入檔的站 | 不設為迄站，顯示「環狀線沒有出站紀錄，不能當迄站」的說明 | — |
| 沒選站開通勤 | 沒有選中的站 | 起訖都是空的 | — |
| 已選一站開通勤 | 選中的站 X | 起站＝X、迄站空 | — |
| 時段選單 | meta.serviceHours 不含 2、3、4 | 2–4 點寫「停止營運」且 disabled | — |
| 打開搜尋 | 按主按鈕或起訖欄位 | 送一次 `commute_input_started`（不帶 props） | — |

</frozen-after-approval>

## Code Map

- `web/src/scene/ScenePage.tsx` -- 上方 `scene-top` 掛著 `<CommuteEntry />`（拿掉）；`Bottom` 決定時間軸或卡片；`measure()` 量 `.scene-dock, .card` 寫 `--dock-top` 與標籤安全區（要把主按鈕算進去）。資料 `Loaded.stations`（`StationIndex`，有 `stations`、`byId`、`lines(i)`）與 `lineNames` 已載好，搜尋直接用。
- `web/src/scene/CommuteEntry.tsx`、`web/src/commute/CommuteForm.tsx` -- 舊入口與表單（原生 select、送出按鈕）；換掉。結果段（文字＋`ShareButton`＋`commuteCard`＋`shareUrl`）搬進新面板，不改內容。
- `web/src/scene/SceneFallback.tsx` -- 替代頁放 `<CommuteForm />`；改成新面板（inline）。
- `web/src/state/view.ts` -- `commute: { o } | null`、`startCommute(o)`、`clearCommute()`；擴成 `{ o: string | null; d: string | null; h: number }`，加 `openCommute()`、`setCommute()`。`selectStation()` 已送 `station_opened`。`view.test.ts` 第 60–70 行測 startCommute 每次新物件。
- `web/src/scene/Selection.tsx` `SelectionCamera` -- `station` 變了就飛到站（減少動態直接切）；選站只呼叫 `selectStation()`，鏡頭不另寫。
- `web/src/card/StationCard.tsx` -- 「從這站找通勤」呼叫 `startCommute(s.id)`；保持。
- `web/src/track.ts` -- `track("commute_input_started")` 已在名單。
- `web/src/data/load.ts` -- `loadMonths`、`loadMeta`、`loadStations`、`loadBasemap`、`loadOdShard`（替代頁要自己載 basemap 拿路線）。
- `web/src/data/types.ts` -- `Station`（`id`、`name`、`display`、`lon/lat`、`exitsRecorded`）、`BasemapFile.lines`（路線順序與名稱）、`stationLines`（站 ID → 路線）、`MetaFile.serviceHours`。
- `web/src/data/views.ts` -- `lineToken(l)` 給路線色 token。
- `web/src/scene/scene.css` -- `.commute-pill`、`.commute-panel`、`.commute-form` 舊樣式（換掉）；`.sleep-hint` 用 `--dock-top` 擺在時間軸正上方（主按鈕出現時要往上讓）。
- `web/src/copy.test.ts`、`web/src/styles/tokens.test.ts` -- 掃原始碼擋「此刻／現在」、色碼與寫死時長。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/state/progress.ts`（新）＋測試 -- AD-22 模組：`recentStations()`、`rememberStation(id)`、`useRecentStations()`、測試用 `resetProgressForTest()`；整個物件讀寫、保留不認得的欄位、記憶體退路。
- [x] `web/src/data/stationSearch.ts`（新）＋測試 -- 路線分組模型（路線依 `basemap.lines`、站序由同線各站座標的最小生成樹推出路線順序、南端在前，支線接在主線後）、`matchStations(query)`（站名、正規站名、`/` 分段，臺→台、去尾字「站」、忽略空白與括號）、`recentIn(ids, model)`；用真實 2026-09 資料釘住淡水信義線、文湖線、中和新蘆線的順序。
- [x] `web/src/find/StationSearch.tsx`（新）-- 輸入框＋最近用過＋依路線分組的清單；`mode: "station" | "origin" | "dest"`；dest 模式出站未入檔的站標「不能當迄站」，點了顯示說明不選；環狀線組標頭寫明沒有出站紀錄。挑到的站寫 `rememberStation`。
- [x] `web/src/find/FindStation.tsx`（新）-- 主按鈕（沒開卡、沒開面板時在時間軸正上方）＋搜尋面板（打開送事件、聚焦輸入框、Esc／× 關閉；選站→`selectStation` 並關面板；底部「找通勤同路人」連到通勤面板）。
- [x] `web/src/find/CommutePanel.tsx`（新，取代 `CommuteForm.tsx`）-- 起站／迄站欄位打開同一個搜尋（送事件）、時段選單 0–23（不在 `serviceHours` 的標停止營運並 disabled）、起訖都選好自動算結果；結果段沿用舊表單。scene 版是下方面板（`view.commute` 非 null 時開），替代頁 inline。
- [x] `web/src/state/view.ts`＋`view.test.ts` -- commute 擴成 `{o,d,h}`；`openCommute(o?)` 預設帶入選中的站；`setCommute(patch)`；`startCommute` 保留。
- [x] `web/src/scene/ScenePage.tsx`、`SceneFallback.tsx`、`scene.css`（或 `find/find.css`）-- 拿掉左上入口、掛主按鈕與面板、量測含主按鈕、睡覺提示讓位；刪 `CommuteEntry.tsx`、`CommuteForm.tsx` 與舊樣式。
- [x] `DESIGN.md` -- 「版面」那句「4.1 實作時改這段」改成實際版面（主按鈕位置與面板）。
- [x] `design/reviews/4.1-find-your-station/` -- Playwright 390×844（DPR 2）截圖與檢查紀錄。

**Acceptance Criteria:**
- Given 首頁沒開卡, when 看畫面, then 「找你的站」在畫面下半部、高 ≥ 44px，左上角沒有「找你的通勤」；播放中也點得到。
- Given 搜尋面板, when 選一站, then 面板關閉、鏡頭飛到該站、車站卡打開；按「從這站找通勤」、點迄站、選一站，3 步內看到同路人結果。
- Given 選過幾站, when 重新整理再打開搜尋, then 最近用過的站還在最上面；網址與分享卡不含它們。
- Given `npm test` 與 `npm run build`, then 全部通過。

## Implementation Notes

- 沒有可用的 coding／review 子代理：實作與 quick 審查都在同一個 session 進行（審查改為對照票的 verify、計畫 AC 與 CLAUDE.md 規則逐項看 diff 的自我審查）。
- 新檔：`web/src/state/progress.ts`（AD-22，欄位 `recentStations`）、`web/src/data/stationSearch.ts`（搜尋模型、路線順序）、`web/src/find/`（`StationSearch`、`FindStation`、`CommutePanel`、`find.css`）。刪掉 `scene/CommuteEntry.tsx`、`commute/CommuteForm.tsx` 與 scene.css 的舊入口樣式。
- 搜尋模型在 ScenePage 載入時一起建（`Loaded.search`），沿用已載入的 stations.json 與 basemap.json，首頁資料量不變（288 KB）；替代頁自己載 basemap.json。meta.json 在通勤面板第一次打開才載。
- `view.commute` 擴成 `{ o, d, h }`；`openCommute()` 預設帶入選中的站、時段用畫面上的整點（停駛就換 8 點）；起訖都選好直接算，結果段沿用骨架文字與「存成圖片」（4.2 換成通勤卡）。
- 主按鈕放在下方 dock 容器裡、以 `--dock-top` 定位在時間軸正上方；ScenePage 量測加上主按鈕（標籤安全區與新變數 `--hint-bottom`），停駛提示改用 `--hint-bottom` 讓到主按鈕上面；主按鈕出現／收起用 MutationObserver 重量。
- 事件：主按鈕打開搜尋、通勤的起訖欄位打開搜尋各送一次 `commute_input_started`（`startSearch()`）；從主按鈕走到通勤結果會送兩次。
- 搜尋面板的 Esc 在捕獲階段接住並 preventDefault，蓋在下面的車站卡不跟著關（CardFrame 聽 window keydown）；分享面板（dialog）開著時讓給它。
- Playwright（390×844、DPR 2、建置版）：`design/reviews/4.1-find-your-station/e2e.cjs`，結果在同資料夾 `checks.json` 與 13 張截圖。點車站卡內的按鈕用 DOM click：Playwright 為了把摘要高度下的按鈕捲進畫面會捲動 overflow:hidden 的頁面（真機捲不動），截圖會失真。

## Plan Change Log

## Review Triage Log

Pass 1（quick，同 session 自我審查，對照票的 verify 逐項）：high 0／medium 1／low 3／false 1／maybe-false 0

| 發現 | 判定 | 去向 | 依據 |
| --- | --- | --- | --- |
| 通勤面板蓋在車站卡上時按 Esc，面板與車站卡一起關（CardFrame 聽 window keydown，先註冊先跑） | medium | patch | Sheet 改在捕獲階段接 Esc 並 preventDefault；Playwright `8b-esc-keeps-card` 驗卡片還在 |
| 搜尋面板開著時從「分享這一刻」開分享面板，Esc 會先關搜尋面板 | low | patch | 有 `dialog[open]` 時 Sheet 不接 Esc |
| 挑迄站時，清單下方又重複一次環狀線說明（被拒時與提示框重複） | low | patch | 拿掉清單下方那段；環狀線組標頭與通勤面板說明仍寫明 |
| Canvas 建立失敗（SceneBoundary）時，替代頁與首頁的主按鈕、通勤面板同時出現（兩個通勤輸入共用 `view.commute`） | low | reject | 只在 WebGL 可用但 Canvas 建立丟錯時發生，原本左上的「找你的通勤」也一樣疊著；修要在 ScenePage 加狀態傳遞，不是直接修正 |
| 打開搜尋的事件會在同一趟流程送兩次，輸入完成率偏低 | false | reject | 票寫「打開搜尋送 commute_input_started」，起訖欄位打開的也是同一個搜尋；照票做，已寫進 Implementation Notes 與 Design Notes 給 4.4 |

票的 verify 逐項：主按鈕在下半部、高 48px、左上沒有舊入口（checks `1-main-button`）；打「忠孝」三站（vitest＋`3-zhongxiao`）；中山在兩條線下（vitest＋`4-zhongshan`）；選站開車站卡、3 步看到同路人（`5-station-card`、`7-commute-result` steps=3）；環狀線當迄站的說明（`8-ring-dest`）；最近用過排最前、重新整理後還在、第 6 站擠掉最舊的（`9`、`10` 與 progress.test）；vitest 的 progress.ts 五項（只有站 ID 字串、最多 5、保留其他欄位、封鎖時列出且不報錯、當月沒有的略過）；網址與分享卡不含最近用過的站（progress.test、find.test、`10` urlHasRecent=false）；沒選站時起訖是空的（view.test、find.test）；2–4 點標停止營運（find.test、`6-commute-origin`）；打開搜尋送事件（find.test）。

## Design Notes

- 路線順序：資料沒有站序；同一條線的站以座標建最小生成樹，取最長路徑當主線（南端在前，和官方編號方向一致：文湖線動物園起、淡水信義線象山起、板南線頂埔起），其餘（中和新蘆線蘆洲支線）依接點往外接在主線後。純顯示用的檢視模型，不碰 AD-2 正規化與 AD-9 行政區；之後若管線輸出官方站序再換（記進 deferred-work）。
- 「別名」只用資料本身有的名字（`display`、`name`、`/` 分段），不在前端寫暱稱表（AD-2：站名正規化只在管線）。
- 開關面板是元件內的暫時 UI 狀態（沿用 CommuteEntry 的作法）；起訖與時段是 AD-16 的 `commute`，在 state。
- 事件：每次打開搜尋（主按鈕或起訖欄位）送一次；從主按鈕走到通勤結果會送兩次，4.4 讀輸入完成率時要知道。

## Verification

**Commands:**
- `cd web && npm ci && npm test && npm run build` -- expected: 全部通過
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS; uv run _bmad/method/scripts/tickets.py --project-root . status _bmad-output/initiative-city-breath > /dev/null` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright 390×844：主按鈕位置與大小、打「忠孝」、中山在兩條線下、選站開卡、重新整理後最近用過還在、環狀線當迄站的說明；截圖存 `design/reviews/4.1-find-your-station/`。
