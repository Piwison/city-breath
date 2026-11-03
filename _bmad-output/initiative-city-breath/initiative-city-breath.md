---
type: initiative
title: "台北人看得到自己在城市作息裡的位置，並把它分享出去"
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md, _bmad-output/initiative-city-breath/user-stories-city-breath-2026-11-03/user-stories-city-breath-2026-11-03.md]
companions: [_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md, docs/data-contract.md]
after: []
status: in-progress
risk: medium
---

# 城市呼吸｜北捷人流脈搏

## Description

用北捷每月公開的「每日分時各站起訖人次」做一個手機優先、純靜態的網站，每月初更新「上個月的台北」：看全城各行政區之間怎麼流動、自己的通勤在全城裡的位置、上個月哪幾天特別不一樣，並能帶走一張通勤卡。差異化是個人化、行政區流向與有意義的活動日，不做即時與多圖層（見 PRD 摘要、產品定位；user-stories 2026-11-03 已決定的事）。

## Outcome

雙北通勤族、追星族與球迷、城市觀察者能在手機上找到自己的通勤、自己那區的流向與上個月的活動日，並分享出去；北極星指標是通勤同路人卡的產生次數（PRD 成功指標）。

## Requirements

R1 (US-1): 通勤族輸入起站、迄站與出發時段，3 步內看到平日平均同路人數；少於 10 人時顯示「少於 10 人」。
R2 (US-2): 通勤族一鍵把結果輸出成直式分享圖片，含資料月份、資料來源與網址。
R3 (US-3; user-stories C1, 決定 2、5): 首頁自動播放全城一天的人潮流動，以行政區為單位，可拖動時間軸與切換平日／假日，上方疊一個「找你的通勤」入口，手機上播放不卡頓。
R4 (US-4): 任何使用者點一個站，看到它的類型標籤與一句話描述、24 小時曲線、最常去的 5 站。
R5 (US-5; user-stories C3、B1、B2、G2, 決定 3): 每月自動列出異常日並對上小巨蛋、花博、中山堂的檔期；大巨蛋、展覽館、封街活動每月人工補 3–5 場並附來源；對不到的標「原因未查證」；使用者看得到該日與平常的差異，以及人從哪些區來。
R6 (US-6): 使用者看到通勤負擔地圖，各站以平日早上 7–9 點出發者的平均搭乘站數上色。
R7 (US-7): 找房的人並排比較 2 到 3 個站的平假日曲線。
R8 (US-8): 記者下載圖表的彙總數字，含 CSV 與引用格式。
R9 (US-9): 老使用者看自己的站 2017 年至今的年度趨勢，標出疫情與新線通車。
R10 (MVP 範圍、資料與技術做法): 每月的 OD 原始檔在本機彙總成網站讀得動的小檔（站×小時×日型、起站×迄站×小時×日型、每日每站總量），先以 1 個月建立，後續擴成近 12 個月。
R11 (MVP 範圍): 網站有資料來源頁，說明出處、授權、OD 是進出站配對而非實際路徑、少於 10 人的顯示規則。
R12 (MVP 範圍): 所有畫面以手機優先版面設計。
R13 (user-stories C2、E1, 決定 5): 使用者點一個行政區，看到這區的人去哪、誰來這裡，平日與假日分開，並可展開該區的站。
R14 (user-stories I1): 通勤族拿到一整年的通勤年度回顧卡（同路人、自己那站最擠的一天）並可分享。
R15 (user-stories I2): 城市觀察者看跨年、春節、連假時城市怎麼空掉又回來。
R16 (user-stories I3): 城市觀察者看颱風或大雨那天城市怎麼停下來。

## Constraints

- 純靜態網站、沒有後端；所有重運算在每月本機彙總完成（PRD 產品提案、資料與技術做法）。
- 起訖人次少於 10 人一律不顯示數字（PRD 風險與對策；architecture AD-3）。
- 只做北捷，不做即時、不做列車動畫與多圖層、不做路線規劃（PRD 我們不做的事）。
- 網站是月刊式回顧：每月初更新上個月，不做預告與即時（user-stories 決定 4）。
- 資料標示出處：政府資料開放授權條款第 1 版（PRD 背景與問題）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字；視覺方向用 prototype、打磨用 impeccable，hallmark 已移除（user-stories 決定 7；CLAUDE.md）。

