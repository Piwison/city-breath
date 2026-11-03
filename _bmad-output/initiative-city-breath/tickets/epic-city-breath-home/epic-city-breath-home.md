---
type: epic
title: "城市觀察者看得到一整天各行政區之間的流動"
parent: initiative-city-breath
covers: [R3, R13]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-data-pipeline]
risk: medium
---

# 城市觀察者看得到一整天各行政區之間的流動

## Description

首頁自動播放全城一天各行政區之間的流動，可拖動時間軸、切換平日／假日；點一個行政區看這區的人去哪、誰來這裡，並展開該區的站。由 v6 Epic 2 遷移，2026-11-03 replan 從站對站弧線改成行政區流向。

## Outcome

首頁地圖上站點脹縮、前 200 組弧線、時間軸播放與平日／假日切換，在手機上順暢。

## Requirements

R1 (parent R3): 首頁自動播放全城一天的人潮流動，以行政區為單位，可拖動時間軸與切換平日／假日，上方疊一個「找你的通勤」入口，手機上播放不卡頓。
R2 (parent R13): 點一個行政區，看到這區的人去哪、誰來這裡，平日與假日分開，並可展開該區的站。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 首頁自動播放行政區流向，平日／假日可切換，中階手機上播放不卡頓。
- 點行政區看得到去哪、誰來，展開的站點大小與顏色依小時更新。
- 2–4 點顯示停止營運狀態。
- 部署到建置版後以上都可用。

## Boundaries
- Touch point: 首頁上方的「找你的通勤」入口 — 本 epic 留位置；輸入表單本身由 epic-commute-card 4.1 做。
- 車站個性卡屬於 epic-station-personality；本 epic 只負責點站後打開它。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes
- Waits on epic-visual-system because: 微縮城市場景基底（2.3）

- Waits on epic-data-pipeline because: 契約 v2 的行政區對照與行政區起訖彙總
- Decision: 2026-11-03 replan：需求變了，城市流動從站對站弧線改成行政區流向（initiative R3 改寫、新增 R13）。新增 3.5 行政區流向弧線（tracer bullet）、3.6 點行政區看去哪誰來並展開站、3.7 Refactor sweep；3.1 改為展開行政區後的站點光點。
- Dropped: 3.2 前 200 組弧線 — 站對站弧線被行政區流向取代（2026-11-03 replan）。
- Decision: 2026-11-03 渲染方式定案為 Three.js＋React Three Fiber（architecture AD-11、AD-12）；3.5 建在 2.3 的場景基底上，並移除骨架的 maplibre-gl 與 deck.gl。
