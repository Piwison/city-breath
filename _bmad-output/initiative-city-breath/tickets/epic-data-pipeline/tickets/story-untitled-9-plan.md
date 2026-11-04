---
title: '行政區起訖彙總'
type: 'feature'
ticket: '9'
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

**Problem:** 首頁行政區流向（R3）與「點行政區看去哪、誰來」（R13）需要行政區×行政區×小時×日型的平均人次，目前只有站級的 od 分片與前 200 組站弧線 `flows.json`。

**Approach:** 管線依 `stations[].district`（1.8）把起訖整數總人次加總到行政區再除以日型天數（AD-7），輸出 `district-flows.json`；< 10 → null 並經 suppress.py 做次要隱藏（新增 `district_groups`）。依 AD-10 移除 `flows.json` 與它的型別、載入函式，骨架只改到能測試與建置。

## Boundaries & Constraints

**Always:** 行政區用 8 碼代碼（AD-9）；只列有車站的區；迄站只算 `exitsRecorded` 的站；小時＝進站時段（AD-15）；停止營運小時整格 `null`（AD-5）；契約三處＋`load.ts` 同一 commit（AD-1）；所有起訖數字經 suppress.py（AD-3），每組零格或 ≥2 null；契約維持 v2（文件已預告 1.9 在 v2 內加入 district-flows.json、移除 flows.json）。

**Never:** 不做新 UI；不改 tickets.toml、不標 done；不碰 1.10 的 daily/、venues.csv；前端不推算行政區或反推隱藏格。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一般格 | 區 A→B 某小時總人次 n、日型 k 天 | `round(n/k)`，≥ 10 才公開 | — |
| 少於 10 | `round(n/k) < 10` 或無人搭 | `null` | — |
| 停止營運 | 全月無紀錄的小時 | 整個小時 `null` | — |
| 次要隱藏 | 列／欄／站區塊只剩一格 null | 再藏組內最小公開格，直到穩定 | 無法保護 → `ValueError` |
| 環狀線迄站 | `exitsRecorded=false` 的站當迄站 | 不計入任何行政區欄 | — |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/aggregate.py` -- `od_hourly` 給 `(o, d, day_type, h, avg)`，avg = 整數總人次 ÷ `day_counts[t]`；`round(avg*k)` 可精確還原整數總人次。不改。
- `pipeline/src/city_breath_pipeline/suppress.py` -- `apply(raw, groups)`、`od_groups`；在其後加 `district_groups`。
- `pipeline/src/city_breath_pipeline/export.py` -- `suppress_od` 改為同時處理 od 與行政區格（一次 `apply`，因為兩者有共同組）；刪除 flows 區塊與 `per_hour`；`allday` 改用整數總人次（修 deferred-work 的非決定性）；daily.json 鍵依站索引排序；新增 district-flows.json 區塊。1.10 同時改 export.py：只動上述區塊，新程式放獨立函式。
- 新 `pipeline/src/city_breath_pipeline/district_flows.py` -- 行政區索引與原始平均（整數加總後除）。
- `pipeline/src/city_breath_pipeline/__init__.py` -- 移除 `TOP_ARCS_PER_HOUR`。
- `pipeline/src/city_breath_pipeline/cli.py` -- build 摘要分別印 od 與行政區的隱藏數。
- `pipeline/tests/test_suppress.py` -- 移除 flows 測試，加 district 已提交資料逐組檢查。
- `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts` -- 加 `DistrictFlowsFile`／`loadDistrictFlows`，刪 `FlowsFile`／`Arc`／`loadFlows`。
- `web/src/App.tsx`、`web/src/map/CityMap.tsx` -- 拿掉 arcs（不畫弧線），其餘不動。
- `web/public/data/2026-09/` -- 刪 flows.json，新增 district-flows.json，重建。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/src/city_breath_pipeline/district_flows.py` -- `district_index`、`district_raw` -- AD-7 唯一彙總處
- [ ] `pipeline/src/city_breath_pipeline/suppress.py` -- `district_groups`（列、欄、站區塊三類） -- AD-3
- [ ] `pipeline/src/city_breath_pipeline/export.py`、`cli.py`、`__init__.py` -- 輸出、移除 flows、決定性
- [ ] `pipeline/tests/test_district_flows.py`、`test_suppress.py` -- AD-7 正確性、組定義、已提交檔逐組檢查、檔案形狀
- [ ] `docs/data-contract.md`、`web/src/data/types.ts`、`web/src/data/load.ts`、`web/src/App.tsx`、`web/src/map/CityMap.tsx` -- 契約與骨架
- [ ] `web/public/data/2026-09/` -- 重建並提交

**Acceptance Criteria:**
- Given 2026-09 原始檔, when `uv run city-breath build --month 2026-09` 跑兩次, then 輸出除 `meta.generatedAt` 外逐位元相同，且無 flows.json。
- Given 已提交 JSON, when pytest, then 行政區列、欄與站區塊組皆零格或 ≥2 null，od 各組亦然。
- Given 永和區平日 7、8 點, when 計算去中山、中正、大安、信義區的比例, then 與原型（中山 19%、中正 18%、大安 15%、信義 12%）比較並在 PR 說明差異原因。
- Given 網站, when `npm test && npm run build`, then 通過。

## Implementation Notes

