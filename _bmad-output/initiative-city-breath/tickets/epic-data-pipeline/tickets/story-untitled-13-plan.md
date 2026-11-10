---
title: '每站的來源（誰來這站）'
type: 'feature'
ticket: '13'
created: '2026-11-10'
status: 'built'
baseline_revision: '5432f92378c4e88ac12b2b3cc51aa056e7cec937'
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

**Problem:** 車站卡要回答「誰來這站」（D1、F2）與「從這站最常去的 10 站」（C5），現在只有起站分片（去哪）與前 5 目的地；從迄站反查要載全部 od 分片，行政區來源也沒有輸出。

**Approach:** 管線多寫 `inbound/{stationId}.json`（每個出站有紀錄的迄站：每日型每小時前 5 起站、各來源行政區平均、整天前 10 起站），`topDestinations` 擴成前 10；新的格子與組全部和 od、district-flows 同一次經 `suppress.py` 隱藏。契約升 v3，三處＋`load.ts` 同一個 commit，12 個月與 basemap.json 重建。

## Boundaries & Constraints

**Always:** 起訖數字四捨五入後 < 10 → `null`；新組（迄站某小時各來源區之和＝exits[h]、來源區格＝區內起站 od 格之和、district-flows 格＝區內各迄站的來源區格之和、全日格＝各小時 od 格之和）只在 `suppress.py` 定義並逐組測試（AD-3）；停止營運小時為 `null`（AD-5）；行政區只用 `districts.station_codes`（AD-9）；起站格的值與 od 分片相同（AD-10）；環狀線站沒有 inbound 分片；所有 JSON `v`＝3（AD-18、AD-21）；不編造數字。

