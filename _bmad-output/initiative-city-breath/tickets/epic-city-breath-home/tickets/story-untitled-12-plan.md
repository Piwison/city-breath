---
title: '車站卡'
type: 'feature'
ticket: '12'
created: '2026-11-13'
status: 'in-progress'
baseline_revision: 'bf7ec0626f81e1c0f4b0f578d2ea003ed685df4a'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 點站只開到 3.6 的最小版小卡（此刻進、出、合計），看不出這站的個性、整天的起伏、這一小時大家從這裡去哪幾站哪幾區，也接不上通勤（走查 A4、C4、C5、A7；R1、R2）。

**Approach:** 照原型 renderStationCard 移植到 3.6 的共用卡框：個性（新的 `web/src/data/traits.ts` 從 stations.json 算每站指標與全線排名，挑排名前 20 的兩個特質）、此刻進站／出站／進出、整天 24 格長條（點了停播放並跳到那個時段）、這一小時前 5 目的地（od 分片，`views.ts`）與這 5 站依行政區加總的「去哪幾區」，地圖上把這 5 條換成站對站緞帶（藍、從起點畫出、點目的地聚焦並飛過去）；「從這站找通勤」把起站寫進 `state/view.ts` 的 `commute`，目前由現有的通勤面板帶入起站，4.1 接手。

## Boundaries & Constraints

**Always:** 特質、指標、排名只在 `traits.ts`（AD-26），純函式、vitest 以 2026-09 實算驗證，不寫死站名或數字；排名池＝出站有紀錄且平日有進出的站；環狀線站不排名、卡上寫出站「未入檔」並附說明（A7）；目的地的 `null` 不排名不當 0、排除同站進出，前端不反推（AD-3）；整小時 null＝停止營運（AD-5）；od 分片只在選了站才載（AD-6，load.ts 快取）；站對站緞帶走 `Flows` 同一個圖層、同一個線寬與光點換算（AD-19），端點經 `project()`（AD-12）；選站、聚焦、通勤起站只在 `state/view.ts`（AD-16）；顏色只走 token、每個動畫有 reduced-motion 版本（AD-8）；卡片沿用 CardFrame（打開就暫停、標明時段與日型）。

**Never:** 不做類型標籤、一句話、平假日曲線、整天前 10、同類型站、誰來這站（epic-station-personality）；不做通勤卡本身（4.1、4.2）、分享鈕與網址（3.15）、徽章、皇冠；不改 tickets.toml、DESIGN.md、SKILL.md、資料契約；不刪原型；不碰 3.14 的列車與雲。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 特質 | 蘆洲 2026-09 | 早上進出比全線第 1 等，最多 2 個前 20 | 早上進出比 ≤ 1 不算該方向 |
| 沒有前 20 的特質 | 例如七張 | 只寫平日一天人次與名次（不稱特質） | — |
| 環狀線站 | exitsRecorded=false | 不排名、沒有個性、出站「未入檔」＋說明、目的地照 od 分片 | — |
| 前 5 目的地 | 平日 8 點 | od 分片該列，排除自己與 null，由大到小 | 分片載入失敗：卡上寫失敗，其他照常 |
| 全都少於 10 人 | 這小時每格 null | 「每個方向都少於 10 人」 | — |
| 停止營運 | 3 點 | 「停止營運」，沒有緞帶，長條該格空 | — |
| 點長條 | 播放中點 17 點 | 停播放、hour=17、卡與緞帶更新 | — |
| 點目的地 | 點第 2 名 | 那條以外變淡、鏡頭飛到那條；可再開那站 | — |
| 從這站找通勤 | 按鈕 | `commute.o`＝這站，通勤面板打開並帶入起站 | — |

</frozen-after-approval>

## Code Map

