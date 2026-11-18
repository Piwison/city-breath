---
title: '真機實測工具：?debug=perf 效能面板與測試步驟'
type: 'feature'
ticket: '4'
created: '2026-11-18'
status: done
baseline_revision: '5d3eb5a53fcf90c50bbb1adb69b524d84dbbba76'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 關卡 1 要 Piwi 在兩支真手機上量 5 個情境的 fps，但網站沒有量測工具，也沒有非工程師看得懂的測試步驟。

**Approach:** 這個 PR 只做工具（hitl 的實測由 Piwi 之後跑，6.4 不標 done）：`?debug=perf` 才以動態載入掛上的角落效能面板（目前／30 秒平均／最低 fps、DPR、光點數、draw call、畫質等級、首次載入秒數、一鍵複製文字摘要），以及 `design/reviews/6.4-device-check.md` 測試步驟與空白紀錄表。同一個 PR 依主 session 指示把 6.2 標 done。

## Boundaries & Constraints

**Always:** `debug` 只經 `web/src/state/url.ts` 讀（AD-16），分享網址（`shareUrl`／`shareLink`）不含它；面板程式在獨立分包，首包與 ScenePage 分包不含（`check-build.mjs` 檢查）；顏色、字型、時長只用 `:root` token；按鈕 ≥ `--tap`；避開 safe area；可收合。

**Never:** 不呼叫 `track()`；不改場景效能或畫面（不到 30 fps 由 Sofia 開票）；不標 6.4 done；不在結果欄填數字。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 開面板 | `?debug=perf` | 左上角出現收合的 fps 按鈕，點開看到全部數值 | — |
| 沒帶參數 | 無 `debug` 或 `debug=foo` | 不載入面板分包、畫面不變 | — |
| 分享 | `?debug=perf&station=…` 時複製連結 | 連結不含 `debug` | — |
| 複製 | 點「複製」 | 剪貼簿拿到文字摘要，按鈕顯示「已複製」 | 剪貼簿不可用時顯示文字框讓使用者長按複製 |
| 背景分頁 | 切到背景再回來 | 取樣重新開始，不把空白秒數算成 0 fps | — |

</frozen-after-approval>

## Code Map

- `web/src/state/url.ts` -- 加 `perfDebug(search)`；`writeQuery` 已保留不認得的鍵（網址列留著 debug），`toQuery` 只寫認得的鍵（分享不含）
- `web/src/scene/ScenePage.tsx` -- 帶 debug 時以 `lazy(import("../debug/PerfPanel"))` 在 Canvas 內掛探針、Canvas 外掛面板
- `web/src/scene/quality.ts` -- `useTier()` 給面板顯示 lite／full
- `web/src/scene/Flows.tsx`、`Trains.tsx` -- 光點與列車 InstancedMesh 加 `name`，探針用 `getObjectByName` 讀 `count`
- `web/src/boot.ts` -- `bootDone()` 記下時間，`bootSeconds()` 給面板
- `web/src/state/view.ts` -- `getView()` 讀時刻、日型、選取
- `web/scripts/check-build.mjs` -- 加分包檢查
- `web/src/styles/tokens.test.ts` -- 原始碼不得有色碼、時長要用 token（新 CSS 也受它檢查）

## Tasks & Acceptance

**Execution:**
- [x] `web/src/state/url.ts` + `url.test.ts` -- `perfDebug` 與分享排除測試
- [x] `web/src/debug/perfStats.ts` + `perfStats.test.ts` -- 純函式：30 秒視窗的目前、平均、最低（逐秒）fps
- [x] `web/src/debug/PerfPanel.tsx` + `perf.css` -- 探針、面板、摘要文字
- [x] `web/src/boot.ts`、`Flows.tsx`、`Trains.tsx`、`ScenePage.tsx` -- 接線
- [x] `web/scripts/check-build.mjs` -- 面板只在自己的分包
- [x] `design/reviews/6.4-device-check.md` -- 步驟、網址、空白紀錄表、LINE／Threads、決定 9
- [x] 6.2 標 done

**Acceptance Criteria:**
- Given 建置產物，when 跑 check-build，then 面板標記只出現在非首包、非 ScenePage 的分包
- Given Playwright 開 `?debug=perf`，then 看得到面板；不帶時沒有面板、也沒有請求面板分包

## Implementation Notes

- 2026-11-18 工具部分完成（PR：6.4 真機實測工具）。6.4 是 hitl：狀態維持 in-progress，等 Piwi 用兩支手機跑完、填好 `design/reviews/6.4-device-check.md` 並判定關卡 1，才標 done。
- 面板在 `web/src/debug/`（PerfPanel.tsx、perfStats.ts、perf.css）；ScenePage 以 `lazy()` 載入，建置後是獨立的 `PerfPanel-*.js` 與 CSS。
- fps 定義：目前＝最近 1 秒格數；平均＝30 秒視窗內（格數−1）÷ 第一格到最後一格的秒數；最低＝從量測當下往回切的完整 1 秒區段中最少的格數。切到背景回來自動重新計時；另有「重新計時」按鈕讓每個情境從 0 開始量。
- 粒子數＝流向光點 InstancedMesh（name `flow-dots`）的 count；另列列車數（name `trains`）。draw call 是 renderer.info.render.calls（上一格，含陰影）。
- 首次載入秒數＝`bootDone()` 時的 performance.now()（開始導航 → 品牌載入畫面收起＝場景第一格）。
- 建置副作用：PerfPanel 也用到 React 的 jsx-runtime，rolldown 把它拆成共用的 `jsx-runtime-*.js`（約 13 KB），首頁多一個 modulepreload；位元組是從首包搬出去的，沒有增加。
- Playwright（swiftshader、390×844）確認：不帶 debug 沒有面板、也沒請求 PerfPanel 分包；帶 `?debug=perf` 有面板、複製出的文字正確、網址列保留 debug。截圖在 `design/reviews/6.4-device-check/`。

## Plan Change Log

## Review Triage Log

- quick（自審）：high 0／medium 0／low 1。low：面板原本 z-index 2 會蓋住打開的通勤表單 → 已拿掉 z-index（patch）。

## Verification

**Commands:**
- `cd web && npm ci && npm test && npm run build` -- expected: 全過
- `uv run _bmad/method/scripts/tickets.py --project-root . status _bmad-output/initiative-city-breath > /dev/null` -- expected: exit 0
