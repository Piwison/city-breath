---
title: '時間軸播放與日型切換'
type: 'feature'
ticket: '3'
created: '2026-11-11'
status: done
baseline_revision: 'e87978a8cf7c206aa34de49bf940a55c6515ae59'
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

**Problem:** 3.5 的時間軸是最小版：沒有時段名、不寫回網址（重新整理就回到清晨）、沒有播放速度與靜態模式、拖曳條看不出 2–4 點停止營運，圖例沒說橘色代表什麼（走查 F5）；原型的「靜態模式」按了看不出差別（走查小問題）。

**Approach:** 照原型移植並補齊：時間軸顯示時段名，播放中跨進新時段時上方浮出時段名；hour、dayType 由 `state/url.ts` 同步回網址；1x／2x 播放速度；靜態模式（停止播放、跳到 8 點、光點換成依人數分級粗細的靜態光帶、按鈕顯示開／關）；拖曳條與刻度標出停止營運；圖例依模式寫「橘＝全城流向」。

## Boundaries & Constraints

**Always:** 時段名、營運判斷、光帶分級、網址讀寫都是純函式並有 vitest；營運與否只看資料（整小時 `null`＝停止營運，AD-5），不寫死 2–4 點；網址只在 `state/url.ts` 讀寫（AD-16），保留它不認得的 query 鍵、鍵的順序固定，留給 3.15 加月份、行政區、站；畫面狀態（still、speed）只在 `state/view.ts`；播放時 React 只在整點重繪（時間文字、拖曳條仍由 rAF 直接寫 DOM）；光帶是一個合併幾何，與光點不同時畫（draw call 不增加，AD-6）；顏色只走 token；動畫時長只用 `--dur-*`，reduced-motion 時直接切換；系統減少動態時開場就是靜態模式。

**Never:** 不做「大日子」入口（7.4）、選區模式的圖例文字（3.6）、小卡內時間列（3.6）、城市睡覺狀態（3.4）；不加 gsap；不改資料契約、DESIGN.md、SKILL.md、tickets.toml、CLAUDE.md；不刪原型資料夾。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 時段名 | 平日 8 / 假日 8 / 18 / 23 / 3（null）/ 5 | 早晨通勤尖峰 / 假日早晨 / 傍晚下班尖峰 / 末班車時段 / 停止營運 / 第一班車前後 | — |
| 浮出 | 播放中時段名由 A 變 B；暫停中變；開場第一次 | 浮出 B；不浮出；不浮出 | — |
| 營運區段 | 24 小時中 2、3、4 為 null | `[[2, 5]]`（半開區間） | 全天營運＝空陣列 |
| 網址寫回 | hour 14、假日，原 query `?x=1&hour=8` | `day=holiday&hour=14&x=1` | replaceState 失敗就略過 |
| 網址讀 | `?month=2026-09&from=a&to=b&at=8` | 讀回 month 與 commute | 不合法值忽略 |
| 靜態模式開 | 播放中、14 點 | 停止、t＝8、still＝true | — |
| 靜態中按播放 | still＝true | still＝false、開始播放 | — |
| 2x | 播放 0.1 秒 | 前進 0.1 小時 | — |
| 光帶分級 | 人數 vs 圖例三值的中點 | 1／2／3 級；null 0 級（不畫） | — |

</frozen-after-approval>

## Code Map

