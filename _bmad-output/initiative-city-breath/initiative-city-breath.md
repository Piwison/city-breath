---
type: initiative
title: "台北人看得到自己在城市作息裡的位置，並把它分享出去"
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md, _bmad-output/initiative-city-breath/user-stories-city-breath-2026-11-03/user-stories-city-breath-2026-11-03.md, DESIGN.md, design/reviews/2.1-user-story-walkthrough-2026-11-10.md, design/reviews/2.1-first-time-user-2026-11-11.md]
companions: [_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md, docs/data-contract.md, DESIGN.md]
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
R17 (user-stories B2、C6；走查結論 1): 使用者把行政區卡與活動卡存成直式圖分享，圖上附日期或月份、資料來源與網址。
R18 (user-stories C5、D1、F2；走查結論 2): 使用者點一個站，看到整天最常去的 10 站，以及每小時來這站的人從哪幾站、哪幾區來。
R19 (DESIGN.md 原則 5、互動): 使用者能從有故事的地標、城市徽章與「此刻最忙」找到值得看的站；地標故事、徽章與此刻最忙都由當月資料算出，不寫死數字。
R20 (DESIGN.md 原則 1、2、場景的層): 首頁場景以真實地形、海、河川、綠地、捷運路線與路線色呈現台北盆地；畫面上每樣東西不是真實資料就是明白標成示意，示意物件不承載數字。
R21 (第一次使用者走查 B1): 使用者從行政區卡、通勤卡、活動卡與沒開卡的首頁都找得到分享入口；分享出去的連結打開時回到同一個站或行政區、同一時段與日型。
R22 (第一次使用者走查 B2): 第一次打開的人看得到網站名與一句話說明，提示在使用者點了之前不消失，任何時候都找得到「關於／資料來源」。
R23 (第一次使用者走查 F6): 假日時使用者直接看到大家都去哪：假日人最多與比平日熱鬧的前 5 站、前 5 區，點了開那站或那區。
R24 (第一次使用者走查 F5): 使用者看得懂畫面上的線寬、光點、顏色（全城／去哪／誰來）、車站柱、寶石與皇冠各代表什麼，說明在場景裡示範、可跳過，不只是文字。

## Constraints

- 純靜態網站、沒有後端；所有重運算在每月本機彙總完成（PRD 產品提案、資料與技術做法）。
- 起訖人次少於 10 人一律不顯示數字（PRD 風險與對策；architecture AD-3）。
- 只做北捷，不做即時、不做路線規劃；列車只做示意（間隔依官方班距、位置示意，不代表即時列車位置），圖層開關只切換底圖的層，不疊北捷以外的資料（PRD 我們不做的事；DESIGN.md 天光定案）。
- 網站是月刊式回顧：每月初更新上個月，不做預告與即時（user-stories 決定 4）。
- 資料標示出處：政府資料開放授權條款第 1 版（PRD 背景與問題）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字；視覺方向用 prototype、打磨用 impeccable，hallmark 已移除（user-stories 決定 7；CLAUDE.md）。

## Done when

- 首頁（台北盆地底圖、行政區流向、地標、徽章、此刻最忙）、點行政區看流向、車站卡（含誰來這站）、通勤同路人卡、活動日、資料來源頁在手機上可用，並部署成公開網址。
- 通勤卡、行政區卡、活動卡都能存成直式圖，圖上附日期或月份、來源與網址。
- 通勤卡可一鍵下載，且「下載分享卡」次數可被計數。
- 第一次打開的人看得到網站名、一句話與「關於／資料來源」；從任何一張卡都分享得出去，連結打開回到同一個畫面。
- 每月的活動日清單有自動對上的場館檔期與人工補的來源，對不到的標「原因未查證」。
- 上線首月檢視成功指標：通勤卡 500 次、輸入完成率 60%、每位訪客開 3 個站、次月回訪 15%（PRD 成功指標，假設值）。
- 每月新資料能用一個指令重跑彙總並更新網站。

## Boundaries

- 不做：即時擁擠度、預測、即時列車位置、路線規劃、北捷以外的系統與資料疊圖、帳號（PRD 我們不做的事；user-stories 決定 4；DESIGN.md）。
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
- design — DESIGN.md（2026-11-10 天光定案：原則、色票、場景各層真實／示意界線、互動、版面）
- walkthrough — design/reviews/2.1-user-story-walkthrough-2026-11-10.md（原型對 user stories 的走查與缺口）
- walkthrough — design/reviews/2.1-first-time-user-2026-11-11.md（沒有背景知識的使用者第一次試用；每條問題對到的票）

## Notes

