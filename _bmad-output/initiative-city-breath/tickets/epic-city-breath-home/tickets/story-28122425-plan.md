---
title: '體驗調整（設計決定 2–8、12、24、25）'
type: 'feature'
ticket: '21'
created: '2026-11-14'
status: done
baseline_revision: '3086282e3c1a06e2dcef2faa0bd0f5ddc1e57541'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md', '{project-root}/_bmad-output/initiative-city-breath/product-plan-v2-2026-11-14.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 產品計畫 v2 定案的十個設計決定（2–8、12、24、25）會改到已上線的畫面，正式版還是舊行為：「此刻」字樣、全城 120 根站柱、點空白處飛回全景、小區緞帶太細、停駛提示蓋住月亮、「去哪」混著區內、白天藍字對比不足、點擊目標 40／30px。Flows.tsx 761 行難改。

**Approach:** 照票面逐條改（R1、R2、R4、R10）；Flows.tsx 先拆成幾何、材質、標籤三檔（行為不變，獨立 commit），再改行為。協調者代 Piwi 採用 3.14／3.12 留下的四個預設一起做（見 Decisions）。

## Decisions（預設，Piwi 可推翻；協調者 2026-11-14 代為採用）

- 列車車身往 `--train-glow` 偏亮，和同色軌道分得開（3.14 問題 1）。
- 暫停時雲也停、陰影圖不再為雲重畫（3.14 問題 2）。
- 第一班車波紋在全景（未放大）時稍微加大（3.14 問題 4）。
- 車站卡的站對站緞帶以這站這一小時最大的目的地當最粗（比照決定 7，3.12 問題 3）。

## Boundaries & Constraints

**Always:** 顏色只走 token（`--hud-accent` 改 #1f6fb8 時 tokens.css 與 DESIGN.md 色票表同一個 commit，tokens.test.ts 過）；每個動畫有 reduced-motion 版本；不編造數字、少於 10 人寫「少於 10 人」（AD-3）；畫面狀態只在 `web/src/state/`（AD-16）；線寬、比例、排名是 views.ts 的純函式、vitest 驗；全城視角的線寬比例（當月最大）不變。

**Never:** 不做卡片兩段高度與一句答案（3.22）、下方主按鈕「找你的站」（4.1）、皇冠（8.2）；拆檔的 commit 不改行為；不改管線與資料契約；不刪原型。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 全城線寬 | 平日 8 點、沒選區 | 前 12 大與線寬＝`ribbonWidth(v, 當月最大)`，和改前相同 | — |
| 選區線寬 | 永和、平日 8 點 | 最粗＝永和這一小時去哪＋誰來 10 條裡最大的那條；圖例「最粗 N 人」＝那條 | 全部 null：不畫、圖例照舊句子 |
| 選站線寬 | 車站卡 | 最粗＝這站這一小時最大的目的地 | 分片未到：不畫 |
| 留在區內 | 行政區卡 | 排名不含自己；「留在區內 N 人」＝對角線（整天＝非 null 小時加總） | 對角 null／全 null：「少於 10 人」 |
| 站柱 | 全城未放大 | 柱高 0（站珠貼在廣場上） | 放大／選區：0.4 秒長出；reduced：直接 |
| 點空白處 | 卡開著 | 卡關、鏡頭不動 | 「回到全景」照舊飛回 |
| 停駛 | 3 點 | 時間軸正上方「捷運停駛中・約 6 點發車」 | 班距推不出：只寫「捷運停駛中」 |

</frozen-after-approval>

## Code Map

- `web/src/scene/Flows.tsx`（761 行）→ 拆：`flowGeometry.ts`（Arc、bez、bezTan、arcsOf、ribbonGeometries、Scalable、scaleTo、revealAt、常數）、`flowMaterial.ts`（chevronTexture、withReveal、OPACITY、BAND_OPACITY、DIM、REVEAL、SHOWN）、`FlowLabels.tsx`（FlowLabelLayer、FlowLabelProjector、FlowLabelEls）；`Flows.tsx` 只留元件，並 re-export 外部用到的名稱（ScenePage 匯入 `FlowLabelLayer`、`Flows`、`FlowLabelEls`；測試匯入 `arcsOf` 等）。
- `web/src/data/views.ts` -- 新增 `flowScale(mode, flows, cityMax, cityLegend)` → `{ max, legend, local }`：city 回當月最大；district／station 用畫面上這些流向的最大值。`districtRanks` 去掉 self、加 `stay: number | null`。`FLOW_KEYS.station`。
- `web/src/scene/flowNow.ts`（新）-- `useFlowNow(source, stations)`：Flows 與 FlowLegend 共用（mode、FlowHour、scale）；od 分片走 `useOdShard`（load.ts 快取）。
- `web/src/scene/FlowLegend.tsx` -- 用 `useFlowNow`；local 時線寬列寫「最粗 N 人」；加「柱子越高人越多」；ScenePage 傳 stations。
- `web/src/scene/Stations.tsx`、`stationRules.ts` -- `pillarShown()`：放大、選中的區、選中的站才有柱；每站 0→1 緩動乘在柱高（reduced 直接）。選區時站名先放、不避流向標籤（`board.stationFirst`）；名牌依 `dayTotal`（已是全日人數）。
- `web/src/scene/FlowLabels.tsx`、`DistrictLabels.tsx`（LabelBoard 加 `stationFirst`）-- 選區時流向標籤避開 `board.stationRects`，依 `stationVersion` 重算（不回頭觸發站名，避免互相追）。
- `web/src/scene/Selection.tsx` -- `SelectionCamera` 取消選取時不再飛回 home。
- `web/src/scene/SleepHint.tsx`、`data/periods.ts`、`scene.css`、`ScenePage.tsx` -- 文案「約 N 點發車」；位置＝`bottom: var(--dock-top)`（ScenePage 量 dock 時寫在 main 上）。
- `web/src/card/DistrictCard.tsx` -- 排名只列跨區、「留在區內」一行；「這個時段最忙」「這個時段進出人數」。
- 「此刻」「現在」：DistrictCard、LayerPanel、ScenePage aria-label、註解一併改；新 vitest 掃 `web/src` 非測試檔。
- `web/src/styles/tokens.css`、`DESIGN.md` -- `--hud-accent` #1f6fb8、`--tap` 44、`--tap-min` 36；DESIGN.md 版面段與待辦同步。
- `web/src/scene/Trains.tsx`、`Clouds.tsx`、`firstTrain.ts`／`Stations.tsx` -- 四個預設。
- 重用：`ribbonWidth`、`legendValues`、`bandWidth`、`isZoomed`、`useOdShard`、`stationDestinations`、`stationFlows`。

