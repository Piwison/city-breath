---
title: '卡片兩段高度與一句答案'
type: 'feature'
ticket: '22'
created: '2026-11-17'
status: done
baseline_revision: '71538f6604d4af6f5d6f90ae7f31931c5c60fd19'
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

**Problem:** 小卡只有一種高度（最高 34vh），數字只看得到兩列半；卡片第一行是標題與控制，沒有一句讀得懂的答案（產品計畫 v2 決定 10、11，體驗原則 2、5）。另外車站卡整天長條的 aria-label 與行政區卡的車站膠囊會出現「1 點 1 人」「5 點 0 人」這類少於 10 的人數，違反「少於 10 人不顯示數字」。

**Approach:** 共用卡框 CardFrame 改成底部 sheet：摘要（約 34dvh 可見）與完整（70dvh），把手點按、上滑下滑（再往下關閉）、鍵盤切換；兩段狀態放在 `state/view.ts`。卡框加 `answer` 槽，行政區卡與車站卡用 `web/src/data/answer.ts` 的純函式由卡上已有的名次組出一句答案。所有顯示人數改走共用 `formatCount`（小於 10 →「少於 10 人」，停止營運另給字），加 vitest 掃描兩張卡的輸出。

## Decisions（預設，Piwi 可推翻；協調者 2026-11-17 指示照票面做）

- 句子用卡上「平日 8 點」「平日整天」同一種時段寫法（whenLabel），不寫「早上」；行政區當主詞時去掉「區」（「永和的人」），目的地保留全名（「中正區」），照決定 11 的例句。
- 句子不帶人數（例句沒有，人數就在下一行表格）；車站卡 od 分片還在載入或載入失敗時，先用這站這小時的進出人數組句子。
- 環狀線站：句子照常寫最常去哪站，後面加「（環狀線出站未入檔，只算在北捷各站下車的人）」。
- 從完整往下滑只回到摘要，不會一次關掉；從摘要再往下才關閉，關閉時往下滑出。
- 鍵盤切換（把手 Enter／Space、↑↓）不播滑動動畫（直接切換）；摘要時 Tab 到看不到的元素會自動展開。
- 開卡一律從摘要開始；從行政區卡進車站卡、回上一層時維持目前的高度；關卡回到摘要。
- 少於 10 人的規則改顯示，不改資料：數字欄（車站卡的進站／出站／進出）寫「少於 10」，後面的「（人）」標籤不變。

## Boundaries & Constraints

**Always:** 顏色只走 token；動畫時長用 `--dur-*`（新增 `--dur-sheet`，reduced-motion 歸零）；reduced-motion 時拖曳不跟手、放開後直接切換；只動 transform；畫面狀態（sheet）只在 `web/src/state/`、不進網址；場景讓位：開卡維持暫停、標籤安全區跟著卡片上緣、鏡頭不因展開而動。

**Never:** 改資料檔、管線或契約；前端反推少於 10 人的格；句子用「此刻」「現在」或寫死站名、數字；加新的動畫函式庫。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 行政區有答案 | 2026-09 平日 8 點永和區 | 「平日 8 點，永和的人最常去中正區」＝卡上去哪第一名 | — |
| 行政區全少於 10 | 有營運、去哪排名空 | 「…，X的人往別區的每個方向都少於 10 人」 | — |
| 停止營運 | 該小時整格 null | 「平日 3 點捷運停止營運，X沒有列車」 | — |
| 車站有答案 | 頂溪平日 8 點 | 「平日 8 點，從頂溪出發的人最常去台北車站」（以 od 第一名為準） | — |
| 車站全少於 10 | od 有營運、top 空 | 「…，從X出發的每個方向都少於 10 人」 | — |
| od 載入中／失敗 | od.status ≠ ok | 用這小時進出組句子（formatCount） | 失敗訊息仍在目的地區塊 |
| 環狀線站 | exitsRecorded=false | 句尾加未入檔說明 | — |
| 人數 0–9 | 任何顯示的人數 | 「少於 10 人」；長條停止營運寫「停止營運」 | — |

</frozen-after-approval>

## Code Map

- `web/src/card/CardFrame.tsx` -- 共用卡框：加 answer 槽、把手、sheet 手勢與鍵盤；卡內時間列不變（aria-live 移到答案）。
- `web/src/card/sheet.ts`（新）-- 純函式：投射落點、選目標（full／peek／close）、rubberband、高度常數（與 card.css 同值，測試比對）。
- `web/src/card/card.css` -- `.card` 改成固定 70dvh、flex 欄；摘要用 transform 往下推；進場改用 `translate` 屬性（與 sheet 的 transform 分開）；內容捲動在 `.card-scroll`。
- `web/src/state/view.ts` -- 加 `sheet: "peek" | "full"`、`setSheet`；`closeCard` 時回到 peek。
- `web/src/data/answer.ts`（新）-- `districtAnswer`、`stationAnswer` 純函式。
- `web/src/data/format.ts`（新）-- `formatCount`、`formatNumber`、`SUPPRESS_BELOW`；`commute.ts` 改為 re-export（share/render、CommuteForm 照用）。
- `web/src/card/DistrictCard.tsx`、`StationCard.tsx` -- 傳 answer；所有人數改 formatCount／formatNumber。
- `web/src/scene/FlowLabels.tsx`、`FlowLegend.tsx` -- 人數改走 formatCount 系列（行為不變，值本來就 ≥ 10）。
- `web/src/scene/ScenePage.tsx` -- 量卡片上緣的 effect 加 sheet 依賴與 transitionend 重量（標籤讓路）。
- `web/src/styles/tokens.css` -- `--dur-sheet`、`--ease-drawer`，reduced-motion 歸零。
- `DESIGN.md` -- 版面段落改寫卡片兩段高度（原文要求 3.22 改）。

