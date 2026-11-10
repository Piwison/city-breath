---
title: '車站類型：固定四型與定名'
type: 'feature'
ticket: '6'
created: '2026-11-11'
status: done
baseline_revision: '8053e3fb9af7ae0e9b287a38974289240bd857bd'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `cluster.py` 每個月各自 KMeans（k=4–8 取輪廓係數最大），群編號依大小排，12 個月的群不一致（6 個月出現「臥室站 2」「辦公站 2」）；照群編號在 `config/station_types.csv` 定名會貼錯，車站卡的類型在各月之間也對不起來。

**Approach:**（Piwi 2026-11-11 決定）改成固定類型：12 個月（2025-10～2026-09）有出站紀錄站的特徵（沿用 `_features`，服務時段 6–23 與 0 點）合併，KMeans k=4（n_init=20、random_state=20261026）得 4 個固定中心，存進 `pipeline/config/station_type_centroids.json`（附產生方式、月份、特徵定義版本），由新指令 `city-breath fit-types` 重新產生；平常 `build` 不重算中心，只把當月各站歸到最近的中心。四型依早上淨流向（amNet）由小到大給 id 0–3，名稱與一句話寫在 `config/station_types.csv`（Piwi 定案，不改）：臥室站／住商站／人氣站／辦公站。

## Boundaries & Constraints

**Always:** 正式中心只用管線從原始月檔算出的 profiles（`build_profiles`），不讀網站 JSON；`stations.json` 的 `types` 每月 4 筆、id 0–3、全部 `draft=false`、名稱各月相同；環狀線 11 站（出站未入檔）`type` 為 `null`、不進擬合；契約形狀不變就不升版，值的意義改變寫進 `docs/data-contract.md`；12 個月全部重建；架構補一條 AD「類型固定、每月歸類」。不編造數字。