## Tasks & Acceptance

**Execution:**
- [x] 拆 Flows（獨立 commit）-- npm test、build 過、行為不變
- [x] `views.ts`、`views.test.ts`、`district.test.ts` -- flowScale、districtRanks（stay、無 self）、全城 8 點線寬不變
- [x] `flowNow.ts`、`Flows.tsx`、`FlowLegend.tsx` -- 決定 7＋站對站、圖例柱高（決定 4）
- [x] `Stations.tsx`、`stationRules.ts`(+test)、`FlowLabels.tsx`、`DistrictLabels.tsx` -- 決定 3、5；波紋加大
- [x] `Selection.tsx` -- 決定 6
- [x] `SleepHint.tsx`、`periods.ts`(+test)、`scene.css`、`ScenePage.tsx` -- 決定 8
- [x] `DistrictCard.tsx` -- 決定 2、12；文案掃描測試
- [x] `tokens.css`、`DESIGN.md`、`tokens.test.ts` -- 決定 24（對比 ≥ 4.5）、25
- [x] `Trains.tsx`、`Clouds.tsx` -- 預設 1、2
- [x] `design/reviews/3.21-tuning/` -- Playwright 390×844 每個決定前後對照
- [x] 順手：3.12 標 done；CLAUDE.md 常用指令與架構 AD-27 補 `station-types`、memlog

**Acceptance Criteria:**
- Given 永和區平日 8 點, then 最粗緞帶是永和最大的流向，圖例「最粗」人數相同；回全城後前 12 大與線寬同改前。
- Given 全城未放大, then 沒有站柱；放大或選區後長出，reduced-motion 直接出現。
- Given 卡開著點空白處, then 卡關、鏡頭位置不變。
- Given 3 點, then 提示在時間軸正上方、逐字「捷運停駛中・約 6 點發車」。
- Given 建置版, then web/src 找不到「此刻」「現在」；`--hud-accent` 對白天 HUD 對比 ≥ 4.5；主要按鈕 44px、次要 ≥ 36px。

## Implementation Notes

