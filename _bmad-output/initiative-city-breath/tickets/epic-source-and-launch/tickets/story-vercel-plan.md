---
title: '預覽部署：Vercel、計數骨架與品牌載入畫面'
type: 'feature'
ticket: '2'
created: '2026-11-18'
status: 'built'
baseline_revision: 'a492714542ef4af454d6bcc688346c937c7f0152'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 3.15 之後要有公開的 `*.vercel.app` 預覽網址給真機與分享連結實測（關卡 1 前置），但 repo 沒有部署設定、沒有計數出口；第一次打開的人在 three 分包下載完之前只看到一行灰字，資料又要等場景分包跑起來才開始抓。

**Approach:** repo 根目錄 `vercel.json`（建置 web/、快取與 noindex 標頭）＋`web/public/robots.txt`；`web/src/track.ts` 是唯一計數出口（AD-20），只在 Vercel 上建置時送出；品牌載入畫面寫在 index.html（首包 CSS 上色），場景第一格畫出後接場景；main.tsx 一啟動就同時抓首頁 JSON 與 import 場景分包。

**Decisions（主 session 2026-11-18 交辦）：** Vercel 專案建立、連 GitHub、開 Web Analytics 與環境變數 `VITE_SITE_URL` 由主 session 在本 PR 合併後做；verify 的部署項（自動部署、`curl -I`、Web Analytics 看到三個事件）在那之後驗。這張票順便把 3.15 標 done。

## Boundaries & Constraints

**Always:** 顏色與時長只走 token，reduced-motion 直接切換（AD-8）；`track()` 只接受 AD-20 的事件與 props，props 不放可識別個人的值；網址只由 url.ts 讀寫（`VITE_SITE_URL` 是預覽標籤的例外，AD-18）；首頁資料量 ≤ 300 KB（決定 29）；資料與 three 分包同時開始（AD-6）。

**Never:** 不登入或呼叫 Vercel；不綁網域；不載第三方網域腳本（Vercel 的 `/_vercel/insights/script.js` 是同網域）；不做整頁錯誤畫面（6.5）、開場提示（3.11）、真機量測（6.4）；不 commit 到 main、不合併。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 第一次打開 | 冷快取 | index.html 一到就有「城市呼吸」、一句話與進度條；JSON 與場景分包同時開始 | — |
| 場景就緒 | 場景第一格畫出 | 載入畫面淡出（`--dur-*`），reduced-motion 時直接移除 | — |
| 不支援 WebGL／資料失敗 | `hasWebGL()` false 或載入失敗 | 立刻收起載入畫面，顯示既有的靜態說明或錯誤訊息 | 錯誤畫面在 6.5 |
| 本機、測試、CI | 建置時沒有 `VERCEL=1` | `track()` 不送出、不注入 Vercel 腳本 | — |
| 不在名單的事件或 props | `track("x")`、`kind:"foo"`、多一個鍵 | 丟棄不送 | 開發時 console.warn |

</frozen-after-approval>

## Code Map

- `web/index.html` -- 加 `#boot` 品牌載入畫面（網站名、一句話、`role="progressbar"`）；%SITE_URL% 已由 vite.config 換掉。
- `web/src/styles/app.css` -- 首包 CSS（tokens＋base），放 `#boot` 樣式；舊 `.boot-status` 拿掉。
- `web/src/main.tsx` -- 現在用 `lazy(() => import("./scene/ScenePage"))`、`Suspense` fallback 一行字。改成模組一執行就 `import()` 場景與 `preloadHome()`。
- `web/src/data/load.ts` -- `getJson` 有 promise 快取；加 `preloadHome()` 回傳各檔 promise，ScenePage 再呼叫同一批函式會拿到快取。
- `web/src/scene/ScenePage.tsx` -- 資料到齊後才掛 `<Canvas>`；加第一格畫出的通知；`!webgl`、`error` 時收起載入畫面；拿掉「載入台北盆地中…」。
- `web/src/state/view.ts` -- `selectDistrict`、`selectStation`、`restoreSelection` 是唯一開卡的路徑，在這裡送 `district_opened`／`station_opened`。
- `web/src/share/SharePanel.tsx` -- `onCopy` 成功後送 `share_link_copied`，`kind` 由 `getView()` 判斷。
- `web/vite.config.ts` -- 用 `define` 注入 `__VERCEL_ANALYTICS__`（建置時 `VERCEL=1`）。
- `web/scripts/check-build.mjs` -- 加檢查：載入畫面文字逐字在 dist/index.html、robots.txt 在。
- 不要動：`state/url.ts` 的網址產生、`share/render.ts`、場景圖層。

