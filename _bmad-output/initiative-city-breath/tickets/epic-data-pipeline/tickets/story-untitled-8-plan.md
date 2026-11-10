---
title: '每站對上官方行政區'
type: 'feature'
ticket: '8'
created: '2026-11-04'
status: done
baseline_revision: '677b33921cfa9d2b3eb2f3a472843dca5a33708c'
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

**Problem:** 首頁行政區流向（R3、R13）需要每站的行政區，目前只有 design/research 的手寫草稿，沒有官方依據，也沒有行政區多邊形可畫。

**Approach:** 管線下載國土測繪中心（NLSC）的官方界線，用 `stations.json` 匯出的 lon/lat 做點在多邊形判定，套上 `config/station_districts.csv` 的人工修正，輸出 `stations[].district`（8 碼代碼）與新的 `districts.json`（簡化多邊形，簡化後每站仍在自己區內）。與手寫草稿的差異寫成報告給 Piwi 看。

## Boundaries & Constraints

**Always:** 行政區 ID＝NLSC 8 碼 TOWNCODE 字串（AD-9）；臺北、新北用同一份界線；判定座標就是 `stations.json` 的 lon/lat；原始下載放 `data/raw/geo/`（不進 git），網址、取得日期、sha256 記在 `pipeline/config/geo_sources.csv`，`build` 驗 sha256；契約變更三處同一 commit（AD-1）；`docs/data-contract.md` 規定改欄位要升版 → `CONTRACT_VERSION` 1→2，重建 2026-09（AD-18）；`districts.json` 目標 < 100 KB。

**Never:** 前端不推算行政區；不做行政區起訖彙總（1.9）、逐日檔（1.10）；不刪 flows.json／daily.json（由 1.9／1.10 依 AD-10 移除）；不用非官方圖資副本；不改 tickets.toml、不標 done；export.py 只做局部修改（1.11 剛改過 od 分片段）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般站 | 站座標落在某區多邊形內 | `district` = 該區代碼 | — |
| 人工修正 | `station_districts.csv` 有該站 | 用修正代碼，報告標 override；簡化檢查略過該站 | 代碼或站名不存在 → 報錯 |
| 不在任何區 | 座標落在兩市以外或縫隙 | — | 報錯列出站名，請補 override |
| 簡化讓站跑出區 | 容差過大 | 容差減半重試 | 降到下限仍失敗 → 報錯 |
| 界線檔被換 | `data/raw/geo` 的 sha256 與設定不符 | — | `build` 報錯，提示 `fetch-geo --update` |
| 環狀線站 | `exitsRecorded=false` 的站在區內 | 該區 `inflowPartial=true` | — |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/stations.py` -- `Station`（lon/lat 已四捨五入 6 位，Y板橋 +0.0006）；判定直接用這兩個值。不改。
- `pipeline/src/city_breath_pipeline/export.py` -- `export_month(agg, stations, out_root)`；stations.json 在 `st_out` 迴圈，meta 在 `meta = {...}`。只在這兩處與函式簽名加參數、加寫 districts.json；od／flows 段（1.11 的 suppress）不動。
- `pipeline/src/city_breath_pipeline/cli.py` -- `fetch`／`build` 子命令、`_download`、`RAW`；新增 `fetch-geo`、`district-report`，`build` 呼叫 districts 模組。
- `pipeline/src/city_breath_pipeline/__init__.py` -- `CONTRACT_VERSION`。
- `web/src/data/types.ts`、`web/src/data/load.ts` -- 契約型別與版本檢查（`CONTRACT_VERSION`，不符就丟錯）；加 `DistrictsFile`、`loadDistricts`。
- `docs/data-contract.md` -- 契約說明，改成 v2 並加 districts.json 與 `district` 欄。
- `design/research/station_district.json`（main 上已有）-- 手寫草稿：正規站名 → 區名（無「區」字）。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/config/geo_sources.csv`、`pipeline/config/station_districts.csv` -- 新增來源紀錄與（只有表頭的）人工修正表。
- [ ] `pipeline/src/city_breath_pipeline/districts.py` -- 解析 NLSC GML、依 TOWNCODE 合併、點在多邊形、套修正、coverage 簡化＋站內檢查、組 districts.json 內容、差異報告。
- [ ] `pipeline/src/city_breath_pipeline/export.py` -- 接收 districts 結果：每站加 `district`、寫 `districts.json`、meta 加 `sources[]`。
- [ ] `pipeline/src/city_breath_pipeline/cli.py` -- `fetch-geo [--update]`、`build` 接上、`district-report`。
- [ ] `pipeline/pyproject.toml` -- 加 shapely。
- [ ] `pipeline/tests/test_districts.py` -- 判定、修正、每站有區、簡化後仍在區內、districts.json 形狀、sha 不符報錯。
- [ ] `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts`、`__init__.py` -- 契約 v2。
- [ ] `web/public/data/2026-09/*` -- 重建。
- [ ] `_bmad-output/.../story-1.8-district-diff.md` -- 差異報告。

