---
type: epic
title: "使用者從地標、徽章與最忙的站找到值得看的地方"
parent: initiative-city-breath
covers: [R19, R24, R31]
sources: [_bmad-output/initiative-city-breath/product-plan-v2-2026-11-14.md, DESIGN.md]
companions: [DESIGN.md]
after: []
risk: medium
---

# 使用者從地標、徽章與最忙的站找到值得看的地方

## Description

探索捷徑：有故事的地標、8 個城市徽章、「這個時段最忙」皇冠、點了會示範的活圖例，以及搭乘模式第 0 期（板南線試乘）。這些是樂趣層，不碰也不影響主要流程（產品計畫 v2 體驗原則 7）。2026-11-14 replan 從 epic-city-breath-home 拆出（原 3.8、3.10、3.9、3.19，現為 8.1–8.4），排在公開上線之後的階段 4，等首月的使用數字再決定先後。2026-11-20 replan（Piwi）：搭乘模式是首頁三條路的主要路（先玩，再給資訊），8.6 提前到階段 2 第一張先做、關卡 A 併入 6.6；8.1–8.4 仍在階段 4。

## Outcome

使用者不必自己一站一站找，就能從地標、寶石與皇冠走到值得看的站，並在場景裡點一下就看懂每種東西代表什麼；這些捷徑是否值得做大，看首月「每位訪客開幾站」的數字。

## Requirements

R1 (parent R19): 使用者能從有故事的地標、城市徽章與「這個時段最忙」找到值得看的站；地標故事、徽章與最忙的站都由當月資料算出，不寫死數字。
R2 (parent R24): 圖例升級成點了會在場景裡示範的活圖例，可跳過；文字圖例（線寬、光點、顏色、柱高）已由 epic-city-breath-home 的 3.21 做。
R3 (parent R31): 使用者可以沿板南線「坐上捷運」：鏡頭在路線上方沿真實軌道前進，行進中不出現資訊，到站停靠才開車站卡，只有暫停、下一站、下車，減少動態時一站一站跳，網址記得線與位置；第 0 期只用現有資料與示意積木；首頁的主按鈕「搭板南線」由 epic-city-breath-home 3.24 接上。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints）。
- 畫面上不用「此刻」「現在」這類會被當成即時的字（initiative Constraints；產品計畫 v2 體驗原則 3）。
- 示意物件不承載數字；徽章進度只經 state/progress.ts 保存；音效預設關閉不載音檔；站的特質與之最只在 traits.ts、badges.ts（architecture AD-22 到 AD-26）。

## Done when

- 地標、8 個徽章與「這個時段最忙」都可用，數字每月由資料重算，徽章進度在 localStorage 不可用時也不壞。
- 圖例的每一項點了都有場景裡的示範，隨時可跳過；reduced-motion 時說明一樣完整。
- 這些都不擋主要流程：沒有強制導覽、沒有擋住畫面的彈窗。
- 板南線可以搭完一趟（頂埔段補了真實軌跡或寫明只到土城）（8.6）；關卡 A（試乘者多數想搭完一條線、兩支手機 30 fps）併入 6.6，由 6.6 的紀錄判定（2026-11-20）。
- 原型資料夾 design/prototypes/2.1-diorama/ 已刪（8.5）。
- 部署到正式網址後以上都可用。

## Boundaries

- 車站卡、卡框、分享面板、提示清單與文字圖例屬於 epic-city-breath-home（3.12、3.22、3.15、3.11、3.21）；本 epic 只在上面加捷徑。
- 地標的位置、連到的車站與所屬行政區由管線輸出（basemap.json，epic-data-pipeline 1.12，AD-25）；本 epic 只讀。
- 不做車站卡分享圖、不做月份切換（initiative Boundaries）。
- 首頁的「搭板南線」主按鈕、「⋯更多」與搭乘結束時的分享屬於 epic-city-breath-home 3.24；搭乘的真人試用與 fps 實測屬於 epic-source-and-launch 6.6。
- 搭乘模式只做第 0 期；第 1 期（板南線真實沿線）、第 2 期（全路網）、第 3 期（站外環顧）記在 initiative Notes 的 Future，不開票。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements R19、R24
- plan — _bmad-output/initiative-city-breath/product-plan-v2-2026-11-14.md, 票的調整、設計決定 2、22
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md, AD-22 到 AD-26
- design — DESIGN.md（互動、體驗原則）；原型 design/prototypes/2.1-diorama/
- walkthrough — design/reviews/2.1-first-time-user-2026-11-11.md, F4、F5
- ride — 平視搭乘模式規劃 https://claude.ai/artifact/1yJ2ipJtfERZnRKSZqSfT5 （Piwi 2026-11-14 核准）

