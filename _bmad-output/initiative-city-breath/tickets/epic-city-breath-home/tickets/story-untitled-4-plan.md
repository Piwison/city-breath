---
title: '城市睡覺狀態'
type: 'feature'
ticket: '4'
created: '2026-11-12'
status: 'built'
baseline_revision: 'dcf2355127edc29756362319ff72483b1a2878cc'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 2–4 點停止營運時，場景只是流向突然消失、只有時間軸副標寫「停止營運」，一眼看不出「城市在睡覺」，也不知道什麼時候恢復；之後的車站柱（3.1）也沒有共用的停駛狀態可讀。

**Approach:** 在 `state/` 加一個營運時段模組（停駛與否只看資料、第一班車只看官方班距），場景依它安靜地入睡：流向與光點在停駛前約 15 分鐘淡出、路線暗下，上方常駐一個提示「捷運停駛中・約 6 點第一班車」（班距不足時只寫「捷運停駛中」），播放照常走過。

## Boundaries & Constraints

**Always:** 停駛只看 `district-flows.json` 整小時 `null`（AD-5），不寫死 2–4 點；第一班車時間只從 `basemap.json` 的 `headway` 推（該日型從現在往後第一個任一線班距不為 `null` 的整點），推不出就不寫時間；淡出程度是時刻 t 的純函式（不是另開動畫），減少動態時是階梯（直接切換）；提示的進出用 CSS transition（`--dur-enter`，減少動態歸零）；顏色只走 token；純函式都有 vitest；React 只在整點重繪。

**Never:** 不改站相關檔案（`DistrictStations.tsx`、`Selection.tsx` 的站部分、`data/traits.ts`）——停駛時站柱怎麼表現由 3.1 用本票的接口做；不做第一班車亮站波紋（3.14）、列車（3.14）；不改窗光公式（3.13 的 `windowsAt` 已在 0–6 點維持最少，只加測試確認）；不改 tickets.toml、DESIGN.md、SKILL.md、資料契約；不把停駛畫成 0。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 停駛判斷 | 2026-09 平日 1／3／5 點 | false／true／false | 資料未載入＝false |
| 第一班車 | 平日 3 點，班距 0–5 點 null、6 點有值 | 6 | 全部 null 或沒有 headway → null |
| 提示文字 | first＝6／null | 「捷運停駛中」＋「約 6 點第一班車」／只有「捷運停駛中」 | — |
| 入睡程度 | 停駛 [2,5)、t＝1.5／1.875／3／5 | 0／0.5／1／0 | reduced：1.99→0、2→1 |
| 時段名浮出 | 播放中進入停止營運 | 不浮出（常駐提示取代）；進入 5 點照常浮出 | — |

</frozen-after-approval>

## Code Map

