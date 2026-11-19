---
title: '同路人數、名次與早晚一小時'
type: 'feature'
ticket: '2'
created: '2026-11-19'
status: 'built'
baseline_revision: 'f4d8bd4a912c75e14b5ea639b581335a3b585837'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 4.1 的通勤面板選好起訖後只有骨架的一句話與「存成圖片」：沒有新卡框、一句答案、名次、前 5 目的地、早晚一小時比較，也沒有分享面板、通勤網址與計數（走查 A3、B1；產品計畫 v2 決定 10、11、17）。

**Approach:** 起訖都選好（且不同站）就在下方開一張通勤卡（共用 `CardFrame`：兩段高度、第一行一句答案、卡內時間列、標題列分享鈕），內容是同路人數、名次、這小時從起站出發的人、「早一點、晚一點出門呢？」三格（點了換時段）與起站前 5 目的地。通勤的時段跟著畫面的時刻（`view.hour`），網址加 `from`／`to`／`at`，分享面板的「存成圖片」用 4.3 版型、「複製連結」打開回到同一張通勤卡；三個事件各在對的時機送出。

## Boundaries & Constraints

**Always:** 人數經 `data/format.ts`（少於 10 人寫「少於 10 人」，含 aria-label、title、分享圖），名次在少於 10 人時不顯示；停駛時段寫「停止營運」不寫 0；一句答案寫明日型與時段（`whenLabel`），不用「此刻／現在」；顏色字型只用 `:root` token、transition 只用 `--dur-*`；畫面狀態只在 `web/src/state/`，網址只經 `state/url.ts`；分享圖由 `render.ts` 依資料重畫；`track()` 只用 AD-20 的事件名與 props；點擊目標 ≥ 36px（主要 44px）。

**Never:** 不改資料契約、管線、`computeCommute` 的算法；不改場景（不畫通勤緞帶）；不做行政區卡分享圖（3.16）與事件驗證（4.4）；不新增 `commute_input_started` 的送出點；不把最近用過的站寫進網址、分享卡或 `track()`。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般 | 頂溪→台北車站、平日 8 點 | 答案「平日 8 點，約 N 人和你一樣從頂溪到台北車站」；名次「第 k」（共 M 站） | — |
| 少於 10 人 | 同路格是 null 或 < 10 | 答案「…的人少於 10 人」不含數字；名次寫「不排名」；分享圖寫「少於 10 人」 | — |
| 停止營運 | 時段列換到 3 點 | 答案「平日 3 點捷運停止營運…」；三格中停駛的格寫「停止營運」且不能點 | — |
| 早晚一小時 | 8 點，點「7 點」那格 | 時段換成 7 點（`view.hour` 與 `commute.h`），數字更新；0 點的前一格是 23 點（和時間列一樣繞回） | — |
| 起訖同站 | o = d | 不開卡，面板寫「起站和迄站是同一站」 | — |
| 換起訖 | 卡上「‹ 換起訖站」 | 回到通勤面板，起站與時段保留、迄站清空 | — |
| 連結還原 | `?…&from=A&to=B&at=7` | 開好 A→B 7 點的通勤卡、暫停在 7 點 | 站不存在、迄站出站未入檔、A = B 或格式錯 → 退回全景並說明 |
| 網址 | 通勤卡開著並暫停 | 網址與複製的連結帶 `from`、`to`、`at`；關卡後拿掉 | — |
| commute_result_shown | 起訖的 od 分片載好、卡上出現結果 | 每組起訖送一次（換時段、換日型不重送；換了起訖或關卡後再開再送） | 載入中、載入失敗不送 |
| share_card_downloaded | 分享面板按「存成圖片」 | 存檔或系統分享成功送 `{kind:"commute"}` | 使用者取消、失敗不送 |
| share_link_copied | 通勤卡開著時複製連結 | 送 `{kind:"commute"}` | 複製失敗不送 |

</frozen-after-approval>

## Code Map