## Notes

- Waits on epic-data-pipeline because: basemap.json 的地標（1.12，已完成）
- Waits on epic-city-breath-home because: 車站卡（3.12）、卡框（3.22）、提示清單（3.11）、文字圖例（3.21）
- Decision: 2026-11-14 replan（產品計畫 v2，Piwi 核准）：地標、徽章、最忙站、活圖例從 epic-city-breath-home 拆成本 epic，排在階段 4。票用 `tickets.py move` 搬過來，編號改了：3.8 → 8.1 有故事的地標、3.10 → 8.2 這個時段最忙皇冠（改名，決定 2）、3.9 → 8.3 城市徽章、3.19 → 8.4 活圖例（決定 22：文字圖例先在 3.21，這張只做互動版，仍先做三版原型給 Piwi 挑）。舊編號不再使用。
- Decision: 2026-11-14 tracer bullet 是 8.1：從 basemap.json 的地標到地標卡再到車站卡，是這組最薄的一條路；8.1 → 8.2 → 8.3 → 8.4 排成一條線（同一個場景與 HUD，沿用 2026-11-10 的依賴檢查）。
- Decision: 2026-11-14 新增 8.5 Refactor sweep（本 epic 超過三張），並把「刪除 design/prototypes/2.1-diorama/」從 3.7 移到這裡：地標與徽章還要照原型移植，原型不能在首頁 epic 收尾時刪。
- Decision: 2026-11-14 關卡 3 用 8.1 的 unknown 擋住（見 initiative Notes 2026-11-14 的關卡做法）：上線滿一個月、Piwi 看過五個指標並決定階段 4 先做哪幾張後，Sofia 移除 unknown 並在這裡記一條 Decision。
- Decision: 2026-11-14 平視搭乘模式規劃（Piwi 核准）的第 0 期開成 8.6「搭乘模式第 0 期：板南線試乘」，放在本 epic、不另開 epic（Sofia）：它是不擋主要流程的樂趣層、同樣排在階段 4、只用現有場景與資料，和 8.1–8.4 改同一個鏡頭、HUD 與 ScenePage；後面幾期才有新資料與新模型，到時若做大再拆成自己的 epic。8.6 排在 8.4 之後（同一條鏡頭與 HUD 的線，避免沒有依賴路徑的兩張同改 CameraRig）；關卡 3 時 Piwi 若要先做搭乘，把 8.6 的 after 改成等 8.1 即可。8.5 Refactor sweep 加等 8.6。
- Decision: 2026-11-14 8.6 的頂埔段（basemap 以直線補、標 approx，約 1.8 km）：先找真實軌跡由管線補進 basemap（AD-21，換內容加 basemapRevision）；補不到就第 0 期只搭到土城並在畫面寫原因，不在直線上假裝真實沿線。
- Decision: 2026-11-20 replan（Piwi 決定，經協調者轉達）：首頁東西太多、第一次來的人沒有明確的路，改成「先玩，再給資訊」與「初期只有三條路」；搭一趟捷運是主要的路。8.6 提前到階段 2 第一張先做：拿掉 after 8.4（只等已完成的 3.12、3.14、3.22），移到本 epic 表的最前面，hitl 改 false；加首頁暫時入口「搭板南線」（3.24 換成主按鈕）；行進中不出資訊、停靠才開車站卡。關卡 A 併入 6.6 真人測試（5 位測試者搭板南線、iPhone 與中階 Android 用 `?debug=perf` 量搭乘全程 30 fps），8.6 不再有自己的關卡與 design/reviews/8.6-ride-trial.md。8.1–8.4、8.5 不動，仍在階段 4。
- Decision: 2026-11-20 8.6 不搬到 epic-city-breath-home（Sofia）：搭乘現在是首頁的主要路，照內容該屬首頁 epic，但 `tickets.py move` 會把 8.6 改號，而 Piwi 與進行中的工作都用「8.6」稱呼它；編號不變比較不會混淆。代價是 3.24（首頁 epic）等 8.6，形成首頁 epic 等後面 epic 的 order_conflict，記在 initiative Notes。本 epic 在建置順序裡移到 epic-source-and-launch 之前，讓 6.6 可以直接等 8.6。
