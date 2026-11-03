---
title: '逐日每站每小時輸出'
type: 'feature'
ticket: '10'
created: '2026-11-04'
status: 'built'
baseline_revision: '78c3e6034b5eb26af05db7d17feac8c635e254cf'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 活動日（R5）要看某一天每站每小時的進出，以及場館站當天的人從哪些行政區來；目前只有月平均與 `daily.json` 的每日進站總量。

**Approach:** 管線多寫 `daily/{YYYY-MM-DD}.json`（每天一檔）：每站 24 小時進站、出站（站層級總量，不受 < 10 限制），以及 `pipeline/config/venues.csv` 列出的場館站之「來源行政區 × 進站小時」到站人次，經 `suppress.py` 主要＋次要隱藏。網站加型別與只在進入某天才載的 loader。

## Boundaries & Constraints

**Always:** 站的參照＝同月 `stations.json` 陣列索引（AD-2）；venues.csv 站名經 `stations.canonical()` 解析，對不到站或站的 `exitsRecorded=false` 就讓 build 失敗；行政區取自 1.8 的 `districts.station_codes`（AD-9）；小時＝進站時段（AD-15）；逐日檔小時陣列 24 格，當日全市沒有人次的小時為 `null`（AD-5）；場館格子只經 `suppress.apply` 與新的 `venue_origin_groups`（AD-3）；契約三處同 commit（AD-1）；輸出可重現（整數加總、鍵排序）。

**Never:** 不刪 `daily.json`（7.1 移除）、不動 1.9 的 `district-flows.json`／`flows.json`；不改 tickets.toml、不標 done；不在前端推算行政區或反推隱藏格；不提交與本票無關的重產雜訊（`stations.json` topDestinations、`daily.json` 鍵順序）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般小時 | 某站當日 8 點進 1,234 | `entries[i][8] = 1234`（不隱藏） | — |
| 全市停駛 | 當日 3 點全市 0 人次或無列 | 每站 `[3]` 皆 `null`，場館各區 `[3]` 也 `null` | — |
| 該站無人 | 全市有營運、該站 0 | `0` | — |
| 環狀線站出站 | `exitsRecorded=false` | `exits[i] = null`（整列） | — |
| 場館格 < 10 | 某區 → 小巨蛋 16 點 7 人 | `null` | — |
| 場館組只一格 null | 組內各區之和＝`exits[站][h]` | 再藏組內最小已公開格 | — |
| 未知場館站名 | venues.csv 寫錯站名 | — | build 失敗並列出站名 |
| 場館站為環狀線站 | 出站未入檔 | — | build 失敗 |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/aggregate.py` -- `aggregate_month` 的 DuckDB `od` 表（d, h, o, dest, n，已套別名）；新增 `daily_hourly`（d, name, h, entries, exits，整數）與 `daily_arrivals`（d, o, dest, h, n，只取 `arrival_dests` 參數裡的迄站、n>0）。既有查詢不動。
- `pipeline/src/city_breath_pipeline/stations.py` -- `canonical()`、`Station.exits_recorded`；venues 解析重用 `canonical`，不改本檔。
- 新 `pipeline/src/city_breath_pipeline/venues.py` -- `load_venues(path, aliases)`、`resolve_venues(venues, stations)`（未知／環狀線 → `VenueError`）。
- `pipeline/src/city_breath_pipeline/suppress.py` -- 在 `od_groups` 之後加 `venue_origin_groups`；`apply`、`unprotected` 重用。1.9 也會在此加函式，各自獨立。
- `pipeline/src/city_breath_pipeline/export.py` -- 新增獨立的 `export_daily(...)` 區段；`export_month` 不動（1.9 在改）。
- `pipeline/src/city_breath_pipeline/cli.py` -- `_load_month` 先讀 venues 傳給 aggregate，建站後解析；`cmd_build` 呼叫 `export_daily` 並印大小與隱藏數。
- `pipeline/src/city_breath_pipeline/districts.py` -- `DistrictResult.station_codes`（站名 → 8 碼）。不改。
- `web/src/data/types.ts`、`web/src/data/load.ts` -- 加 `DailyFile`、`loadDaily(month, date)`（同時取 stations.json 檢查 month，AD-2/AD-6）。
- `docs/data-contract.md` -- 加 daily/ 章節與場館組說明。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/config/venues.csv` -- 7 場館（venue_id, venue_name, station_name, source）。
- [ ] `pipeline/src/city_breath_pipeline/venues.py` -- 載入與解析。
- [ ] `pipeline/src/city_breath_pipeline/aggregate.py` -- 兩張逐日表。
- [ ] `pipeline/src/city_breath_pipeline/suppress.py` -- `venue_origin_groups`。
- [ ] `pipeline/src/city_breath_pipeline/export.py` -- `export_daily`。
- [ ] `pipeline/src/city_breath_pipeline/cli.py` -- 接上。
- [ ] `pipeline/tests/test_daily.py` -- 逐日彙總、null 小時、場館解析、組定義、已提交輸出逐組 0 或 ≥2 null、場館組公開值和 ≤ exits、檔案形狀。
- [ ] `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts` -- 契約。
- [ ] `web/public/data/2026-09/daily/` -- 重建並提交。

