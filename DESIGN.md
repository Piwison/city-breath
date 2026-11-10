# 城市呼吸 設計定案（DESIGN.md）

2026-11-10 Piwi 定案：**天光**。原型與四輪紀錄在 `design/prototypes/2.1-diorama/`（README 有每輪的取捨），可試玩的頁面是 https://claude.ai/artifact/EGtXU3zq58fgnCoMT2py3n 。user story 走查在 `design/reviews/2.1-user-story-walkthrough-2026-11-10.md`。

正式版照這份做；原型移進 `web/src/scene/` 後刪除原型資料夾（2.3、3.5）。顏色以下表與原型 `:root` 為準，2.2 已整理成 `web/src/styles/tokens.css`（見「Token 與 base」）。

## 一句話

一座可以把玩的台北盆地模型：真實地形與河川上，行政區像薄片拼在一起，街廓跟著人潮呼吸，捷運列車照官方班距跑；光從太陽來，日夜靠光線而不是換色。每個看得到的東西，不是真實資料，就是明白標成「示意」。

## 原則

1. **像台北**：真實地形（盆地、四周的山、海）、真實河川、真實捷運路線與路線色、真實位置的地標。只要能用資料，就不用示意。
2. **每個數字都有出處，示意要說清楚**：建築與樹（疏密依附近車站人潮）、地標造型、列車位置是示意；高度、人數、倍數、排名都由資料即時算出，不寫死。少於 10 人不顯示數字。
3. **光，不是調色**：材質顏色固定，日夜由太陽方位、光色、天空與曝光表現；夜裡亮的是窗、站珠、列車。
4. **一層一層看進去**：全城 → 行政區 → 車站；地標、徽章、大日子是捷徑。每一層都在 2–3 步內拿到答案（見走查）。
5. **好玩來自資料**：徽章是資料裡的「之最」，大日子是資料偵測到的異常，地標的故事是那站在全線排名前 20 的特質。驚喜不能是編的。
6. **每次觸碰都有回應，但不吵**：按壓壓扁彈回、漣漪、彈出、彩紙只在解鎖或散場高峰。減少動態時全部換成平滑過渡、不自動播放。

## 色票（天光）

全天共用：

| 用途 | token | 值 |
| --- | --- | --- |
| 字型 | `--font` | Noto Sans TC, PingFang TC, Microsoft JhengHei, system-ui |
| 捷運路線（臺北捷運路線資料服務 LineColor） | `--line-br` `--line-r` `--line-r3` `--line-g` `--line-g3` `--line-o` `--line-bl` | #b57a25 #d90023 #ef9298 #107547 #d2de1a #f5a818 #0a59ae |
| 環狀線（暫定，待查新北捷運官方色） | `--line-y` | #f2c500 |
| 流向：全城／去哪／誰來／通勤 | `--flow-neutral` `--flow-out` `--flow-in` `--commute` | #e9781e #2a7fd0 #e2582b #d63a48 |
| 地面 | `--plinth` `--plinth-side` `--strata-1` `--strata-2` `--tile` `--tile-side` | #d8c9ac #a48d6b #b39a74 #8c7457 #f3ede1 #d6c9b2 |
| 地形六層（40／120／250／400／600／850 公尺） | `--terrain-1`…`--terrain-6`、`--terrain-side` | #dfe2b8 #c6d49c #aac485 #8fb271 #789f5f #648b50、#a69a74 |
| 水、綠地、樹 | `--water` `--green` `--tree` | #7db3dc #a8cf8c #93bf74 |
| 建築 | `--building` `--roof` `--window`；牆色 `--bld-tint-1..3`；屋頂點綴 `--accent-1..3` | #ffffff #ebe4d6 #ffcb72；#ffffff #f1e8dc #e1e8ee；#e39a80 #9fc2b4 #e9c98a |
| 車站 | `--station` `--station-glow` | #fbf7ef #ffe0a0 |
| 徽章與皇冠 | `--gem` `--gem-found` `--gem-ink` `--gem-glow` | #ffc83d #4fc9b8 #b07a00 #ffe08a |
| HUD 白天 | `--hud-bg` `--hud-ink` `--hud-muted` `--hud-accent` | rgba(255,252,246,.86) #1b2033 #586079 #2a7fd0 |
| HUD 夜晚（`data-phase="night"`） | 同上 | rgba(14,18,38,.80) #eef1ff #a3acd0 #7fb6ff |

