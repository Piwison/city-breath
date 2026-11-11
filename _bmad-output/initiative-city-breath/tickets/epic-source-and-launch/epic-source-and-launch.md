---
type: epic
title: "網站公開上線並交代資料來源"
parent: initiative-city-breath
covers: [R11]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: [epic-city-breath-home, epic-commute-card, epic-event-days]
risk: low
---

# 網站公開上線並交代資料來源

## Description

網站部署到 Vercel，上線前確認「關於與資料來源」列齊所有出處與限制。由 v6 Epic 5 遷移；2026-11-11 replan 把資料來源頁（6.1）移到首頁 epic 成 3.17，好讓第一次來的人在車站卡做完後就找得到。

## Outcome

網站以公開網址上線，「關於與資料來源」說清楚出處與限制。

## Requirements

R1 (parent R11): 資料來源頁說明出處、授權、OD 是進出站配對而非實際路徑、少於 10 人的顯示規則。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 「關於與資料來源」（3.17）在公開網址上含四項說明與環狀線限制，並列到上線當月所有 epic 用到的來源。
- 網站部署為公開網址。

## Boundaries

- 資料來源頁本身由 epic-city-breath-home 3.17 做（2026-11-11 由 6.1 移過去）；本 epic 只部署並在上線前核對。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-city-breath-home because: 首頁
- Waits on epic-commute-card because: 通勤卡
- Waits on epic-event-days because: 活動日
- Decision: 2026-11-03 replan：活動日排在上線前（Piwi），本 epic 也等 epic-event-days；資料來源頁要加上活動資料的出處（臺北市資料大平臺、人工補的來源）。
- Decision: 2026-11-10 replan（天光定案）：資料來源頁也要列底圖的來源（basemap.json 的 sources）並說明哪些是示意、徽章進度只存在瀏覽器（6.1）。
- Decision: 2026-11-11 replan（第一次使用者走查 B2、F7；Piwi 決定 3）：6.1 資料來源頁移到 epic-city-breath-home 成 3.17「關於與資料來源」，排在車站卡之後就做；本 epic 只剩 6.2 部署，仍等首頁、通勤卡、活動日三個 epic 完成。