- `web/src/card/CardFrame.tsx` -- 共用卡框（`kicker`、`title`、`when`、`actions`、`back`、`answer`、`timeRow`、`onClose`）；不改。`CardTimeRow` 用 `seek()`，時段跟 `view.hour`。
- `web/src/card/StationCard.tsx` -- 參考的卡片寫法（`card-stats`、`card-rank`、`card-note`、`ShareAction`）；不改。
- `web/src/data/commute.ts` -- `computeCommute(shard, oi, di, dayType, h)`（null＝停止營運；`companions`、`rank`、`rankedOf`、`departures`、`top`）；加早晚一小時的純函式，不改原算法。
- `web/src/data/answer.ts` -- 一句答案；加 `commuteAnswer`。
- `web/src/data/format.ts`、`data/periods.ts`（`whenLabel`、`CLOSED`）-- 顯示人數與時段的唯一出處。
- `web/src/state/view.ts` -- `commute {o,d,h}`、`openCommute`、`setCommute`、`clearCommute`、`writeTime`、`closeCard`、`selectDistrict/Station`。
- `web/src/state/url.ts` -- `UrlState.commute`、`toQuery`（from/to/at）、`parseQuery`（已讀 from/to/at，不檢查）、`planLink`、`urlStateOf`、`dropsOf`、`syncUrl`、`clearViewQuery`、`shareLink`。
- `web/src/share/SharePanel.tsx` -- `ShareAction`／`SharePanel`（`target.image(url)` 有給才有「存成圖片」）、`copiedKind`、`onSave`（目前沒有計數）。
- `web/src/share/card.ts` `commuteCard()`、`render.ts` `drawCommute`／`saveShareCard`（回傳 shared/downloaded/cancelled）-- 4.3 版型，不改。
- `web/src/share/ShareButton.tsx`、`styles/app.css` `.share-button`／`.share-error` -- 只有 4.1 的骨架結果在用；改用分享面板後刪掉。
- `web/src/find/CommutePanel.tsx` -- `CommuteInput`、`CommuteForm`、`CommuteResult`（骨架結果，拿掉）、`CommuteData`；時段選單改成經 clock 換時段。
- `web/src/find/FindStation.tsx` -- `CommuteSheet`（自己載 meta）、`FallbackFind`；起訖齊了就不顯示表單。
- `web/src/scene/ScenePage.tsx` -- `Bottom`（時間軸／車站卡／行政區卡）、`ShareMoment`、連結還原的 effect、量測的 deps（`cardOpen`）。
- `web/src/scene/Selection.tsx` 第 112 行 -- 點空白處 `closeCard()` 只在有區或站時；通勤卡也要關。
- `web/src/scene/SceneFallback.tsx`、`scene/scene.css` `.scene-fallback` -- 替代頁也開同一張通勤卡（`.card` 是 absolute，替代頁要 fixed）。
- `web/src/state/view.track.test.ts`、`find/find.test.tsx`、`state/url.test.ts`、`data/answer.test.ts`、`data/commute.test.ts` -- 既有測試寫法（node 環境、`renderToStaticMarkup`、`vi.mock("../track")`）。
- `design/reviews/4.1-find-your-station/e2e.cjs` -- Playwright 腳本的寫法（建置版、390×844、DPR 2、DOM click）。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/answer.ts`＋測試 -- `commuteAnswer({ origin, dest, dayType, hour, operating, companions })`。
- [x] `web/src/data/commute.ts`＋測試 -- `nearbyHours(shard, oi, di, dayType, h)`：前一小時、這小時、後一小時（繞回）各自的同路人數與是否營運。
- [x] `web/src/state/view.ts`＋測試 -- `commuteReady()`；`writeTime` 時通勤開著就讓 `commute.h` 跟著；`openCommute` 暫停播放；`restoreCommute()`；`closeCard` 與打開別的區／站時收起通勤；`commuteResultShown(key)`（每組起訖一次，通勤不完整時重設）。
- [x] `web/src/state/url.ts`＋測試 -- 通勤進 `urlStateOf`／`dropsOf`／`syncUrl` 鍵；`parseQuery` 格式錯記 `commute`；`planLink` 檢查起訖存在、迄站出站有紀錄、不同站，restore 帶 `commute`；`clearViewQuery` 也拿掉通勤。
- [x] `web/src/share/SharePanel.tsx`＋測試 -- `copiedKind` 通勤優先；`saveAndCount()` 存檔成功送 `share_card_downloaded`（kind＝卡的 kind）。刪 `ShareButton.tsx` 與 `.share-button` 樣式。
- [x] `web/src/card/CommuteCard.tsx`（新）＋`card.css`＋測試 -- 通勤卡：答案、早晚一小時三格（點了 `pickHour`）、名次與這小時從起站出發、起站前 5 目的地（你的迄站標出）、月份與說明；分享鈕（有結果才有圖）；「‹ 換起訖站」清迄站；od 分片到了送 `commute_result_shown`。
- [x] `web/src/find/CommutePanel.tsx`、`FindStation.tsx`、`data/useMeta.ts`（新）-- 拿掉骨架結果；起訖齊了不顯示表單；時段選單經 clock；meta 用共用 hook；替代頁起訖齊了開通勤卡。
- [x] `web/src/scene/ScenePage.tsx`、`Selection.tsx`、`scene.css` -- `Bottom` 通勤卡優先；連結還原通勤；`cardOpen` 含通勤卡（量測、分享這一刻）；點空白處關通勤卡；替代頁的卡用 fixed。
- [x] `DESIGN.md` -- 「通勤卡」那行改成實際內容。
- [x] `design/reviews/4.2-commute-card/` -- Playwright 390×844（DPR 2）：卡片摘要／完整高度、一句答案、點 7 點那格、複製連結打開回到同一張卡、存成的圖（含少於 10 人）；截圖與 checks.json。
- [x] `_bmad-output/.../tickets.toml` 經 `tickets.py mark 4.1 done`。

**Acceptance Criteria:**
- Given 首頁選好起訖, when 看畫面, then 通勤卡露出約三分之一（摘要）、第一行是一句答案，往上滑到完整看得到三格、名次與前 5 目的地。
- Given 通勤卡在 8 點, when 點 7 點那格, then 卡內時間列、膠囊、答案與三格都換成 7 點的數字。
- Given 分享面板, when 複製連結並在新分頁打開, then 回到同一組起訖、同一時段與日型的通勤卡。
- Given 存成圖片, then 圖上有同路人數（或「少於 10 人」）、月份、來源與短網址。
- Given `npm test`、`npm run build` 與 ticket tree 檢查, then 全部通過。

## Implementation Notes

- 沒有可用的 coding／review 子代理：實作與 quick 審查都在同一個 session 進行（審查＝對照票的 verify、計畫 AC 與 CLAUDE.md 規則逐項看 diff 的自我審查）。
- 新檔：`web/src/card/CommuteCard.tsx`（`CommuteCard`／`CommuteCardView`／`commuteShareTarget`）、`web/src/data/useMeta.ts`（meta.json 共用 hook）。刪 `web/src/share/ShareButton.tsx` 與 `app.css` 的 `.share-button`、`find.css` 的 `.commute-result`。
- `pickHour` 從 `StationCard.tsx` 移到 `state/clock.ts`（StationCard 照舊匯出），通勤卡的三格、表單的時段選單、連結還原共用。
- `view.ts`：`writeTime` 在通勤開著時同步 `commute.h`；`openCommute`／`restoreCommute` 暫停播放；`commuteReady()`；`closeCard` 與打開別的區／站收起通勤；`commuteResultShown(o, d)` 以起訖組去重（StrictMode 的第二次 effect 也不重送）。
- `url.ts`：`ViewKey` 加 `commute`；`parseQuery` 三個鍵不齊或格式錯記 `commute`；`planLink` 加 `canBeDest`（環狀線不能當迄站）、起訖同站退回；`urlStateOf`／`dropsOf`／`syncUrl` 的鍵含通勤卡；`clearViewQuery` 也拿掉通勤（原本留著，3.15 的測試同步改）。
- `ScenePage`：`Bottom` 通勤卡優先（蓋在車站卡上，關掉露出車站卡）；開場 `startClock` 用 `at`；`anyCard` 含通勤卡（量測、「分享這一刻」收起）。`Selection.tsx`：點地圖（站、區、空白處）收起通勤卡。
- 替代頁：通勤卡經 portal 掛在 body（外框 `.hud` 的 backdrop-filter 會框住 fixed 的子元素），`.fallback-card-layer .card` 用 fixed；× 只清迄站回到面板；連結裡的通勤也還原。
- `SharePanel`：`copiedKind` 通勤優先；`saveAndCount()` 存檔／系統分享成功送 `share_card_downloaded`（kind＝卡的 kind），取消或丟錯不送；`onSave` 補 catch。
- Playwright（390×844、DPR 2、建置版）：`design/reviews/4.2-commute-card/e2e.cjs`，結果在同資料夾 `checks.json`、截圖與兩張存下來的圖（`5-saved-commute-7.png`、`9-saved-under-10.png`）。展開卡片用點把手（Playwright 的滑鼠拖曳在觸控情境不穩；拖曳在 3.22 驗過）；swiftshader 下兩個 WebGL 分頁同時開太慢，開新分頁前先關舊的。

## Plan Change Log

## Review Triage Log

Pass 1（quick，同 session 自我審查，對照票的 verify 逐項）：high 0／medium 2／low 3／false 1／maybe-false 0

| 發現 | 判定 | 去向 | 依據 |
| --- | --- | --- | --- |
| 替代頁的通勤卡被 `.scene-fallback-card`（`.hud` 的 backdrop-filter）框住，摘要露出 63%、下緣超出畫面 | medium | patch | 改用 portal 掛到 body；Playwright `9-fallback` visibleRatio 0.35 |
| 在卡片摘要高度點三格時，Playwright 捲動 overflow:hidden 的頁面點到地圖、卡片被關（真機不會捲） | medium（測試） | patch | e2e 先點把手展開再點格；`3-seven-oclock` 時段、答案、三格、網址都換成 7 點 |
| 替代頁的通勤面板在通勤卡開著時，會把卡內時間列停到的停駛時段跳回 8 點 | low | patch | `CommuteInput` 的停駛修正只在 `!commuteReady` 時做 |
| `share/ShareButton.tsx`、`.share-button`、`.commute-result` 樣式改用分享面板後沒人用 | low | patch | 刪除；`grep` 無其他引用 |
| FallbackFind 的 CommuteCard 縮排錯位 | low | patch | 重新縮排 |
| 換時段或日型時 `commute_result_shown` 不重送，「看到結果」次數偏低 | false | reject | 計畫 Design Notes：以起訖組為單位，避免一次查詢算成好幾次；4.4 讀指標時以此為準 |

票的 verify 逐項：vitest 涵蓋少於 10 人（answer.test、CommuteCard.test 的少於 10 人與兩個起站×每站×平假日×3 時段的掃描）、停止營運（answer.test、commute.test、CommuteCard.test）、名次（CommuteCard.test）、前後一小時（commute.test 含繞回、CommuteCard.test）與一句答案（answer.test）；點 7 點那格時段換成 7 點、數字更新（CommuteCard.test＋url.test 的 syncUrl＋Playwright `3-seven-oclock`）；卡片預設約三分之一（`1-card-peek` 0.35）、往上看完整（`2-card-full` 0.71）；複製的連結打開回到同一張通勤卡（`4-share` 剪貼簿＝面板網址、`5-link-roundtrip` sameCard，關掉露出車站卡）；存成的圖含同路人數、月份、來源與短網址（`5-saved-commute-7.png`、少於 10 人 `9-saved-under-10.png`，CommuteCard.test 驗資料）；三個事件各在對的時機（view.track.test）。CLAUDE.md 底線：顏色只用 token（tokens.test 掃過）、新 transition 用 `--dur-*`（`8-reduced-motion` 全 0s）、不編造數字、少於 10 人含 aria-label 與分享圖、狀態只在 state/、網址只經 url.ts、分享圖由 render.ts 重畫。

## Design Notes

- 時段只有一份：通勤卡的時段就是畫面的時刻。`writeTime` 在通勤開著時同步寫 `commute.h`，所以卡內時間列、三格、網址的 `hour` 與 `at` 永遠一致；表單的時段選單也改成 `seek()`。打開通勤面板暫停播放（和開卡一樣），免得時段跟著播放跑。
- 卡片只在一處：起訖齊了，`Bottom` 優先顯示通勤卡（蓋住車站卡）；關掉通勤卡回到底下原本的車站卡或時間軸。通勤面板（表單）只在起訖不齊時出現。
- 日型用畫面的平日／假日（DESIGN.md：小卡的卡內時間列有平日／假日），網址的 `day` 已在。
- `commute_result_shown` 以「起訖組」為單位：同一組換時段或日型不重送，避免把一次查詢算成好幾次。

## Verification

**Commands:**
- `cd web && npm ci && npm test && npm run build` -- expected: 全部通過
- `export UV_SYSTEM_CERTS=1; unset UV_NATIVE_TLS; uv run _bmad/method/scripts/tickets.py --project-root . status _bmad-output/initiative-city-breath > /dev/null` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright 390×844、DPR 2：見 Tasks 最後一項，結果在 `design/reviews/4.2-commute-card/checks.json`。