- Parked: R6、R7 為 P1，R8、R9 為 P2；R14（目標 2027 年 1 月推出 2026 回顧）、R15 為 P1，R16 為 P2。這一版上線、通勤卡有人用之後再切成 epics（PRD 里程碑關卡）。
- Decision: 2026-11-11 網站名用「城市呼吸」，開場一句話「台北捷運的一天：每小時誰去了哪」（Piwi 定 3.11 時確認；原 Open question 品牌名稱結案）。
- Open question: 2017 年至今各月檔欄位與站名是否一致（影響 R9）。
- Open question: 渲染方式是 Three.js 微縮城市還是 MapLibre＋deck.gl；交給 bmad-architecture。
- Open question: 大巨蛋賽程與活動的穩定來源（臺北市平台沒有）。
- Decision: 2026-10-26 站點座標採用臺北捷運車站出入口座標（data.gov.tw 128428），不申請 TDX。
- Decision: 2026-10-26 環狀線 11 站只有進站紀錄（出站未入檔），不分群、不能當迄站。
- Decision: 2026-10-29 升級到 BMAD v7 預覽版，由 v6 epics.md 遷移而來（見 _bmad-output/migration-v6-v7/migration-v6-v7.md）。
- Decision: 2026-11-03 replan。需求變了，不只是做法：城市流動從站對站弧線改成行政區流向（R3 改寫、新增 R13）；活動日從 Parked 移入這一版（R5 改寫）；新增 R14–R16 並暫緩；hallmark 移除（PR #1）。來源是 Piwi 的 user-stories 2026-11-03。已完成的 1.1–1.5 不受影響。
- Decision: 2026-11-03 新增 epic-event-days（活動日），排在上線之前；年度回顧卡暫緩，目標 2027 年 1 月（Piwi）。
- Decision: 2026-11-03 architecture 受影響：AD-8「設計依 hallmark」失效；資料契約要加行政區、逐日資料與活動表（v2）；渲染方式未定。已建議跑 bmad-architecture，architecture 文件由 Winston 改，這裡不動。
- Decision: 2026-11-10 replan。2.1 定案「天光」（DESIGN.md，PR #20）並做了 user story 走查。需求有變：新增 R17 行政區卡與活動卡分享、R18 誰來這站與整天前 10、R19 地標徽章與此刻最忙、R20 真實底圖與示意界線；「不做列車動畫與多圖層」改成列車只做示意、圖層只切換底圖。做法也變：底圖與地標位置改由管線輸出（1.12）、每站來源由管線算（1.13）、2.3 改寫成台北盆地與天光、首頁 epic 加地標、徽章、皇冠、首次提示、車站卡與示意物件、通勤入口改成可打字的找車站、分享卡往前、7.4 依原型寫清楚。已完成或已建好的 1.1–1.11、7.1–7.3 不動。
- Decision: 2026-11-10 architecture 受影響：底圖檔的契約與版本、地形垂直誇張與 projection.ts、地標位置與所屬行政區、徽章進度的 localStorage、音效、示意物件規則；由 Winston（bmad-architecture）在同一個 PR 更新 spine。
- Open question: B3（同場散場同站回家）要活動日逐日起訖、A5／D3／H1 要路網距離；走查建議的這兩項新計算這次不開票，留在 Parked 的 R6 與之後的 replan。
- Open question: R18 的 D1、F2 屬於不主動設計的族群（決定 1），這次因為 C5 一起做；若 Piwi 只要 C5，1.13 可縮成整天前 10 目的地。
- Decision: 2026-11-11 replan（第一次使用者走查，design/reviews/2.1-first-time-user-2026-11-11.md）。需求有變：新增 R21 分享入口與網址、R22 開場說明與關於、R23 假日熱門、R24 怎麼看這張圖。做法也變：分享與網站說明提前到首頁 epic 的車站卡（3.12）之後（Piwi 決定 3），行政區卡分享 4.5 移成 3.16、資料來源頁 6.1 移成 3.17；新增 3.15、3.18、3.19；鏡頭改成地圖手勢（3.5，Piwi 決定 2）；開場維持清晨自動播放（Piwi 決定 1）；不開車站卡分享（Piwi 決定 4）。已完成的票不動。
- Decision: 2026-11-11 architecture 不必為已定的事改：網址記站與行政區已在 AD-16 的狀態清單；提示等點了才收、「看過」仍只存 AD-22 的鍵；鏡頭手勢屬 AD-11 的 CameraControls 設定，細則在 DESIGN.md 與 diorama-game-juice。要動 AD 的只有三件，都還待 Piwi 決定（見首頁 epic Notes）：3.18 的 5 區若走管線要升契約 v4（AD-1、AD-7、AD-10、AD-18）、4.4 的連結分享事件要加進 AD-20、4.1 的「最近用過的站」若要跨工作階段保存要改 AD-16／AD-22。
- Decision: 2026-11-11 Piwi 回覆 PR #31 replan 報告的五個決定，只改做法、不改需求（R1–R24 不變）：(1) 3.18 的前 5 區走管線，districts.json 加區總量、契約升 v4、12 個月重建；管線部分拆成首頁 epic 的 3.20（epic-data-pipeline 已完成，不重開），3.18 等它。(2) 4.1「最近用過的站」跨次記住，Winston 改 AD-22。(3) 3.10 點皇冠先列前 3 名（原 Assumption 轉 Decision）。(4) 3.11 一句話定稿「台北捷運的一天：每小時誰去了哪」，寫進 DESIGN.md。(5) 6.2 Vercel 預覽部署提前到 3.15 之後，epic-source-and-launch 拿掉整個 epic 閘門、改由各票指定，新增 6.3 正式上線。已完成的票不動；3.5 緞帶放大上限與雙向分車道、3.3 播放中是否寫網址兩件仍待 Piwi。
- Decision: 2026-11-11 architecture 已由 Winston 在同一個 PR 更新：AD-10 加 v4 的區總量、AD-22 加最近用過的站（AD-16 例外同步）、AD-18 補部署（預覽期 noindex、分享網址不寫死網域）、AD-6 註明實測由 Piwi 在 6.2、6.3 做。4.4 的連結分享事件仍由 4.4 寫回 AD-20。
