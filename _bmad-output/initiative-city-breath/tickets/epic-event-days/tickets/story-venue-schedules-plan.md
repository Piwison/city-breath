---
title: '場館檔期自動匯入'
type: 'feature'
ticket: '2'
created: '2026-11-04'
status: done
baseline_revision: '5c54d479d12d8015d36f85fe6881162e3d249497'
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

**Problem:** 7.1 的站級異常都標「原因未查證」，且暫定門檻漏掉 9/20 小巨蛋（漢斯季默，1.39 倍、多 4,476 人），又把輔大開學造成的水位變化誤判成 5 天異常。

**Approach:** 新增 `city-breath fetch-events --month` 抓臺北市資料大平臺三個場館檔期快照（含 BIG-5 解碼）到 `data/raw/events/`；`build` 解析後對上 `venues.csv` 的車站，和站級異常配對寫進 `events[]` 與 `eventIds`；站級門檻改成「倍數＋人數＋站自身變異（modified z-score）」三條件並定案。

## Boundaries & Constraints

**Always:** 判定與門檻只在 `anomaly.py`（AD-14）；配對只在管線，前端只查表（AD-13）；每個用到的快照列進 `meta.json` 的 `sources[]`（網址＋sha256，AD-1）；`venues.csv` 只讀；租用期整段保留為 `startDate`/`endDate`，演出日＝期間內該場館站有站級異常的日子（只有那些日子連 `eventIds`）；`events[]` 形狀照 AD-14；輸出可重現；契約四處同一 commit。

**Never:** 不做人工活動表（7.3）與畫面（7.4）；不動 1.9 的流向檔；不改 tickets.toml、不標 done；不提交 `stations.json` 的 ±1 重產雜訊。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| BIG-5 檔 | 小巨蛋 `_202609.csv`（cp950） | 正確解出「漢斯季默」等名稱 | UTF-8／BIG-5 都解不開就報錯 |
| 租用期跨進場拆台 | IVE 9/7–13，只有 9/13 異常 | event 起訖 9/7–13，只有 9/13 的異常帶它的 id | — |
| 中山堂逐場列 | 同節目多天多場 | 合成一筆，候選日＝實際演出日 | — |
| 花博年度檔未發布 | 只有 114 年度 | 0 筆、`fetch-events` 與 `build` 都印出「尚未發布」 | 不中斷 |
| 沒抓快照 | `data/raw/events/YYYYMM/` 不存在 | `build` 失敗並提示跑 `fetch-events` | SystemExit |
| 站級門檻 | 9/20 小巨蛋 1.39 倍、z≈4.5；輔大 1.66 倍、z≈0.7 | 前者列入，後者不列 | — |
| 沒配到異常的檔期 | 中山堂節目，西門無異常 | 不寫進 `events[]` | — |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/anomaly.py` -- 門檻常數、`is_station_anomaly`、`detect` 的站級迴圈；`THRESHOLDS` 帶 `provisional`。改門檻與加 z。
- `pipeline/src/city_breath_pipeline/venues.py` -- `load_venues`、`resolve_venues`（站索引→venue_id）；只讀。
- 新增 `pipeline/src/city_breath_pipeline/schedules.py` -- 資料集清單（pid、場館、選資源規則）、解碼、三種解析、快照 manifest、配對 `link()`。
- `pipeline/src/city_breath_pipeline/cli.py` -- 加 `fetch-events`；`cmd_build` 讀快照、把來源加進 `sources`、傳給 `export_events`；`_report_anomalies` 印配對。
- `pipeline/src/city_breath_pipeline/export.py` -- `export_events(agg, stations, out, events=...)` 填 `events` 與 `eventIds`。
- `docs/data-contract.md`、`web/src/data/types.ts` -- `thresholds` 形狀、門檻文字、`events[]` 的 auto 說明。
- 資料集：小巨蛋 `f0497727-…`（每月一個資源 `_YYYYMM`，Big5）、花博 `19c3ec8b-…`（年度資源「NNN年度…」，UTF-8，2026 未發布）、中山堂 `bf51fdc3-…`（單一滾動資源，UTF-8，逐場一列）。清單 API `https://data.taipei/api/frontstage/tpeod/dataset.view?id=<pid>`。

## Tasks & Acceptance

