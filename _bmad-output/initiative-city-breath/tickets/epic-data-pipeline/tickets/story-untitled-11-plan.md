---
title: '次要隱藏'
type: 'feature'
ticket: '11'
created: '2026-11-04'
status: 'built'
baseline_revision: '32301b09e3c0018921bba4f88630e542da5e177b'
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

**Problem:** 起訖格子少於 10 人已輸出 `null`，但站的進站量（`stations.json` entries、分片的 `*Departures`）等於該起站該小時各迄站之和；一組裡只有一格 `null` 時，用總量減掉其他格就能反推那格（AD-3）。

**Approach:** 新增 `pipeline/src/city_breath_pipeline/suppress.py`，作為 < 10 規則與次要隱藏的唯一實作；API 是通用的「格子＋若干組」，1.9、1.10 直接重用。od 分片與 flows.json 改用它的結果輸出。

## Boundaries & Constraints

**Always:** 每組結束時是零格或至少兩格 `null`；結果可重現（同輸入同輸出）；契約欄位不變、`CONTRACT_VERSION` 不變。

**Never:** 不在前端或 export.py 另寫門檻；不改 tickets.toml；不動 1.9／1.10 的輸出（尚未存在）。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 一組一格 null | `[50, 30, 4, 12]` | `4`→null，再隱藏最小已公開格 `12` | 無 |
| 連鎖 | 次要隱藏使另一組只剩一格 null | 該組再隱藏，直到全部穩定 | 無 |
| 已有兩格以上或零格 null | 組內 0 或 ≥2 null | 不變 | 無 |
| 同值 | 兩格都是最小值 | 取組內順序較前者（可重現） | 無 |
| 無格可藏 | 只有一格且為 null（或其餘也全 null 不可能） | 無法保護 | `ValueError` |
| 原始為 None | 無人搭的格 | 視為 null（與少於 10 人無法區分） | 無 |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/export.py` -- `suppress()`（primary 規則）移到 suppress.py，export 改 import；`export_month` 的 od 迴圈（`od[o][t][h][di] = avg`）建格子；`*Departures` = round(列總和)；flows 由 `per_hour` 取前 200；`topDestinations` = 全日每迄站和的前 5。
- `pipeline/src/city_breath_pipeline/aggregate.py` -- `od_hourly` 與 `station_hourly` 同分母，列總和（含同站進出）＝該站進站平均、欄總和＝該站出站平均，未四捨五入前完全相等。不改。
- `pipeline/src/city_breath_pipeline/stations.py` -- `Station.exits_recorded`；環狀線 11 站整欄結構性為空（已知是 0），不算保護格。不改。
- `pipeline/tests/test_pipeline.py` -- 匯入 `suppress` 改自 suppress.py。
- `docs/data-contract.md` -- 共通規則加次要隱藏說明。
- `web/public/data/2026-09/` -- 重新 build 後提交 od 分片（及其他重產檔）。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/src/city_breath_pipeline/suppress.py` -- `primary(avg)`、`secondary(values, groups)`（工作清單到穩定，回傳新值與被次要隱藏的鍵）、`apply(raw, groups)`、`unprotected(values, groups)`（測試與防呆共用） -- AD-3 唯一實作
- [ ] `pipeline/src/city_breath_pipeline/export.py` -- 建三類組（見 Design Notes），經 `apply` 後寫 od 分片；flows 只取經隱藏後仍公開的格；回傳次要隱藏計數，cli 印出 -- 所有起訖輸出經 suppress.py
- [ ] `pipeline/src/city_breath_pipeline/cli.py` -- build 摘要印出次要隱藏格數
- [ ] `pipeline/tests/test_suppress.py` -- I/O 矩陣單元測試；對已提交的 `web/public/data/*/` 逐組檢查三類組皆為零格或 ≥2 null，且 flows 不含 null 格
- [ ] `docs/data-contract.md` -- 次要隱藏說明（無欄位變更）

**Acceptance Criteria:**
- Given 2026-09 原始檔, when `uv run city-breath build --month 2026-09`, then 每個 od 分片的每組（列、欄、全日）都是零格或至少兩格 null，且 build 印出次要隱藏格數。
- Given 已提交的 JSON, when 執行 pytest, then 逐組檢查通過，且 flows.json 每條弧線在對應分片中為公開值。

## Implementation Notes

- 無人值守執行，且此環境沒有可派出的 subagent：實作與 quick 審查都由同一個 session 直接依本計畫完成。Open Questions 由執行者依 AD-3 自行決定（見 Design Notes），沒有交給人。
- 新增 `pipeline/src/city_breath_pipeline/suppress.py`（`primary`、`secondary`、`apply`、`unprotected`、`od_groups`）；`export.py` 的 `suppress()` 移除，改由 `suppress_od()` 建格子並經 `apply`；flows 只取仍公開的格。`cli.py` 印出隱藏格數。`meta.json` notes 多一句說明次要隱藏（文字，非欄位）。
- 2026-09：549,360 格，主要隱藏 451,747 格，次要隱藏 2 格（台北車站→先嗇宮 假日 17 點、南京復興→大安森林公園 平日 18 點）；欄組與全日組原本就都 ≥2 null。flows.json 未變。
- 重跑 build 時 `stations.json`、`daily.json` 出現與本票無關的非決定性差異（見 deferred-work.md），未提交這兩檔；本票提交的資料只有 2 個 od 分片與 meta.json。
- 選擇：原始 None（無人搭）算 null 格；環狀線迄站整欄不算保護格；四捨五入後的總量與格子和視為相等。

## Plan Change Log

## Review Triage Log

- Pass 1（quick，inline）：high 0／medium 1／low 0／false 0／maybe-false 0，另 1 筆 defer。
  - medium／patch：組定義 `od_groups` 原放在 export.py，與 CLAUDE.md 規則 3「能用總量減出來的格子要再隱藏，只在 suppress.py 做」不符 → 移到 suppress.py，重跑 build 與 pytest，結果相同（次要隱藏 2 格，21 passed）。
  - defer：topDestinations 浮點累加順序造成重跑結果不一（既有問題，非本票造成）→ deferred-work.md。全日組的成員取自同一次 build 的 topDestinations，單次輸出自洽，不影響本票的保護性。

## Design Notes

已公開的總量與對應的格子組（格子鍵 `(o, d, t, h)`，只含 `exits_recorded` 的迄站）：
1. 列：起站 o、日型 t、小時 h 的各迄站 ＝ `stations[o].entries[h]`、`tDepartures[h]`。
2. 欄：迄站 d、t、h 的各起站 ＝ `stations[d].exits[h]`（攻擊者載入全部分片即可加總）。
3. 全日：o 的 `topDestinations` 每個迄站 d、t 的各營運小時 ＝ 該 `avg`。

四捨五入：總量是 round(Σ原值)，格子是 round(原值)，所以差值只差每格最多 0.5 的累積誤差；誤差多半互相抵消，仍足以估出被藏格，因此一律視為相等並套用規則。原始 None（無人搭）照樣算 null 格；環狀線迄站整欄已知為 0，不算。2026-09 現況：列組只有 2 組剛好一格 null，欄、全日組皆 ≥2。

## Verification

**Commands:**
- `cd pipeline && uv run city-breath build --month 2026-09` -- expected: 完成並印出次要隱藏格數
- `cd pipeline && uv run --group dev pytest` -- expected: 全過
- `cd web && npm ci && npm test && npm run build` -- expected: 全過（網站不受影響）