日夜四個相位（後綴 `-night` `-dawn` `-day` `-dusk`，在相鄰兩組間內插；關鍵時刻 0／4.8／5.7／6.6／7.6／16.6／17.6／18.4／19.3 時）：

| token | night | dawn | day | dusk |
| --- | --- | --- | --- | --- |
| `--sky-top` | #0a0f26 | #3a4c8c | #5aa6e0 | #35306f |
| `--sky-horizon` | #1e2a50 | #f7b48f | #d9eeff | #f2895a |
| `--light`（太陽／月光） | #7b8ce0 | #ffb27a | #fff2dc | #ff8f52 |
| `--amb-sky` | #2a3466 | #b9b6dc | #d3e8ff | #bba6d0 |
| `--amb-ground` | #12141f | #7a6a66 | #b5a58c | #76605e |

光：太陽 2026 年 9 月約 5:40 升、18:00 落，東升西落、正午在南；夜裡換月光。曝光 0.78（夜）到 1.0（日），NeutralToneMapping。

地標用的 `--lm-*`、列車 `--train-glow`、雲 `--cloud` 等其餘 token 以原型 `:root` 為準。

## Token 與 base（2.2）

- `web/src/styles/tokens.css`：全站唯一定義顏色與字型的地方。上面兩張表的值都在這裡（測試 `tokens.test.ts` 會逐一比對這份文件），另有字級 `--text-2xs`…`--text-xl`、圓角 `--radius*`、點擊尺寸 `--tap` `--tap-min`、動態 `--dur-*` `--ease-*`。相位 token 直接放 `:root`（正式版沒有 `data-variant`）；HUD 夜晚放 `:root[data-phase="night"]`。`--page-bg` 是場景載入前與無 WebGL 時的頁面底色，白天＝`--sky-horizon-day`、夜晚＝`--sky-horizon-night`。
- `web/src/styles/base.css`：reset、字型、焦點框、選取色、`.num` 等寬數字、`.hud` 玻璃面（跟著 `data-phase` 換色）。
- 動態：所有 transition／animation 的時長用 `--dur-*`，`prefers-reduced-motion: reduce` 時歸零，也就是直接切換（AD-8）；測試會擋寫死的時長。
- 程式取色：`web/src/styles/tokens.ts`。`tokenRgb('--flow-in')` 讀全天 token（也讀得懂建置壓縮後的 8 碼 hex）；`mixRgba` 在線性 sRGB 內插。
- 日夜（2.3 起只在 `web/src/scene/daylight.ts`，AD-8）：`tokenAt('--sky-top', h)` 依上面的關鍵時刻內插四相位（與原型 `at()` 相同）；`phaseAt(h)` 依太陽高度決定 `data-phase`（夜晚程度 > 0.55 為夜），由 `state/clock.ts` 寫到 `:root`；`lightingAt(h)` 算太陽／月亮位置與強度、半球光、曝光與天色。場景材質用 `scene/useTokenColor.ts` 的 `useTokenColor('--x')`。
- 其他 CSS 與 TS 不寫色碼，測試會掃 `web/src` 擋下。

## 場景基底（2.3）

