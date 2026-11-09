---
title: '產出 tokens 與 base'
type: 'feature'
ticket: '2'
created: '2026-11-10'
status: 'built'
baseline_revision: '04328776111fb8a2e4458d65a9b764ae9efa99f8'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: []
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 2.1 定案「天光」，色票只存在 DESIGN.md 與原型的 `:root`／`:root[data-variant="a"]`；網站仍用 hallmark 時期的暫用 token（暗底 oklch），也沒有讀 token、依時刻內插日夜色的工具，2.3 場景與 4.3 分享卡無處取色。

**Approach:** 用 impeccable 把天光色票整理成正式的 `web/src/styles/tokens.css`（全天 token、`-night/-dawn/-day/-dusk` 相位 token 直接放 `:root`，HUD 夜晚放 `:root[data-phase="night"]`）與 `base.css`；新增純函式的 token 工具（讀 token、解析色碼、依 KEYS 內插相位色、判定 HUD 日夜），附單元測試；骨架改讀新 token；DESIGN.md 記下檔案位置。

## Boundaries & Constraints

**Always:** 色值以 DESIGN.md 表格為準，表外的 token 以原型 `:root` 與 variant a 為準；顏色字型只在 tokens.css 定義，其他 CSS／TS 不寫色碼（規則 5、AD-8）；相位關鍵時刻與內插照原型 `KEYS`／`at()`（在線性 sRGB 內插，與 Three.js 色彩管理一致）；HUD 日夜照原型 `night > 0.55`；每個 transition／animation 用時長 token，reduced-motion 時時長為 0（直接切換）；跑 impeccable audit，P0 要修。

**Never:** 不做 Three.js 場景、不裝 three、不寫 `useTokenColor` 本身（2.3）；不大改骨架 App.tsx 版面；不加 `data-variant`；不改 tickets.toml、不標 done；不載外部字型。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 相位內 | `tokenAt('--sky-top', 12)` | 等於 `--sky-top-day` | — |
| 相位間 | h=5.25（night→dawn 中點） | 兩色在線性空間的中點 | — |
| 只有全天值 | `--water` 無相位後綴 | 回傳 `--water` | — |
| 超出範圍 | h=24、h=-1 | 視為 0、23 | — |
| token 不存在 | `tokenAt('--nope', 8)`、`tokenRgb('--nope')` | — | 丟出錯誤並寫出 token 名 |
| 色碼格式 | `#abc`、`#aabbcc`、`rgba(14,18,38,.80)` | `[r,g,b,a]` | 無法解析回 `null` |
| HUD 日夜 | h=12／5／6／19 | day／night／day／night | — |

</frozen-after-approval>

## Code Map

- `DESIGN.md` -- 色票表與相位表（權威值），2.2 補「token 檔案」一節
- `design/prototypes/2.1-diorama/index.html:14-85` -- `:root`、`[data-phase="night"]`、`[data-variant="a"]` token；`:387-426` clamp/smooth/sunState/KEYS/at()；`:1893` data-phase 判定
- `web/src/styles/tokens.css` -- 暫用 token，整檔取代
- `web/src/styles/app.css` -- 骨架樣式，改用新 token 名（`--hud-*`、`--font`、`--page-bg`），html/body 規則移到 base.css
- `web/src/map/tokens.ts` -- 舊 `tokenRgb`（canvas 轉色），改由新工具提供後刪除
- `web/src/map/CityMap.tsx` -- deck.gl 讀 `--flow-in/--flow-out` 與選取外框；`rgba(0,0,0,0)` 改 `transparent`；`transitions` 在 reduced-motion 時為 0
- `web/src/App.tsx` -- 只改提及 hallmark 的註解
- `web/vite.config.ts` -- vitest 用 node 環境；測試以 `?raw` 與 `import.meta.glob` 讀檔，不需 @types/node

## Tasks & Acceptance

**Execution:**
- [x] `web/src/styles/tokens.css` -- 全天、相位、HUD 日夜、字型、圓角、字級、時長 token；`--page-bg` 日夜指向天空地平線色；reduced-motion 時長 0 -- 唯一色票來源
- [x] `web/src/styles/base.css` -- reset、body 字型與底色、表單繼承字型、focus-visible、`.num`、`.hud` 玻璃面 -- 共用底層
- [x] `web/src/styles/app.css` -- import tokens 與 base，改用新 token -- 骨架不壞
- [x] `web/src/styles/tokens.ts` -- `parseColor`、`PHASE_KEYS`、`phaseSpan`、`readCssToken`、`tokenRgba`、`tokenRgb`、`tokenAt`、`sunAt`、`hudPhase` -- AD-8 工具
- [x] `web/src/styles/tokens.test.ts` -- I/O 矩陣；tokens.css 與 DESIGN.md 值一致；相位 token 四組齊全；src 內除 tokens.css 外無色碼；transition／animation 用時長 token -- 守規則
- [x] `web/src/map/CityMap.tsx`、刪 `web/src/map/tokens.ts` -- 改用新工具
- [x] `DESIGN.md` -- 補 token 檔案與工具說明

