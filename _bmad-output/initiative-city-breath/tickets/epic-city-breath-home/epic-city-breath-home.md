---
type: epic
title: "城市觀察者看得到一整天的人潮流動"
parent: initiative-city-breath
covers: [R3]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-data-pipeline]
risk: medium
---

# 城市觀察者看得到一整天的人潮流動

## Description

首頁地圖上站點脹縮、前 200 組弧線、時間軸播放與平日／假日切換，在手機上順暢。由 v6 Epic 2 遷移。

## Outcome

首頁地圖上站點脹縮、前 200 組弧線、時間軸播放與平日／假日切換，在手機上順暢。

## Requirements

R1 (parent R3): 拖動或播放時間軸，看一整天人潮在各站之間流動，可切換平日／假日，手機上播放不卡頓。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 token，設計用 hallmark（architecture AD-8）。

## Done when

- 站點大小與顏色依小時更新，淨流入／流出可辨。
- 每小時只畫前 200 組弧線。
- 中階手機上播放不卡頓。
- 2–4 點顯示停止營運狀態。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-data-pipeline because: 契約 v1 的 stations.json 與 flows.json
