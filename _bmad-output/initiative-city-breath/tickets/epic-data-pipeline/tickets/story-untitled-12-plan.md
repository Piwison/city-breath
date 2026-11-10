---
title: '底圖圖層輸出'
type: 'feature'
ticket: '12'
created: '2026-11-10'
status: done
baseline_revision: '872f37d598e5b4ac30df2955dd8fdca249f88dee'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/design/prototypes/2.1-diorama/tools/build_layers.py']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 天光場景（2.3 起）要真實地形、海、河川、綠地、捷運軌道、每站路線、班距與地標，現在只有原型自己抓的 `layers.json`（新北河川用了沒標授權的服務、地標座標寫死在前端），不符 AD-1、AD-21、AD-25。

**Approach:** 把 `build_layers.py` 搬進管線成 `basemap.py`：`city-breath fetch-basemap` 依 `pipeline/config/basemap_sources.csv` 下載原始檔到 `data/raw/basemap/`（sha256 記在 csv）；`build` 在建最新月份時寫出不分月份的 `web/public/data/basemap.json`，契約三處同一個 commit。

## Boundaries & Constraints

**Always:** 幾何一律經緯度、5 位小數（AD-12）；高程存公尺、六層 40／120／250／400／600／850；路線 ID 固定 `BR R R-3 G G-3 O BL Y`、JSON 不放色碼（AD-21）；車站用站 ID（AD-2 例外）；地標與行政區由管線用 AD-9 同一套界線判定（AD-25）；`v`＝`CONTRACT_VERSION`（新增檔不升版）加 `basemapRevision`；每個來源列進 `sources[]`（name、publisher、url、license、retrieved、sha256）；檔案 ≤ 1 MB；不編造數字（班距存來源的區間，不取中點）；輸出可重現（不放產生時間）。

**Never:** 不用新北市水利局 ArcGIS（沒標授權）、不用 WRA 河道的快取或鏡像；不輸出新北綠地；不改既有月份檔的形狀；不提交與本票無關的重產雜訊；不改 tickets.toml、不標 done。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 全部來源齊 | fetch-basemap 後 build 最新月份 | basemap.json ≤ 1 MB，sources 列出全部來源 | — |
| WRA 河道連不到 | gic.wra.gov.tw 下載失敗 | fetch 印繁中手動下載說明（網址、存放路徑、之後的指令），其他來源照抓 | 不中斷 |
| WRA 檔缺 | build 時 `wra_riverpoly.zip` 不在 | 警告；只有臺北市河川；`sources` 該筆 `missing: true` 附說明 | 不中斷 |
| 檔案被換 | sha256 與 csv 不符 | — | build 失敗，提示 `fetch-basemap --update` |
| 建舊月份 | `build --month 2025-10` | 不重寫 basemap.json，印出原因 | — |
| 環狀線站 | `exitsRecorded=false` | 路線只有 `["Y"]` | — |
| 地標站名錯／不在任何區 | landmarks.csv | — | build 失敗並列出地標 |
| 營運外 | 0–5 點、或來源班距 0 | 該格 `null` | — |

</frozen-after-approval>

## Code Map

