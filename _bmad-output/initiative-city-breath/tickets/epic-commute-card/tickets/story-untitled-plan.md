---
title: '直式分享卡輸出'
type: 'feature'
ticket: '3'
created: '2026-11-10'
status: done
baseline_revision: '872f37d598e5b4ac30df2955dd8fdca249f88dee'
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

**Problem:** 三大族群 P0 唯一做不到的是分享（走查結論 1：A2、B2、C6）：通勤結果沒辦法存成圖，也沒有帶月份、來源與網址的直式卡。

**Approach:** 新增 `web/src/share/`：卡片資料模型（共用外框＋依 `kind` 換的內容區）、在離屏 canvas 依資料重畫 1080×1920 直式卡的 `render.ts`（AD-17），先實作通勤卡內容；顏色字型從 tokens.css 讀、依卡片時段決定日夜；網址由新的 `state/url.ts` 產生；接在骨架的通勤結果上加「存成圖片」。

## Boundaries & Constraints

**Always:** 只讀 `web/public/data/` 已載入的資料與 `meta.json`（AD-1）；少於 10 人寫「少於 10 人」、不畫數字也不反推（AD-3）；顏色、字型、字級只來自 tokens.css（AD-8），canvas 也不寫色碼；繪字前等 `document.fonts.ready` 與 `document.fonts.load`；卡上有資料月份、資料來源、網址（C6）；文案寫「h 點出發」（AD-15）；任何新 transition 用 `--dur-*`（reduced-motion 歸零）；版型讓 4.5 行政區卡、7.7 活動卡只要加一種 `kind` 與一個內容繪製函式。

**Never:** 不截場景、不讀 WebGL 緩衝（AD-17）；不放街廓、樹、地標造型、列車、雲等示意元素（AD-23）；不做計數（4.4）、不做行政區卡與活動卡內容（4.5、7.7）、不改正式入口（4.1）；不自帶字型檔；不改資料契約。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般數字 | 平日 8 點，同路 214 人、名次 3／87 | 卡上 `214 人`、名次句、起迄站名、月份、來源、網址 | — |
| 少於 10 人 | companions = null | 寫「少於 10 人」，不出現任何同路數字、不寫名次 | — |
| 長站名 | 站名超過內容寬 | 先縮字到下限，仍太寬就換行，全部留在面板內 | — |
| 夜間 | 23 點 | 天空用夜相位、面板用夜晚 HUD token | — |
| 停止營運 | 結果為 null | 不出現「存成圖片」 | — |
| 字型或 canvas 不可用 | `toBlob` 回 null | — | 按鈕旁顯示「圖片產生失敗，請再試一次」 |

</frozen-after-approval>

## Code Map

- `web/src/data/commute.ts` -- `computeCommute()`、`formatCount()`（null→「少於 10 人」）、`SUPPRESS_BELOW`；重用，不改。
- `web/src/data/types.ts` -- `MetaFile`（`month`、`source.name/publisher/url`、`dayCounts`）、`Station.id/display`、`DayType`；不改。
- `web/src/styles/tokens.ts` -- `parseColor`、`tokenAt(name, h, read)`、`hudPhase(h)`、`TokenReader`；新增從 CSS 原文讀 `:root`／夜晚區塊的 reader 與 Rgba→canvas 色字串。
- `web/src/styles/tokens.css` -- 色票與 `--text-*`、`--radius`、`--font`；不改值。
- `web/src/styles/tokens.test.ts` -- 會掃 `web/src` 所有 ts/tsx/css 擋色碼（`#hex`、`rgb(` 等）與寫死的時長；新程式不得踩到。
- `web/src/App.tsx` -- 骨架 `CommuteForm`：`res`、`o`、`d`、`h`、`month`；加按鈕，需把 `meta` 傳入。
- `web/src/styles/app.css` -- 骨架版面；加按鈕與錯誤訊息樣式。
- `web/vite.config.ts` -- vitest `environment: "node"`、`css: true`（`?raw` 可讀 CSS）。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/styles/tokens.ts` -- 加 `cssTokenReader(css, phase)`（解析 tokens.css 原文的 `:root`，夜晚再覆寫 `:root[data-phase="night"]`）與 `canvasColor(rgba)`（輸出 `#rrggbbaa`）；測試補在 `tokens.test.ts` -- 卡片的日夜跟卡片時段走，不跟目前頁面的 `data-phase`。
- [x] `web/src/state/url.ts` -- `shareUrl(state, base)`：month、日型、時段、起迄站 ID（AD-2）序列化成 query；`siteLabel(url)` 給卡上印的短網址；附 `url.test.ts` -- AD-16 的種子，3.x 時間軸票擴充。
- [x] `web/src/share/card.ts` -- `ShareCard` 型別（共用外框：`kind`、`hour`、`dayType`、`footer`）、`CommuteCard`、`commuteCard()`、`cardFooter(meta, dayType, url)` -- 文字由資料組出，可測。
- [x] `web/src/share/render.ts` -- 尺寸常數、`resolveTheme(hour, read)`、`drawShareCard(ctx, card, theme)`（共用外框＋`CONTENT[kind]`）、`fitText`／換行、`renderShareCard()`（等字型、離屏 canvas、`toBlob`）、`saveShareCard()`（可分享檔案就用 Web Share，否則下載） -- AD-17 單一版型。
- [x] `web/src/share/render.test.ts` -- 以記錄用的假 context 驗 I/O 矩陣：少於 10 人、數字、長站名不出界、夜間色、月份來源網址都在、9:16 與安全區。
- [x] `web/src/App.tsx`、`web/src/styles/app.css` -- 通勤結果下加「存成圖片」、產生中與失敗狀態。
- [x] `web/share-preview.html`、`web/scripts/share-samples.mjs` -- 開發用預覽頁（不進 build）與 Playwright 樣張腳本；輸出到 `design/reviews/4.3-share-card/`。

