---
title: '分享面板、連結預覽與網址記狀態'
type: 'feature'
ticket: '15'
created: '2026-11-17'
status: done
baseline_revision: '358948f2ac7846bbf5c9f6d3b319e36658934f26'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/_bmad-output/initiative-city-breath/product-plan-v2-2026-11-14.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 走查 B1：找不到任何分享入口、網址不記站與行政區；貼出去的連結沒有預覽圖與標題（體驗原則 6、決定 16–20）。

**Approach:** 共用卡框 `actions` 槽放分享鈕，沒開卡時上方有「分享這一刻」；按了開分享面板（預覽、「存成圖片」只在有圖的卡、「複製連結」→「已複製」）。`state/url.ts` 加 month、district、station，開場還原並暫停；不合法退回全景並顯示訊息。index.html 加 OG／Twitter 標籤（`VITE_SITE_URL`）、固定預覽圖與網站圖示；分享圖改成天空帶放網站名、數字與英文用自帶 OFL 字型子集。

## Decisions（預設，Piwi 可推翻；協調者 2026-11-17 代 Piwi 採用）

- 環狀線站一句答案的括號縮成「（只算在北捷站下車的人）」。
- 車站卡摘要高度：「這小時進站／出站／進出」三格排在類型標籤之前。
- 網址鍵：`month`、`day`、`hour`、`district`（8 碼代碼）、`station`（站 ID），固定順序；從行政區卡進的車站卡兩個都記，打開回到同一層並有「‹ 區名」。
- 任一鍵不合法（格式錯、月份不在 months.json、區或站不存在）→ 整個退回首頁全景（照常從清晨播放），上方顯示可讀訊息，點 × 才收。月份合法但不是最新月（這版不做月份切換，決定 28）→ 照樣還原到那張卡，訊息寫明「這個連結是 X 月的，網站顯示最新的 Y 月」。
- 「分享這一刻」按了先暫停播放，連結記目前的月份、日型、時段；面板預覽是一句「平日 14 點的台北捷運」＋月份，不放數字。
- 數字與英文字型用 Manrope（SIL OFL 1.1，@fontsource/manrope 的 latin 子集再裁成基本拉丁與數字），只給分享圖與預覽圖用，介面 `--font` 不變；token `--font-num`。
- 連結預覽圖與網站圖示由 tokens 產生（腳本），預覽圖用 render.ts 同一組天空、面板、字型畫，不放任何數字。

## Boundaries & Constraints

**Always:** 網址只由 url.ts 讀寫（預覽標籤的 `VITE_SITE_URL` 是 AD-18 唯一例外）；顏色與字型只走 token；動畫用 `--dur-*`、reduced-motion 直接切換；少於 10 人不顯示數字；分享圖不截場景（AD-17）；字型放 web/public/、不向外部網址載入。

**Never:** 做車站卡的分享圖；做行政區卡的分享圖內容（3.16）；直接叫系統分享面板當第一步；QR code；改資料、管線、契約。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 行政區卡分享 | 大安區、假日、14 點 | 連結 `?month=2026-09&day=holiday&hour=14&district=63000030`；打開＝大安區卡、假日 14 點、暫停 | — |
| 車站卡 | 從大安區進大安站 | 面板只有「複製連結」；連結含 district 與 station | — |
| 分享這一刻 | 播放中 9 點 | 暫停；連結含 month、day、hour | — |
| 不合法 | `?hour=25`、`?station=nope`、`?month=2030-01` | 全景、從清晨播放、訊息 | 不丟錯 |
| 舊月份 | `?month=2026-08&station=…` | 還原到那站（9 月資料）＋月份訊息 | — |
| 複製失敗 | clipboard 拒絕 | 退回選取輸入框＋execCommand；再失敗提示「請長按網址複製」 | — |

</frozen-after-approval>

## Code Map

