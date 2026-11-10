---
title: '異常日與 events.json'
type: 'feature'
ticket: '1'
created: '2026-11-04'
status: done
baseline_revision: '39042024203183acd522e2ad4be635346ff8b770'
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

**Problem:** 活動日（R5）需要「上個月哪幾天、哪些站特別不一樣」的單一答案；目前只有 v1 `daily.json` 的全市異常候選，定義也不是 AD-14 的「排除當日」，且沒有站級。

**Approach:** 新增 `pipeline/src/city_breath_pipeline/anomaly.py` 作為判定異常與「平常」的唯一地方（AD-14），由 `export.py` 的獨立函式寫出每月 `events.json`（`days[]`、`anomalies[]`、空的 `events[]`），契約寫進 `docs/data-contract.md`、`types.ts`、`load.ts`，並移除 v1 `daily.json`。

## Boundaries & Constraints

**Always:** 「平常」＝同月同星期幾、排除當日的中位數，全市級與站級同一函式；全市級門檻 |ratio − 1| ≥ 0.15（AD-4 假日檢查也用它）；站的參照＝同月 `stations.json` 陣列索引（AD-2）；人次為進站時段的當日總量（AD-15）；契約四處同一 commit（AD-1）；契約維持 v2（AD-10 已列 events.json 與移除 daily.json）；輸出可重現（整數加總、排序後輸出）。

**Never:** 不做場館檔期匯入與 `eventIds` 配對（7.2）、人工活動表（7.3）、畫面（7.4）；不動 1.9 的 `district-flows.json`／`flows.json`／`suppress.py`；前端不比對日期、不套門檻；不改 tickets.toml、不標 done；不提交 `stations.json` topDestinations 的重產雜訊。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 平常 | 某站 4 個週一 100/120/130/500，求第 4 個 | 平常＝median(100,120,130)=120，不含 500 | — |
| 全市假日 | 週一全市 148 萬、其他週一約 224 萬 | `anomalies[]` 有一筆 `station: null`、ratio ≈ 0.66 | — |
| 站級演出日 | 小巨蛋出站 22,343、平常 11,426 | 一筆 `station: 小巨蛋索引`、`measure: "exits"`、ratio 1.955 | — |
| 小站小波動 | 平常 600、當日 925（1.54 倍、多 325 人） | 不列（多出人數未達門檻） | — |
| 環狀線站 | `exitsRecorded=false` | 只看進站 | — |
| 同星期幾只有 1 天、或平常為 0 | 無基準 | 不判定；`days[].cityRatio` 為 `null` | — |

</frozen-after-approval>

## Code Map

- `pipeline/src/city_breath_pipeline/aggregate.py` -- `MonthAggregate.daily_station`（date, name, entries, exits 整數）與 `days`（date, dayType）已有，anomaly 只讀這兩個；不改 SQL。
- `pipeline/src/city_breath_pipeline/export.py` -- `export_month` 末段「daily.json」區塊（約 180–208 行）刪除；新增獨立的 `export_events()` 區段（放在 `export_daily` 之後，避開 1.9 會改的 flows 區）。
- `pipeline/src/city_breath_pipeline/cli.py` -- `cmd_build` 在 `export_daily` 後呼叫 `export_events`，印全市級異常日、站級筆數，並對「平日卻低於平常 15%」的日子提示可能漏列假日（AD-4）。
- `pipeline/tests/test_daily.py` -- 已提交資料的檢查寫法可照抄（`DATA`、`MONTHS`）。
- `web/src/data/types.ts`、`web/src/data/load.ts`、`load.test.ts` -- 照 `DailyFile`／`loadDaily` 的模式加 `EventsFile`／`loadEvents`（同時取同月 stations.json 檢查 month 與索引範圍）；import 另起一行，減少與 1.9 衝突。
- `docs/data-contract.md` -- 刪 `daily.json` 段與樹狀圖那行，加 `events.json` 段；版本說明行更新。
- `CLAUDE.md` 已知狀況的假日行 -- 改指向 `events.json`。
- `web/public/data/2026-09/daily.json` -- 刪除；`events.json` 新增。

## Tasks & Acceptance

