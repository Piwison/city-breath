---
name: diorama-game-juice
description: 城市呼吸的微縮城市場景與遊戲手感規則（天光）。做或改首頁場景、地形與底圖、行政區流向、車站、地標、徽章、活動日場景、design/prototypes 的 Three.js 原型、或任何沙盤、緞帶、粒子、鏡頭運鏡、點選回饋、日夜光照時使用。
---

# 微縮城市與遊戲手感（城市呼吸專用，天光）

城市呼吸的畫面是一座可以把玩的台北盆地模型：真實地形與河川上，行政區像薄片拼在一起，街廓跟著人潮呼吸，捷運列車照官方班距跑；光從太陽來，日夜靠光線而不是換色。每個看得到的東西，不是真實資料，就是明白標成「示意」。

這份 skill 把這種手感寫成可執行的規則。定案內容在 `DESIGN.md`（2026-11-10 天光），原型與每輪取捨在 `design/prototypes/2.1-diorama/`（README），架構在 `_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/`。三者衝突時：架構 AD 優先，其次 DESIGN.md，最後才是這份 skill。

來源：Piwi 2026-11-04 提供的「diorama-game-juice」建議，依本專案架構改寫；2026-11-10 依天光定案改寫。

## 先決定你在寫哪一種

| | 原型（`design/prototypes/*.html`） | 正式版（`web/src/scene/`） |
| --- | --- | --- |
| 形式 | 單一 HTML，`<script type="importmap">` | React Three Fiber 元件 |
| 套件來源 | jsDelivr，版本寫死 | npm，版本照 architecture Stack |
| three | `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js`，addons 用 `…/three@0.186.1/examples/jsm/` | `three` 0.186.1＋`@react-three/fiber`＋`@react-three/drei` |
| 鏡頭 | `camera-controls@3.1.2`（`CameraControls.install({ THREE })`） | drei 的 `<CameraControls makeDefault />`（內建 camera-controls 3.x） |
| 一次性動作 | `gsap@3.15.0` | `gsap`（同版本），在事件處理裡呼叫 |
| 顏色 | `tokenColor('--x')`：`getComputedStyle` 讀 `:root` 轉 `THREE.Color` | `useTokenColor('--x')`（AD-8） |
| 底圖 | 原型自己的 `layers.json`（`tools/build_layers.py`） | 只讀管線輸出的 `web/public/data/basemap.json`（AD-21） |

不要用 esm.sh（發布頁面的 CSP 會擋），不要用 three 0.170 等舊版範例的 API。正式版不得讀原型的 `layers.json`。

## 不可違反（對應架構）

- 顏色只從 `:root` token 來，JS 與 GLSL 都不寫死色碼（AD-8）。路線色用 `--line-` 加小寫、去連字號的路線 ID（`R-3` → `--line-r3`，AD-21）。
- 經緯度只經 `project(lon, lat)` 轉場景座標；真實高程只經 `elevation(m)`（`TERRAIN_EXAGGERATION`＝2），都在 `projection.ts`（AD-12）。人數決定的高度（站柱、建築、緞帶）不是高程，不乘誇張倍數，只有它們的基座取 `elevation()`。
- 選了哪一區、現在幾點、播放中與否，只存在 `web/src/state/`（AD-16）。GSAP 和鏡頭動畫只改畫面，不保存狀態；動畫中途狀態改變就打斷重來。唯一跨工作階段保存的是徽章進度與「看過首次提示」，只經 `state/progress.ts`（AD-22）。
- 播放用的連續時間由單一 clock 推進，場景在 `useFrame` 讀；GSAP 不負責時間軸播放。
- 場景圖層只吃 `views.ts` 的檢視模型（`FlowFrame`、`StationFrame`），首頁、行政區展開、活動日共用同一個流向圖層與人數→粒子函式（AD-19）。
- 只畫資料裡有的數字。人數 `null` 不畫粒子、標示「少於 10 人」；不做擁擠度、車廂滿載等資料沒有的指標（AD-3）。活動日的「平常」與周邊站只查 `events.json`，不用月平均、不自己依距離找（AD-14）。
- 站的特質、排名、徽章得主、此刻最忙只從 `web/src/data/traits.ts`、`badges.ts` 來（AD-26）；地標的位置、連到的站、所屬區只從 `basemap.json` 來（AD-25）。
- 示意物件（街廓、樹、列車、雲、地標造型）可以由資料決定疏密與間隔，但不顯示數字、點了不出數字、不進分享卡（AD-23）。
- 音效預設關閉，打開後才建 `AudioContext`，WebAudio 合成，不載音檔，只在 `scene/sfx.ts`（AD-24）。
- 效能預算：DPR ≤ 2、同時粒子 ≤ 3,000、中階 Android 30 fps 以上（AD-6）。站柱、街廓、樹、列車、粒子、地標積木都用 `InstancedMesh`；捷運路線與少量重點弧線用 Line2 或 Tube。

