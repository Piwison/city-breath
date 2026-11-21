---
title: '搭乘模式第 0 期：板南線試乘'
type: 'feature'
ticket: '6'
created: '2026-11-20'
status: done
baseline_revision: '3f503102797b4ee95bc85b719ffa6a76bf9b7caa'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 首頁的主要路「搭一趟捷運」還不存在：沒有辦法坐在板南線上看台北，停靠時才看那站的車站卡。

**Approach:** 同一個 `<CameraControls>` 沿 basemap 板南線的真實軌道（非 approx 段，經 `project()`／`elevation()`）在路線上方約三層樓高前進、到站減速停靠開車站卡（摘要高度）；搭乘狀態 `ride{line, station}` 在 `state/`，網址只經 `url.ts`。頂埔段先用管線從 OpenStreetMap 補真實軌跡（AD-21），補不到才只搭到最後一個有真實軌道的站並寫原因。

## Boundaries & Constraints

**Always:** 顏色字型只走 `:root` token、Three.js 用 `useTokenColor`；每個動畫有減少動態版（一站一站直接切換）；行進中畫面上沒有卡片、數字、說明，只有暫停、下一站、下車三顆（≥ `--tap`）；停靠才開現有車站卡（3.12／3.22，peek）；狀態只在 `web/src/state/`、網址只由 `state/url.ts` 讀寫、搭乘中只在暫停或到站時寫網址；`?debug=perf` 面板搭乘中照常；不在 approx 直線上假裝真實沿線；不編造幾何或數字。

**Never:** 不做隧道、不加新模型或新資料（OSM 軌跡除外，走管線）；不做分享鈕、首頁主按鈕版面、「⋯更多」（3.24）；不做後面幾期；不另建第二個鏡頭或 renderer；不送新的計數事件。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 首頁進入 | 按「搭板南線」 | 鏡頭飛到西端第一站上方、往東出發；其他 HUD 收起 | 資料未載入時按鈕 disabled |
| 車站卡進入 | 板南線站的卡按「搭這條線」 | 卡關、從這站往較遠的終點出發 | 不在搭乘路線上的站（只連 approx 段）不出按鈕 |
| 停靠 | 抵達一站 | 減速停住、開那站車站卡（peek），停留後自動出發 | 碰卡片＝暫停 |
| 終點 | 抵達端點站 | 停住、暫停；再按繼續或下一站就反向 | — |
| 減少動態／靜態模式 | prefers-reduced-motion | 不連續移動，停留後直接切到下一站 | — |
| 連結 | `?ride=BL&station=<id>` | 回到同一站、暫停、卡開著 | 線不支援或站不在路線上 → 退回全景並說明 |
| 下車 | 按下車 | 回全景、播放維持暫停、恢復鏡頭限制 | — |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/basemap.py` -- `build_basemap`、`build_rail`、`add_gap_tracks`、`fingerprint`：加 OSM 軌跡補段（讀 `.osm`、接到同線最近端點、approx=False）、OSM 內容指紋、notes；`BASEMAP_REVISION` 加一。
- `pipeline/config/basemap_sources.csv` -- 加 OSM way 806164088（ODbL）一列；`cli.py cmd_fetch_basemap` 用 `bm.fingerprint`。
- `web/src/state/view.ts` -- 加 `ride` 欄位、非 React 的 `rideMotion`、低階寫入；`selectStation` 會送計數，搭乘停靠不用它。
- `web/src/state/ride.ts`（新）-- 路線站序、`advanceRide(dt)`、開始／暫停／下一站／下車／還原、速度曲線（純函式可測）。
- `web/src/state/url.ts` -- `ride` 鍵：`UrlState`、`KEYS`、`parseQuery`、`planLink`、`urlStateOf`、`dropsOf`、`syncUrl` 的 keyOf（行進中不寫）、`clearViewQuery`。
- `web/src/scene/ridePath.ts`（新）-- 由非 approx 軌道組出路徑（project()）、站投影、取樣位置；vitest 驗證每點在軌道上。
- `web/src/scene/RideCamera.tsx`（新）-- 每格推進 ride clock、`setLookAt` 擺鏡頭；進出時 FOV／near。
- `web/src/scene/CameraRig.tsx` -- 搭乘中放寬距離與傾角限制、不因轉向重設鏡頭。
- `web/src/scene/Selection.tsx` -- 搭乘中不選取、不飛。
- `web/src/scene/Stations.tsx`、`Flows.tsx`、`DistrictLabels` 呼叫處 -- 搭乘中不長站柱、不標站名、不畫流向與其標籤。
- `web/src/scene/Blocks.tsx` -- 搭乘中把路徑兩側走廊內的示意建築與樹沉下去（uniform＋instance attribute，減少動態直接切換），鏡頭不穿樓。
- `web/src/scene/ScenePage.tsx` -- 算路線、還原連結、首頁暫時按鈕、搭乘控制、搭乘中收起其他 HUD、碰畫面或卡片暫停。
- `web/src/card/StationCard.tsx` -- 「搭這條線」（`onRide` prop）。
- `web/src/debug/PerfPanel.tsx` -- 不改，確認搭乘中照常。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/...` -- OSM 補段＋測試，下載 OSM 檔、重建 basemap.json -- 頂埔段真實軌跡（AD-21）
- [ ] `web/src/scene/ridePath.ts` + test -- 路徑與站序 -- 每點在軌道上
- [ ] `web/src/state/ride.ts`、`view.ts`、`url.ts` + tests -- 搭乘狀態、時鐘、網址
- [ ] `web/src/scene/RideCamera.tsx`、`CameraRig.tsx`、`Selection.tsx`、`Stations.tsx`、`Flows.tsx`、`Blocks.tsx` -- 鏡頭與場景讓路
- [ ] `web/src/scene/ScenePage.tsx`、`scene.css`、`card/StationCard.tsx` -- 入口、控制、收起 HUD
- [ ] `docs/data-contract.md`、`DESIGN.md` -- 底圖來源與搭乘說明
- [ ] Playwright 390×844 截圖到 `design/reviews/8.6-ride-bannan/`

