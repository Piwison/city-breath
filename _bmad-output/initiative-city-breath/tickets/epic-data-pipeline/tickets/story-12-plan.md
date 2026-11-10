---
title: '擴充到近 12 個月'
type: 'feature'
ticket: '7'
created: '2026-11-04'
status: done
baseline_revision: 'c37fa66295e9451d034362328c7e42ea75dc0f67'
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
- 結果（2026-11-04）：2025-10～2026-08 共 11 個月逐月建出，2026-09 未動。沒有遇到新的站名前綴，`station_aliases.csv` 不用改。
  - 2025-10～2026-07 的 OD 月檔完全沒有「廣慈/奉天宮」（進站、出站欄都沒有），這幾個月 119 站；2026-08 起回到 120 站。站索引本來就只在同月有效（AD-2），`loadDaily`／`loadEvents` 已檢查；`loadOdShard` 原本沒檢查，本票補上（同月 `stations.json`、`origin`、列長）。
  - 2025-11-01 凌晨 2 點有進站（白晝之夜），該月 `serviceHours` 含 2、3 點；`test_daily` 原本寫死「每天 2–4 點停駛」，改成對 `meta.serviceHours` 檢查。
  - 2025-12 的月檔排除 51,408 列（日期不在 12 月，應是跨年夜 2026-01-01 凌晨的紀錄）；1 月檔 1/1 0 點只有約 1.1 萬進站。跨月過濾是 1.3 的既有規則，本票不改，列為待決問題。
  - 2026-07-10（週五）全市進站只有平常的 26%，`build` 提示可能漏列假日：是巴威颱風停班停課日（NOWnews 2026-07-09 報導雙北 7/10 停班停課），不是人事行政總處日曆上的假日，沒有加進 `holidays.csv`，列為待決問題。
  - 花博 2026 年度檔仍未發布（最新 114 年度），2026-01～08 沒有花博自動檔期。
  - 各月分群都是 k=4，但草稿標籤與群序號每月不同；1.6 人工定名要決定是否跨月共用。
  - 資料量：`web/public/data/` 12 個月共約 52 MB（`du -sb` 51,836,342 bytes），每月 4.4–4.8 MB。
- 下載：本機用 scratch 腳本把 curl 接到 `cli._download` 與 `urllib.request.urlopen`，程式不改。
- 檔案：`pipeline/config/holidays.csv`、`pipeline/tests/test_months.py`（新）、`pipeline/tests/test_daily.py`、`web/src/data/load.ts`、`web/src/data/load.test.ts`、`docs/data-contract.md`、`web/public/data/2025-10`～`2026-08`、`months.json`。

## Review Triage Log

- 本環境沒有可啟動子代理的工具，quick lens 改為在同一個 session 逐項自審 diff（程式部分；資料檔由 pytest 逐月檢查）。
- low／false：`loadOdShard` 由同步回傳 Promise 改為 async function，呼叫端（`App.tsx` 的 `await loadOdShard(...)`）不受影響。
- false：`test_every_file_has_current_contract_version_and_month` 假設每個月份 JSON 都有 `month`；查過 export.py，od 分片、daily、events、meta、stations、districts、district-flows 都寫 `month`。
- 沒有需要修補或延後的發現。