- 無人值守執行，環境沒有可派出的 subagent：實作與 quick 審查都由同一個 session 依本計畫直接完成；Open Questions 由執行者依 AD 自行決定，記在這裡。
- 新增 `district_flows.py`（`total_count`、`district_index`、`district_totals`、`district_raw`）；`suppress.py` 加 `district_groups`（列、欄、站區塊）與 `Suppressed.primary_keys`；`export.py` 的 `suppress_od` 多收 `DistrictCells`，od 與行政區格一次 `apply`；flows 區塊、`per_hour`、`TOP_ARCS_PER_HOUR` 移除；meta notes 加一句行政區起訖說明（文字，非欄位）。
- 形狀選擇：`districts[]` 索引＋`weekday`/`holiday` 各 24 格，每格 N×N 密集矩陣（停止營運整格 null）。21 區，72,114 bytes；首頁三檔合計 246,696 bytes（AD-6 目標 300 KB 內）。稀疏三元組未採用：公開格占 84%，密集反而小且前端好讀。
- 契約維持 v2：data-contract.md 的 v2 段落本來就預告 1.9 在 v2 內加入 district-flows.json、移除 flows.json；只有 2026-09 一個月份，已重建。
- 決定性：od 全日加總改用 `round(avg × 天數)` 還原的整數總人次（topDestinations 有 23 筆 ±1，現在是精確值）；daily.json 的 `stations` 鍵改依站索引排序。兩次 build 除 `meta.generatedAt` 外逐位元相同。
- 2026-09：站起訖 549,360 格，主要隱藏 451,747、次要隱藏 392（1.11 時為 2；多出的來自站區塊組）；行政區 18,522 格，主要隱藏 1,504、次要隱藏 253，公開 15,479 格，全部與另寫的原始 CSV 驗算一致。
- 永和區只有頂溪一站（永安市場在中和區）。平日 7+8 點（分母＝頂溪 entries 11,400）：中正 20.8%、中山 18.0%、大安 13.9%、信義 9.3%；原型同時段為中山 19.2%、中正 17.6%、大安 15.0%、信義 10.6%。差異來自 1.8 改區：忠孝新生（大安→中正）、公館（中正→大安）、中山與雙連（中山→大同）、國父紀念館（信義→大安）、西門（萬華→中正）、台電大樓（大安→中正）、圓山（大同→中山）、中山國中（松山→中山）。
- 骨架：App.tsx 不再載入 flows、CityMap 拿掉 ArcLayer；`--flow-arc` token 暫留（3.5 換場景時一起清）。
- 開 PR 後 1.10（PR #9）先合併：rebase 到 3904202，export.py／suppress.py／load.ts／data-contract.md 的衝突兩邊都保留（`venue_origin_groups` 與 `district_groups` 並列、`loadDaily` 與 `loadDistrictFlows` 並列）；重建 2026-09 後 1.9 的數字不變、daily/ 與 main 逐位元相同，pytest 66 過、npm test 7 過。
- 接著 7.1（PR #11）合併：再 rebase 到 9ed2c97。daily.json 由 7.1 移除（本票對它的鍵排序修正隨之作廢），export.py 保留 `export_events` 與 `suppression_summary`，契約檔列兩邊的新檔。重建後 1.9 的數字不變，events.json、daily/ 與 main 相同；pytest 83 過、npm test 11 過。
- 留給 Piwi（未處理）：逐日檔環狀線站 `exits` 為 null、stations.json 為 0，兩者不一致，本票沒有動 stations.json 的 exits；逐日場館來源格的同日型加總 ×天數 ＝ od 區塊（起區→場館站）×天數，是跨檔的另一種總量關係（進位誤差 × 天數會變大），目前兩邊各自保護、沒有放在同一組。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，inline）：本環境沒有可啟動的審查子代理，由實作者依 Quick lens 逐項自審 diff；Piwi 看 PR 時再審一次。high 0／medium 1／low 2／false 0／maybe-false 0。
  - medium｜patch｜`suppress.py` `district_groups`：區內沒有任何起站分片時，站區塊只有行政區格一格，`secondary` 會丟 `ValueError`（單元測試的丙區觸發）。空區塊的行政區格必為無人搭、沒有可反推的 od 格 → 跳過空區塊。2026-09 每區都有起站，輸出不變。
  - low｜patch｜`test_district_flows.py` 用 `DistrictCells.__new__` 手拼物件 → `DistrictCells` 改成 dataclass＋`build()`，測試與 export 共用同一個建構路徑。
  - low｜patch｜AD-10 要求「誰來」附固定說明，但資料來源頁只讀 `meta.json` notes → notes 加一句環狀線迄站不計、相關行政區「誰來」偏少。

## Design Notes

已公開總量與組（行政區格鍵 `("D", 起區索引, 迄區索引, t, h)`，od 格鍵 `(oi, di, t, h)`）：
1. 列：起區 A 的各迄區 ＝ Σ A 內各站 `entries[h]`。
2. 欄：迄區 B 的各起區 ＝ Σ B 內各站 `exits[h]`。
3. 站區塊：行政區格 (A,B) ＝ Σ od(o∈A, d∈B)；組成員＝該行政區格＋區塊內所有 od 格。只要行政區格公開、區塊只剩一個 od null，就能用減法反推；行政區格是唯一 null 時也能用 od 加總反推，所以兩者同組。這讓 od 分片可能多出次要隱藏，因此 od 與行政區格在同一次 `apply` 處理。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath build --month 2026-09` -- expected: 印出 district-flows.json 大小與隱藏格數
- `cd pipeline && uv run --group dev pytest` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 通過