## Done when

- 首頁的行政區流向、點行政區看流向、通勤同路人卡、活動日、車站個性卡、資料來源頁在手機上可用，並部署成公開網址。
- 通勤卡可一鍵下載，且「下載分享卡」次數可被計數。
- 每月的活動日清單有自動對上的場館檔期與人工補的來源，對不到的標「原因未查證」。
- 上線首月檢視成功指標：通勤卡 500 次、輸入完成率 60%、每位訪客開 3 個站、次月回訪 15%（PRD 成功指標，假設值）。
- 每月新資料能用一個指令重跑彙總並更新網站。

## Boundaries

- 不做：即時擁擠度、預測、列車動畫、路線規劃、北捷以外的系統、帳號（PRD 我們不做的事；user-stories 決定 4）。
- 只主動設計 A 通勤族、B 追星族與球迷、C 城市觀察者；其他族群用同一份資料就能服務，但不為他們設計（user-stories 決定 1）。
- R6–R9、R14–R16 不在這一版的 epics 內，先記為 Parked。
- Touch point: 臺北市資料大平臺（小巨蛋、花博、中山堂檔期，站點與區界圖資）— 管線讀取；owner: epic-data-pipeline、epic-event-days。
- Tracer path：月檔 → 彙總管線（epic-data-pipeline）→ 靜態 JSON → 首頁行政區流向（epic-city-breath-home）→ 通勤卡（epic-commute-card）→ 分享出去。

## References

- prd — _bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md, User stories、MVP 範圍
- user-stories — _bmad-output/initiative-city-breath/user-stories-city-breath-2026-11-03/user-stories-city-breath-2026-11-03.md, User stories、臺北市開放資料能補上什麼、已決定的事
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- contract — docs/data-contract.md
- prd (original) — https://claude.ai/artifact/S46QYMugL6cKGNZK9ePN7r
- user-stories (original) — https://claude.ai/artifact/Ss7vdA4Mv3iH3uPm1XEDdG

## Notes

- Parked: R6、R7 為 P1，R8、R9 為 P2；R14（目標 2027 年 1 月推出 2026 回顧）、R15 為 P1，R16 為 P2。這一版上線、通勤卡有人用之後再切成 epics（PRD 里程碑關卡）。
- Open question: 品牌名稱是否就叫「城市呼吸」。
- Open question: 2017 年至今各月檔欄位與站名是否一致（影響 R9）。
- Open question: 渲染方式是 Three.js 微縮城市還是 MapLibre＋deck.gl；交給 bmad-architecture。
- Open question: 大巨蛋賽程與活動的穩定來源（臺北市平台沒有）。
- Decision: 2026-10-26 站點座標採用臺北捷運車站出入口座標（data.gov.tw 128428），不申請 TDX。
- Decision: 2026-10-26 環狀線 11 站只有進站紀錄（出站未入檔），不分群、不能當迄站。
- Decision: 2026-10-29 升級到 BMAD v7 預覽版，由 v6 epics.md 遷移而來（見 _bmad-output/migration-v6-v7/migration-v6-v7.md）。
- Decision: 2026-11-03 replan。需求變了，不只是做法：城市流動從站對站弧線改成行政區流向（R3 改寫、新增 R13）；活動日從 Parked 移入這一版（R5 改寫）；新增 R14–R16 並暫緩；hallmark 移除（PR #1）。來源是 Piwi 的 user-stories 2026-11-03。已完成的 1.1–1.5 不受影響。
- Decision: 2026-11-03 新增 epic-event-days（活動日），排在上線之前；年度回顧卡暫緩，目標 2027 年 1 月（Piwi）。
- Decision: 2026-11-03 architecture 受影響：AD-8「設計依 hallmark」失效；資料契約要加行政區、逐日資料與活動表（v2）；渲染方式未定。已建議跑 bmad-architecture，architecture 文件由 Winston 改，這裡不動。
