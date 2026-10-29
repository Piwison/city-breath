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

一個指令就能把該月 OD 檔彙總成契約 v1 的靜態 JSON，車站類型由人定名。由 v6 Epic 0 遷移。

## Outcome

一個指令就能把該月 OD 檔彙總成契約 v1 的靜態 JSON，車站類型由人定名。

## Requirements

R1 (parent R10): 每月 OD 原始檔在本機彙總成站×小時×日型、起站×迄站×小時×日型、每日每站總量三份資料，並輸出成契約 v1 的靜態 JSON。
R2 (parent R10): 先以 1 個月建立，後續擴成近 12 個月。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 token，設計用 hallmark（architecture AD-8）。

## Done when

- `city-breath fetch` 與 `build` 對任一月份可重跑，輸出符合 docs/data-contract.md。
- 車站類型標籤經 Piwi 定名（draft=false）。
- 近 12 個月資料可用。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