**Acceptance Criteria:**
- Given 2026-09 原始檔與界線檔，when `uv run city-breath build --month 2026-09`，then 120 站都有 8 碼 `district`，`districts.json` < 100 KB 且每站落在自己區的簡化多邊形內。
- Given 網站，when `npm test && npm run build`，then 通過且載入 v2 檔不報版本錯。
- Given 差異報告，when Piwi 打開，then 看得到所有官方≠草稿的站與離界線 150 m 內的站。

## Implementation Notes

Assumptions（無人值守，記錄於此）：
- 票面寫「臺北市資料大平臺點位＋區界、新北用內政部區界」，但架構 AD-9（較新、為準）規定用 NLSC 同一份界線；照 AD-9。
- data.gov.tw 7441 的 SHP 放在 www.tgos.tw，被本環境出口代理拒絕（403），NLSC 開放資料站 whgis-nlsc 連線被重置。改用同一機關的官方 WFS（`wfs.nlsc.gov.tw`，圖層 `VILLAGE_NLSC` 全國村里界圖），依 TOWNCODE 合併成鄉鎮市區；代碼、名稱與 7441 同一套。另用 NLSC 官方點位查詢 API（`api.nlsc.gov.tw/other/TownVillagePointQuery`）逐站交叉驗證。
- 依 docs/data-contract.md「改任何欄位都要升版」，升到 v2；flows.json、daily.json 暫留，由 1.9／1.10 依 AD-10 移除。

實作紀錄：
- 開工前依協調者指示 rebase 到含 1.11 的 main（677b339）；export.py 只動 stations 迴圈、新增 districts.json 區塊、meta 的 `sources`／notes，od 分片與 suppress 段未動。
- WFS 一次抓大範圍框會 404（筆數上限），屬性 FILTER 不可靠；改用 121.25–122.05、24.60–25.35 的框，臺北 456、新北 1057 筆，與較小框的筆數一致（範圍完整），重抓 sha256 相同（可重現）。
- 原始界線 coverage 有 2 處極小的不對齊（三峽約 2 m、貢寮一段），都不在車站附近，未處理。
- 純全域簡化：要讓 120 站都在區內，容差得降到 0.0004（202 KB）。很多站離界線只有 2–30 m（出口平均落在界線道路上）。改為全域容差 0.0016＋在跑出區的站（台電大樓、圓山、雙連）周邊 250 m 換回原始界線，結果仍是不重疊的 coverage，districts.json 65,706 bytes。
- 交叉驗證：逐站呼叫 NLSC TownVillagePointQuery，116 站一致；圓山（8 m）、東門（2 m）不一致，該 API 以地籍判定；2 站落在無地號道路上查無。
- meta.json 加 `sources[]`（AD-1）：OD 月檔與出口座標以檔案修改日與 sha256 記錄，界線取自 geo_sources.csv；舊 `source` 暫留給骨架。
- 新指令：`fetch-geo [--update]`（sha 不符時原檔不動，新檔留 `.new`）、`district-report --check-api`。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick）：本環境沒有可啟動的審查子代理，改由實作者依 Quick lens 的指示逐項自審 diff，並記錄於此；Piwi 看 PR 時再審一次。high 0／medium 0／low 2／false 0／maybe-false 0。
  - low｜patch｜`cli.py` `cmd_fetch_geo`：sha 不符又沒加 `--update` 時，原本會先覆蓋原檔，導致下一次 `build` 直接失敗。改成下載到 `.new`，只有相符或 `--update` 才換上。
  - low｜patch｜`districts.py` `_drop_slivers`／`_coords`：`make_valid`／交集可能回傳含 MultiPolygon 的 GeometryCollection，舊寫法只取第一層 Polygon 會漏面。加 `_polygons_of` 遞迴攤平。修完 pytest 37 過、重建輸出不變（65,706 bytes）。

## Design Notes

- 簡化用 `shapely.coverage_simplify`（保持鄰區共邊，不留縫），座標四捨五入到 5 位；檢查不過就容差減半。
- `districts.json` 收 41 區（臺北 12＋新北 29），沒有車站的區 `stations: []`，給場景畫完整底座。
- `polygon` 為 GeoJSON MultiPolygon 座標（AD-12：地理資產以經緯度存放）。

## Verification

**Commands:**
- `cd pipeline && uv run --group dev pytest` -- expected: 全過
- `cd pipeline && uv run city-breath build --month 2026-09` -- expected: 印出 41 區、districts.json 大小
- `cd web && npm ci && npm test && npm run build` -- expected: 通過
