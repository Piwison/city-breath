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

探索捷徑：有故事的地標、8 個城市徽章、「這個時段最忙」皇冠、點了會示範的活圖例，以及搭乘模式第 0 期（板南線試乘）。這些是樂趣層，不碰也不影響主要流程（產品計畫 v2 體驗原則 7）。2026-11-14 replan 從 epic-city-breath-home 拆出（原 3.8、3.10、3.9、3.19，現為 8.1–8.4），排在公開上線之後的階段 4，等首月的使用數字再決定先後。

## Outcome

使用者不必自己一站一站找，就能從地標、寶石與皇冠走到值得看的站，並在場景裡點一下就看懂每種東西代表什麼；這些捷徑是否值得做大，看首月「每位訪客開幾站」的數字。

## Requirements

R1 (parent R19): 使用者能從有故事的地標、城市徽章與「這個時段最忙」找到值得看的站；地標故事、徽章與最忙的站都由當月資料算出，不寫死數字。
R2 (parent R24): 圖例升級成點了會在場景裡示範的活圖例，可跳過；文字圖例（線寬、光點、顏色、柱高）已由 epic-city-breath-home 的 3.21 做。
R3 (parent R31): 使用者可以沿板南線「坐上捷運」：鏡頭在路線上方沿真實軌道前進、到站停靠並開車站卡，只有暫停、下一站、下車，減少動態時一站一站跳，網址記得線與位置；第 0 期只用現有資料與示意積木。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints）。
- 畫面上不用「此刻」「現在」這類會被當成即時的字（initiative Constraints；產品計畫 v2 體驗原則 3）。
- 示意物件不承載數字；徽章進度只經 state/progress.ts 保存；音效預設關閉不載音檔；站的特質與之最只在 traits.ts、badges.ts（architecture AD-22 到 AD-26）。

## Done when

- 地標、8 個徽章與「這個時段最忙」都可用，數字每月由資料重算，徽章進度在 localStorage 不可用時也不壞。
- 圖例的每一項點了都有場景裡的示範，隨時可跳過；reduced-motion 時說明一樣完整。
- 這些都不擋主要流程：沒有強制導覽、沒有擋住畫面的彈窗。
- 板南線可以搭完一趟（頂埔段補了真實軌跡或寫明只到土城），關卡 A 的紀錄裡 Piwi 判定過或不過（8.6）。
- 原型資料夾 design/prototypes/2.1-diorama/ 已刪（8.5）。
- 部署到正式網址後以上都可用。

## Boundaries

- 車站卡、卡框、分享面板、提示清單與文字圖例屬於 epic-city-breath-home（3.12、3.22、3.15、3.11、3.21）；本 epic 只在上面加捷徑。
- 地標的位置、連到的車站與所屬行政區由管線輸出（basemap.json，epic-data-pipeline 1.12，AD-25）；本 epic 只讀。
- 不做車站卡分享圖、不做月份切換（initiative Boundaries）。
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