**Acceptance Criteria:**
- Given 2026-09 原始檔，when `uv run city-breath build --month 2026-09`，then 寫出 30 個逐日檔並印出總大小與場館隱藏格數；9/13 台北小巨蛋 16 點出站約 2,642（同月假日平均約 730）。
- Given 已提交的逐日檔，when pytest，then 每個場館組皆零格或 ≥2 格 null。
- Given 網站，when `npm test && npm run build`，then 通過。

## Implementation Notes

Assumptions（無人值守，記錄於此）：
- 契約版本維持 v2：AD-10 把 daily/ 列為 v2 的檔案，docs 也寫「v2 之後還會加」；只新增檔案、未改既有欄位。
- 「當日全市沒有紀錄」以當日該小時全市人次和為 0 判定（原始檔 2–4 點整列不存在；全為 0 的列同樣當停駛）。
- 環狀線站的 `exits` 在逐日檔整列為 `null`（未入檔，不是 0）；月平均檔維持原樣。
- 場館站各區組含同站進出（起站＝迄站），因此各區之和恰等於當日 `exits[站][h]`。整列（24 小時）皆 null 的來源行政區不列出，等同 null 格，計入組內 null 數。
- venues.csv 的站名寫正規站名（無「站」字，例 `台北小巨蛋`）。

實作紀錄：
- 無人值守，且此環境沒有可派出的 subagent：實作與 quick 審查都由同一個 session 直接依本計畫完成（同 1.8、1.11）。
- 新增 `venues.py`（`load_venues`、`resolve_venues`、`VenueError`）、`config/venues.csv`（7 館 7 站）；`aggregate_month` 加 `arrival_dests` 參數與 `daily_hourly`、`daily_arrivals`（DuckDB 整數加總並排序，重跑逐位元相同）；`suppress.venue_origin_groups`；`export.export_daily` 為獨立區段，`export_month` 未動；`cli._load_month` 回傳多一個 `venue_stations`。
- `export_daily` 每個（場館站, 營運小時）檢查各來源區之和＝同檔 `exits`，不等就 build 失敗。來源區清單＝所有車站的區（2026-09 為 21 區）。
- 2026-09：30 檔共 1,187,635 bytes（單檔 38.8–40.0 KB，gzip 合計 383 KB）。場館格 92,610：少於 10 人隱藏 14,942 格、次要隱藏 873 格。
- 查核：9/13（日）台北小巨蛋 16 點出站 2,642（其他週日 730、1,146、691；假日平均 1,511）；9/5（六）劍潭 19 點出站 9,817（其他週六 2,163、2,493、2,112；假日平均 2,972）。
- 網站：`DailyFile`、`VenueArrivals` 型別；`loadDaily(month, date)` 同時取同月 stations.json 檢查 month 與站數；新增 `load.test.ts`。
- 重跑 build 時 `stations.json`、`daily.json`、`meta.json`（generatedAt）有與本票無關的差異（deferred-work.md 既有條目），未提交；本票提交的資料只有 `daily/`。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，inline 自審；本環境無審查子代理，Piwi 看 PR 時再審）：high 0／medium 0／low 1／false 2／maybe-false 0。
  - low｜patch｜`cli.py` `_load_month`：區域變數名 `agg_venues` 易誤解為彙總結果 → 改名 `venue_stations`。
  - false｜「場館格可由其他公開總量反推」：查過 `daily.json`（只有每日進站）、`stations.json`（月平均）、od 分片（月平均）、1.9 的 district-flows（月平均、行政區對行政區），都不是單日單站來源區格子之和；全日出站是各小時組的聯集，各小時組保護即保護。
  - false｜「省略的來源區洩漏資訊」：只省略整天全為 null 的區，與列出全 null 等價；測試把省略的區算 null 格逐組檢查。

## Design Notes

逐日檔形狀（緊湊陣列）：

```json
{"v":2,"month":"2026-09","date":"2026-09-13","dayType":"holiday",
 "entries":[[…24]…],"exits":[[…24]|null…],
 "venues":[{"station":87,"venueIds":["taipei-arena"],
            "origins":["63000040",…],"arrivals":[[…24]…]}]}
```

`venue_origin_groups(venue_stations, origin_districts, hours)`：每個（場館站, 營運小時）一組 `[(站, 區, h) for 區]`，公開總量＝同檔 `exits[站][h]`。其他總量（每日每站進站、月平均）不等於這些格子的和。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath build --month 2026-09` -- expected: 30 個逐日檔與大小、隱藏數
- `cd pipeline && uv run --group dev pytest -q` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 通過