- 在 `?scene=1` 預覽（three／R3F 另外分包），3.5 換成首頁。檔案在 `web/src/scene/`：`projection.ts`（`project()`、`elevation()`、`terrainLevelAt()`）、`daylight.ts`、`Sky`（全螢幕 shader：漸層、太陽、月亮、星星）、`Daylight`（唯一投影的方向光＋半球光＋曝光）、`Plinth`、`Terrain`（每區薄片＋六層台地合成一個頂點色 mesh，水、綠地各一）、`Rails`（全部路線一個 LineSegments2）、`DistrictLabels`、`LayerPanel`、`TimeBar`（預覽用）、`SceneFallback`。
- 投影：原點＝21 區外框中心，最大邊長 100 單位（1 單位約 424 公尺），與原型相同。台地高度＝`elevation(門檻公尺)`，垂直 2 倍；原型是手調的 0.2–3.0，正式版 850 公尺約 4.0 單位，山比原型高約三分之一。
- 陰影圖只在光的位置變了才重畫；短邊 < 600px 的螢幕用 1024 的陰影圖（原型 2048）。
- 截圖與原型對照：`design/reviews/2.3-scene-base/`。

## 場景的層

| 層 | 資料 | 真實或示意 |
| --- | --- | --- |
| 地形台地、海 | Copernicus DEM GLO-30 | 真實（垂直約誇張 2 倍） |
| 行政區薄片 | districts.json（NLSC 界線） | 真實 |
| 河川、公園 | 臺北市工務局、新北市水利局 | 真實（新北公園缺） |
| 捷運路線 | 臺北市捷運局路網圖 | 真實（頂埔段以直線補） |
| 車站柱高 | stations.json 此刻進出 | 真實 |
| 流向緞帶 | district-flows、od 分片、daily venues | 真實，線寬與人數成正比 |
| 街廓與樹 | 附近車站全日人數決定疏密 | 示意 |
| 地標 | 公開地圖的位置 | 位置真實、造型示意 |
| 列車 | 官方班距 | 間隔真實、位置示意 |
| 雲 | — | 純裝飾，放大時淡出 |

## 互動

- 首頁自動播放一天（48 秒，從清晨開始）；手指碰到就暫停。
- 上方：「找車站／通勤」（選站後可只看該站，或看同路人）、徽章、圖層；左上第二排「此刻最忙」。
- 下方時間軸：播放、時間、平日／假日／大日子、天色漸層的拖曳條、圖例（線寬＝每小時人次、一顆光點＝N 人）。
- 小卡（行政區、車站、流向、通勤、地標、活動）蓋住時間軸時，卡內有「‹ 時間 ›＋平日／假日」。
- 行政區卡：這一小時／整天，去哪、誰來前 3，這區最忙的車站。
- 車站卡：個性（排名前 20 的特質）、進出站、整天長條、前 5 目的地與去哪幾區、從這站找通勤。
- 通勤卡：同路人數、名次、早一小時與晚一小時。
- 大日子：查到原因的活動＋原因未查證的異常（含全城）；活動卡有那天曲線對照平常、散場高峰周邊站、各區來的人。
- 徽章 8 個，寶石是線索，提示保持容易（Piwi 決定），解鎖噴彩紙，進度存瀏覽器。

## 版面（手機 390×844 為準）

HUD 不超過畫面 35%；上方兩排（40px 按鈕、34px 提示）、下方時間軸約 140px 或小卡最高 34vh。點擊目標至少 30px，主要按鈕 40px。

## 待辦

- 環狀線官方色碼。
- 白天 HUD 的 `--hud-accent`（#2a7fd0）當文字色在亮玻璃上對比約 4.0:1、白字壓在它上面約 4.2:1，都略低於 WCAG AA 的 4.5:1（2.2 audit P1）；要調深或只用在粗大字與非文字元素，待 Piwi 決定。
- 字型目前只列在 `--font`，沒有自帶 Noto Sans TC 字檔：iOS 用蘋方、Windows 用正黑體、Android 用系統字。要不要自帶（檔案大小與分享卡一致性的取捨）待決定。
- 新北公園綠地範圍。
- 真實建物（國土測繪中心建物圖層需申請授權）。
- 手機效能實測（AD-6）。
