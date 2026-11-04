---
name: diorama-game-juice
description: 城市呼吸的微縮城市場景與遊戲手感規則。做或改首頁場景、行政區流向、活動日場景、design/prototypes 的 Three.js 原型、或任何沙盤、弧線、粒子、鏡頭運鏡、點選回饋時使用。
---

# 微縮城市與遊戲手感（城市呼吸專用）

城市呼吸的畫面是一張可以把玩的城市沙盤：行政區在有厚度的底座上隨一天呼吸，人潮沿弧線一波波湧向別區，點一下會彈起、鏡頭會飛過去。這份 skill 把這種手感寫成可執行的規則，並和架構（`_bmad-output/initiative-city-breath/architecture-city-breath-2026-10-26/`）對齊。衝突時以架構 AD 為準。

來源：Piwi 2026-11-04 提供的「diorama-game-juice」建議，依本專案架構改寫。

## 先決定你在寫哪一種

| | 原型（`design/prototypes/*.html`） | 正式版（`web/src/scene/`） |
| --- | --- | --- |
| 形式 | 單一 HTML，`<script type="importmap">` | React Three Fiber 元件 |
| 套件來源 | jsDelivr，版本寫死 | npm，版本照 architecture Stack |
| three | `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js`，addons 用 `…/three@0.186.1/examples/jsm/` | `three` 0.186.1＋`@react-three/fiber`＋`@react-three/drei` |
| 鏡頭 | `camera-controls@3.1.2`（`CameraControls.install({ THREE })`） | drei 的 `<CameraControls makeDefault />`（內建 camera-controls 3.x） |
| 一次性動作 | `gsap@3.15.1` | `gsap`（同版本），在事件處理裡呼叫 |
| 顏色 | `tokenColor('--x')`：`getComputedStyle` 讀 `:root` 轉 `THREE.Color` | `useTokenColor('--x')`（AD-8，會跟日夜相位重讀） |

不要用 esm.sh（發布頁面的 CSP 會擋），不要用 three 0.170 等舊版範例的 API。

## 不可違反（對應架構）

- 顏色只從 `:root` token 來，JS 與 GLSL 都不寫死色碼；日夜相位改變時重讀（AD-8）。
- 經緯度只經 `project(lon, lat)` 轉場景座標，包含行政區形狀、河流、站點、弧線端點（AD-12）。
- 選了哪一區、現在幾點、播放中與否，只存在 `web/src/state/`（AD-16）。GSAP 和鏡頭動畫只改畫面，不保存狀態；動畫中途狀態改變就打斷重來。
- 播放用的連續時間由單一 clock 推進，場景在 `useFrame` 讀；GSAP 不負責時間軸播放。
- 場景圖層只吃 `views.ts` 的檢視模型（`FlowFrame`、`StationFrame`），首頁、行政區展開、活動日共用同一個流向圖層與人數→粒子函式（AD-19）。
- 只畫資料裡有的數字。人數 `null` 不畫粒子、標示「少於 10 人」；不做擁擠度、車廂滿載等資料沒有的指標（AD-3、user stories「做不到」）。
- 後製用 three/addons 的 EffectComposer＋RenderPass＋UnrealBloomPass＋OutputPass，由單一 `useFrame(..., 1)` 接手渲染；局部發光用 layers（AD-11）。
- 效能預算：DPR ≤ 2、同時粒子 ≤ 3,000、中階 Android 30 fps 以上（AD-6）。站點、粒子、地標積木用 `InstancedMesh`；弧線多時優先用 InstancedMesh 光膠囊，少量重點弧線才用 Tube 或 Line2。

## 沙盤

- 行政區不飄在空白背景：放在有厚度的底座上（斜切邊、側面厚度、底面有細刻度或等高線），底座接收陰影。
- 行政區形狀來自 `districts.json` 的多邊形，擠出成有導角的地塊。
- 表面的小地標積木只是裝飾：數量與高度不代表真實建築，也不拿來編數字；可隨該區流量權重增減密度。

## 遊戲手感清單

1. **呼吸**：每區的高度（`scale.y`）與發光度隨當下小時的真實進出人數起伏，再疊一個很小的待機正弦波。
2. **脈衝流向**：弧線用 `QuadraticBezierCurve3`，高度與粗細依人數。粒子不等速移動，用脈衝函式一波波湧出，頭亮尾淡：

   ```glsl
   float pulse = pow(fract(uTime * uSpeed - aProgress + aPhase), 3.0);
   ```

   早八、晚六尖峰時速度與頻率提高。不用 1px 的 `THREE.Line` / `LineBasicMaterial`。
3. **落點漣漪**：粒子抵達目標區時，在落點放一圈擴散後淡出的環（`RingGeometry`），和到達的脈衝同步。
4. **點選聚焦**：點行政區時該區用 `gsap` 彈起（例如 `elastic.out(1.1, 0.4)`，約 0.6 秒），其他區微微下沉、變淡；畫面只留這區前 5 個「誰來」（暖色 token）與「去哪」（冷色 token）弧線。
5. **鏡頭運鏡**：選區或選通勤時用 `setLookAt(…, true)` 平滑飛過去；手機上把目標往上偏，讓主體落在下方抽屜之上。待機時可以極小幅搖擺。
6. **浮標**：選中區的上方浮出區名與稱號（3D 座標 `.project(camera)` 轉螢幕座標，或 drei 的 `<Html>`）。稱號必須由真實數字決定（例如淨流入第一），不用 emoji 當圖示。

## 手機 HUD

- 首頁自動播放一天（預設 48 秒，1x／2x），手指碰到沙盤就暫停並交還控制。
- 上方「找你的通勤」入口：起站、迄站、時段，站對站（不是區對區）；選完鏡頭飛到那條弧線，顯示同路人數與名次。
- 下方時間軸：可拖動，附時段稱號。
- 點行政區彈出「這區的人去哪、誰來」小卡：前 3 名排行，點排行項目鏡頭飛到該弧線。
- HUD 不遮超過畫面 35%。

## 減少動態

`prefers-reduced-motion` 或畫面上的「靜態模式」按鈕開啟時：不自動播放、不搖晃鏡頭、彈跳改成 `power2.out` 平滑過渡、不閃爍；粒子流改成依人數分級粗細的靜態光帶，資訊一樣完整可讀。

## 相關 skill

- 動畫曲線與時機：`animate`、`emil-design-eng`、`apple-design`；效能：`animation-performance`、`threejs-performance`。
- 遊戲回饋與 HUD：`game-feel`、`game-ui-ux`。
- Three.js 細節：`threejs-*`（CloudAI-X）為主；點選大量地塊看 `threejs-core-raycaster`，陰影看 `threejs-impl-shadows`，drei 元件看 `threejs-impl-drei`（這三個以 r160 為準，版本衝突時以本專案為準）。
- 打磨與稽核：`impeccable`。
