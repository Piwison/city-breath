---
title: '車站柱與站珠'
type: 'feature'
ticket: '1'
created: '2026-11-12'
status: 'built'
baseline_revision: 'b7ce6a6aae61ec69dd9b32e289cbf503cbd23575'
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

**Problem:** 場景上看不到每一站此刻有多少人進出；3.6 只在選區時把該區的站畫成大小不同的站珠，全城和放大時都沒有車站，也沒有「廣場＋細柱＋站珠」的造型（R1，DESIGN.md「場景的層：車站柱高＝真實」）。

**Approach:** 照原型移植：全部 120 站各一組「廣場（路線色）＋細柱（`--station`）＋站珠（路線色、夜裡發光）」，三個 InstancedMesh；柱高＝該小時進出（stations.json，平方根比例，換算在 views.ts），站在台地上（`levelHeight()`→`elevation()`）、跟著行政區抬起與按壓。放大或選區才點得到、才標站名，只標重要的站；點站鏡頭飛過去、站珠彈一下、開 3.6 的最小版車站小卡。取代 3.6 的 `DistrictStations`（同一套站珠）。

## Boundaries & Constraints

**Always:** 柱高只用 stations.json（AD-1），換算是 `views.ts` 的純函式，不乘地形倍數（AD-12）；停止營運（`null`）不當 0：柱收進廣場、站珠熄燈變淡，和 0 人（最矮的柱）看得出差別（AD-5）；名牌不放數字；顏色只走 token，路線色 `--line-*`（AD-8、AD-21）；環狀線站只有進站，柱高只算進站並在圖層說明寫明；站屬哪區只看 `district`（AD-9）；狀態只在 `state/view.ts`（AD-16），圖層開關加 `station`；點擊順序 站 > 緞帶 > 區，命中半徑 22px（44px 目標）；quality.ts 的 lite 時簡化幾何、不投影；站珠彈一下與柱高變化在減少動態／靜態模式時直接切換。

**Never:** 不做第一班車亮站波紋（3.4）、完整車站卡（3.12）、皇冠（3.10）、寶石（3.9）、緞帶點擊；不改 tickets.toml、DESIGN.md、SKILL.md、資料契約與管線；不刪原型資料夾。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 柱高 | 進出 v、當月單站單小時最大 P | `0.35 + 2.1·√(min(1, v/P))` | — |
| 0 人 | v = 0 | 最矮的柱 0.35 | — |
| 停止營運 | 3 點（null） | 沒有柱、站珠落在廣場上、熄燈 | 不當 0 |
| 播放中 | t = 8.5 | 8 點與 9 點內插 | 一邊 null：柱從廣場長出 |
| 暫停 | hour = 8、t = 8.4 | 用 8 點的值（與小卡一致） | — |
| 減少動態 | 換時段 | 直接切換，不內插不緩動 | — |
| 環狀線站 | exitsRecorded=false | 只算進站 | — |
| 名牌 | 全城沒放大 | 不標站名 | — |
| 名牌 | 放大、沒選區 | 依當日型全日進出取前 10 個放得下的 | 互相重疊就略過 |
| 名牌 | 選區 | 這區的站全標（放不下的略過），選中的站一定標 | — |
| 點擊 | 全城沒放大 | 點不到站，點到區 | — |
| 點擊 | 放大或選區 | 22px 內最近的站 > 區 | — |

</frozen-after-approval>

## Code Map