**Execution:**
- [ ] `pipeline/src/city_breath_pipeline/anomaly.py` -- `normal()`（排除當日的同星期幾中位數）、`detect(agg, stations)` 回傳 days 與 anomalies；門檻常數集中於此 -- AD-14 單一擁有者
- [ ] `pipeline/src/city_breath_pipeline/export.py` -- 刪 daily.json；加 `export_events()` -- AD-10
- [ ] `pipeline/src/city_breath_pipeline/cli.py` -- 呼叫與摘要輸出、假日提示 -- AD-4
- [ ] `pipeline/tests/test_anomaly.py` -- 中位數排除自身、門檻邊界、環狀線、無基準、形狀、決定性、已提交 events.json 形狀與 2026-09 驗收 -- 測試
- [ ] `web/src/data/types.ts`、`load.ts`、`load.test.ts`、`docs/data-contract.md`、`CLAUDE.md` -- 契約與 loader -- AD-1
- [ ] 重建 2026-09，提交 `events.json` 與刪除 `daily.json`

**Acceptance Criteria:**
- Given 2026-09 已重建，when 讀 `events.json`，then 站級異常含 9/13 台北小巨蛋與 9/5 劍潭，全市級含 9/28。
- Given 同一份原始檔重跑 build，when 比對 `events.json`，then 位元組完全相同。
- Given `web/public/data/`，when 列出檔案，then 沒有 `daily.json`，網站與管線沒有任何地方讀它。

## Implementation Notes

- 無人值守執行：CHECKPOINT 1 未停下等核准，Design Notes 的 4 項假設待 Piwi 確認；本環境沒有子代理，實作與審查都在同一個 session 直接做。
- 新增 `anomaly.py`（`normal`、`detect`、`to_json`、門檻常數）、`export.export_events`、`cli._report_anomalies`、`tests/test_anomaly.py`（17 個）；`load.ts` 加 `loadEvents`、`load.test.ts` 加 4 個。
- 門檻比較改用 `Fraction`：浮點 `115/100 − 1` 略小於 0.15，剛好 15% 會漏判（測試抓到）。
- 2026-09：全市級 9/25（0.636）、9/26（0.842）、9/28（0.659）；站級 12 筆。9/13 台北小巨蛋（進站 1.966）、9/5 劍潭（出站 1.699）都在。
- 重跑兩次 `events.json` 位元組相同；`daily/` 無變化；`stations.json`（topDestinations ±1）與 `meta.json`（generatedAt）的重產差異未提交。
- 觀察（給 7.2）：輔大 9/14–24 連續 5 天上榜，像是開學讓同星期幾中位數混入開學前的日子，不是活動；9/20 小巨蛋（漢斯季默）出站 1.39 倍、多 4,476 人，暫定門檻抓不到。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，同 session 自審，無子代理）：high 0／medium 0／low 2／false 0／maybe-false 0。
  - low｜patch｜`cli.py` 編輯時把 `NLSC_POINT_API = "…"` 的等號後空白吃掉：已補回。
  - low｜patch｜`loadEvents` 對 `events[].stations` 也接受 `null`：改成只接受整數索引。

## Design Notes

假設（無人值守，未經 Piwi 確認）：

1. **全市級異常放在 `anomalies[]`，`station: null`**：前端只查表、不自己套 15% 門檻；全市級與站級共用同一欄位與日後的 `eventIds`（例如假日、颱風）。`days[]` 仍給每天的 `cityRatio`。
2. **站級多一個欄位 `measure`（`"entries"`／`"exits"`）**：AD-14 的形狀只有 `ratio`、`baseline`；同一站同一天進、出都過門檻時取倍數大的一邊，`baseline` 必須說明是哪一邊才有意義。
3. **站級暫定門檻**：當日 ≥ 平常 × 1.5 且多出 ≥ 1,000 人；只抓「多」不抓「少」（減少多半是全市假日，已在全市級）。2026-09 試算約 12 個站日；`events.json` 帶 `thresholds`（含 `provisional: true`），7.2 定案後寫回 AD-14。
4. `baseline` 四捨五入成整數，`ratio` 是對未取整中位數的倍數、取 3 位小數。

