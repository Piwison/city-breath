---
type: epic
title: "通勤族找到同路人並把通勤卡分享出去"
parent: initiative-city-breath
covers: [R1, R2, R17]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: [DESIGN.md]
after: []
risk: medium
---

# 通勤族找到同路人並把通勤卡分享出去

## Description

輸入起訖站與時段看到同路人數與名次，一鍵下載直式分享卡，下載次數可計數。由 v6 Epic 3 遷移；2026-11-10 replan 把分享卡移到最前並讓行政區卡共用，入口改成可打字搜尋的「找車站／通勤」，通勤卡加早晚一小時比較。

## Outcome

通勤族從「找車站／通勤」3 步內看到同路人數、名次與早晚一小時的差別，一鍵把通勤卡或行政區卡存成直式圖，下載次數可計數。

## Requirements

R1 (parent R1): 輸入起站、迄站與出發時段，3 步內看到平日平均同路人數；少於 10 人時顯示「少於 10 人」。
R2 (parent R2): 一鍵把結果輸出成直式分享圖片，含資料月份、資料來源與網址。
R3 (parent R17): 把行政區卡存成直式圖分享，圖上附月份、日型、時段、資料來源與網址（活動卡由 epic-event-days 做，共用本 epic 的版型）。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 3 步內完成輸入並看到結果。
- 分享卡可下載且含月份、來源、網址；行政區卡也能下載。
- 站選單可打字搜尋，通勤卡看得到早晚一小時的差別。
- 部署到建置版後以上都可用。
- 「下載分享卡」次數可被計數。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- design — DESIGN.md, 互動（找車站／通勤、通勤卡）
- walkthrough — design/reviews/2.1-user-story-walkthrough-2026-11-10.md, A 雙北通勤族、結論 1

## Notes

- Waits on epic-data-pipeline because: od/{stationId}.json 分片
- Waits on epic-visual-system because: 分享卡的視覺 token
- Decision: 2026-11-03 replan：首頁上方疊「找你的通勤」入口（user-stories 決定 2），由 4.1 做，所以 4.1 等首頁的 3.5；其餘不變。
- Decision: 2026-11-10 replan（走查結論 1：三大族群 P0 唯一做不到的是分享）：4.3 分享卡移到本 epic 最前，只等 2.2 的 token，先接在骨架的通勤結果上；版型給行政區卡（新增 4.5）與活動卡（7.7）共用。4.1 改成「找車站／通勤」入口＋可打字搜尋的站選單＋只看起站（等 3.5、3.12）；4.2 加早晚一小時比較；4.4 計數帶卡片種類；新增 4.6 Refactor sweep（本 epic 已超過三張）。
- Decision: 2026-11-10 拿掉本 epic 檔頭的整個 epic 閘門（原本要等 epic-data-pipeline、epic-visual-system 全部完成），改由各 story 的 after 指定真正要等的票（4.3 等 2.2、4.2 等 1.5、4.1 等 3.5 與 3.12），否則分享卡會被 1.12、1.13、1.6 與 2.3 卡住，無法往前做。
- Decision: 2026-11-10 tracer bullet 改為 4.3：最薄的一條從資料到可下載圖片的路徑。