- `web/src/data/views.ts` -- `StationFrame` 加 `district`、`plazaToken`、`entriesOnly`、`dayTotal`；`stationFrames(index, null, …)` 回全部站；新增 `PILLAR_MIN/GAIN`、`pillarHeight()`、`pillarAt()`（內插／整點）。
- `web/src/scene/stationRules.ts`（新）-- 純函式：`ZOOM_PX`、`isZoomed()`、`stationPickable()`、`chooseStationLabels()`（名牌挑選與避讓）。
- `web/src/scene/Stations.tsx`（新，取代 `DistrictStations.tsx`）-- 三個 InstancedMesh、柱高平滑、抬起／按壓、站珠彈一下（gsap）、夜間自發光、名牌 DOM 與點擊位置；lite 簡化。
- `web/src/scene/Selection.tsx` -- 點站不再限選區（改看 spots 是否可點）；按下在站上時不壓區。
- `web/src/scene/DistrictLabels.tsx` -- `LabelBoard` 加 `stationRects`／`stationVersion`，區名避開站名。
- `web/src/state/view.ts`、`scene/LayerPanel.tsx`、`scene/scene.css` -- `station` 圖層、色塊、來源說明。
- `web/src/scene/ScenePage.tsx` -- 換掛 `<Stations>`（在 Flows 之後、區名之前）、overlays。
- 重用：`lift.ts`（`liftOf`、`lifts.press`、`lifts.frame`）、`quality.ts useTier`、`daylight.ts sunAt`、`useTokenColor(s)`、`traits.ts stationVolume`、`labelPlace.ts` 的 `SafeArea/Rect`。
- 移植來源：`design/prototypes/2.1-diorama/index.html` 1021–1033、1365–1400、1425–1440、1525–1545、1981–1995（不刪）。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/views.ts`、`data/stations.test.ts`（新） -- 柱高、內插、null、環狀線、全部站
- [x] `web/src/scene/stationRules.ts`、`stationRules.test.ts` -- 放大判斷、可點規則、名牌挑選
- [x] `web/src/scene/Stations.tsx`、刪 `DistrictStations.tsx`、`Selection.tsx`、`DistrictLabels.tsx`、`ScenePage.tsx` -- 場景
- [x] `web/src/state/view.ts`、`LayerPanel.tsx`、`scene.css` -- 圖層
- [x] `design/reviews/3.1-stations/` -- Playwright 截圖與原型並排；draw call／三角形

**Acceptance Criteria:**
- Given 首頁全城 8 點, then 每站有柱，市中心的柱明顯比郊區高。
- Given 拖時間軸 4 點 → 8 點, then 柱從廣場長出、高度更新。
- Given 選大安區或放大市中心, when 點一站, then 鏡頭飛過去、站珠彈一下、開車站小卡；名牌不重疊。
- Given reduced-motion, when 點站或換時段, then 沒有彈跳、柱高直接切換。
- `npm test`、`npm run build` 通過；draw call 與三角形記在 Implementation Notes。

## Implementation Notes

- 沒有 subagent 工具：實作與 Quick lens 自審都在這個 session 做（同 3.5、3.6、3.13）。Checkpoint 由協調者的委派訊息代替人工核准；要 Piwi 決定的列在 PR 說明。
- **協調者 2026-11-12 補充（合併 origin/main 17c3c1a，含 3.4 城市睡覺與 3.20 契約 v4）**：站柱接上 3.4 的 `state/service.ts sleepAt(time.t, dayType, calm)`，柱高與站燈都乘上 1 − 入睡程度，停駛前和流向一起淡出、減少動態時直接切換。因此 `pillarAt` 播放中遇到「下一小時停駛」時維持這一小時的高度（不再往 0 內插），淡出交給 sleepAt；矩陣「播放中：一邊 null 柱從廣場長出」改成「停駛的那一小時沒有柱，清晨開始營運時柱以 HEIGHT_RATE 緩動長出、減少動態直接出現」（凍結區塊未改，記在這裡）。
- **全部站都畫**（原型相同）：全城視角是細小的柱，放大或選區才點得到、才標名。3.6 的 `DistrictStations`（選區才出現、大小依人數的站珠）刪除，改由 `Stations.tsx` 提供；站珠大小固定（選中 ×1.6），人數只看柱高。
- **柱高**：`views.ts pillarHeight = 0.35 + 2.1·√(min(1, v/P))`（原型），P＝當月單站單小時最大進出；`null` → 沒有柱、站珠往 `--station` 褪 65%、自發光乘上營運比例。播放中依 time.t 內插，暫停或減少動態用整點（與小卡「平日 8 點」同值）；柱高以 `1 − e^(−9·dt)` 追目標，減少動態或靜態模式直接切換。環狀線站 `entriesOnly`，只算進站，圖層說明寫明。
- **顏色**：站珠＝第一條路線 `--line-*`、廣場＝最後一條路線（轉乘站看得到兩色）、細柱 `--station`、站珠自發光 `--station-glow` 乘路線色（原型 tintEmissive），強度 (0.25 + 1.5·night)·營運比例。
- **名牌規則**（`stationRules.ts`）：全城沒放大（< 11 px／單位）不標；放大沒選區時依這個日型的全日進出取前 10 個放得下的（穩定，不隨播放跳動；原型用此刻進出前 12）；選了區只標這區的站（別區不標）；選中的站一定標，碰到流向標籤時上下每 4px 挪開最多 64px，挪不開才壓上。名牌避開流向標籤、HUD、時間軸／小卡與畫面邊緣；區名再避開站名（`LabelBoard.stationRects`）。
- **點擊**：`stationPickable`：放大、站在選中的區、或已選一站時可點；命中半徑 22px（44px 目標），站名中心也算一個點擊位置。順序 站 > 緞帶（目前不能點，從卡片聚焦）> 區；按在站上時不壓扁後面的區。
- **站珠彈一下**：gsap 0.4 → 1，`elastic.out(1.3, 0.35)` 0.7 秒（原型 stPop）；減少動態或靜態模式時直接 1。
- **效能**：三個 InstancedMesh（廣場、細柱、站珠），draw call +3；full 每站 372 個三角形（廣場 20 段、柱 10 段、站珠 14×10）＝120 站 44,640；lite 每站 144（10、6、8×6）＝17,280，且 lite 不投影（陰影 pass 少 2 個 call）。Playwright（390×844、DPR 2、swiftshader、暫停在平日 8 點）整個畫面：關車站 69 call → 開車站 72 call。`performance.getEntriesByName('stations:build')` 記等級與每站三角形。矩陣只在柱高、抬起、選取或彈跳在變時上傳；名牌只在鏡頭、畫面、柱高或流向標籤變了才重算。
- bundle：ScenePage 1,151 KB → 1,159 KB（含 main 的 3.4）。
- 無頭 swiftshader 約 0.5–2 fps；截圖等 25–70 秒。真機 fps 沒量（6.2 預覽部署後 Piwi 用 iPhone 實測）。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審，含 Playwright 截圖發現的問題）：high 0、medium 3、low 2、false 0、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| medium | patch | 矩陣變更判斷和名牌重算共用 `last.key`，兩邊寫的字串不同，矩陣每格都重傳並要求陰影重畫（實測開車站多 11 個 call）；拆成 `matKey`。 |
| medium | patch | `frames` 每個整點換一份，狀態跟著重設，暫停換時段時柱高沒有緩動；改成換月份或重建網格才重設。 |
| medium | patch | 換等級（lite）重建網格時狀態沒重設，新網格的 instance 數維持 0、站全部消失；重設條件加上網格。 |
| low | patch | 選中的站名被流向標籤蓋住（截圖：大安區選公館）；選中的站名上下每 4px 找空位。 |
| low | patch | 站名本身點不到（在站珠上方約 20px，超出命中半徑）；名牌中心加進點擊位置。 |

## Design Notes

- 選區時只有部分站有名牌：流向標籤先放，站名避開它們（大安區平日 8 點只標得出 3／11 站，選了公館後 5 站）；選中的站一定標。
- 3.6 的站珠大小依人數，3.1 改成柱高表現人數、站珠固定大小（原型）。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）：全城 8 點、放大市中心、選區、點站、深夜 3 點、reduced-motion，與原型同情境並排。
