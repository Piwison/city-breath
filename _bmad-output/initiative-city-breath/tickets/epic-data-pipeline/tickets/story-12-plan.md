---
title: '擴充到近 12 個月'
type: 'feature'
ticket: '7'
created: '2026-11-04'
status: 'in-progress'
baseline_revision: 'c37fa66295e9451d034362328c7e42ea75dc0f67'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `web/public/data/` 只有 2026-09 一個月；R2 要近 12 個月，月份切換 UI（Deferred）與活動日都需要更多月份。

**Approach:** 用現有管線（契約 v2、同一份程式）逐月 `fetch` → `fetch-events` → `build` 2025-10 到 2026-08，每月建完刪掉該月 OD 原始檔省空間；`holidays.csv` 補上人事行政總處辦公日曆表的國定假日；別名有新前綴只改 `station_aliases.csv`；加測試確認所有月份同一個 `CONTRACT_VERSION` 且 `months.json` 與資料夾一致。

</frozen-after-approval>

## Implementation Notes

- oneshot：程式改動很少（假日表、測試、load.ts 一個月份檢查），主要工作是逐月跑管線與檢查輸出。
- 假設（無人值守，記在這裡）：
  - 「近 12 個月」＝OD 索引最新的 12 個月：2025-10～2026-09（2026-11-04 查索引，最新為 2026-09）。
  - 2026-09 已上線，依 AD-18 不可變，不重建；新月份用同一份程式與契約 v2 建出。
  - 假日來源：人事行政總處「中華民國政府行政機關辦公日曆表」114 年（1141020 更新）與 115 年 CSV（data.gov.tw 14718）。只列平日放假的日子（週末本來就是 holiday）；範圍內沒有補行上班日，所以 `holidays.csv` 格式不用擴充。
  - 自動場館檔期照抓；舊月份不補人工活動（沒有附網址查證的來源就維持「原因未查證」）。
  - 本機 Python 3.13 對代理 CA 嚴格檢查失敗，下載改由 scratch 腳本把 curl 接到同一個 `cli._download`／`schedules.fetch(get=...)`（同 7.2 的做法），程式不改。