## 場景的層：哪些真實、哪些示意

照 DESIGN.md「場景的層」。新增任何東西前先問：它是真實資料嗎？不是的話，畫面上有沒有說它是示意？

| 層 | 來源 | 真實或示意 |
| --- | --- | --- |
| 地形台地、海 | basemap.json（Copernicus DEM） | 真實，垂直誇張 2 倍 |
| 行政區薄片 | districts.json | 真實 |
| 河川、綠地 | basemap.json | 真實（新北綠地缺） |
| 捷運路線 | basemap.json 軌道 | 真實（`approx` 段以直線補） |
| 車站柱高 | stations.json 此刻進出 | 真實 |
| 流向緞帶 | district-flows、od 分片、daily | 真實，線寬與人數成正比 |
| 街廓與樹 | 附近車站全日人數決定疏密 | 示意 |
| 地標 | basemap.json 的 landmarks | 位置真實、造型示意 |
| 列車 | basemap.json 的班距 | 間隔真實、位置示意 |
| 雲 | — | 純裝飾，放大時淡出 |

## 沙盤

- **底座**：三層地層蛋糕（`--plinth`、`--strata-1`、`--strata-2`），四周是真實地形，21 區以外的底座也是真實地形，北邊有海。
- **地形**：六層台地（40／120／250／400／600／850 公尺，`--terrain-1`…`--terrain-6`、側面 `--terrain-side`），高度經 `elevation()`。山本身就是綠的；40 公尺以上（`terrainLevelAt() ≥ 1`）不蓋房子、成片種樹。
- **行政區**：固定厚度的薄片（`--tile`、`--tile-side`），疊圖才放得上去；薄片本身不隨人數伸縮。選區時這區的河川、綠地、路線、建築一起彈起。
- **呼吸**：由街廓高度（整區依此刻進出人數起伏）與站柱高度（每站依此刻進出人數）表現，再疊一個很小的待機正弦波。
- **街廓**：整座城共用一張方格，每 4 格留一條大街；疏密依附近車站全日人數，車站周圍留廣場、河上與公園不蓋。矮胖的圓角積木（每棟約 100 個三角形），三種牆色 `--bld-tint-1..3`、高樓頂上 `--accent-1..3` 小塔；窗戶用世界座標畫、樓層大小一致，入夜亮 `--window`、深夜漸少。
- **車站**：「廣場＋細柱＋站珠」，站珠是所屬路線色，夜裡 `--station-glow`。放大到一定程度或選了行政區才點得到、才標站名，只標重要的。
- **列車**：沿真實軌道雙向跑，同線間隔依班距（尖峰較密），營運外沒有列車，環狀線沒有班距不畫。6 點第一班車時，各站從台北車站往外一圈圈亮起。
- **雲**：白天飄過並投影，放大時淡出。

## 光：天光

材質顏色固定，日夜只靠光（DESIGN.md 原則 3）。

- 太陽東升西落、正午在南；夜裡換月光。只有這一盞方向光投影（PCF 陰影），陰影跟著轉。
- 天空、光色、環境光（`--sky-top`、`--sky-horizon`、`--light`、`--amb-sky`、`--amb-ground`）有 `-night`／`-dawn`／`-day`／`-dusk` 四組，在關鍵時刻（0／4.8／5.7／6.6／7.6／16.6／17.6／18.4／19.3 時）於相鄰兩組間內插。關鍵時刻、`phaseAt(t)` 與光的計算只在 `scene/daylight.ts`。
- NeutralToneMapping，曝光夜 0.78、日 1.0。夜裡亮的是窗、站珠、列車的自發光；天光不用 bloom 或其他後製。
- 天空在沙盤後面（不要再用一大片地面擋住），夜裡有星星。時間軸的拖曳條底色就是一天的天色。HUD 入夜後換暗色（`data-phase="night"`）。

## 流向

- **緞帶**：線寬 `W_MIN + (W_MAX − W_MIN) × 人數 ÷ 當月最大流向`，尾端放大的箭頭，緞帶上的箭紋往目的地捲動。時間軸下方的圖例用同一個公式、依目前鏡頭換算像素，粗細要和畫面一致。
- **光點**：一顆光點代表固定人數（預設 50 人）；超過同時上限就自動加倍，圖例跟著改。粒子用脈衝一波波湧出，頭亮尾淡，不等速：

  ```glsl
  float pulse = pow(fract(uTime * uSpeed - aProgress + aPhase), 3.0);
  ```

