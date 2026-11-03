---
type: epic
title: "城市呼吸有一套微縮城市視覺系統"
parent: initiative-city-breath
covers: [R12]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: []
risk: medium
---

# 城市呼吸有一套微縮城市視覺系統

## Description

微縮城市方向（等角視角、發光路線、日夜光影；design/prototypes）用 prototype 做幾版讓 Piwi 定案，tokens 與 base 用 impeccable 整理，正式底圖或 3D 場景在建置版可用。由 v6 Epic 1 遷移，2026-11-03 replan 改掉 hallmark。

## Outcome

hallmark 選定主題並產出 tokens.css／base.css，底圖可用。

## Requirements

R1 (parent R12): 所有畫面以手機優先版面設計，顏色與字型只透過定案方向的 token。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 微縮城市方向由 Piwi 從 prototype 的幾個版本中定案，記錄在 DESIGN.md。
- tokens.css 取代暫用 token，impeccable audit 沒有阻擋級問題。
- 正式底圖或 3D 場景在建置版正常載入。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes
- Decision: 2026-11-03 replan：hallmark 已移除（PR #1），2.1、2.2 在原 id 上改寫成 prototype 定案與 impeccable 整理 tokens；2.3 底圖要等 bmad-architecture 決定渲染方式（Three.js 或 MapLibre＋deck.gl）。