## Tasks & Acceptance

**Execution:**
- [ ] `web/src/data/format.ts`、`commute.ts` -- 共用格式函式 -- 一個出處
- [ ] `web/src/data/answer.ts` + `answer.test.ts` -- 句子與各邊界；掃 answer.ts 原始碼無「此刻」「現在」與站名
- [ ] `web/src/state/view.ts` + test -- sheet 狀態
- [ ] `web/src/card/sheet.ts` + test、`CardFrame.tsx`、`card.css`、`tokens.css` -- 兩段高度、手勢、鍵盤、reduced-motion
- [ ] `DistrictCard.tsx`、`StationCard.tsx`、`FlowLabels.tsx`、`FlowLegend.tsx` -- answer 與 formatCount
- [ ] `web/src/card/under10.test.tsx` -- 掃全部行政區與車站卡 48 個時段的輸出，不得出現 0–9 人
- [ ] `ScenePage.tsx` -- 標籤安全區跟著 sheet
- [ ] `DESIGN.md` -- 版面
- [ ] `design/reviews/3.22-card-heights/` -- Playwright 截圖

**Acceptance Criteria:**
- Given 390×844，when 打開行政區卡或車站卡，then 卡片可見高度約三分之一；上滑或點把手後約七成、完整表格可捲動；完整時播放維持暫停、鏡頭位置不變。
- Given 摘要，when 往下滑，then 卡片關閉；Given 完整，when 往下滑，then 回到摘要。
- Given 鍵盤焦點在把手，when 按 Enter、↑、↓，then 切換高度且無滑動動畫；Given reduced-motion，then 切換沒有滑動動畫。

## Implementation Notes

- 沒有可用的實作子代理，由本 session 直接照 plan 實作。
- `formatCount` 搬到 `web/src/data/format.ts`（多了四捨五入與「< 10 →少於 10 人」、可給 null 的字），`commute.ts` re-export 原名，share／CommuteForm 不用改。另有 `formatNumber`（數字欄，單位寫在標籤）。
- 改到的人數顯示：車站卡整天長條 aria-label（原本「1 點 1 人」「5 點 0 人」，停止營運照寫）、這小時進站／出站／進出三格、前 5 目的地與去哪幾區；行政區卡去哪／誰來與第 4、5 名、留在區內、這區車站膠囊（凌晨個位數）；場景弧頂流向標籤（null 時「少於 10」＋單位）、圖例「最粗 N 人」。
- `under10.test.tsx` 掃最新月份 41 區 × 平日假日 × 24 小時＋整天、120 站 × 平日假日 × 24 小時（od 分片實檔）的輸出文字與 aria-label／title；把長條 aria-label 暫時改回舊寫法時這個測試會失敗（板橋 平日 0 點「2 人」），確認不是空轉。
- 卡框：`.card` 固定 70dvh、`transform` 推到摘要；進場改用 `translate` 屬性，兩者疊加不打架。內容移進 `.card-scroll`（完整才捲）。把手、標題、答案、時間列不捲。
- 關閉時往下滑出：只認卡片自己的 `transform` transitionend（子元素的會冒泡），500ms 保底。
- 標籤讓路：ScenePage 量卡片上緣的 effect 加上 `sheet` 依賴，並在 dock 的 transitionend／pointerup 重量（transform 不觸發 ResizeObserver）。
- tokens：`--dur-sheet: 380ms`（sheet 屬 200–500ms 區間）、`--ease-drawer`；reduced-motion 時 `--dur-sheet: 0ms`。

## Plan Change Log

## Review Triage Log

- 2026-11-17 quick（本 session 沒有子代理工具，由實作者對照 diff 自審；high 0／medium 1／low 0／false 0／maybe-false 0）
  - medium／patch：`CardFrame.tsx` 關閉時聽卡片的 transitionend，子元素（把手、按鈕）的 transitionend 會冒泡上來，可能在滑出動畫一開始就關卡 → 只認 `e.target === el` 且 `propertyName === "transform"`，保底 500ms。已修。
- 截圖驗證（`design/reviews/3.22-card-heights/checks.json`）：上滑→full、下滑→peek、再下滑→關卡；點把手 full、↓ peek、Enter full；全程 playing=false；頂溪摘要與完整的場景構圖相同（鏡頭不動）；減少動態時拖曳中卡片不動（top 545），放開 50ms 已在完整（top 241）；console 無錯誤。

## Design Notes

- sheet 用 CSS transition 而不是 rAF spring：transition 從目前的值重新指向，可中途抓住（Vaul 做法）；手指拖曳時直接寫 `style.transform`，放開清掉讓 CSS 接手，曲線用 iOS drawer `cubic-bezier(0.32, 0.72, 0, 1)`。
- 高度固定 70dvh、摘要以 `translateY(70dvh − 34dvh)` 推到畫面外，只動 transform；短內容的卡在完整時留白，換來不量高度、不跳。

## Verification

**Commands:**
- `cd web && npm test` -- 全綠
- `cd web && npm run build` -- 成功

**Manual checks (if no CLI):**
- Playwright 390×844（hasTouch）截圖存 `design/reviews/3.22-card-heights/`：永和摘要／完整、頂溪摘要／完整、環狀線站、停止營運、reduced-motion。