- `design/prototypes/2.1-diorama/tools/build_layers.py` -- 原型做法：路網圖 RouteName→路線、KML 河川、水綠地圖集、DEM 台地與格網、班距解析、站→路線（150 m 內）、缺段直線補。照搬，但修三個缺陷：新北投支線沒切出（R-3 被含在淡水線長線段裡）、`新埔` 被誤加 Y、`Y板橋` 被加 BL；班距取中點改存區間；R-3 班距補上。
- `pipeline/src/city_breath_pipeline/districts.py` -- `sha256_file`、`to_meters`、`DistrictResult.districts`（簡化界線）與 `load_districts` 的 `District.geometry`（未簡化）。地標判區用**未簡化**的界線，與 AD-9 判站同一套。
- `pipeline/src/city_breath_pipeline/cli.py` -- 仿 `cmd_fetch_geo` 寫 `cmd_fetch_basemap`；`_districts()` 需同時回傳原始 `District` 清單給 basemap；`cmd_build` 末段呼叫 basemap。
- `pipeline/src/city_breath_pipeline/stations.py` -- `canonical`、`load_aliases`、`station_id`；地標站名經別名解析。
- `pipeline/src/city_breath_pipeline/export.py` -- `_write`；新增 `export_basemap` 寫檔。
- `web/src/data/types.ts`、`load.ts` -- 加 `BasemapFile` 與 `loadBasemap()`（驗 `v` 與形狀）。
- `docs/data-contract.md` -- 新章節 basemap.json、landmarks.csv、basemap_sources.csv。
- `pipeline/tests/test_months.py` 掃月份資料夾，basemap.json 在根目錄不受影響；`test_districts.test_all_published_files_use_current_contract_version` 會掃到它（v 必須相同）。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/config/basemap_sources.csv` -- 每個原始檔一列（key、file、name、publisher、url、dataset、license、retrieved、sha256、optional、note）。
- [ ] `pipeline/config/landmarks.csv` -- 原型 14 地標：id、name、kind、lon、lat、station_name、venue_id、source_url（位置取 Wikidata，CC0）。
- [ ] `pipeline/config/mrt_routes.csv`、`pipeline/config/station_lines.csv` -- 路網圖 RouteName→路線（含新北投支線的切段）、站路線人工修正（附理由）。
- [ ] `pipeline/src/city_breath_pipeline/basemap.py` -- 讀來源、驗 sha256、各層處理、組 JSON。
- [ ] `pipeline/src/city_breath_pipeline/cli.py`、`export.py`、`pipeline/pyproject.toml` -- fetch-basemap、build 接上、依賴（rasterio、pyproj、scipy、pyshp）。
- [ ] `pipeline/tests/test_basemap.py` -- 合成資料單元測試（班距解析、站路線、切段、WRA SHP 讀取、地標判區）＋已提交 basemap.json 的 verify 檢查。
- [ ] `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts`、`load.test.ts` -- 契約。
- [ ] `web/public/data/basemap.json` -- 產生並提交。

**Acceptance Criteria:**
- Given 已提交的 basemap.json，when pytest，then 2026-09 的 120 站都有路線（環狀線站為 `["Y"]`）、有班距的每線平假日各 24 格且 0–5 點為 null、每個地標的行政區在 districts.json 且車站在 stations.json、每個 basemap_sources.csv 來源都在 `sources`、檔案 ≤ 1 MB。
- Given 網站，when `npm test && npm run build`，then 通過，`loadBasemap` 版本不符時報錯。

## Implementation Notes

Assumptions（無人值守，記錄於此；Checkpoint 1 由派工者代為放行，同 1.8、1.10、1.11）：
- 契約版本維持 v2：AD-21 明訂新增 basemap.json 不升版；既有月份檔形狀不變。
- basemap.json 只在建最新月份時重寫（`stationsMonth`），避免重建舊月份時少掉新站。
- 班距存來源公告的區間 `[最短, 最長]`，不取中點（原型取中點）；RouteID R-3、G-3 依與 lines.csv LineID 同名對到新北投、小碧潭支線（待 Piwi 確認）；O-2 等其他 RouteID 不列。
- 切區、軌道的 `di` 用 districts.json 的簡化界線（和薄片同形）；地標判區用未簡化界線（AD-9）。用原始界線切時檔案 3.4 MB，改用簡化界線後 593 KB。
- 河川：臺北市河流（河川用地）與水利署 RIVERPOLY 合併，河道面扣掉臺北市河濱高灘地綠地（同原型）。兩者都保留：臺北市的河川用地含市管小溪溝，RIVERPOLY 讓新北與臺北用同一份河道。
- 地標座標改取 Wikidata（CC0）並附項目網址（原型座標沒有來源）；「淡水河口」的 Wikidata 座標在海上、不在任何區，改用淡水老街（Q11152333）。
- 站路線三個原型缺陷已修：新北投支線切段（mrt_routes.csv）、新埔誤加 Y、Y板橋誤加 BL（環狀線站固定 Y）；七張加 G-3 寫在 station_lines.csv。

實作紀錄：
- 此環境沒有可派出的 subagent：實作與 quick 審查由同一個 session 直接依本計畫完成。
- 新增 `basemap.py`、`config/{basemap_sources,landmarks,mrt_routes,station_lines}.csv`、`tests/test_basemap.py`（21 項）；`cli.py` 加 `fetch-basemap` 與 `_build_basemap`，`_districts` 改回傳 (結果, 原始界線)；`export.export_basemap`；依賴加 rasterio、pyproj、scipy、pyshp。
- 2026-11-10 `fetch-basemap`：DEM 兩塊、data.taipei 六個檔下載並登記 sha256；水利署網址 RemoteDisconnected，改登記 Piwi 手動放的 `data/raw/basemap/RIVERPOLY.zip`（sha256 ce5edd43…）。
- `build --month 2026-09`：basemap.json 592,719 bytes；120 站路線（幾何 104、最近 3、人工 2、環狀線 11）；軌道 31 段，直線補段：七張（G-3，約 606 m）、廣慈/奉天宮（BL，約 528 m）、新店（G，約 201 m）、頂埔（BL，約 1,845 m）；地標 14 個。重跑兩次 sha256 相同。
- 重跑 build 時 `2026-09/meta.json` 只有 generatedAt 不同，未提交。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，inline 自審；本環境無審查子代理，Piwi 看 PR 時再審）：high 0／medium 0／low 2／false 1／maybe-false 0。
  - low｜patch｜`cli.py` `cmd_build`：用 `sources[1:3]` 取出口座標與界線來源，sources 順序一改就拿錯 → 改依名稱挑選。
  - low｜patch｜`cli.py` `_build_basemap`：地標來源的取得日期寫死在 cli → 移到 `basemap.LANDMARKS_RETRIEVED`，與 landmarks.csv 放在一起說明。
  - false｜「超過 1 MB 時檔案已寫出」：build 會以非零結束並印出原因，CI 的 `test_published_basemap_header_and_size` 擋住超過的檔，不會被提交而不被發現。

## Design Notes

basemap.json 形狀（細節以 data-contract 為準）：`{v, basemapRevision, stationsMonth, bbox, levels, districts:[{id, water, green, terrain[6]}], outside:{terrain[6]}, sea, outsideWater, grid:{lon0,lat0,step,nx,ny,rows}, lines:[{id,name}], tracks:[{line, coords, di, approx}], stationLines:{stationId:[line]}, headway:{line:{weekday:[[min,max]|null ×24], holiday}}, landmarks:[{id,name,kind,lon,lat,station,district,venue}], sources:[…], notes:[…]}`。`di` 是軌道每個頂點所在的 `districts[]` 索引（−1＝不在有站的區）。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath fetch-basemap` -- expected: 下載 9 個檔、WRA 印手動說明
- `cd pipeline && uv run city-breath build --month 2026-09` -- expected: 寫出 basemap.json 並印大小與各層摘要
- `cd pipeline && uv run --group dev pytest -q` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 通過