## Tasks & Acceptance

**Execution:**
- [x] `vercel.json` -- installCommand／buildCommand／outputDirectory、framework null、三組 headers -- AD-18
- [x] `web/public/robots.txt` -- Disallow all（預覽期，6.3 改）
- [x] `web/src/track.ts`＋`track.test.ts` -- 事件與 props 白名單、只在 Vercel 送出 -- AD-20
- [x] `web/package.json` -- `@vercel/analytics` 固定 2.0.1（2026-03-12 發布）
- [x] `web/src/main.tsx`、`web/src/boot.ts`、`web/src/data/load.ts` -- 平行載入、進度、注入 analytics
- [x] `web/index.html`、`web/src/styles/app.css` -- 品牌載入畫面
- [x] `web/src/scene/ScenePage.tsx` -- 第一格畫出接場景、失敗時收起
- [x] `web/src/state/view.ts`、`web/src/share/SharePanel.tsx` -- 接三個事件
- [x] `web/scripts/check-build.mjs` -- 載入畫面與 robots 檢查
- [x] `web/scripts/boot-timing.mjs` -- Playwright：截圖、量請求開始時間 → `design/reviews/6.2-preview/`

**Acceptance Criteria:**
- Given 冷快取的 `vite preview`，when 打開首頁，then 1 秒內看得到「城市呼吸」「台北捷運的一天：每小時誰去了哪」與進度，場景就緒後換成場景。
- Given 同一次載入，when 看網路請求，then months/basemap JSON 與場景分包的開始時間相差在幾十毫秒內，不是等其中一個結束。
- Given vitest，when 跑 track.test，then 只接受 AD-20 的事件名與 props。

## Implementation Notes

