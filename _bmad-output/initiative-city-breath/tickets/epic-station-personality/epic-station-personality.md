---
type: epic
title: "使用者認識每個站的個性"
parent: initiative-city-breath
covers: [R4]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-data-pipeline]
risk: low
---

# 使用者認識每個站的個性

## Description

點站開啟車站個性卡：類型、一句話、平假日曲線、前 5 目的地與同類型站。由 v6 Epic 4 遷移。

## Outcome

點站開啟車站個性卡：類型、一句話、平假日曲線、前 5 目的地與同類型站。

## Requirements

R1 (parent R4): 點一個站，看到它的類型標籤與一句話描述、24 小時曲線、最常去的 5 站。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 每站有類型標籤與一句話（環狀線站有說明）。
- 平假日 24 小時曲線可見。
- 前 5 目的地與同類型其他站可見。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-data-pipeline because: 人工定名的車站類型
