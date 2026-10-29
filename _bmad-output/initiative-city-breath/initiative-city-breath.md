---
type: initiative
title: "台北人看得到自己在城市作息裡的位置，並把它分享出去"
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: [_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md, docs/data-contract.md]
after: []
status: in-progress
risk: medium
---

# 城市呼吸｜北捷人流脈搏

## Description

用北捷每月公開的「每日分時各站起訖人次」做一個手機優先、純靜態的網站：看城市怎麼過一天、自己的站是什麼個性、自己的通勤在全城裡的位置，並能帶走一張通勤卡。差異化是個人化、車站個性與有意義的故事，不做即時與多圖層（見 PRD 摘要、產品定位）。

## Outcome

雙北通勤族與城市觀察者能在手機上找到自己的通勤並分享出去；北極星指標是通勤同路人卡的產生次數（PRD 成功指標）。

## Requirements

R1 (US-1): 通勤族輸入起站、迄站與出發時段，3 步內看到平日平均同路人數；少於 10 人時顯示「少於 10 人」。
R2 (US-2): 通勤族一鍵把結果輸出成直式分享圖片，含資料月份、資料來源與網址。
R3 (US-3): 城市觀察者拖動或播放時間軸，看一整天人潮在各站之間流動，可切換平日／假日，手機上播放不卡頓。
R4 (US-4): 任何使用者點一個站，看到它的類型標籤與一句話描述、24 小時曲線、最常去的 5 站。
R5 (US-5): 城市觀察者看颱風假、演唱會、跨年等特殊日子與平常的差異，至少 3 篇滾動式故事。
R6 (US-6): 使用者看到通勤負擔地圖，各站以平日早上 7–9 點出發者的平均搭乘站數上色。
R7 (US-7): 找房的人並排比較 2 到 3 個站的平假日曲線。
R8 (US-8): 記者下載圖表的彙總數字，含 CSV 與引用格式。
R9 (US-9): 老使用者看自己的站 2017 年至今的年度趨勢，標出疫情與新線通車。
R10 (MVP 範圍、資料與技術做法): 每月的 OD 原始檔在本機彙總成網站讀得動的小檔（站×小時×日型、起站×迄站×小時×日型、每日每站總量），先以 1 個月建立，後續擴成近 12 個月。
R11 (MVP 範圍): 網站有資料來源頁，說明出處、授權、OD 是進出站配對而非實際路徑、少於 10 人的顯示規則。
R12 (MVP 範圍): 所有畫面以手機優先版面設計。

## Constraints

- 純靜態網站、沒有後端；所有重運算在每月本機彙總完成（PRD 產品提案、資料與技術做法）。
- 起訖人次少於 10 人一律不顯示數字（PRD 風險與對策；architecture AD-3）。
- 只做北捷，不做即時、不做列車動畫與多圖層、不做路線規劃（PRD 我們不做的事）。
- 資料標示出處：政府資料開放授權條款第 1 版（PRD 背景與問題）。
- 所有視覺設計使用 hallmark skill，顏色與字型只透過 token（architecture AD-8；Piwi 2026-10-26 指定）。

## Done when

- 城市呼吸首頁、通勤同路人卡、車站個性卡、資料來源頁在手機上可用，並部署成公開網址。
- 通勤卡可一鍵下載，且「下載分享卡」次數可被計數。
- 上線首月檢視成功指標：通勤卡 500 次、輸入完成率 60%、每位訪客開 3 個站、次月回訪 15%（PRD 成功指標，假設值）。
- 每月新資料能用一個指令重跑彙總並更新網站。

## Boundaries

- 不做：即時擁擠度、列車動畫、路線規劃、北捷以外的系統、帳號（PRD 我們不做的事）。
- P1、P2（R5–R9）不在 MVP 的 epics 內，先記為 Parked。
- Tracer path：月檔 → 彙總管線（epic-data-pipeline）→ 靜態 JSON → 首頁地圖（epic-city-breath-home）→ 通勤卡（epic-commute-card）→ 分享出去。

## References

- prd — _bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md, User stories、MVP 範圍
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- contract — docs/data-contract.md
- prd (original) — https://claude.ai/artifact/S46QYMugL6cKGNZK9ePN7r

## Notes

- Parked: R5、R6、R7 為 P1，R8、R9 為 P2；MVP 完成、通勤卡有人用之後再切成 epics（PRD 里程碑關卡）。
- Open question: 品牌名稱是否就叫「城市呼吸」。
- Open question: 2017 年至今各月檔欄位與站名是否一致（影響 R9）。
- Decision: 2026-10-26 站點座標採用臺北捷運車站出入口座標（data.gov.tw 128428），不申請 TDX。
- Decision: 2026-10-26 環狀線 11 站只有進站紀錄（出站未入檔），不分群、不能當迄站。
- Decision: 2026-10-29 升級到 BMAD v7 預覽版，由 v6 epics.md 遷移而來（見 _bmad-output/migration-v6-v7/migration-v6-v7.md）。
