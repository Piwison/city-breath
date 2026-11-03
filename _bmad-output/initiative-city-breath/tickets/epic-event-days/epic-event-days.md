---
type: epic
title: "使用者看得到上個月哪幾天特別不一樣、為什麼"
parent: initiative-city-breath
covers: [R5]
sources: [_bmad-output/initiative-city-breath/user-stories-city-breath-2026-11-03/user-stories-city-breath-2026-11-03.md]
companions: []
after: [epic-data-pipeline, epic-city-breath-home]
risk: medium
---

# 使用者看得到上個月哪幾天特別不一樣、為什麼

## Description

每月自動列出異常日，並自動對上臺北市資料大平臺的小巨蛋、花博、中山堂檔期；大巨蛋、展覽館、封街活動每月人工補 3–5 場並附來源；對不到的標「原因未查證」。使用者點進一天，看那天和平常的差異，以及人從哪些行政區來。2026-11-03 replan 新增（initiative R5）。

## Outcome

追星族、球迷與城市觀察者每月都有理由回來看「上個月的台北」，並把活動日的畫面分享出去。

## Requirements

R1 (parent R5): 每月自動列出異常日並對上小巨蛋、花博、中山堂的檔期；大巨蛋、展覽館、封街活動每月人工補 3–5 場並附來源；對不到的標「原因未查證」；使用者看得到該日與平常的差異，以及人從哪些區來。

## Constraints

- 起訖人次少於 10 人一律不顯示數字，含次要隱藏（initiative Constraints；architecture AD-3）。
- 網站是月刊式回顧，不做預告（initiative Constraints）。
- 顏色與字型只透過 `:root` token，每個動畫有 reduced-motion 版本，不編造數字（initiative Constraints）。
- 異常日、「平常」與活動原因只在管線判定，前端只查 events.json（architecture AD-13、AD-14）。

## Done when

- 每月的異常日清單自動產生，至少對上小巨蛋、花博、中山堂的檔期。
- 人工補的活動有來源連結，對不到原因的標「原因未查證」。
- 點進一天看得到和平常的差異與人從哪些區來，少於 10 人不顯示。
- 部署到建置版後以上都可用。

## Boundaries

- 不做活動預告或預測（initiative Constraints 月刊式回顧）。
- 逐日資料的產生屬於 epic-data-pipeline 1.10；行政區流向地圖屬於 epic-city-breath-home。
- Touch point: 臺北市資料大平臺的小巨蛋場地租用資訊、花博公園展館資訊、中山堂演出訊息 — 每月讀取；owner: 本 epic。

## References

- parent — _bmad-output/initiative-city-breath/initiative-city-breath.md, Requirements R5
- user-stories — _bmad-output/initiative-city-breath/user-stories-city-breath-2026-11-03/user-stories-city-breath-2026-11-03.md, 臺北市開放資料能補上什麼
- architecture — _bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md

## Notes

- Waits on epic-data-pipeline because: 逐日每站每小時資料（1.10）
- Waits on epic-city-breath-home because: 行政區流向地圖
- Decision: 2026-11-03 replan 新增本 epic，排在上線之前（Piwi）。
- Open question: 大巨蛋賽程與活動的穩定來源。
- Open question: 小巨蛋租用期含進場與拆台，演出日怎麼判定（期間內人流尖峰或人工確認）。
- Decision: 2026-11-03 architecture AD-14 定了異常日與 events.json 的形狀，第一張票負責把 events.json 寫進 docs/data-contract.md 並移除 v1 的 daily.json；venues.csv 由 1.10 建立，本 epic 只讀。
- Decision: 2026-11-04 refine：本 epic 只需要 initiative R5 與 architecture AD-13、AD-14，沒有另開 UX 或 PRD；活動日畫面（7.4）開工前要先做 prototype 給 Piwi 確認（Piwi 2026-11-04：UI/UX 都要先給 prototype）。
- Decision: 2026-11-04 tracer bullet 是 7.1：從逐日資料算出異常日並輸出 events.json，2026-09 的 9/13 小巨蛋、9/5 劍潭要出現在站級異常裡。