- `web/src/data/traits.ts` -- 現有 `stationVolume`、`busiestStations`；新增 `stationMetrics`（W 平日全日進出、H、ratio、office、bed、evening、late、early、spike、peakH）、`traitRanks`、`stationTraits(i)`（前 20、最多 2 個，文案與倍數格式照原型 TRAITS）、`daySeries`（24 格長條）。
- `web/src/data/views.ts` -- 新增 `stationDestinations(shard, origin, dayType, hour, n=5)`、`destinationDistricts(top, stations)`、`stationFlows(...)`→`FlowHour`（from/to 為站 ID、kind out）；`FLOW_KEYS.station`。
- `web/src/data/useOdShard.ts`（新）-- `loadOdShard` 的 React hook（同月快取、換站取消）。
- `web/src/state/view.ts` -- `commute: { o: string } | null`、`startCommute(o)`；`selectStation` 換站清 focus。
- `web/src/card/StationCard.tsx`、`card.css` -- 全部卡片內容；長條按鈕 `seek(h)`＋`setPlaying(false)`。
- `web/src/scene/Flows.tsx` -- 選站時畫站對站（端點＝站的台地頂＋抬起＋柱頂）；名稱表加站名；情境鍵加 station 與分片是否到了。
- `web/src/scene/Selection.tsx` `SelectionCamera` -- focus 是站對站時飛到那條。
- `web/src/scene/CommuteEntry.tsx`、`commute/CommuteForm.tsx` -- 訂閱 `commute`，打開面板並帶入起站。
- `web/src/scene/ScenePage.tsx` -- 傳 StationIndex 給 Flows 與 StationCard 需要的資料（districts 名稱）。
- 重用：`CardFrame`、`whenLabel`、`monthLabel`、`seek`（clock.ts）、`pillarHeight`、`liftTarget`、`stationLabel`。
- 移植來源：`design/prototypes/2.1-diorama/index.html` 1035–1050（MET）、1630–1665（renderStationCard）、1676–1694（TRAITS、traitsOf）；不刪。

## Tasks & Acceptance

**Execution:**
- [ ] `web/src/data/traits.ts`、`traits.test.ts` -- 指標、排名、特質、長條；2026-09 實算（蘆洲、台大醫院、動物園、台北車站、環狀線）
- [ ] `web/src/data/views.ts`、`views.test.ts`、`useOdShard.ts` -- 前 5 目的地、去哪幾區、站對站 frame
- [ ] `web/src/state/view.ts`、`view.test.ts` -- commute 起站
- [ ] `web/src/card/StationCard.tsx`、`card.css`、`StationCard.test.tsx`（若有 DOM 測試環境，否則抽純函式測） -- 卡片；長條點擊跳時段、環狀線顯示
- [ ] `web/src/scene/Flows.tsx`、`Selection.tsx`、`ScenePage.tsx`、`CommuteEntry.tsx`、`commute/CommuteForm.tsx` -- 緞帶、鏡頭、通勤入口
- [ ] `design/reviews/3.12-station-card/` -- Playwright 390×844：蘆洲平日 8 點、台北車站、環狀線站、動物園假日、reduced-motion，與原型並排

**Acceptance Criteria:**
- Given 播放中, when 點一站, then 時間停住、卡上「平日 N 點」、看到個性、進出、整天長條、前 5 目的地與去哪幾區，地圖畫出 5 條藍色站對站緞帶。
- Given 車站卡, when 按 ›、切假日或點長條, then 卡與緞帶一起更新。
- Given 環狀線站, then 出站「未入檔」與說明，沒有個性。
- `npm test`、`npm run build` 通過。

## Implementation Notes