**Never:** 不在 export.py 或前端另寫門檻或組；不改 tickets.toml、不標 done；不做車站卡 UI（epic-station-personality）；不動 7.6 的 events.json 擴充。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般迄站 | 2026-09 台北車站 weekday 8 點 | `districts` 各格＝該區起站總人次÷天數；`top` 5 筆皆為公開值 | — |
| 來源區格 < 10 | 某區只來 3 人 | `null`，同組（站×小時）再藏最小公開格 | — |
| 來源區格公開、區內只剩一個 od 格 null | 區塊組 | 再藏一格（od 或來源區格） | — |
| 停止營運 | 2–4 點 | 該小時 `top`、`districts` 為 `null` | — |
| 環狀線站 | `exitsRecorded=false` | 無分片；`load` 拒絕 | `loadInboundShard` 報錯 |
| 前 10 某筆 < 10 | 小站的第 10 名 | `avg: null`（與 od 全日組一起隱藏） | — |
| 來源區合計 ≠ exits | 資料不一致 | — | build 失敗 |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/__init__.py` -- `CONTRACT_VERSION` 2→3。
- `pipeline/src/city_breath_pipeline/suppress.py` -- `od_groups` 第 3 類「全日」改成以全日格 `("A", o, d, t)` 為成員；新增 `inbound_groups`（鍵 `("I", 起區, 迄站, t, h)`）。`district_groups` 不改。
- `pipeline/src/city_breath_pipeline/export.py` -- `export_month`：`allday` 整數總人次已有；`top_dests` 改前 10；新增 `top_origins`（迄站側前 10）；`suppress_od` 加入全日格與來源區格；寫 `inbound/`（整個資料夾重產）；`stations.json` 的 `topDestinations.avg` 改取全日格；`suppression_summary` 多 `allday`、`inbound` 兩類。
- `pipeline/src/city_breath_pipeline/district_flows.py` -- `total_count`、`district_index` 重用；新增來源區×迄站的整數總人次。
- `pipeline/src/city_breath_pipeline/cli.py` -- build 摘要印出新格數與 inbound 大小。
- `pipeline/tests/test_suppress.py` -- 全日組形狀、已提交輸出攻擊者視角逐組檢查（擴到 inbound）。
- `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts`（`CONTRACT_VERSION`、`loadInboundShard`）、`load.test.ts`、`render.test.ts`（v）、`web/src/App.tsx`（`avg` 可為 null）。
- `basemap.py` 讀 `CONTRACT_VERSION`，建 2026-09 時自動重寫，`basemapRevision` 不變。

## Tasks & Acceptance

**Execution:**
- [ ] `suppress.py`、`district_flows.py` -- 全日格與來源區格的組（見 Design Notes）
- [ ] `export.py`、`cli.py`、`__init__.py` -- 輸出 inbound 分片、前 10、v3；來源區合計與 exits 對不上就失敗
- [ ] `pipeline/tests/test_inbound.py`、`test_suppress.py` -- 合成資料單元測試＋已提交輸出逐組檢查＋od 值一致＋2026-09 手算對照
- [ ] `docs/data-contract.md`、`types.ts`、`load.ts`、`load.test.ts`、`App.tsx`、`render.test.ts` -- 契約 v3
- [ ] `web/public/data/` -- 12 個月依序重建（2026-09 最後，重寫 basemap.json）

**Acceptance Criteria:**
- Given 重建後的 12 個月，when pytest，then 每個 inbound 分片與 topDestinations 的每組都是零格或至少兩格 null，inbound 的起站值與 od 分片相同，所有檔 `v`＝3。
- Given 2026-09 原始檔，when 用 duckdb 直接算某站某小時各來源區人數，then 與 inbound 分片一致。
- Given 網站，when `npm test && npm run build`，then 通過，`loadInboundShard` 對不上同月 stations.json 時報錯。

## Implementation Notes

Assumptions（無人值守；Checkpoint 1 由派工者代為放行，同 1.8、1.10、1.11、1.12）：
- 次要隱藏照 AD-3 字面「藏組內最小的已公開格」。來源區塊組（來源區格＋區內起站 od 格）裡來源區格永遠 ≥ 任一 od 格，所以被藏的幾乎都是 od 格：12 個月各有約 3.7–4.1% 原本公開的 od 格改成 null（2026-09：97,221 格中 3,570 格）。試做「優先藏來源區格」：2026-09 od 只多藏 171 格（0.18%），但來源區格次要隱藏從 2,856 升到 6,579 格。要不要改是產品取捨，留給 Piwi（見 PR）。
- 全日格本身也照 < 10 隱藏（v2 的 topDestinations.avg 沒經 suppress.py）；12 個月實際沒有任何一格 < 10。
- 前 5 起站只從隱藏後仍公開的 od 格挑；前 10 依全日整數總人次排序，不含同站進出與 0 人（v2 會列 0 人，實際從未發生）。
- 來源區含同站進出與環狀線起站，各區整數總人次之和與 exits 不等就 build 失敗。
- 7.6 的 events.json 擴充不在本票，AD-10 說「否則再升一版」。

實作紀錄：
- 此環境沒有可派出的 subagent：實作與 quick 審查由同一個 session 直接依本計畫完成。
- `suppress.py`：`od_groups` 第三類改成全日格為成員；新增 `inbound_groups`（欄、列、來源區塊、行政區區塊）。`district_flows.inbound_raw`；`export.inbound_json`、`TOP_*` 常數、`suppress_od` 收全日格與來源區格；`cli.py` 摘要；`CONTRACT_VERSION` 3。
- 測試：新增 `tests/test_inbound.py`（合成資料端到端、連鎖、環狀線、合計不符、組形狀；12 個月攻擊者視角逐組檢查、od 值一致、整天總量不留單一未知數、來源區≈od 手加）；`test_suppress`、`test_district_flows`、`test_anomaly`、`test_daily` 跟著改。網站 `loadInboundShard` 三個案例。
- 12 個月原始檔：主 checkout 只有 2026-09，其餘 11 個月重新 fetch（2026-03 第一次連線被重設，重抓成功）；每月 sha256 都與既有 meta.json 記錄相同，只有 `sources[0].retrieved` 變成 2026-11-10。依序重建 2025-10 → 2026-09，basemap.json 只有 `v` 由 2 變 3（revision 1 不變）。
- 手算對照（獨立 duckdb 直接讀 2026-09 原始 CSV）：台北101/世貿 平日 8 點 21 區全部與 inbound 一致（原始總和 6,578.2 ＝ exits 6,578）；台北小巨蛋 假日 21 點：公開的 2 區一致，其餘為少於 10 或次要隱藏，沒有不符。
- 大小：web/public/data 52,429,291 → 64,133,802 bytes（+11.7 MB，+22%），1,857 → 3,155 檔；inbound 12 個月 1,298 片共 11.26 MB（單片約 8–10 KB，gzip 約 1.7 KB）；stations.json 109 → 139 KB。
- district-flows 每月另有 1–13 格因連鎖改成 null（2026-05 有 2 格、2026-07 od 有 1 格反而由 null 變公開，連鎖順序改變所致，同一版內每組仍保護好）。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，inline 自審；本環境無審查子代理，Piwi 看 PR 時再審）：high 0／medium 0／low 2／false 0／maybe-false 0，另 1 筆交給 Piwi。
  - low｜patch｜`web/src/data/load.ts` `loadInboundShard`：`allDay` 缺欄時丟 TypeError 而不是「對不上」→ 改成 `!!d.allDay?.every(...)`。
  - low｜patch｜`export.py`：每個迄站都重算一次起站索引清單 → 移出迴圈並排序（輸出不變）。
  - 交給 Piwi：v2 的 od 分片已經公開過（git 歷史／部署），v3 新藏的 od 格可從舊版取得；若舊版已對外，舊版數字＋v3 的來源區格可能減出兩版都隱藏的格。是否要處理（例如維持 od 不動、改藏來源區格）由 Piwi 決定。

## Design Notes

新格子與組（同一次 `apply`，鍵形狀不同不會撞）：
1. 全日格 `("A", o, d, t)`＝全日整數總人次÷天數，只建「起站前 10 ∪ 迄站前 10」的配對。組：`[A, (o,d,t,h) for h]`（取代舊的「各小時＝avg」組，avg 本身也是起訖數字，要能隱藏）。
2. 來源區格 `("I", f, d, t, h)`。組：欄 `[I(f,d) for f]`＝exits[d][h]；區塊 `[I(f,d), (o,d) for o∈f]`；行政區 `[D(f,B), I(f,d) for d∈B]`；列 `[I(f,d) for d]`＝f 內各站 entries 之和。

前 5 起站只從**隱藏後仍公開**的 od 格挑（不含同站），所以不帶任何 od 分片以外的資訊；前 10 依全日整數總人次排序（同 topDestinations），值取全日格。來源區含同站進出，才能等於 exits。

分片形狀：`{v, month, dest, districts[], weekday:{top[24], districts[24], allDay[]}, holiday:{…}}`；`top[h]` 為 `{station, avg}[]` 或 `null`，`districts[h][i]` 對到 `districts[i]`（同 district-flows 的區序）。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath build --month <每個月>` -- expected: 12 個月皆成功，印出各類隱藏格數
- `cd pipeline && uv run --group dev pytest -q` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 全過
