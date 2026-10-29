---
type: epic
title: "通勤族找到同路人並把通勤卡分享出去"
parent: initiative-city-breath
covers: [R1, R2]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-data-pipeline, epic-visual-system]
risk: medium
---

# 通勤族找到同路人並把通勤卡分享出去

## Description

輸入起訖站與時段看到同路人數與名次，一鍵下載直式分享卡，下載次數可計數。由 v6 Epic 3 遷移。

## Outcome

輸入起訖站與時段看到同路人數與名次，一鍵下載直式分享卡，下載次數可計數。

## Requirements

R1 (parent R1): 輸入起站、迄站與出發時段，3 步內看到平日平均同路人數；少於 10 人時顯示「少於 10 人」。
R2 (parent R2): 一鍵把結果輸出成直式分享圖片，含資料月份、資料來源與網址。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 token，設計用 hallmark（architecture AD-8）。

## Done when

- 3 步內完成輸入並看到結果。
- 分享卡可下載且含月份、來源、網址。
- 「下載分享卡」次數可被計數。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-data-pipeline because: od/{stationId}.json 分片
- Waits on epic-visual-system because: 分享卡的視覺 token
