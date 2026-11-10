---
title: '人工活動表'
type: 'feature'
ticket: '3'
created: '2026-11-04'
status: done
baseline_revision: '7f918f420a678cb1b8fa87fac2fd18c4b7293fb6'
route: 'oneshot'
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

**Problem:** 大巨蛋、展覽館、封街活動不在臺北市資料大平臺的場館檔期裡，2026-09 的 SEMICON（南港展覽館）與《大象來了》（劍潭）只能顯示「原因未查證」。

**Approach:** 新增 `pipeline/config/events.csv`（`startDate,endDate,venue_id,name,url,verified`），`build` 驗證後與 7.2 的自動檔期一起配對，寫進 `events.json`，標 `source: "manual"`；沒有來源網址的列讓 build 失敗；每月補活動的步驟寫進 CLAUDE.md。

</frozen-after-approval>

## Implementation Notes

oneshot：改動集中在 `schedules.py` 一個載入函式與 `link()` 的來源欄位，約 100 行內（含測試另計）。

- 無人值守執行；本環境沒有子代理，實作與審查都在同一個 session（同 7.1、7.2）。分支疊在 7.2（PR #13）上。
- `schedules.py`：`Schedule` 加 `source`、`verified`；新增 `load_manual()`（整份表都驗：欄位、名稱、`http(s)://` 網址、`venue_id`、`verified`、日期）；`link()` 的 id 前綴改用每筆的 `source`，人工活動沒配到也輸出。`cli.py` 在 build 一開始就讀表，錯誤直接失敗。
- `pipeline/config/events.csv` 兩列，都以 WebFetch 讀過來源確認日期：SEMICON Taiwan 2026（官網 FAQ：展期 9/2–9/4、南港展覽館一、二館）、《大象來了》（NOWnews 6872340：9/5、9/6 在士林區基河路到北藝中心，沒有寫捷運站）。
- 2026-09 重建：SEMICON 配到 9/2–4 南港展覽館站，《大象來了》配到 9/5 劍潭站；站級異常仍「原因未查證」11 筆（南港 ×4、士林、大安森林公園、台大醫院、善導寺、台北車站、圓山、Y板橋）。`events.json` 重跑位元組相同；`meta.json`（generatedAt）、`stations.json`（±1）的重產差異未提交。
- 測試 12 個（`test_schedules.py`）：表的欄位與 7 種壞列（含沒有網址）、只收當月、與 auto 合併與配對、同站同日 auto＋manual、已提交的表與 events.json 驗收。
- CLAUDE.md 沒有既有的每月流程段落，依 architecture Consistency Conventions 在「常用指令」下加一行「每月更新」。

## Plan Change Log

## Review Triage Log

- 第 1 輪（quick，同 session 自審，無子代理）：high 0／medium 0／low 0／false 0／maybe-false 0。

## Design Notes

假設（無人值守，未經 Piwi 確認）：

1. 人工列不論有沒有配到異常都寫進 `events[]`（人工查證過、刻意補的）；沒配到的 build 印提醒。自動檔期維持只收配到的。
2. `id`＝`manual-<venue_id>-<起日>`，規則同 auto；同一天同站同時配到 auto 與 manual 時兩個 id 都列。
3. 只收與當月重疊的列；`verified` 只接受 `true`／`false`；`url` 必須是 `http(s)://`；`venue_id` 必須在 `venues.csv`。
4. 站只來自 `venues.csv`（只讀）：《大象來了》只連劍潭站，同日的士林、大安森林公園維持「原因未查證」。
