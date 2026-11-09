# 2026-11-10 更新的審查（天光定案）

這次沒有可用的平行子代理，兩個必跑的審查角度由同一個 session 依序做，寫完再改 spine。

## 版本查證

結論：這次沒有新增套件，不需要新的版本查證。

- 新的做法只用到已在 Stack 的 three 0.186.1：`NeutralToneMapping`（r162 起有）、`three/addons` 的 `Line2`／`LineSegments2`，2.1 原型就是用 three@0.186.1 跑的。
- WebAudio、localStorage 是瀏覽器標準 API，沒有版本可鎖。
- Copernicus DEM GLO-30、水利署河川河道（data.gov.tw 25781）是資料來源，不是套件；可取得性與授權由 1.12 在 `basemap_sources.csv` 記錄取得日期與 sha256。25781 的 SHP 下載站在原型環境連不到，已記為 1.12 的 hitl 與 epic 的風險。

## 對手測試：兩個都守規則、卻接不起來的單位

| # | 情境 | 處理 |
| --- | --- | --- |
| 1 | 2.3 的路線圖層和 3.1 的站珠各自把路線代碼對到色碼（`R-3` 對 `--line-r3` 還是 `--line-r-3`） | 已補：AD-21 固定路線 ID 與 token 命名規則，JSON 不放色碼 |
| 2 | HUD 的 `data-phase` 由 clock 依一組時刻切換，場景光色由 daylight.ts 依另一組時刻內插，黃昏時 HUD 已變暗、場景還是白天 | 已補：AD-8 規定關鍵時刻與 `phaseAt(t)` 只在 daylight.ts |
| 3 | 1.13 的 inbound 分片在次要隱藏前取前 5 起站，od 分片在隱藏後，同一格兩個檔一個有數字一個 null，可反推 | 已補：AD-10 規定 inbound 的起站格與 od 分片是同一批隱藏後的格子 |
| 4 | 此刻最忙在大日子模式用月平均、活動卡用 daily，兩者對「此刻最忙」說法不同 | 已補：AD-26 規定大日子時餵 daily，同一函式 |
| 5 | 地標卡和車站卡各自算「個性」 | AD-26 已涵蓋（traits.ts 唯一出處） |
| 6 | 徽章和首次提示各自寫 localStorage 鍵 | AD-22 已涵蓋（progress.ts 一個鍵） |
| 7 | 站柱基座用 `elevation()`、柱高也乘了誇張倍數 | AD-12 已涵蓋（資料高度不經 `elevation()`，只有基座取） |

## 好 spine 清單

- 這次 replan 的新需求 R17–R20 都在 Capability → Architecture Map 有列。
- 運作面（部署、快取、每月更新）沒有變：basemap.json 走 `web/public/data/**` 的短快取（AD-18），每月更新流程不必重跑 fetch-basemap（只有底圖來源更新時才跑）。
- lint：只剩路徑樣板（`{month}`、`{id}`、`{date}`）的誤報，與 2026-11-03 相同。