- 這個工作階段沒有子代理工具：實作與 quick 審查都在同一個工作階段直接做（審查是讀完整 diff 逐項檢查，見 Review Triage Log）。
- `vercel.json`：`framework: null`（Vercel 的「Other」）。理由：網站在 `web/` 子資料夾、從 repo 根目錄建置，建置與輸出都已明寫（`cd web && npm ci`／`cd web && npm run build`／`web/dist`）；設成 vite 預設會假設專案在根目錄、輸出在 `dist`，跟這些覆寫打架，也不需要它的任何預設（單頁、網址只用 query string，不需要改寫規則）。三組標頭：`/(.*)` 的 `X-Robots-Tag: noindex`（6.3 拿掉）、`/data/(.*)` 的 `public, max-age=300`、`/assets/(.*)` 的 `public, max-age=31536000, immutable`（Vite 輸出的檔名帶內容雜湊）。欄位照 Vercel 官方 vercel.json 文件（`$schema`、`framework`、`installCommand`、`buildCommand`、`outputDirectory`、`headers[].source` 用 `/(.*)` 形式）。
- 計數：`@vercel/analytics` 固定 `2.0.1`（2026-03-12 發布，最新的正式版）。`__VERCEL_ANALYTICS__` 由 vite.config 的 `define` 在建置時決定（`VERCEL=1`），關掉時套件整個被 tree-shake 掉（首包不含 `/_vercel/insights`）；Vercel 上的建置首包多約 4 KB。`startAnalytics()` 的 `beforeSend` 拿掉網址的 query string 與 hash（站與通勤起訖不進後台）。事件名單照 AD-20，含 `event_day_opened`（AD-20 列了七個；票面寫六個，少列了活動日）。
- 開卡事件放在 `state/view.ts` 的 `selectDistrict`／`selectStation`／`restoreSelection`：這是開卡的唯一路徑（場景點選、行政區卡的站列、分享連結還原）。回到行政區卡、關卡、只改聚焦、同一張再點都不送。分享連結還原的卡也算打開。
- 載入畫面：`index.html` 的 `#boot`（文字逐字）、樣式在首包 `app.css`（用夜空相位 token，開場從 5.2 時播，暗接暗）；新 token `--dur-boot`（reduced-motion 歸零）。`src/boot.ts` 算進度（六件事：場景分包、months、basemap、三個首頁資料檔）並在場景第一格畫出後（`FirstFrame`）淡出；資料載入失敗與 `SceneFallback` 也收起。
- 平行載入：`main.tsx` 模組一執行就 `import("./scene/ScenePage")` 與 `preloadHome()`（load.ts，共用 getJson 快取）。
- `check-build.mjs` 加：載入畫面文字與進度在 dist/index.html、首包不含 three、首頁資料 ≤ 300,000 bytes（2026-09：288,379）、robots.txt。
- 量測（`web/scripts/boot-timing.mjs`，vite preview、390×844、冷快取、9 Mbps／60 ms）：第一次繪製 252 ms（含載入畫面）；場景分包 238 ms、months 242 ms、basemap 243 ms 開始，三個月份檔在 months 回來後 313 ms 開始；載入畫面在 swiftshader 下約 4.7 s 收起（真機在 6.4 量）。截圖與 timing.json 在 `design/reviews/6.2-preview/`。
- Vercel 專案建立與 `VITE_SITE_URL` 由主 session 合併後做，verify 的部署項（自動部署、`curl -I`、Web Analytics 三個事件）在那之後驗。

## Plan Change Log

- 2026-11-18（Piwi）：Hobby 方案、先不驗證自訂事件 → 部署後的驗證只看瀏覽次數，「Web Analytics 三個事件」改由延後的 4.4 處理。robots.txt 改成 `Allow: /`（連結預覽爬蟲要抓得到），不收錄只靠 X-Robots-Tag。

## Review Triage Log

Pass 1（quick，同一工作階段讀 diff）：high 0、medium 0、low 2、false 0、maybe-false 1。
- low（reject）：場景分包載入失敗時載入畫面停在 100% 不收 — 整頁錯誤畫面是 6.5 的範圍（票面寫明），分包失敗在一般使用不常見，修法要加錯誤分支。
- low（reject）：載入畫面蓋著時時鐘已開始播放，揭幕時約已過 0.5 秒（模擬約 15 分鐘）— 時鐘只在場景每格推進，第一格後約一個 rAF＋520 ms 淡出，影響可忽略。
- maybe-false（defer 給 Piwi／6.4）：`robots.txt` Disallow all 可能讓尊重 robots.txt 的連結預覽爬蟲（LINE、Threads）抓不到預覽 — 要在 6.4 用真的分享連結確認；若抓不到，改成只靠 X-Robots-Tag 或放行預覽爬蟲。

## Verification

**Commands:**
- `cd web && npm test` -- 全綠
- `cd web && npm run build` -- 成功、check-build 通過
- `cd web && node scripts/boot-timing.mjs` -- 印出請求時序、寫截圖

**Manual checks:**
- 合併後由主 session：Vercel 專案、`VITE_SITE_URL`、Web Analytics；`curl -I` 三組標頭；部署網址開車站卡、行政區卡、複製連結後 Web Analytics 有三個事件（需 Pro 方案，見 PR）。
