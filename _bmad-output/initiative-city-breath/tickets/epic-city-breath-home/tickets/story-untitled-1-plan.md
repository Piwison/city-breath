---
title: '車站柱與站珠'
type: 'feature'
ticket: '1'
created: '2026-11-12'
status: 'in-progress'
baseline_revision: 'b7ce6a6aae61ec69dd9b32e289cbf503cbd23575'
route: 'full'
route_source: 'auto'
risk: 'low'
review: ''
review_source: ''
lenses_ran: []
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
- [ ] `web/src/data/views.ts`、`data/district.test.ts` -- 柱高、內插、null、環狀線、全部站
- [ ] `web/src/scene/stationRules.ts`、`stationRules.test.ts` -- 放大判斷、可點規則、名牌挑選
- [ ] `web/src/scene/Stations.tsx`、刪 `DistrictStations.tsx`、`Selection.tsx`、`DistrictLabels.tsx`、`ScenePage.tsx` -- 場景
- [ ] `web/src/state/view.ts`、`LayerPanel.tsx`、`scene.css` -- 圖層
- [ ] `design/reviews/3.1-stations/` -- Playwright 截圖與原型並排；draw call／三角形

**Acceptance Criteria:**
- Given 首頁全城 8 點, then 每站有柱，市中心的柱明顯比郊區高。
- Given 拖時間軸 4 點 → 8 點, then 柱從廣場長出、高度更新。
- Given 選大安區或放大市中心, when 點一站, then 鏡頭飛過去、站珠彈一下、開車站小卡；名牌不重疊。
- Given reduced-motion, when 點站或換時段, then 沒有彈跳、柱高直接切換。
- `npm test`、`npm run build` 通過；draw call 與三角形記在 Implementation Notes。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）：全城 8 點、放大市中心、選區、點站、深夜 3 點、reduced-motion，與原型同情境並排。