- `web/src/state/url.ts` -- 加 `district`、`station` 鍵與 `parseQuery`（回傳狀態＋不合法的鍵）；`urlStateOf` 加 month／district／station；`syncUrl` 的 key 跟著加。
- `web/src/state/view.ts` -- 加 `month`（資料月份，載入後寫）與 `setMonth`；`restoreSelection(district, station)`。
- `web/src/scene/ScenePage.tsx` -- 開場用 parseQuery；資料到後驗證區、站、月份，還原或退回全景＋訊息；上方加「分享這一刻」；`.scene-notice`。
- `web/src/share/SharePanel.tsx`（新）-- `<dialog>` 面板：預覽（文字或 render 出的圖）、存成圖片（只有給 `image` 時）、複製連結；`ShareAction` 鈕給卡框 `actions`。
- `web/src/share/share.css`（新）-- 面板、按鈕樣式（token）。
- `web/src/card/CardFrame.tsx` -- Esc 若已被面板處理（defaultPrevented）就不關卡。
- `web/src/card/StationCard.tsx`、`DistrictCard.tsx` -- `actions` 接 ShareAction；車站卡三格移到類型前。
- `web/src/data/answer.ts` -- LOOP_NOTE 縮短。
- `web/src/share/render.ts` -- 網站名移到上方天空帶、下方留白；數字與英文用 `--font-num`；`drawLinkPreview`（1200×630）。
- `web/src/styles/tokens.css`、`base.css` -- `--font-num`、`@font-face`（unicode-range 基本拉丁）。
- `web/index.html`、`web/vite.config.ts` -- OG／Twitter／圖示／theme-color；`%SITE_URL%` 由 `VITE_SITE_URL` 替換。
- `web/scripts/brand-assets.mjs`（新）-- 由 tokens 產 favicon.svg；Playwright 開 brand-preview.html 取 og.png、apple-touch-icon.png。
- `web/scripts/check-build.mjs`（新）-- 建置後檢查 meta、檔案存在、沒有外部字型網址；`npm run build` 接上。
- `docs/sources.md`（新）-- 資料與字型來源、授權。

## Tasks & Acceptance

**Execution:**
- [ ] `url.ts` + `url.test.ts` -- 五個鍵來回一致、不合法退回、parseQuery 列出不合法鍵
- [ ] `view.ts` + test、`ScenePage.tsx` -- 還原、退回全景、訊息、分享這一刻
- [ ] `SharePanel.tsx`、`share.css`、`CardFrame.tsx`、兩張卡 -- 面板與入口
- [ ] `answer.ts`、`StationCard.tsx` -- 兩個小調整（含測試）
- [ ] 字型：`@fontsource/manrope`（devDependency）→ 裁切到 `web/public/fonts/`＋OFL.txt；tokens、base、render.ts、render.test
- [ ] 預覽與圖示：render.ts `drawLinkPreview`、brand-assets、index.html、vite.config、check-build
- [ ] `docs/sources.md`、DESIGN.md 待辦字型那條
- [ ] Playwright 截圖 `design/reviews/3.15-share/`

**Acceptance Criteria:**
- Given 建置版大安區、假日、14 點，when 按分享→複製連結→新分頁打開，then 同一張卡、同一時段、暫停。
- Given 車站卡，when 按分享，then 面板沒有「存成圖片」。
- Given 建置產物，then index.html 有 og:title「城市呼吸｜上個月的台北捷運」、og:description、og:image、twitter:card，預覽圖與圖示存在，沒有外部字型網址。
- Given 分享圖，then 只有短網址、網站名在上方天空帶、下方留白，數字用自帶字族。

## Implementation Notes