- 沒有 subagent 工具：實作與 Quick lens 自審都在這個 session 做（同 3.1、3.5、3.6、3.13）。Checkpoint 由協調者的委派訊息代替人工核准；要 Piwi 決定的列在 PR 說明。plan 約 1,700 tokens，略超 1,600，由委派一次做完、沒拆。
- **traits.ts（AD-26）**：`stationMetrics`（W 平日全日進出、H、ratio、office、bed、evening、late、early；分母 0 以 1 代替）、`traitBoard`（排名池＝出站有紀錄且平日有進出，2026-09 為 109 站；名次＝比它大的站數＋1，同分同名次；以 stations 陣列為鍵快取）、`stationTraits`（早上進出比只算大於 1 的方向；名次 ≤ 20 的取前 2；同名次照 METRIC_KEYS 順序；沒有前 20 → `fallback` 平日一天人次與名次，不稱特質）、`daySeries`、`times`／`percent`（原型 x2／pct）。尖峰倍數（AD-26 列的指標）沒有做：車站卡用不到，3.9 徽章要時加在同一檔。
- **2026-09 實算**：蘆洲 早上進站是出站 13 倍（全線第 1）、晚上 6–10 點出站占 49.1%（第 1，平均 30.8%）；台大醫院 早上出站是進站 7.7 倍（第 1）；動物園 假日是平日 1.27 倍（第 1 高）；台北車站 平日一天約 295,042 人次（第 1）。109 站中 39 站沒有任何前 20 的特質（例：七張、三重、南港），卡上寫「這一站」＋平日人次與名次。
- **前 5 目的地**（views.ts `stationDestinations`）：od 分片該日型該小時一列，排除同站進出與 null，由大到小、同值依索引；整格 null＝停止營運。`destinationDistricts` 依迄站 `district`（AD-9）把這 5 站加總，卡上註明「上面 5 站依所在區加總」。`stationFlows` → `FlowHour`（from/to 站 ID、kind out、同一個 dotScale）。
- **od 分片**：`data/useOdShard.ts` 給車站卡與 Flows 共用（load.ts 依路徑快取，一站只抓一次；換站時舊結果不寫入、也不拿舊站的分片畫新站）。
- **地圖**：選站時 Flows 把流向換成站對站（藍），端點在站珠頂（台地頂＋liftTarget＋這一小時的柱高＋0.55）；分片未到時不畫（不是停止營運）；名稱表加站名，弧頂標籤寫「蘆洲 → 松江南京 383 人」。情境鍵加 station 與分片到了沒有，緞帶從這站畫出去；靜態模式與減少動態直接出現。聚焦站對站時 `SelectionCamera` 飛到那條的中點（距離 max(42, 跨距×2.1)）；取消聚焦飛回那站。
- **卡片**：CardFrame（打開就暫停、標題列「平日 8 點」）；kicker「車站・蘆洲區」；個性兩行；此刻進站／出站／進出（環狀線：出站「未入檔」、第三格「此刻進出（只算進站）」，並加一段說明為什麼沒有個性）；整天 24 格長條（按鈕，`scaleY` 高度、停止營運只留虛線底、目前的時段 `--hud-accent`，點了 `pickHour`＝停播放＋seek）；前 5 目的地（點了聚焦那條緞帶，再出現「看「X」這一站 ›」）；去哪幾區；「從這站找通勤」。
- **從這站找通勤**：`state/view.ts` 加 `commute: { o } | null`、`startCommute`、`clearCommute`（AD-16 的 commute，先只有起站）。`CommuteEntry` 看到 commute 就打開面板，`CommuteForm` 帶入起站、游標移到迄站；收起面板清掉。4.1 換成正式入口時接這個欄位。
- **測試**：traits.test.ts（合成站＋2026-09 實算，數字另外從 stations.json 直接加總比對）、destinations.test.ts（od 分片實檔比對）、StationCard.test.tsx（react-dom/server 輸出 HTML：蘆洲平日 8 點的個性／進出／前 5／去哪幾區、環狀線、少於 10 人、停止營運、聚焦、載入中與失敗；`pickHour` 停播放跳時段）、view.test.ts（commute）。
- 長條每格約 13px 寬（24 格放在手機卡片裡），低於 30px 的點擊目標；同一列旁邊有 ‹ › 可逐小時換，鍵盤也點得到。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審）：high 0、medium 0、low 2、false 0、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| low | patch | 環狀線站第三格標「此刻進站（人）」，和第一格同名同值，看起來像重複；改成「此刻進出（只算進站）」。 |
| low | patch | 矩陣「點目的地」「分片載入失敗」沒有測試；StationCard.test.tsx 加聚焦後「看這站」與載入失敗兩個測試。 |

## Design Notes

- 原型的 traitsOf 在沒有前 20 時仍留排名最前的那一個；票面寫「排名前 20 的兩個特質」，2026-09 有 39／109 站沒有任何前 20。這裡照票面：沒有前 20 就不稱特質，只寫平日一天人次與名次（PR 列為要 Piwi 決定）。
- 原型「去哪幾區」加總整列公開的格子（前 4 區）；票面寫「這 5 站加總」，照票面，數字與上面 5 列加得起來。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）截圖放 `design/reviews/3.12-station-card/`，與原型同情境並排。
