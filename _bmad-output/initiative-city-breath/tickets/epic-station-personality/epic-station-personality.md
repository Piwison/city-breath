---
type: epic
title: "使用者認識每個站的個性"
parent: initiative-city-breath
covers: [R4, R18]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-data-pipeline]
risk: low
---

# 使用者認識每個站的個性

## Description

點站開啟的車站卡由首頁 epic 的 3.12 做，本 epic 再加上類型、一句話、平假日曲線、整天前 10 目的地、同類型站與誰來這站。由 v6 Epic 4 遷移；2026-11-10 replan 改成建在 3.12 的車站卡上，並加入 R18。

## Outcome

點一個站，看到它是什麼類型、平常怎麼起伏、大家從這裡去哪、又從哪裡來。

## Requirements

R1 (parent R4): 點一個站，看到它的類型標籤與一句話描述、24 小時曲線、最常去的 5 站。
R2 (parent R18): 點一個站，看到整天最常去的 10 站，以及每小時來這站的人從哪幾站、哪幾區來。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 每站有類型標籤與一句話（環狀線站有說明）。
- 平假日 24 小時曲線可見。
- 前 5 目的地（3.12）、整天前 10 目的地與同類型其他站可見。
- 誰來這站（前 5 起站、來源行政區）可見，環狀線站有說明。
- 部署到建置版後以上都可用。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Boundaries

- 車站卡本身（個性特質、進出、整天長條、這一小時前 5、去哪幾區）屬於 epic-city-breath-home 3.12；本 epic 只往卡裡加內容。
- 每站來源的計算屬於 epic-data-pipeline 1.13。

## Notes

- Waits on epic-data-pipeline because: 人工定名的車站類型
- Waits on epic-city-breath-home because: 車站卡（3.12）
- Decision: 2026-11-10 replan（天光定案與走查 A4、C4、C5、D1、F2）：車站卡改由首頁的 3.12 做，本 epic 的 story 都改成往那張卡加內容。5.2 改成整天前 10 目的地（等 1.13）；新增 5.4 誰來這站（等 1.13）；5.3 也說明誰來這站為什麼沒有；本 epic 超過三張，新增 5.5 Refactor sweep。
- Decision: 2026-11-10 依賴檢查：5.1 → 5.2 → 5.4 → 5.3 排成一條線，因為都改同一張車站卡。
