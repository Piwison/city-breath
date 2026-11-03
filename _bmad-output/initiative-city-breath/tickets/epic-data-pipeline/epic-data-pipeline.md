---
type: epic
title: "每月 OD 原始檔變成網站讀得動的小檔"
parent: initiative-city-breath
covers: [R10]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: []
status: in-progress
risk: medium
---

# 每月 OD 原始檔變成網站讀得動的小檔

## Description

一個指令就能把該月 OD 檔彙總成靜態 JSON，車站類型由人定名。由 v6 Epic 0 遷移；2026-11-03 replan 加上契約 v2：每站的官方行政區、行政區起訖彙總、逐日每站每小時，供首頁行政區流向（epic-city-breath-home）與活動日（epic-event-days）使用。

## Outcome

一個指令就能把該月 OD 檔彙總成契約 v1 的靜態 JSON，車站類型由人定名。

## Requirements

R1 (parent R10): 每月 OD 原始檔在本機彙總成站×小時×日型、起站×迄站×小時×日型、每日每站總量三份資料，並輸出成契約 v1 的靜態 JSON。
R2 (parent R10): 先以 1 個月建立，後續擴成近 12 個月。
R3 (parent R10；供 R3、R13): 每站有依官方圖資判定的行政區，並輸出行政區×行政區×小時×日型的起訖彙總。
R4 (parent R10；供 R5): 輸出每一天每站每小時的進出量，停止營運時段為 null。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- `city-breath fetch` 與 `build` 對任一月份可重跑，輸出符合 docs/data-contract.md。
- 車站類型標籤經 Piwi 定名（draft=false）。
- 近 12 個月資料可用。
- 契約 v2 的行政區對照、行政區起訖彙總與逐日每站每小時輸出寫進 docs/data-contract.md，pytest 通過。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes
- Decision: 2026-11-03 replan：需求變了（initiative R3 改寫、新增 R13、R5 移入這一版），本 epic 加 1.8 每站對上官方行政區、1.9 行政區起訖彙總、1.10 逐日每站每小時，排在 1.6、1.7 之前；已完成的 1.1–1.5 不動。
- Decision: 2026-11-03 契約 v2 的欄位與檔案切法先交給 bmad-architecture 定，再開始 1.9、1.10。