- 沒有可用的子代理工具（實作與審查），由本 session 直接照 plan 實作，審查由實作者對照 diff 自審（同 3.22）。
- 網址：`url.ts` 加 `district`、`station` 鍵、`parseQuery`（狀態＋不合法的鍵）、`planLink`（對照 months.json、districts、stations 決定還原／退回全景）、`shareLink`（播放中也給暫停的那一刻）、`clearViewQuery`。`urlStateOf` 暫停時記 month＋hour，選了區、站才記；`syncUrl` 改在資料載入、還原之後才開始（否則開場第一次寫入會先把 district、station 洗掉）。
- `view.ts` 加 `month`（資料月份）與 `restoreSelection`。行政區卡「整天」範圍不在 AD-16 的鍵裡，連結打開是那一小時（沒加鍵）。
- 面板：`share/SharePanel.tsx`（原生 `<dialog>` showModal、portal 到 body；指標事件 stopPropagation，免得 React 事件冒泡回卡框拉動卡片）。Esc 只關面板：面板 preventDefault，CardFrame 看 defaultPrevented。複製：Clipboard API → 選取輸入框 execCommand → 提示長按複製。「已複製」2.4 秒回到「複製連結」。
- 「分享這一刻」在右上「回到全景」左邊（窄螢幕只有圖示、≥520px 有字），沒開卡才有；按了先暫停。
- 分享圖：網站名移到上方天空帶（字色依天空亮暗選白天或夜晚的 HUD 字色），面板裡不再有品牌列；下方天空本來就留白。canvas 字型改 `--font-num`（"Manrope Num" 後接系統字，逐字回退）。
- 字型：`@fontsource/manrope` 5.3.0（devDependency）latin 子集 → `scripts/subset_fonts.py`（fontTools）→ `public/fonts/manrope-num-{400,700}.woff2`（各約 7 KB）＋ `OFL.txt`；`base.css` @font-face 帶 unicode-range，只在畫分享圖時下載。
- 預覽與圖示：`share/mark.ts`（token 色的圖示 SVG）、`render.ts` 的 `drawLinkPreview`；`brand-preview.html`＋`scripts/brand-assets.mjs`（Playwright）寫出 `public/favicon.svg`、`apple-touch-icon.png`、`og.png`。`vite.config.ts` 把 `%SITE_URL%` 換成 `VITE_SITE_URL`、`%THEME_COLOR%` 換成 `--sky-horizon-day`。`scripts/check-build.mjs` 接在 `npm run build` 後（CI 也跑）。
- 文案：連結問題的說明避開「現在」（copy.test 會擋）。

## Plan Change Log

## Review Triage Log

- 2026-11-18 quick（沒有子代理工具，實作者對照 diff 自審；high 0／medium 1／low 2／false 0／maybe-false 0）
  - medium／patch：`SharePanel.tsx` 用 portal 掛在 body，但 React 事件仍沿元件樹冒泡回 CardFrame 的 onPointerDown／Move，在面板裡捲動或拖動會拉動後面的卡片 → dialog 擋下 pointerdown／move／up 的冒泡。已修。
  - low／patch：e2e 第一次同時開兩個分頁、swiftshader 跑兩個 WebGL 太慢導致 timeout → 驗證腳本先關原分頁再開新分頁（不是產品問題）。
  - low／patch：截圖 9 發現退回全景時日型還留在連結的「假日」，但網址已清掉 → 退回時也把日型設回平日。已修並重拍。

## Design Notes

- 面板用原生 `<dialog>.showModal()`：焦點圈住、Esc、背景不可點都是瀏覽器給的；進場 `@starting-style` 往上 16px＋淡入（`--dur-enter`，減少動態歸零）。
- canvas 的 font 用 `--font-num` 的字族清單：瀏覽器逐字回退，數字與英文落在 Manrope、中文落在系統字。

## Verification

**Commands:**
- `cd web && npm test` -- 全綠
- `cd web && npm run build` -- 成功且 check-build 通過

**Manual checks (if no CLI):**
- Playwright 390×844 建置版：大安區假日 14 點分享流程、車站卡面板、分享這一刻、不合法網址；截圖存 `design/reviews/3.15-share/`。