- 沒有 subagent 工具：實作與 Quick lens 自審都在這個 session 做（同 3.12、3.14）；checkpoint 由協調者的委派訊息代替。plan 約 2,000 tokens，超過建議值，由委派一次做完、沒拆。中途額度中斷一次（2026-11-15→17），恢復後從截圖繼續。
- **拆檔**（commit 7ff485d，行為不變）：`flowGeometry.ts`（Arc、bez、anchorsOf、arcsOf、ribbonGeometries、scaleTo）、`flowMaterial.ts`（chevronTexture、withReveal、revealAt、透明度常數）、`FlowLabels.tsx`（FlowLabelLayer、FlowLabelProjector）；Flows.tsx 761 → 約 300 行，轉出原本的名稱；npm test 342／build 通過後才改行為。
- **決定 7**：`views.ts flowScale(mode, flows, cityMax, cityLegend)`；`scene/flowNow.ts useFlowNow()` 給 Flows 與 FlowLegend 共用（od 分片走 useOdShard／load.ts 快取）。2026-09 永和平日 8 點最粗＝永和→中正 1,505（全城比例時只有 6,582 的 23%）；全城 8 點前 12 大線寬以 6,582 為分母（flowScale.test.ts 寫死 12 個值與公式）。local 時圖例兩段：`legendValues(max)[1]` 與「最粗 1,505 人」（相同就一段）；光帶分級用 `[a, b, max]`。車站卡（3.12 問題 3）同一套，卡底加 FlowLegend（原本車站卡沒有圖例）。`FLOW_KEYS.station`＝「藍＝從這站去哪」。
- **決定 3**：`stationRules.pillarShown()`；Stations 每站 `grow` 0→1 指數趨近（`PILLAR_GROW_RATE` 8／秒，約 0.4 秒），乘在柱高；減少動態或靜態直接切換。站珠、廣場全城照留（波紋要看得到）。站對站緞帶端點的柱高照舊用 pillarHeight（選站時鏡頭已飛近、柱子已長出）。
- **決定 5**：選區時 Stations 不避流向標籤（不看 board.version），FlowLabels 以 `board.stationRects` 當起始佔位、依 `stationVersion` 重算；兩邊單向依賴，不會每格互相觸發。名牌依 `dayTotal`（全日進出）挑，原本就是。
- **決定 6**：SelectionCamera 拿掉「取消選取飛回 home」；× 與點空白處一樣只關卡。「回到全景」不變。
- **決定 8**：`sleepHint` 文案「約 N 點發車」；位置 `bottom: calc(var(--dock-top) + 8px)`，`--dock-top` 由 ScenePage 量時間軸（或小卡）上緣時寫在 `.scene-page`；進場由下往上 8px（--dur-enter，減少動態歸零）。
- **決定 12**：`districtRanks` 去掉 self、加 `stay`（對角線；整天＝非 null 小時加總；全 null → null）；卡上「留在區內 N 人」或「少於 10 人」，跨兩欄一行（`.card-stay`）。
- **決定 2**：「這個時段最忙」「整天最忙」、「這區的車站・這個時段進出人數」；LayerPanel、aria-label、註解的「此刻」全改；`web/src/copy.test.ts` 掃 web/src 非測試檔（「出現在」不算）。
- **決定 24、25**（commit 4435d1a，tokens.css 與 DESIGN.md 同一個 commit）：`--hud-accent` #1f6fb8，對 HUD 底色疊在白天最深天色（--sky-top-day）上約 4.52:1、疊在地平線色上更高；舊值 #2a7fd0 約 3.6:1（測試一併確認）。`--tap` 44、`--tap-min` 36；拖曳條 input 改成 36px 高的透明點擊區，22px 天色條改畫在 `.scrub-wrap::before`（底色經 `--scrub-bg`）。車站卡 24 格整天長條每格約 12px 寬，放不下 36px（旁有 ‹ ›），DESIGN.md 版面段已註明。
- **預設**（Piwi 可推翻）：列車車身＝路線色往 `--train-glow` 推 0.45；雲只在播放中飄，暫停時不飄、陰影圖不為雲重畫（淡入淡出照補）；全景（未放大）時波紋偏離量 ×1.6（`WAVE_WIDE`），亮度仍照原曲線；車站卡緞帶比例見決定 7。
- **順手**：3.12 標 done（tickets.py mark）；CLAUDE.md 常用指令、架構 AD-27 補 `city-breath station-types`，memlog 記一筆。
- **截圖**：`design/reviews/3.21-tuning/`（before-＝main 3086282，after-＝這個分支；Playwright 390×844、DPR 2、Chromium＋swiftshader，約 1 fps；第一班車用 page.clock 假時鐘一格格推）。`*-tap-targets.json` 是畫面上每個按鈕的尺寸。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審，沒有子代理；含截圖檢查）：high 0、medium 1、low 3、false 1、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| medium | patch | 拖曳條的天色不見了：`--scrub-bg` 寫在 input 上，但畫天色條的是 `.scrub-wrap::before`，自訂屬性只往下繼承（after 截圖第一輪看得到空白條）。改寫在 `.scrub-wrap` 上，重拍。 |
| low | patch | 「留在區內」一行寫成「留在永和區內 N 人」，和票面、DESIGN.md 的「留在區內 N 人」不同字；改成逐字「留在區內」，測試同步。 |
| low | reject | 選區圖例「最粗 N 人」那段 bar 在放大時是 24px 高、22px 寬，看起來像圓點；全城圖例最粗那段原本就是同一個樣子（同一個 barPx），不在這張改。 |
| low | reject（交 Piwi） | 車站卡 24 格整天長條每格約 12px 寬，低於次要 36px；手機卡片放不下 24 個 36px，旁邊有 ‹ › 可逐小時換、鍵盤也點得到。DESIGN.md 版面段已註明。 |
| false | — | 疑慮：選區時站名先放、流向標籤避開站名，兩邊會每格互相觸發重算。Stations 在選區時不比對 `board.version`（固定 −2），只有 FlowLabels 依 `stationVersion` 重算，單向依賴。 |

## Design Notes

- 選區圖例：local 時三段線寬改成兩段（`legendValues(max)[1]` 與精確的最大值「最粗 N 人」），相同就只留一段；光帶分級用 `[a, b, max]`，比例與畫面一致。
- 站柱「淡入」用柱高 0→1 長出（InstancedMesh 共用材質，逐柱透明度要改 shader；長出也更像「呼吸」）。站珠與廣場全城照留：第一班車波紋要看得到。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）前後對照放 `design/reviews/3.21-tuning/`；量所有按鈕尺寸。