- `web/src/data/periods.ts` -- 已有 `CLOSED`、`closedRanges`、`shouldToast`、`periodHint`（`[CLOSED]: "捷運休息中"`）。加 `firstTrainHour(headway, dayType, hour)`、`sleepHint(first)`、`sleepLevel(t, ranges, ramp)`；`shouldToast` 對 `CLOSED` 回 false、移除 `CLOSED` 的副標。
- `web/src/state/service.ts`（新）-- 營運時段 store：`setService({ isOpen, headway })`、`closedAt(dayType, hour)`、`firstTrainAt(dayType, hour)`、`sleepAt(t, dayType, reduced)`（快取每日型的 `closedRanges`）、React `useClosed()`。**3.1 的接口**：站元件 React 端 `useClosed()`、`useFrame` 內 `sleepAt(time.t, getView().dayType, reduced)`。
- `web/src/data/views.ts` `FlowSource.operating` -- 停駛來源，不改。`web/src/data/types.ts` `BasemapFile.headway`／`HeadwayHours` -- 班距，不改。
- `web/src/scene/ScenePage.tsx` -- 載入後 `setService({ isOpen: flows.operating, headway: basemap.headway })`、卸載清掉；掛 `<SleepHint />`。
- `web/src/scene/SleepHint.tsx`（新）-- 常駐提示，與 `PeriodToast` 同一個位置與 transition（容器常駐、`data-open`）；收起時保留文字讓淡出有內容。
- `web/src/scene/Flows.tsx` -- `useFrame` 內依 `sleepAt` 把緞帶、箭頭材質 opacity 乘 `1 − s`、光點縮小；s＝1 時整組不畫。整點的 `arcs` 不變（停駛小時本來就是 `flows: null`）。
- `web/src/scene/Rails.tsx` -- `useFrame` 內 `material.color.setScalar(1 − RAIL_SLEEP × s)`（亮度倍數、不是色碼）；s 沒變就不寫。
- `web/src/scene/PeriodToast.tsx`、`scene.css` -- toast 不浮出停止營運；`.sleep-hint` 樣式（同 `.period-toast`，月亮小圖用既有 `--moon-disc`）。
- `web/src/scene/daylight.ts` `windowsAt` -- 0–6 點 `lit` 已是最少 0.30，不改。
- 參考：`design/prototypes/2.1-diorama/index.html` 430（停止營運判斷）、1494（toast 副標）、1966（窗光）——原型沒有睡覺狀態，本票新增。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/periods.ts`、`periods.test.ts` -- firstTrainHour、sleepHint、sleepLevel、shouldToast 不浮停止營運 -- I/O 矩陣
- [x] `web/src/state/service.ts`、`service.test.ts` -- store、closedAt（用 2026-09 實際檔）、sleepAt、firstTrainAt
- [x] `web/src/scene/daylight.test.ts` -- 停駛各小時窗光等於深夜最少值
- [x] `web/src/scene/SleepHint.tsx`、`PeriodToast.tsx`、`scene.css`、`ScenePage.tsx` -- 提示與接線
- [x] `web/src/scene/Flows.tsx`、`Rails.tsx` -- 入睡淡出
- [x] `design/reviews/3.4-sleep/` -- Playwright 390×844：1、3、5 點、reduced-motion 3 點，與原型同時刻並排

**Acceptance Criteria:**
- Given 首頁 `?hour=3`, then 沒有緞帶與光點、路線變暗、上方提示「捷運停駛中・約 6 點第一班車」、時間軸副標「停止營運」與斜紋照舊。
- Given `?hour=1` 或 `?hour=5`, then 沒有睡覺提示、路線正常亮度。
- Given 播放中從 1 點走到 6 點, then 時間不停、流向在 2 點前淡出、提示在 2 點出現 5 點收起、5 點浮出「第一班車前後」。
- Given reduced-motion 停在 3 點, then 同樣的睡覺畫面，提示沒有位移動畫。

## Implementation Notes

- 沒有 subagent 工具：由主 session 委派的 agent 一次做完（plan、實作、自審、驗證），checkpoint 視為委派時已核准，要 Piwi 決定的寫在 Design Notes。
- `PeriodToast.tsx` 不必改：`shouldToast` 對 `CLOSED` 回 false 就夠了；`periodHint` 拿掉停止營運的「捷運休息中」（不會再浮出）。
- `sleepLevel` 照 I/O 矩陣只在停駛前淡入、5 點一到直接醒（第一版寫了停駛後也淡出 0.25 小時，與矩陣「t＝5 → 0」不符，改掉）。
- 流向：`Flows` 的 `useFrame` 依 `sleepAt` 改緞帶、箭頭、光帶材質 opacity，光點乘 `wake` 縮小，入睡過半收起前三大標籤；換幾何時重設，下一格重新套用。整點的 `arcs` 不變。
- 路線：`LineMaterial.color`（乘在頂點色上）`setScalar(1 − 0.55 × s)`；停駛時亮度 0.45 倍（線性空間）。
- `state/service.ts` 給 3.1 的接口寫在檔頭註解：React `useClosed()`、`useFrame` 內 `sleepAt(time.t, getView().dayType, reduced)`。
- Playwright 390×844（swiftshader）：`?hour=1`／`3`／`5`、reduced-motion `?hour=3`，與原型（`?debug` 設 `S.hour`）並排在 `design/reviews/3.4-sleep/`；另拍暫停在 1:54 的淡出途中。播放（2x）從 1:40 走到 6:10 沒有停：2 點提示出現、5 點收起並浮出「第一班車前後」、6 點浮出「城市醒來」，沒有頁面錯誤。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審，沒有 subagent 工具，同 3.3、3.5）：high 0、medium 0、low 3、false 1、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| low | reject（交 Piwi） | 3 點時睡覺提示正好蓋住月亮（月亮在畫面約 33% 寬、y≈125，提示在 y 102–138）；位置是 DESIGN.md「版面」上方提示區、與時段名共用，改位置要 Piwi 決定，寫進 Design Notes。 |
| low | reject | 5 點時睡覺提示淡出（220ms）與「第一班車前後」浮出短暫重疊在同一位置；只有一次 transition 的長度，不加互斥邏輯。 |
| low | reject | 無頭瀏覽器裡時間文字比整點狀態晚一格更新（rAF 寫 DOM、React 先換 hour），提示看起來在 01:50 就出現；是 3.3 起就有的低幀率現象，真機每格更新不會看到。 |
| false | — | 疑慮：`ribbons.body.visible` 被 R3F 的 `<primitive>` 重設。`<primitive>` 沒傳 `visible`，R3F 不會改它；換幾何時 `awake` 重設為 −1，下一格重新套用。 |

## Design Notes

- 第一班車用官方班距（6 點）而不是 OD 資料：OD 的 5 點有零星紀錄（2026-09 平日全市各格皆少於 10 人），但公告班距與營運從 6 點開始；5 點維持 3.3 的時段名「第一班車前後」。待 Piwi 確認文案「約 6 點第一班車」。
- 入睡程度：停駛前 0.25 小時（1x 播放約 0.5 秒）由 0 升到 1，停駛一結束（5 點）直接醒；拖到 1:50 會看到流向半透明。
- 路線變暗（亮度 × 0.45）是新的視覺語言（原型沒有）：表示「這時段沒有列車」，不是換色；待 Piwi 確認。
- 睡覺提示和時段名共用上方提示位置，3 點時正好蓋住月亮；另一個做法是放在時間軸上方（但 3.18 的「假日大家去哪」也要放那裡）。待 Piwi 決定。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 截圖放 `design/reviews/3.4-sleep/`，與原型同時刻並排。
