---
title: '3.20 行政區總量輸出（契約 v4）'
type: 'feature'
ticket: '20'
created: '2026-11-12'
status: 'built'
baseline_revision: '30308aa1b55a4cebad23a657f247cf424767fe1b'
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

**Problem:** 3.18 的「假日前 5 區」需要每區每小時進出總量，但契約 v3 沒有；在前端把 `stations.json` 已四捨五入的站平均相加違反 AD-7。

**Approach:** 管線在 `districts.json` 每區加 `weekday`／`holiday` 的 `{ entries[24], exits[24] }`（區內各站整數總人次加總 ÷ 日型天數再四捨五入），契約升 v4，12 個月與 `basemap.json` 重建；隱藏結果不變。

## Boundaries & Constraints

**Always:** AD-7 先加整數總人次再除；停止營運小時 `null`（AD-5）；區只用 `districts.py` 的 `station_codes`（AD-9）；`exits` 只算 `exitsRecorded` 的站；契約三處（data-contract.md、export.py、types.ts）＋ load.ts 同一 commit（AD-1）；所有月份與 basemap.json 的 `v` 都是 4（AD-18）。v3 已公開的 od、district-flows、inbound、topDestinations、daily 場館格逐格不變（AD-3）。

**Never:** 不改 web 畫面（3.18）、不動 3.6 的 web/src 卡片與流向、不改 DESIGN.md／SKILL.md；不在前端相加站平均；不編造數字。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般區 | 區內多站、營運小時 | `entries[h]` ＝ round(Σ 站整數總人次 ÷ 天數) | — |
| 停止營運 | h 不在 `service_hours` | `entries[h]`、`exits[h]` 為 `null` | — |
| 有環狀線站的區 | `inflowPartial: true` | entries 含環狀線站；exits 不含（少算） | — |
| 沒有車站的區 | `stations: []` | `weekday`、`holiday` 為 `null` | — |
| 區內全是出站未入檔的站 | 目前不存在 | 不能輸出 exits | `build` 報錯 |
| 舊版資料 | `v: 3` 的檔 | load.ts 拒絕 | 丟可讀錯誤 |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/__init__.py` -- `CONTRACT_VERSION` 3 → 4。
- `pipeline/src/city_breath_pipeline/district_flows.py` -- 區的彙總都在這裡；`total_count` 由平均還原整數總人次。新增 `district_profiles(station_hourly, stations, codes, day_counts, service_hours)`。
- `pipeline/src/city_breath_pipeline/export.py` `export_month` -- 寫 `districts.json` 處（約 322 行）把每區加上 `weekday`／`holiday`；`DistrictResult.districts` 是 dict 列表（測試會給空列表）。
- `pipeline/src/city_breath_pipeline/suppress.py` -- 不改邏輯；`district_groups` docstring 註明 v4 區總量就是列、欄組的總量，不新增組。
- `pipeline/tests/test_published_cells.py` -- v2→v3 遮罩測試保留；加 v3→v4：v3 公開數字的摘要 fixture，現有資料必須相同。
- `pipeline/tests/test_district_flows.py` -- 合成資料的 AD-7 測試在這裡加區總量測試，並加對 committed 資料的形狀與加總檢查。
- `docs/data-contract.md`、`web/src/data/types.ts`（`District`）、`web/src/data/load.ts`（`CONTRACT_VERSION`、`loadDistricts` 形狀檢查）、`web/src/data/load.test.ts`。
- `pipeline/src/city_breath_pipeline/cli.py` `cmd_build` -- 建最新月份時重寫 basemap.json；不改。

## Tasks & Acceptance

**Execution:**
- [x] `pipeline/src/city_breath_pipeline/district_flows.py` -- 加 `district_profiles` -- AD-7 的區總量。
- [x] `pipeline/src/city_breath_pipeline/export.py`、`__init__.py`、`suppress.py`（docstring） -- 寫入 districts.json、升 v4。
- [x] `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts`、`web/src/data/load.test.ts` -- 契約 v4 與載入檢查。
- [x] `pipeline/tests/test_district_flows.py`、`pipeline/tests/test_published_cells.py`＋fixture -- 單元測試、2026-09 手算格、v3→v4 不變。
- [x] `web/public/data/` -- 12 個月與 basemap.json 重建，確認只有預期改變。

**Acceptance Criteria:**
- Given 2026-09 原始 CSV，when 用 duckdb 直接算大安、蘆洲平日 8 點與假日 14 點進出，then 等於 districts.json 的值。
- Given 重建後資料，when 跑 `pytest`，then v3 公開格的摘要全部相同、所有 JSON 的 `v` 為 4。
- Given v4 資料，when 跑 `npm test && npm run build`，then 通過，load.ts 拒絕 v3 與缺區總量的 districts.json。

## Implementation Notes

- 沒有可派工的 subagent，直接照 plan 實作。
- `district_profiles` 在 `district_flows.py`，`districts_json` 在 `export.py`；區總量欄位接在每區既有欄位之後。
- 四捨五入沿用 Python `round`（剛好 .5 取偶數），與 `build_profiles`（stations.json）一致；2026-09 大安區假日 14 點出站 188,365 ÷ 10 ＝ 18,836.5 → 18,836 就是這種情況，契約已寫明。
- v3→v4 檢查用摘要（`fixtures/published_v3.json`，在重建前的 v3 資料上產生），不另存遮罩，fixture 小、CI 不需要 git 歷史。
- 重建：2026-09 用主 checkout 的月檔，其餘 11 個月 `fetch` 到 worktree 的 `data/raw/`，建完即刪。

## Plan Change Log

## Review Triage Log

- Pass 1（quick；這個 session 沒有可派的 reviewer subagent，由實作者依 plan 的 AC 與 CLAUDE.md 規則自行逐項檢查 diff）：high 0、medium 0、low 0、false 0、maybe-false 0。
  - AC1 手算：duckdb 直讀 2026-09 原始 CSV 的 8 格與 districts.json 相同，釘在 `test_district_totals_match_hand_count_2026_09`。
  - AC2：`test_numbers_published_in_v3_unchanged` 12 個月全過；另以腳本比對 3,155 個改變的檔，去掉 `v` 後只有 districts.json 新欄位與 11 個月 meta.json 的 `sources[0].retrieved`（重新下載月檔、sha256 相同）。
  - AC3：`npm test` 195 過、`npm run build` 過；load.test 涵蓋 v3 拒絕、缺區總量、非 24 格與所有已輸出月份。
  - 規則：契約三處＋load.ts 同改；區只用 `station_codes`（AD-9）；web 只動 data/ 下的 types.ts、load.ts、load.test.ts；suppress.py 只改 docstring。

## Design Notes

隱藏分析：區 `entries` ＝ Σ 區內站 `entries`，`exits` ＝ Σ 區內出站有紀錄站的 `exits`，都是已公開站總量的線性組合；AD-3 的模型把站總量視為精確公開，所以區總量不帶新資訊，也恰是 `district_groups` 的列組（起區各迄區之和）與欄組（迄區各起區之和）早已當作公開的總量。不新增組、不新藏格；重建後以摘要比對證明。

## Verification

**Commands:**
- `cd pipeline && uv run --group dev pytest -q` -- 全過。
- `cd web && npm test && npm run build` -- 全過。
- `git diff --stat` 重建後 -- 只有每個 JSON 的 `v`、meta 的 `generatedAt`、districts.json 的新欄位改變（以腳本比對去掉 `v` 後的內容）。