**Acceptance Criteria:**
- Given 建置版，when 從板南線車站卡按「搭這條線」或首頁「搭板南線」，then 鏡頭沿軌道前進、到站減速並開那站車站卡（摘要高度）。
- Given 行進中，when 看畫面，then 沒有卡片、數字與說明，只有三顆 ≥ 44px 的按鈕。
- Given reduced-motion，when 搭乘，then 一站一站直接切換。
- Given 暫停中的搭乘網址，when 新分頁打開，then 同一站、暫停、卡開著。
- Given `?debug=perf`，when 搭乘，then 面板照常顯示 fps。

## Implementation Notes

- 沒有可用的實作子代理，直接照計畫實作（step-03 允許）。
- 頂埔段：工作區連得到 `api.openstreetmap.org`（overpass、geofabrik 被擋）。OSM way 806164088（railway=subway、ref=BL、start_date 2015-07-06，頂埔延伸段單一方向的軌道，26 節點）由 `basemap_sources.csv` 登記為必要來源（ODbL），`build` 用 `add_osm_tracks` 接到路網圖板南線在永寧附近的端點（約 70 m，兩份圖的接縫），頂埔不再列為缺段。一條 way 屬 OSMF 的「非實質」擷取，標出處即可。重建 basemap.json：只有 basemap.json 變（`basemapRevision` 2，頂埔段非 approx），2026-09 其他輸出位元組相同（meta.json 只差 generatedAt，已還原）。
- API 回應的 `generator` 每次不同（含伺服器行程編號），原始位元組 sha256 每抓一次就變；`.osm` 改用內容指紋（`osm_fingerprint`），`fetch-basemap` 也改用 `bm.fingerprint` 比對。
- 發現（未處理，記給 Piwi）：廣慈/奉天宮在資料裡被判成板南線（`nearest`），basemap 有一段從南港展覽館拉到廣慈/奉天宮約 4 km 的 BL approx 直線；它實際是信義線東延段的站。搭乘路徑不走 approx，所以不停這站；地圖上的那條直線是 1.12 起就有的。
- 搭乘鏡頭：三層樓＝街廓窗戶的樓層高 `FLOOR_H`（0.22）× 3；真實高程換算的 10 公尺只有 0.035 單位、會低於所有示意積木，不採用。鏡頭朝前約 15° 往下看。直式手機的 38° FOV 太窄，搭乘中放寬到水平約 36°（垂直上限 72°），near 拉到 0.08。
- 鏡頭沿軌道會穿過示意建築（街廓不避開軌道）：搭乘時路徑兩側走廊（0.34 單位）裡的建築、小塔與樹沉進薄片（`corridorMask`＋`aRide`／`uRide`），下車後長回來；佈局本身不變，首頁全景不受影響。
- 搭乘中讓路：站柱收起、站珠縮小並在鏡頭附近淡出、軌道線收細一半、離鏡頭很近的列車淡出（不然會整片擋住畫面）；流向、區名、站名、時段名、停駛提示、上方按鈕、時間軸、「找你的站」主按鈕都收起。
- 搭乘狀態 `ride{line, station, docked, playing}` 在 view.ts，連續位置 `rideMotion` 是非 React 欄位，`state/ride.ts` 是唯一改寫它的地方（AD-16）；`advanceRide` 由 RideCamera 每格呼叫。網址 `ride=BL&station=…` 由 url.ts 在停靠或暫停時寫，行進中 keyOf 回 null 不寫。