**Acceptance Criteria:**
- Given 新 tokens.css，when 比對 DESIGN.md 色票表，then 每個列出的 token 都存在且值相同。
- Given `web/src` 原始碼，when 搜尋色碼（hex、rgb()、oklch()、hsl()），then 只出現在 tokens.css（測試檔除外）。
- Given `npm test && npm run build`，then 皆通過，骨架頁照常載入。
- Given impeccable audit，then 沒有 P0。

## Implementation Notes

- 本次由 bmad-build 的子代理執行，環境沒有可再派發的子代理，step-03 直接依計畫實作；計畫核准（CHECKPOINT 1）以呼叫端的委派指示代替。
- vitest 預設把 CSS 匯入清成空字串，`?raw` 也讀不到原文；`web/vite.config.ts` 加 `test.css: true` 才能在測試比對 tokens.css。
- `wrapHour` 對 0–24 內的值不做取餘，否則 19.3 會變成 19.299999… 落到 dusk→night 段。
- 骨架改動：`CityMap.tsx` 改從 `styles/tokens.ts` 讀色、選取外框改用 `--hud-ink`（新底色是亮天空）、底圖背景改 `transparent`、deck.gl 半徑過場在 reduced-motion 時為 0；刪除 `map/tokens.ts`（canvas 轉色）。
- 新增表外 token：`--hud-shadow`（原型 `.badge` 的陰影色）、`--page-bg`（指向地平線色，不是新色值）、字級／圓角／點擊尺寸／時長／緩動。`--ease-pop` 取自原型的解鎖彈出，impeccable detector 標為 advisory（bounce easing），因屬定案手感而保留。
- 驗證：`npm test` 34 項通過、`npm run build` 通過；以 headless Chrome（390×844）看骨架白天／夜晚兩種 `data-phase`，頁寬 390 無橫向捲動；`prefers-reduced-motion: reduce` 時 `--dur-phase` 與 body transition 皆為 0s。
- impeccable audit：無 P0。P1：白天 `--hud-accent` 當文字（亮玻璃上約 4.0:1）與白字壓 accent（約 4.2:1）低於 4.5:1，色值為 DESIGN.md 定案值，未自行更改，記入 DESIGN.md 待辦。

## Plan Change Log

## Review Triage Log

- 2026-11-10 第 1 輪（quick）：環境無法啟動獨立的審查子代理，quick lens 未能以無上下文的方式執行，`lenses_ran` 留空；改由實作者依 quick lens 的檢查項目自行檢視 diff（計畫驗收條件、CLAUDE.md 規則、bug）。建議在 PR 上另跑 `bmad-code-review`。
  - 自查結果：high 0／medium 0／low 2／false 0／maybe-false 0。
  - low｜`web/src/styles/tokens.ts` `tokenAt` 每次呼叫讀三次 `getComputedStyle`，2.3 若在每幀對大量 token 呼叫可能吃效能｜reject：AD-8 明訂不自行快取，瀏覽器對未失效的樣式本身有快取；效能由 2.3 的 `useTokenColor` 依相位變化重讀處理。
  - low｜`web/src/styles/tokens.test.ts` 字型順序的期望值寫在測試裡而非從 DESIGN.md 解析｜reject：DESIGN.md 的字型列不是色碼，解析成本高於價值，值改動時測試會失敗提醒。

## Design Notes

相位內插回傳 sRGB `[r,g,b,a]`（0–255，alpha 0–1），內插在線性 sRGB 做，與原型 `THREE.Color.lerp`（色彩管理預設開）一致；2.3 的 `useTokenColor` 以 `color.setRGB(r/255, g/255, b/255, SRGBColorSpace)` 接上，並訂閱 `data-phase` 重讀。

## Verification

**Commands:**
- `cd web && npm test` -- expected: 全部通過
- `cd web && npm run build` -- expected: tsc 與 vite build 成功

**Manual checks (if no CLI):**
- impeccable audit 報告沒有 P0
