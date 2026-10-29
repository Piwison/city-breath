---
type: epic
title: "網站公開上線並交代資料來源"
parent: initiative-city-breath
covers: [R11]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-city-breath-home, epic-commute-card]
risk: low
---

# 網站公開上線並交代資料來源

## Description

資料來源頁說清楚出處與限制，網站部署到 Vercel。由 v6 Epic 5 遷移。

## Outcome

資料來源頁說清楚出處與限制，網站部署到 Vercel。

## Requirements

R1 (parent R11): 資料來源頁說明出處、授權、OD 是進出站配對而非實際路徑、少於 10 人的顯示規則。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 token，設計用 hallmark（architecture AD-8）。

## Done when

- 資料來源頁上線並含四項說明與環狀線限制。
- 網站部署為公開網址。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-city-breath-home because: 首頁
- Waits on epic-commute-card because: 通勤卡