- `web/src/state/view.ts` -- 加 `still`、`speed` 與 `setStill`、`setSpeed`；`time.t` 不變。
- `web/src/state/clock.ts` -- `advance` 乘 speed；新增 `setStillMode(on)`（開＝停止＋seek(8)）、`togglePlay()`（靜態中按播放先關靜態）；`startClock` 在減少動態時開靜態模式。
- `web/src/state/url.ts` -- `readQuery` 擴成讀 month、day、hour、from/to/at；`writeQuery(search, patch)` 合併並保留未知鍵；`syncUrl()` 訂閱 view，hour／dayType 變了節流 300ms 後 `history.replaceState`。
- `web/src/data/periods.ts`（新）-- `periodName(hour, dayType, operating)`、`periodHint(name)`、`shouldToast(prev, next, playing)`、`closedRanges(isOpen)`。
- `web/src/data/views.ts` -- `FlowSource.operating(dayType, hour)`；`bandTier(value, legend)`、`BAND_W`；`FlowMode`＝"city" 與 `FLOW_KEYS`（3.6 加 district）。
- `web/src/scene/Flows.tsx` -- `reduced` 改讀 `still`；光帶合併幾何（`--particle-hi` 混 `--flow-neutral`），still 時顯示光帶、藏光點。
- `web/src/scene/FlowLegend.tsx` -- 模式圖例「橘＝全城流向」；靜態時「一顆光點＝N 人」換成三級光帶圖例；bar 改用 `data-w`（場景寬），ScaleProbe 一起換算。
- `web/src/scene/TimeBar.tsx` -- 時段名（小元件只訂閱 hour）、速度鍵、靜態模式鍵、拖曳條停止營運斜紋與刻度（0／6／12／18／停駛）。
- `web/src/scene/PeriodToast.tsx`（新）-- 上方浮出時段名＋副標，1.7 秒後收；CSS transition。
- `web/src/scene/CameraRig.tsx` -- 減少動態或靜態模式時鏡頭直接切換。
- `web/src/scene/ScenePage.tsx` -- 讀網址、開 `syncUrl`、掛 PeriodToast、傳 source 給 TimeBar。
- `web/src/scene/scene.css`、`web/src/styles/tokens.css` -- mini 鍵、刻度、斜紋（新 token `--scrub-closed`）、toast（新時長 `--dur-enter`）。
- `design/prototypes/2.1-diorama/index.html` 425–441（hourTitle）、536–546（dock）、1457–1500（setStill、speed、toast）-- 移植來源，不刪。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/periods.ts`、`periods.test.ts` -- 時段名、浮出判斷、停止營運區段
- [x] `web/src/data/views.ts`、`views.test.ts` -- operating、bandTier、FLOW_KEYS
- [x] `web/src/state/view.ts`、`clock.ts`、`clock.test.ts` -- still、speed、靜態模式與播放
- [x] `web/src/state/url.ts`、`url.test.ts` -- 讀寫合併、syncUrl 節流
- [x] `web/src/scene/Flows.tsx`、`FlowLegend.tsx` -- 光帶與模式圖例
- [x] `web/src/scene/TimeBar.tsx`、`PeriodToast.tsx`、`CameraRig.tsx`、`ScenePage.tsx`、`scene.css`、`tokens.css` -- HUD
- [x] `design/reviews/3.3-timeline/` -- Playwright 截圖與原型同時刻並排

**Acceptance Criteria:**
- Given 首頁播放中, when 從 6 點跨進 7 點, then 上方浮出「早晨通勤尖峰」約 1.7 秒後收起；時間軸副標同時換字。
- Given 拖到 3 點, then 拖曳條該段有斜紋與「停駛」刻度、副標「停止營運」、圖例「停止營運：這個時段沒有列車」。
- Given 按「靜態」, then 畫面停在 08:00、光點換成光帶、按鈕顯示「開」、圖例換成光帶三級。
- Given `?hour=14&day=holiday` 重新整理, then 停在假日 14 點；切平日後網址變 `day=weekday`。
- Given reduced-motion, then 開場靜態模式已開、不播放、浮出與按鈕沒有位移動畫。
- Given 播放中, then React 只在整點與按鈕操作時重繪（時間文字與滑桿由 rAF 寫）。

## Implementation Notes

- 沒有 subagent 工具：實作直接在這個 session 做，review 也由本 session 依 Quick lens 的要求自審（見 Triage Log），和 3.5 相同。
- 這份 plan 約 2,000 tokens，超過 1,600 的建議值；由主 session 委派、一次做完，沒有拆。
- 網址：`readQuery` 擴成也讀 month、from/to/at（3.15、4.2 之後用得到），`writeQuery` 依固定順序重寫這幾個鍵、不認得的鍵原樣接在後面；`syncUrl()` 訂閱 view，hour／dayType 變了 300ms 後 `replaceState` 一次，開場也對一次（只有 `?hour=14` 會補成 `day=weekday&hour=14`）。擴充方法寫在 url.ts 開頭的註解。
- 靜態模式：`view.still` 是旗標，`clock.setStillMode()` 負責「停止、跳 8 點」；播放鍵走 `togglePlay()`，靜態中按播放＝關靜態再播放。系統減少動態時 `startClock` 開靜態模式。鏡頭在減少動態或靜態時都直接切換。
- 光帶：`Flows.tsx` 在既有的合併幾何旁多一個光帶 mesh（緞帶中線上、抬高 0.02、`--flow-neutral` 往 `--particle-hi` 推 70%），只在靜態時顯示；光點 InstancedMesh 在靜態時隱藏，所以同時 draw call 仍是緞帶＋箭頭＋（光點或光帶）。寬度：門檻是圖例三值的中點（2026-09：2 千、4.5 千），三級寬 0.2／0.45／0.75 場景單位、不超過緞帶寬的 55%（先試 0.35／0.8／1.35、八成，8 點的緞帶幾乎整條變白，圖例「橘＝全城流向」說不通，改窄）。舊的「減少動態時光點等距靜止」拿掉。
- 圖例改兩列：第一列線寬三段；第二列「■ 橘＝全城流向｜一顆光點＝N 人」，靜態時第二段換成「光帶 <2千 2–4.5千 ≥4.5千」。每個 bar 的場景寬放 `data-w`，`ScaleProbe` 不再需要 source。390 寬時 dock 約 148px（3.5 約 122px）。
- 拖曳條：停止營運斜紋（新 token `--scrub-closed`）與刻度 0／停駛／6／12／18，位置用 `calc(11px + (100% − 22px) × t/23.95)` 對齊圓鈕中心；Firefox 圓鈕改成 22px border-box 讓兩邊一致。`aria-valuetext` 在停止營運時加「停止營運」。
- 時段名：`data/periods.ts`（原型 hourTitle），營運與否只看 `FlowSource.operating()`。副標「9 月平日平均・早晨通勤尖峰」（月份縮成「9 月」才放得下）。浮出用 CSS transition（新 token `--dur-enter` 220ms，減少動態歸零），容器常駐、`data-open` 切換，計時器放 ref，換時段不會把上一個的收起計時器清掉而卡住。
- Playwright 390×844（swiftshader）實測：播放中 6:55 → 7 點浮出「早晨通勤尖峰／線條變粗、光點變快」；拖到 3 點副標「停止營運」、圖例「停止營運：這個時段沒有列車」、網址 `?day=weekday&hour=3`；`?hour=14` 按靜態 → 08:00、按鈕「靜態 開」、圖例換光帶；`?hour=14&day=holiday` 切平日 → 網址 `?day=weekday&hour=14`，重新整理回到平日 14:00；reduced-motion 開場 08:00、靜態開、不播放。截圖與原型並排在 `design/reviews/3.3-timeline/`。原型的時段名浮出在無頭瀏覽器裡沒截到（gsap 補間在 1–2 fps 下沒跑完就被收起），所以那張對照只有時間軸。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審）：high 0、medium 1、low 3、false 0、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| medium | patch | 光帶太寬（八成緞帶寬、tier 3 1.35 單位）：8 點靜態截圖緞帶幾乎全變米白，和圖例「橘＝全城流向」矛盾；改成 0.2／0.45／0.75、上限 55%，重截確認兩側留橘。 |
| medium | patch | 時段名浮出的收起計時器原本放在 effect cleanup，時段換了但不該浮出（暫停中）時會清掉計時器、提示卡住不收；改成 ref 計時器，只在卸載時清。 |
| low | patch | 圖例在靜態模式排成三列，dock 超過約 140px 的版面；改成固定兩列、光帶標籤短寫。 |
| low | reject | 播放中切換平日／假日會浮出新的時段名（例如「假日早晨」）；原型同樣如此，算是切換的回饋，不改。 |
| low | reject | `replaceState` 失敗的分支（try/catch 略過）沒有測試；只是吞掉瀏覽器的例外，不加測試替身。 |

## Design Notes

- 預設做法（待 Piwi 確認）：播放中也寫網址（每整點一次、replaceState 不進歷史）；所以播放中重新整理會停在那一小時、不再自動播放。另一做法是播放中不寫 hour。
- 光帶分級的門檻＝圖例三值（例 1 千、3 千、6 千）的中點（2 千、4.5 千），由當月最大推得，不寫死；三級寬 0.2／0.45／0.75 場景單位，且不超過緞帶寬的 55%（兩側留橘，圖例「橘＝全城流向」仍成立）。8 點平日前 12 大是 3,143–5,912 人，會分成 2、3 兩級。
- 系統減少動態時開場就是靜態模式，使用者仍可關掉或按播放（明確選擇）；鏡頭在減少動態或靜態時都直接切換。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）：播放中浮出時段名、3 點停止營運、靜態模式、假日、reduced-motion，與原型同時刻並排，放 `design/reviews/3.3-timeline/`。
