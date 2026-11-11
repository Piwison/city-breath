---
type: epic
title: "通勤族找到同路人並把通勤卡分享出去"
parent: initiative-city-breath
covers: [R1, R2, R17, R21]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: [DESIGN.md]
after: []
risk: medium
---

# 通勤族找到同路人並把通勤卡分享出去

## Description

輸入起訖站與時段看到同路人數與名次，一鍵下載直式分享卡，下載次數可計數。由 v6 Epic 3 遷移；2026-11-10 replan 把分享卡移到最前並讓行政區卡共用，入口改成可打字搜尋的「找車站／通勤」，通勤卡加早晚一小時比較。2026-11-11 replan（第一次使用者走查）：行政區卡分享移到首頁 epic（3.16），計數提前並加上連結分享，找車站改依路線分組，通勤卡接首頁的分享入口（3.15）。

## Outcome

通勤族從「找車站／通勤」3 步內看到同路人數、名次與早晚一小時的差別，一鍵把通勤卡存成直式圖或分享連結，下載與分享次數可計數。

## Requirements

R1 (parent R1): 輸入起站、迄站與出發時段，3 步內看到平日平均同路人數；少於 10 人時顯示「少於 10 人」。
R2 (parent R2): 一鍵把結果輸出成直式分享圖片，含資料月份、資料來源與網址。
R3 (parent R17): 把行政區卡存成直式圖分享，圖上附月份、日型、時段、資料來源與網址（活動卡由 epic-event-days 做，共用本 epic 的版型）。
R4 (parent R21): 使用者從行政區卡、通勤卡、活動卡與沒開卡的首頁都找得到分享入口；分享出去的連結打開時回到同一個站或行政區、同一時段與日型。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 3 步內完成輸入並看到結果。
- 分享卡可下載且含月份、來源、網址；通勤卡的連結打開回到同一張通勤卡。
- 站選單可打字搜尋、依路線分組，通勤卡看得到早晚一小時的差別。
- 部署到建置版後以上都可用。
- 「下載分享卡」與分享連結的次數可被計數。

## Boundaries

- R3 的行政區卡存成圖片由 epic-city-breath-home 3.16 做（2026-11-11 由 4.5 移過去），本 epic 提供版型（4.3，已完成）與計數（4.4）。
- 分享入口與網址（3.15）屬於 epic-city-breath-home；本 epic 的通勤卡接上它。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- design — DESIGN.md, 互動（找車站／通勤、通勤卡）
- walkthrough — design/reviews/2.1-user-story-walkthrough-2026-11-10.md, A 雙北通勤族、結論 1
- walkthrough — design/reviews/2.1-first-time-user-2026-11-11.md, B1、F3

## Notes

- Waits on epic-data-pipeline because: od/{stationId}.json 分片
- Waits on epic-visual-system because: 分享卡的視覺 token
- Decision: 2026-11-03 replan：首頁上方疊「找你的通勤」入口（user-stories 決定 2），由 4.1 做，所以 4.1 等首頁的 3.5；其餘不變。
- Decision: 2026-11-10 replan（走查結論 1：三大族群 P0 唯一做不到的是分享）：4.3 分享卡移到本 epic 最前，只等 2.2 的 token，先接在骨架的通勤結果上；版型給行政區卡（新增 4.5）與活動卡（7.7）共用。4.1 改成「找車站／通勤」入口＋可打字搜尋的站選單＋只看起站（等 3.5、3.12）；4.2 加早晚一小時比較；4.4 計數帶卡片種類；新增 4.6 Refactor sweep（本 epic 已超過三張）。
- Decision: 2026-11-10 拿掉本 epic 檔頭的整個 epic 閘門（原本要等 epic-data-pipeline、epic-visual-system 全部完成），改由各 story 的 after 指定真正要等的票（4.3 等 2.2、4.2 等 1.5、4.1 等 3.5 與 3.12），否則分享卡會被 1.12、1.13、1.6 與 2.3 卡住，無法往前做。
- Decision: 2026-11-10 tracer bullet 改為 4.3：最薄的一條從資料到可下載圖片的路徑。
- Decision: 2026-11-11 replan（第一次使用者走查；Piwi 決定 3）：分享與網站說明要在車站卡之後就做，4.5 行政區卡分享移到 epic-city-breath-home 成 3.16（首頁 epic 在建置順序裡排在本 epic 之前，留在這裡會等到首頁 epic 全部做完）；4.4 改名「下載與分享計數」、加連結分享事件，排到本 epic 第一張未做的票，等 3.15、3.16；4.1 依路線分組、最近用過的站、預設不放無關站、時段選單標停止營運（F3、小問題）；4.2 接 3.15 的分享鈕並把通勤起訖寫進網址；本 epic 加 R4（parent R21）。
- Decision: 2026-11-11 4.1「最近用過的站」跨次造訪記住（Piwi）：Winston 改了 AD-22（與 AD-16 的例外），最多 5 站、只存站 ID、不存任何人數，經 state/progress.ts 存在同一個鍵，localStorage 不能用時退回記憶體；4.1 的 description／verify 同步。原 Open question 結案。
- Decision: 2026-11-11 4.1 加等 3.11：progress.ts 由 3.11 建立（「看過開場」），4.1 在同一個模組加欄位，排成一條線避免兩張票各建一份；3.9 之後也改它，加欄位不互相覆寫。
- Decision: 2026-11-11 4.4 不寫 after 6.2：epic-source-and-launch 在建置順序裡排在本 epic 之後（6.3 正式上線要等本 epic），寫了會 order_conflict。改在 4.4 與 6.2 的描述互相寫明交接：Web Analytics 由 6.2 打開，4.4 的「分析工具看得到事件」在 6.2 的部署上驗。