## Plan Change Log

## Review Triage Log

### 第 1 輪（quick；這個工作階段沒有子代理可用，由實作者對照票面 verify 與 CLAUDE.md 不可違反的規則自審全部 diff，獨立審查留給 6.5）

計數：high 0、medium 4、low 3、false 1、maybe-false 0。

| # | 發現 | 判定 | 路由 | 證據／處理 |
| --- | --- | --- | --- | --- |
| 1 | 停靠時從車站卡按「從這站找通勤」沒反應：搭乘中 FindStation 整個不掛，通勤面板出不來 | medium | patch | `FindStation` 加 `hideMain`，搭乘中只收主按鈕；面板開著時先收搭乘控制（`RideControls` 的 picking） |
| 2 | 停靠時開了通勤面板或通勤卡，自動出發後卡片還在（行進中有卡片，違反「先玩，再給資訊」） | medium | patch | `ride.ts depart()` 一併收起 commute；`ride.test.ts`「停靠時從卡上開了通勤面板：出發時跟著收起」 |
| 3 | 建築沉下去後屋頂小塔浮在半空（小塔的走廊判斷用了較小的寬深） | medium | patch | 小塔用它建築的寬深（÷0.6）判斷；截圖確認 |
| 4 | 列車與站珠經過鏡頭旁時整片擋住畫面（鏡頭只比列車高約半個單位） | medium | patch | 搭乘中列車在 2–4 單位內縮小淡出、站珠縮成 0.45 倍並在 0.6–1.3 單位內淡出；站珠每格重寫但陰影圖只在結構變時重畫（避免每格重畫陰影） |
| 5 | 暫停鈕同時改字又帶 aria-pressed，螢幕閱讀器會念成「繼續，已按下」 | low | patch | 拿掉 aria-pressed，只換字 |
| 6 | 「搭這條線」的 aria-label 不含看得到的字（label-in-name） | low | patch | aria-label 改成「搭這條線（板南線），從 X 出發」 |
| 7 | 搭乘控制在卡片出現時用 `bottom` 做 transition（版面屬性） | low | reject | 只是一個 3 顆按鈕的絕對定位小元件、一次 380 ms，減少動態時 0 ms；改 transform 要另外換算 --dock-top，複雜度不值得 |
| 8 | 自動停靠開的車站卡沒送 `station_opened`，「每位訪客開幾站」會少算搭乘的人 | false | — | 刻意的：不是使用者點的卡；送了反而灌水（AD-20 指標的定義是「打開」）。寫在 view.ts `writeRide` 與 DESIGN.md，Piwi 可推翻 |

驗證（對照票面 verify，建置版、Playwright 390×844、DPR 2，`design/reviews/8.6-ride-bannan/checks.json`）：兩個入口都能上車；行進中取樣畫面沒有任何文字、只有暫停／下一站／下車三顆（80×44、94×44、80×44）；到站開那站車站卡、摘要高度（露出 0.33）；暫停後網址 `ride=BL&station=…`，新分頁打開同一站、「繼續」（暫停中），8 秒後仍在同一站；下車回全景、網址留 hour（暫停）；停靠約 6 秒後自動出發、卡片收起；減少動態三次跳站，每站之間畫面雜湊完全相同、每次都停靠開卡；`?debug=perf` 搭乘中面板照常顯示 fps；無 console 錯誤。vitest：`ridePath.test.ts`（每一點在板南線真實軌道上、頂埔是起點、approx 站不停）、`ride.test.ts`。pytest 389 全過（新增 3）。

## Design Notes

速度曲線：每段 = 正弦加速 RAMP 秒 → 等速 CRUISE → 正弦減速 RAMP 秒（段太短時只有加減速）；停靠點在站的投影往回 STOP_BACK，讓站珠在前方看得到。三層樓 = 街廓窗戶樓層高（0.22 單位）× 3，基座 = 軌道高度與 `levelHeight(terrainLevelAt())`（經 `elevation()`）取大者。搭乘自動停靠開的卡不送 `station_opened`（不是使用者點的，避免灌水「每位訪客開幾站」）。

## Verification

**Commands:**
- `cd web && npm ci && npm test && npm run build` -- expected: 全部通過
- `cd pipeline && uv run --group dev pytest` -- expected: 全部通過
- `uv run _bmad/method/scripts/tickets.py --project-root . status _bmad-output/initiative-city-breath > /dev/null` -- expected: exit 0

**Manual checks (if no CLI):**
- Playwright 390×844：兩個入口、行進中無卡無數字、停靠開卡、三顆按鈕尺寸、reduced-motion 跳站、網址往返、`?debug=perf`。
