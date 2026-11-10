---
type: epic
title: "每月 OD 原始檔變成網站讀得動的小檔"
parent: initiative-city-breath
covers: [R10, R18, R20]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: [DESIGN.md]
after: []
status: in-progress
risk: medium
---

# 每月 OD 原始檔變成網站讀得動的小檔

## Description

一個指令就能把該月 OD 檔彙總成靜態 JSON，車站類型由人定名。由 v6 Epic 0 遷移；2026-11-03 replan 加上契約 v2：每站的官方行政區、行政區起訖彙總、逐日每站每小時，供首頁行政區流向（epic-city-breath-home）與活動日（epic-event-days）使用。2026-11-10 replan（天光定案）加上不分月份的底圖圖層（地形、海、河川、綠地、軌道、站所屬路線、班距、地標）與每站的來源（誰來這站），契約升 v3。

## Outcome

一個指令就能把該月 OD 檔彙總成契約 v1 的靜態 JSON，車站類型由人定名。

## Requirements

R1 (parent R10): 每月 OD 原始檔在本機彙總成站×小時×日型、起站×迄站×小時×日型、每日每站總量三份資料，並輸出成契約 v1 的靜態 JSON。
R2 (parent R10): 先以 1 個月建立，後續擴成近 12 個月。
R3 (parent R10；供 R3、R13): 每站有依官方圖資判定的行政區，並輸出行政區×行政區×小時×日型的起訖彙總。
R4 (parent R10；供 R5): 輸出每一天每站每小時的進出量，停止營運時段為 null。
R5 (parent R20): 輸出台北盆地的底圖圖層：真實地形與海、河川、綠地、捷運軌道、每站所屬路線、各線班距與地標位置，每層附來源與授權。
R6 (parent R18): 輸出每站每小時的前幾名起站與來源行政區，以及整天前 10 目的地，少於 10 人不顯示。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- `city-breath fetch` 與 `build` 對任一月份可重跑，輸出符合 docs/data-contract.md。
- 車站類型標籤經 Piwi 定名（draft=false）。
- 近 12 個月資料可用。
- 契約 v2 的行政區對照、行政區起訖彙總與逐日每站每小時輸出寫進 docs/data-contract.md，pytest 通過。
- basemap.json 與 v3 的每站來源寫進 docs/data-contract.md，所有月份重建，pytest 通過。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- design — DESIGN.md, 場景的層；原型資料處理 design/prototypes/2.1-diorama/tools/build_layers.py 與其 README
- walkthrough — design/reviews/2.1-user-story-walkthrough-2026-11-10.md, 結論與建議 2、3

## Notes
- Decision: 2026-11-03 replan：需求變了（initiative R3 改寫、新增 R13、R5 移入這一版），本 epic 加 1.8 每站對上官方行政區、1.9 行政區起訖彙總、1.10 逐日每站每小時，排在 1.6、1.7 之前；已完成的 1.1–1.5 不動。
- Decision: 2026-11-03 契約 v2 的欄位與檔案切法先交給 bmad-architecture 定，再開始 1.9、1.10。
- Decision: 2026-11-03 architecture 審查發現公開總量可以減出被隱藏的小數字（AD-3 次要隱藏），新增 1.11 次要隱藏，1.9、1.10 等它；既有 od 分片也改經 suppress.py。
- Decision: 2026-11-04 1.8 已合併（PR #7）：界線用國土測繪中心村里界 WFS 合併成鄉鎮市區，120 站分在 21 區；與手寫草稿不同的 9 站照官方判定，是否人工修正等 Piwi 看差異報告（story-1.8-district-diff.md）。票面文字改成與 AD-9 一致。
- Decision: 2026-11-10 replan（天光定案，DESIGN.md；走查結論 2、3）：新增 1.12 底圖圖層輸出（原型的 build_layers.py 搬進管線，AD-1、AD-21）與 1.13 每站的來源（D1、F2，並把 topDestinations 擴成前 10 給 C5），排在 1.10 之後、1.6 之前；1.12 先於 2.3，1.13 先於 epic-station-personality。
- Decision: 2026-11-10 1.12 設 hitl：水利署河川河道的 SHP 在 gic.wra.gov.tw，原型環境連不到，可能要 Piwi 手動下載；Copernicus DEM 的授權字樣要放進 sources。
- Open question: 風險：新北市水利局地圖服務（原型用的新北河川）沒有標示開放授權；正式輸出改用水利署河川河道（data.gov.tw 25781）。若 25781 的河道面和原型差太多（例如沒有二重疏洪道），要 Piwi 決定是否接受。
- Open question: 新北的公園綠地沒有範圍資料（data.ntpc.gov.tw 只有地址），1.12 先只輸出臺北市綠地。
- Decision: 2026-11-10 依賴檢查：1.13 等 1.12，兩張都改 export.py、types.ts、docs/data-contract.md 與 cli.py。
- Decision: 2026-11-11 1.6 改成固定類型（Piwi）：每月各自分群的群編號 12 個月不一致，照編號定名會貼錯；改成 12 個月一起 k-means（k=4）得固定中心、每月歸類（architecture AD-27），四型定名為臥室站、住商站、人氣站、辦公站。票面 description／verify 同步改寫。