- **數量要少**：全市只畫前 12 大；選了區畫這區前 5 去哪（`--flow-out`）、前 5 誰來（`--flow-in`）。前三大在弧頂標人數，重疊時自動挪開。
- **落點漣漪**：光點抵達時在落點放一圈擴散後淡出的環，和到達的脈衝同步。
- 選區、選站、點流向時緞帶從起點畫出去；整點更新時不重畫。不用 1px 的 `THREE.Line`。

## 回饋的強度

每次觸碰都有回應，但不吵（DESIGN.md 原則 6）。分三級，不要越級：

| 級 | 什麼時候 | 做什麼 |
| --- | --- | --- |
| 輕 | 任何按下 | 地塊或物件微微壓扁、放開彈回；點中處漣漪；Android 輕震（`navigator.vibrate?.(6)`） |
| 中 | 選區、選站、選地標、點流向 | `gsap` 彈起（例如 `elastic.out(1.1, 0.4)`，約 0.6 秒）、其他區微沉變淡；鏡頭 `setLookAt(…, true)` 飛過去（手機上目標往上偏，讓主體落在小卡之上）；名牌彈出；緞帶畫出去；播放中跨進新時段時上方浮出時段名 |
| 重 | 只有兩種：解鎖徽章、大日子的散場高峰前後 | 彩紙；大日子場館打光（小巨蛋）；音效開著時才出聲 |

彩紙不用在別的地方。浮標的稱號必須由真實數字決定（例如此刻淨流入第一），不用 emoji 當圖示。

## 好玩來自資料

- **地標**：位置真實、造型示意，每個連到一站。點了說那站的「個性」：`traits.ts` 挑那站在全線排名前 20 的兩個特質，數字每月重算。會動的部分要有根據：纜車只在白天、夜市燈籠傍晚亮、飛機只在營運時段。
- **城市徽章**：8 個「之最」，全部由 `badges.ts` 從 stations.json 算。地圖上發光的寶石（`--gem`）是線索，收集冊的提示保持容易（Piwi 決定）；點到那站就解鎖（`--gem-found`）、噴彩紙。驚喜不能是編的。
- **此刻最忙**：皇冠跟著每小時進出最多的站跑，左上第二排顯示站名與人數，點了直接開那站。
- **大日子**：只列 events.json 查到原因的活動與原因未查證的異常（含全城）；點了切到那天的 daily 資料。

## 手機 HUD

照 DESIGN.md「互動」與「版面」（390×844 為準）：

- 首頁自動播放一天（48 秒，從清晨開始，前幾秒就看到日出）；手指碰到沙盤就暫停並交還控制。
- 上方第一排：「找車站／通勤」（可打字搜尋；選站後可只看這站，或再選迄站看同路人）、徽章、圖層；第二排：此刻最忙。按鈕 40px、提示 34px。
- 下方時間軸約 140px：播放、時間、平日／假日／大日子、天色漸層的拖曳條、圖例。
- 小卡（行政區、車站、流向、通勤、地標、活動）最高 34vh；蓋住時間軸時，卡內有一列「‹ 時間 ›＋平日／假日」。
- HUD 不超過畫面 35%；點擊目標至少 30px。
- 第一次打開只出現一次提示「點一個區、一個地標或發光的寶石看看」。
- 圖層面板：流向、捷運路線、車站、河川、綠地、建築、區名的開關，以及音效開關（預設關閉）。

## 減少動態

`prefers-reduced-motion` 或畫面上的「靜態模式」開啟時：不自動播放（停在早上 8 點，拖時間軸一樣會換日夜光）；不搖晃鏡頭、鏡頭直接切換；彈跳改成 `power2.out` 平滑過渡；沒有彩紙、沒有閃爍與打光；列車、雲、地標動畫靜止；粒子流改成依人數分級粗細的靜態光帶，資訊一樣完整可讀。

## 相關 skill

- 動畫曲線與時機：`animate`、`emil-design-eng`、`apple-design`；效能：`animation-performance`、`threejs-performance`。
- 遊戲回饋與 HUD：`game-feel`、`game-ui-ux`。
- Three.js 細節：`threejs-*`（CloudAI-X）為主；點選大量地塊看 `threejs-core-raycaster`，陰影看 `threejs-impl-shadows`，drei 元件看 `threejs-impl-drei`（這三個以 r160 為準，版本衝突時以本專案為準）。
- 打磨與稽核：`impeccable`。