**Execution:**
- [x] `schedules.py` -- 抓取／解碼／解析／配對 -- AD-13
- [x] `anomaly.py` -- 定案門檻、`provisional: false` -- AD-14
- [x] `cli.py`、`export.py` -- `fetch-events`、build 串接、sources -- AD-1
- [x] `tests/test_schedules.py`、`tests/test_anomaly.py` -- 解析（含 BIG-5）、期間→演出日、配對、門檻 -- 測試
- [x] `docs/data-contract.md`、`types.ts`、CLAUDE.md 指令 -- 契約
- [x] 抓 2026-09 快照、重建、提交 `events.json` 與 `meta.json`

**Acceptance Criteria:**
- Given 2026-09 已重建，when 讀 `events.json`，then IVE（9/7–13）與漢斯季默（9/20–21）是 `source: "auto"`、附資料集網址的 event，且 9/13、9/20 小巨蛋站異常的 `eventIds` 指向它們。
- Given 同一份快照重跑 build，when 比對 `events.json`，then 位元組相同。

## Implementation Notes

- 無人值守執行：CHECKPOINT 1 未停下等核准，Design Notes 的假設待 Piwi 確認；本環境沒有子代理，實作與審查都在同一個 session 直接做（同 7.1）。中途 container 重啟一次，從未提交的工作樹接續。
- 新增 `schedules.py`（資料集清單、`pick_resource`、`fetch`、`decode`、`parse`、`load`、`link`）、`tests/test_schedules.py`（15 個）；`anomaly.py` 加 `station_z` 與第三條門檻；`export_events` 收 `schedules`、`venue_stations`；`cli.py` 加 `fetch-events` 與配對摘要。
- 中山堂有一列寫成區間（`20270106至20270109`），改成展開成每一天。
- 本環境的 Python 3.13 對代理 CA 做嚴格 X.509 檢查，`urllib` 連不上 data.taipei；快照改由 scratch 腳本把 curl 當 `get` 傳給同一個 `fetch()` 抓（`fetch()` 的 `get` 參數本來就為測試保留）。Piwi 的機器不受影響。
- 2026-09：花博 115 年度資源未發布（最新 114 年度），記為 missing；小巨蛋 6 筆、中山堂 10 筆節目共 16 筆檔期，配到異常 2 筆（IVE→9/13、漢斯季默→9/20）。站級異常 17 筆，15 筆仍「原因未查證」。
- 重跑兩次 `events.json` 位元組相同；`stations.json` 的 ±1 重產雜訊未提交。
- 觀察：9/11、9/12 小巨蛋（IVE 前兩天）1.29／1.30 倍、z≈3.4，剛好不到門檻；中山堂（西門）整月沒有站級異常，所以 events[] 沒有中山堂檔期。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，同 session 自審，無子代理）：high 0／medium 0／low 1／false 0／maybe-false 0。
  - low｜patch｜CLAUDE.md 沒寫花博年度檔晚發布的已知狀況：已補一行。

## Design Notes

假設（無人值守，未經 Piwi 確認）：

1. **站級門檻**：當日 ≥ 平常 × 1.3、多出 ≥ 1,000 人，且 modified z-score ≥ 3.5（Iglewicz–Hoaglin：該站該方向整月「當日÷平常」倍數的中位數與 MAD，M = 0.6745 ×(r − 中位數)/MAD；MAD 為 0 時此條視為通過）。z 擋住「整月本來就大起大落」的站（輔大開學），倍數與人數底線擋住大站的小百分比與小站的小人數。全以分數精確比較。
2. `events[]` 只放配到至少一筆異常的自動檔期；`verified: false`（機器配對，未經人工）；`url` 為資料集頁 `https://data.taipei/dataset/detail?id=<pid>`。
3. `id`＝`auto-<venue_id>-<起日YYYYMMDD>`，同場館同起日再加 `-2`、`-3`（依名稱排序）。
4. 中山堂同名節目在當月合成一筆（起訖＝最早／最晚演出日，候選日＝演出日）；小巨蛋、花博的候選日＝租用期每一天。
5. 只抓當月資源；上個月資源中跨月的租用期不處理（2026-09 沒有這種情況）。

## Verification

**Commands:**
- `cd pipeline && uv run --group dev pytest` -- expected: 全過
- `cd pipeline && uv run city-breath fetch-events --month 2026-09 && uv run city-breath build --month 2026-09` -- expected: 印出 IVE、漢斯季默配對
- `cd web && npm test && npm run build` -- expected: 通過
