---
type: epic
title: "城市觀察者看得到一整天各行政區之間的流動"
parent: initiative-city-breath
covers: [R3, R13, R19, R20]
sources: [_bmad-output/initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md]
companions: [DESIGN.md]
after: [epic-data-pipeline]
risk: medium
---

# 城市觀察者看得到一整天各行政區之間的流動

## Description

首頁自動播放全城一天各行政區之間的流動，可拖動時間軸、切換平日／假日；點一個行政區看這區的人去哪、誰來這裡，並展開該區的站。由 v6 Epic 2 遷移，2026-11-03 replan 從站對站弧線改成行政區流向；2026-11-10 replan 依天光定案（DESIGN.md）與走查，加上車站卡、地標、徽章、此刻最忙、首次提示，以及示意的街廓、樹、列車與雲。

## Outcome

打開首頁就看到台北盆地上一天的行政區流向在播放；點區、點站、點地標或寶石，2–3 步內拿到答案（DESIGN.md 原則 4），在手機上順暢。

## Requirements

R1 (parent R3): 首頁自動播放全城一天的人潮流動，以行政區為單位，可拖動時間軸與切換平日／假日，上方疊一個「找你的通勤」入口，手機上播放不卡頓。
R2 (parent R13): 點一個行政區，看到這區的人去哪、誰來這裡，平日與假日分開，並可展開該區的站。
R3 (parent R19): 從有故事的地標、城市徽章與「此刻最忙」找到值得看的站；地標故事、徽章與此刻最忙都由當月資料算出，不寫死數字。
R4 (parent R20): 場景以真實底圖呈現台北盆地；街廓、樹、列車、雲與地標造型明白標成示意，不承載數字。

## Constraints

- 起訖人次少於 10 人一律不顯示數字（initiative Constraints；architecture AD-3）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints；hallmark 已移除）。

## Done when

- 首頁自動播放行政區流向，平日／假日可切換，中階手機上播放不卡頓。
- 點行政區看得到去哪、誰來，展開的站點大小與顏色依小時更新。
- 2–4 點顯示停止營運狀態。
- 點站開車站卡（個性、進出、前 5 目的地與去哪幾區）；小卡開著也能換時段與平假日。
- 地標、8 個徽章與此刻最忙都可用，徽章進度在 localStorage 不可用時也不壞。
- 部署到建置版後以上都可用。

## Boundaries
- Touch point: 首頁上方的「找你的通勤」入口 — 本 epic 留位置；輸入表單本身由 epic-commute-card 4.1 做。
- 車站卡的基本內容（個性特質、進出、整天長條、前 5 目的地、去哪幾區、從這站找通勤）由 3.12 做；類型標籤、一句話、平假日曲線、整天前 10、同類型站與誰來這站由 epic-station-personality 加進同一張卡。
- 「大日子」與活動卡屬於 epic-event-days；本 epic 提供時間軸與共用的卡內時間列（3.6）。
- Touch point: basemap.json（地形、軌道、班距、地標）— 由 epic-data-pipeline 1.12 產生，本 epic 只讀。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md
- design — DESIGN.md（天光：互動、版面、場景的層）；原型 design/prototypes/2.1-diorama/
- walkthrough — design/reviews/2.1-user-story-walkthrough-2026-11-10.md

## Notes
- Waits on epic-visual-system because: 微縮城市場景基底（2.3）

- Waits on epic-data-pipeline because: 契約 v2 的行政區對照與行政區起訖彙總
- Decision: 2026-11-03 replan：需求變了，城市流動從站對站弧線改成行政區流向（initiative R3 改寫、新增 R13）。新增 3.5 行政區流向弧線（tracer bullet）、3.6 點行政區看去哪誰來並展開站、3.7 Refactor sweep；3.1 改為展開行政區後的站點光點。
- Dropped: 3.2 前 200 組弧線 — 站對站弧線被行政區流向取代（2026-11-03 replan）。
- Decision: 2026-11-03 渲染方式定案為 Three.js＋React Three Fiber（architecture AD-11、AD-12）；3.5 建在 2.3 的場景基底上，並移除骨架的 maplibre-gl 與 deck.gl。
- Decision: 2026-11-10 replan（天光定案與走查）：3.5 改成流向緞帶（線寬與人數成正比、前 12 大、圖例）；3.3 依 DESIGN.md 加天色拖曳條與時段名；3.6 加「這一小時／整天」、最忙車站，以及之後所有小卡共用的卡內時間列；3.1 改成車站柱與站珠。新增 3.12 車站卡、3.13 街廓建築與樹（示意）、3.14 列車與雲（示意）、3.8 有故事的地標、3.10 此刻最忙皇冠、3.9 城市徽章、3.11 第一次開啟提示；3.7 等全部，並負責刪原型資料夾。tracer bullet 仍是 3.5。
- Decision: 2026-11-10 車站卡從 3.6 拆成 3.12：3.6 已有行政區卡與共用卡內時間列，再加車站卡會超過一次 session；3.12 接在 3.1（點得到站）之後。
- Decision: 2026-11-10 原型資料夾保留到 3.7 才刪（DESIGN.md 原寫 2.3、3.5），因為 3.8–3.14 還要照原型移植；請 Piwi 確認。
- Open question: 本 epic 現有 13 張有效 story，超過一般 8–12 張；可把地標、徽章、皇冠、首次提示拆成獨立的「探索捷徑」epic，等 Piwi 決定。
- Decision: 2026-11-10 依賴檢查：3.4 改等 3.3（同一條時間軸）；3.14 等 3.13、3.10 等 3.8、3.9 等 3.10（同一個場景與 HUD 上排，排成一條線避免互相覆寫）。