**Acceptance Criteria:**
- Given 骨架通勤結果, when 按「存成圖片」, then 得到 1080×1920 PNG，含資料月份、資料來源、網址三項，且三項都在 IG 限動上下安全區之內。
- Given `npm test`, then 少於 10 人的卡繪出的文字含「少於 10 人」且不含該組數字。
- Given 樣張腳本, then `design/reviews/4.3-share-card/` 有一般、少於 10 人、長站名、夜間四張 PNG。

## Implementation Notes

- 沒有可用的 coding／review 子代理，實作與 quick 審查都在同一個 session 內進行（審查改為逐項對照計畫 AC、CLAUDE.md 規則與 diff 的自我檢查）。
- 檢查 tokens 的測試會擋 `color(` 這種寫法（CSS color() 函式），所以 render.ts 讀色的小工具叫 `tok`。
- 大數字與「少於 10 人」用 `--hud-ink`，不用 `--commute`：通勤色在夜晚面板上對比約 3:1，只留給路線與站珠。「少於 10 人」字串取自 `formatCount(null)`，門檻不在 render.ts 重複。
- 面板加一圈 `--hud-line` 細框（同 `.hud`），夜裡面板才和夜空分得開。
- 斷行：英數與網址不拆、句讀不放行首、左括號不放行尾，數字與單位之間用 NBSP（「第 3 熱門」「共 67 站」不被拆開）。
- 與 Design Notes 的差異：Web Share 只帶圖片檔，沒有帶深連結 `url`；iOS 上同時帶 files 與 url 時部分 App 會丟掉圖片。深連結仍由 `shareUrl()` 產生，卡上印 `siteLabel()`。
- 骨架「存成圖片」按鈕底色 `--commute`、字色 `--station`（日夜都約 5.7:1；`--hud-on` 在夜晚只有約 3:1）。
- 樣張：`web/share-preview.html`＋`src/share/preview.ts`（dev 專用，不進 build），`web/scripts/share-samples.mjs` 取回 render.ts 實際產生的 PNG；四個情境都是 2026-09 真實起訖。真實站名最長 8 字，一行放得下；超長站名的縮字換行由 vitest 驗。
- 手動驗證（Playwright）：桌面與 390×844＋reduced-motion 兩種，按「存成圖片」都下載到 1080×1920 PNG；把 `toBlob` 改成回 null 時出現「圖片產生失敗，請再試一次」。停止營運時段在骨架選單裡選不到，`computeCommute` 回 null 時按鈕不出現（`res && asked` 才渲染）。

## Plan Change Log

## Review Triage Log

Pass 1（quick，同 session 自我審查）：high 0／medium 0／low 3／false 1／maybe-false 1

| 發現 | 判定 | 去向 | 依據 |
| --- | --- | --- | --- |
| render.ts 寫死「少於 10 人」，與 `SUPPRESS_BELOW` 兩個來源 | low | patch | 改用 `formatCount(null)`，測試照過 |
| share-samples.mjs 依賴未列在 package.json 的 playwright | low | patch | 檔頭註明需要已安裝的 playwright 與 Chromium |
| Web Share 沒帶深連結，與 Design Notes 不同 | low | patch | 刻意取捨（iOS 會丟圖），記在 Implementation Notes |
| 內容超出 box 時數字區與說明會重疊 | false | reject | 站名最多兩行、縮到 `--text-md`；vitest 以 20 多字的起訖站驗過每行不出界、不重疊 |
| iOS Safari 在 await 產圖後呼叫 `navigator.share` 可能因使用者手勢失效而丟 NotAllowedError | maybe-false（若成立為 medium） | defer | 失敗時會改走下載，不會壞；要在 iPhone 實機按一次確認 |

## Design Notes

- 卡片時段決定外觀：天空漸層取 `tokenAt('--sky-top'|'--sky-horizon', h + 0.5)`，面板與字色依 `hudPhase(h + 0.5)` 取白天或夜晚 HUD token；所以從 tokens.css 原文讀（`?raw`），不讀 `getComputedStyle`（那只看得到目前頁面的相位）。
- 尺寸：390px 手機稿放大到 1080 寬（×1080/390），字級、圓角從 token 換算，不另訂數字。
- 擴充：`ShareCard = CommuteCard | …`，`CONTENT: { [K in kind]: (ctx, box, card, theme) => void }`；4.5、7.7 只加型別成員與一個函式，外框（品牌列、日型時段、月份來源網址）不動。
- 卡上印 `siteLabel`（主機＋路徑），完整深連結交給 Web Share 的 `url`；圖上的長 query 讀不了也點不了。

## Verification

**Commands:**
- `cd web && npm test` -- expected: 全部通過，含新的 share、url、tokens 測試
- `cd web && npm run build` -- expected: tsc 與 vite build 成功
- `node web/scripts/share-samples.mjs` -- expected: 四張 PNG 寫進 `design/reviews/4.3-share-card/`

**Manual checks (if no CLI):**
- 看四張樣張：文字不出界、夜間可讀、少於 10 人沒有數字、頁尾三項齊全。