**Never:** 不改名稱與一句話；`build` 不重算中心；不改 od、inbound、district-flows 等其他輸出（重建後 `test_published_cells.py` 仍過）；不做車站卡 UI（epic-station-personality）；不合併 PR、不標 done。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般月份 | build 2026-09 | 每個出站有紀錄的站歸到最近中心；types 4 筆、draft=false | — |
| 環狀線站 | `exitsRecorded=false` | `type: null` | — |
| 當月沒有任何平日進出的站 | 特徵全 0 | `type: null`，不硬塞 | — |
| 缺中心檔 | 沒有 `station_type_centroids.json` | — | build 失敗，提示跑 `fit-types` |
| 特徵定義不符 | 中心檔的特徵版本或小時與程式不同 | — | build 失敗，提示重跑 `fit-types` |
| 名稱表與中心數不符 | csv 的 id 少於或多於中心 | — | build 失敗 |
| 重新擬合 | `fit-types --months …` | 覆寫中心檔，印各型站數、輪廓係數、整年同型站數，提醒對照名稱表 | 缺月檔就失敗並提示 `fetch` |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/cluster.py` -- 改寫：保留 `_features`、`_describe`、`HOLIDAY_WEIGHT`；新增固定 `FEATURE_HOURS`、`FEATURE_VERSION`、`fit_types`（合併多月特徵擬合、依 amNet 排序）、`load_centroids`／`write_centroids`、`load_type_names`（csv `id,label,description`）、`assign_types`（取代 `cluster_stations`，回傳 `ClusterResult`）。移除 `_draft_label` 與每月選 k。
- `pipeline/src/city_breath_pipeline/export.py` -- `export_month` 改呼叫 `assign_types`；`meta.clustering` 維持 `{k, silhouette:{"4": 當月}}` 形狀。
- `pipeline/src/city_breath_pipeline/cli.py` -- 新增 `fit-types --months`（逐月 `aggregate_month`→`build_profiles`→擬合→寫檔＋摘要）；build 摘要改印固定類型。
- `pipeline/config/station_type_centroids.json`、`pipeline/config/station_types.csv` -- 新檔。
- `pipeline/tests/test_inbound.py` -- monkeypatch 改成 `assign_types`。
- `pipeline/tests/test_types.py` -- 新：合成資料單元測試＋已提交 12 個月檢查。
- `docs/data-contract.md`、`web/src/data/types.ts` -- 只改說明文字（形狀不變）；`App.tsx` 照常（`types[station.type]`、`draft` 顯示）。
- 架構 spine 補 AD-27，Consistency Conventions 的每月更新、R4 對照列；`README.md` 分群那列。

## Tasks & Acceptance

**Execution:**
- [ ] `cluster.py`、`export.py`、`cli.py` -- 固定中心、每月歸類、`fit-types`
- [ ] `pipeline/config/` -- 跑 `fit-types` 產生中心檔；寫名稱表
- [ ] `test_types.py`、`test_inbound.py` -- I/O 矩陣各列＋已提交輸出檢查
- [ ] `docs/data-contract.md`、`types.ts`、`README.md`、架構 AD-27 -- 說明
- [ ] `web/public/data/` -- 12 個月依序重建（2026-09 最後）
- [ ] tickets.toml 1.6 description/verify、epic Notes、memlog

**Acceptance Criteria:**
- Given 重建後的 12 個月，when 讀 `stations.json`，then 每月 types 為同樣 4 筆（id、名稱、一句話相同）、皆 draft=false，每個出站有紀錄的站 type 在 0–3，環狀線站為 null，且每站的 type 等於以該月 profile 算出特徵後最近的中心。
- Given 重建後，when pytest（含 `test_published_cells.py`），then 全過；`npm test && npm run build` 通過。

## Implementation Notes

Checkpoint 1 由派工者依 Piwi 2026-11-11 的決定代為放行（同 1.8–1.13）；此環境沒有可派出的 subagent，實作與 quick 審查由同一個 session 完成。

- `cluster.py`：`FEATURE_HOURS`（6–23、0）、`FEATURE_VERSION=1`、`fit_types`、`load_centroids`、`assign_types`（取代 `cluster_stations` 與草稿標籤）；`StationTypeError` 由 `build` 轉成 SystemExit。中心檔另有 `namesConfirmed`：`fit-types` 新寫的檔為 false，`build` 照著輸出 `draft: true`，Piwi 對照名稱後改 true（已改，2026-11-11 定名）。
- `fit-types`：12 個月原始檔（主 checkout 只有 2026-09，其餘 11 個月重新 fetch 到 worktree，用完刪除）→ 1,298 筆（108 站 × 10 個月＋109 站 × 2 個月），輪廓係數 0.3035，94／109 站 12 個月同一型；各型（整年最常歸到的型）臥室 32、住商 27、人氣 30、辦公 20。和 Piwi 看過的試算（讀網站 JSON）逐站完全相同，中心特徵也相同（amNet −0.1826／−0.0625／+0.0486／+0.1585）。
- 每月站數：臥室 30–33、住商 25–29、人氣 26–32、辦公 19–22；當月輪廓係數 0.285–0.305。不穩定的 15 站：三重（臥室／住商各 6 個月）、中正紀念堂、台北101/世貿、大直、輔大、淡水、頭前庄、圓山、中山國中、木柵、亞東醫院、動物園、關渡、頂埔、廣慈/奉天宮（只有 2 個月）。
- 重建 12 個月：只有 `stations.json`（427 個站的 `type` 值與 `types[]`）與 `meta.json`（`clustering` 值、`generatedAt`、重新下載月檔的 `sources[0].retrieved`）改變；od、inbound、district-flows、daily、events、basemap 都沒變。契約形狀不變，不升版。
- 測試：新增 `tests/test_types.py`（I/O 矩陣各列、fit 排序、CLI 缺月檔、已提交中心與名稱、12 個月逐站最近中心）；pytest 353 passed（含 `test_published_cells.py`）；npm test 103 passed；build 通過。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，inline 自審；本環境無審查子代理，Piwi 看 PR 時再審）：high 0／medium 1／low 0／false 0／maybe-false 0。
  - medium｜patch｜`cluster.py` `assign_types`：`draft` 寫死 false，日後重跑 `fit-types` 換了中心而 csv 仍依 id 貼名，名稱會無聲貼到不同形狀的類型上，契約對 `draft` 的說明也沒有實作 → 中心檔加 `namesConfirmed`（`fit_types` 寫 false），`draft = not namesConfirmed`；已提交的檔設 true，測試兩種情況。

## Design Notes

中心檔形狀（JSON）：`{featureVersion, hours, holidayWeight, months[], method:{algorithm:"kmeans",k,nInit,randomState}, samples, silhouette, command, types:[{id, centroid[39], features}]}`。`features` 是中心的 `_describe`（amNet、pmNet、lateShare、holidayRatio），寫進每月 `types[].features`（各月相同，描述類型本身）；`size`、`examples` 是當月。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath fit-types --months 2025-10..2026-09` -- expected: 4 型站數約 32／27／30／20，輪廓係數約 0.30
- `cd pipeline && uv run city-breath build --month <每個月>` -- expected: 12 個月皆成功
- `cd pipeline && uv run --group dev pytest -q` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 全過
