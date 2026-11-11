---
type: epic
title: "網站公開上線並交代資料來源"
parent: initiative-city-breath
covers: [R11]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: []
after: []
risk: low
---

# 網站公開上線並交代資料來源

## Description

網站部署到 Vercel，上線前確認「關於與資料來源」列齊所有出處與限制。由 v6 Epic 5 遷移；2026-11-11 replan 把資料來源頁（6.1）移到首頁 epic 成 3.17，好讓第一次來的人在車站卡做完後就找得到。2026-11-11 Piwi 決定部署分兩步：3.15 之後先做預覽部署（6.2，公開的 *.vercel.app 網址、不宣傳、不給搜尋引擎收錄），三個功能 epic 完成後正式上線（6.3）。

## Outcome

網站以公開網址上線，「關於與資料來源」說清楚出處與限制。

## Requirements

R1 (parent R11): 資料來源頁說明出處、授權、OD 是進出站配對而非實際路徑、少於 10 人的顯示規則。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 「關於與資料來源」（3.17）在公開網址上含四項說明與環狀線限制，並列到上線當月所有 epic 用到的來源。
- 3.15 合併後就有預覽部署的公開網址，分享連結在上面打得開，Piwi 用 iPhone 做過 AD-6 實測並留下紀錄（6.2）。
- 三個功能 epic 完成後正式上線：拿掉 noindex、分享連結與分享圖都指向正式網址、上線前再實測一次（6.3）。

## Boundaries

- 資料來源頁本身由 epic-city-breath-home 3.17 做（2026-11-11 由 6.1 移過去）；本 epic 只部署並在上線前核對。
- 不修效能：6.2、6.3 的實測不達 AD-6 預算時開新票，不在部署票裡改場景。
- 不做：自訂網域是否要綁由 Piwi 在 6.3 決定；這一版不做多環境（staging）。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-city-breath-home because: 6.2 等分享入口與網址（3.15）；6.3 等整個首頁 epic
- Waits on epic-commute-card because: 6.3 等通勤卡
- Waits on epic-event-days because: 6.3 等活動日
- Decision: 2026-11-03 replan：活動日排在上線前（Piwi），本 epic 也等 epic-event-days；資料來源頁要加上活動資料的出處（臺北市資料大平臺、人工補的來源）。
- Decision: 2026-11-10 replan（天光定案）：資料來源頁也要列底圖的來源（basemap.json 的 sources）並說明哪些是示意、徽章進度只存在瀏覽器（6.1）。
- Decision: 2026-11-11 replan（第一次使用者走查 B2、F7；Piwi 決定 3）：6.1 資料來源頁移到 epic-city-breath-home 成 3.17「關於與資料來源」，排在車站卡之後就做；本 epic 只剩 6.2 部署，仍等首頁、通勤卡、活動日三個 epic 完成。
- Decision: 2026-11-11 6.2 Vercel 部署提前到 3.15 之後（Piwi：分享連結要有公開網址，Piwi 也要用 iPhone 實測效能）。做法（Sofia）：6.2 留在本 epic、id 不變，拿掉本 epic 檔頭的整個 epic 閘門，改由各票指定要等什麼（同 epic-commute-card 2026-11-10 的做法）：6.2 等 3.15；新增 6.3 正式上線，等 6.2 與首頁、通勤卡、活動日三個 epic。沒選「把 6.2 移成首頁 epic 的新票」：首頁 epic 已有 19 張，而部署與上線核對是同一條線，留在一起才不會把正式上線的檢查拆散。
- Decision: 2026-11-11 6.2 是預覽部署、不是正式上線：main 自動部署到 *.vercel.app，整站 X-Robots-Tag: noindex、不綁網域、不宣傳；AD-6 手機效能實測由 Piwi 用 iPhone 做（hitl），紀錄寫進 design/reviews/。正式上線的檢查（noindex 拿掉、來源齊全、五種分享連結、再測一次）在 6.3。
- Assumption: 預覽期用 X-Robots-Tag: noindex 擋搜尋引擎收錄（Sofia 的建議，architecture AD-18 標 [ASSUMPTION]）；Piwi 若希望預覽期就能被搜尋到，6.2 拿掉這一項。
- Open question: 6.2 照 Piwi 的決定只等 3.15，但完整的出處與授權說明在 3.17（緊接 3.15 的下一張）。票面寫成「網址要給 Piwi 以外的人，等 3.17 合併後」；Sofia 的建議是不必讓部署本身等 3.17。若 Piwi 想讓 6.2 直接等 3.17，改 6.2 的 after 即可。
- Decision: 2026-11-11 tracer bullet 是 6.2：從 main 到公開網址的最薄一條路，Vercel 專案設定是 hitl 步驟；6.3 只在它之上拿掉 noindex 並做上線核對。
