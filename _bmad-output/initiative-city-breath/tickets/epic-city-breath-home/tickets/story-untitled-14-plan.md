---
title: '列車與雲（示意）'
type: 'feature'
ticket: '14'
created: '2026-11-13'
status: 'built'
baseline_revision: 'bf7ec0626f81e1c0f4b0f578d2ea003ed685df4a'
route: 'full'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 場景裡捷運路線是靜的、天空是空的：DESIGN.md「場景的層」的列車（間隔真實、位置示意）與雲（純裝飾，放大時淡出），以及 6 點第一班車時各站一圈圈亮起，都還只在原型裡（R4、AD-23）。

**Approach:** 照原型移植（`design/prototypes/2.1-diorama/index.html` 1157–1182、2026–2068）：列車一個 InstancedMesh，沿 basemap.json 的 31 段軌道雙向跑，同線間隔＝班距代表值 × 固定比例；營運外（班距 null）沒有列車，環狀線沒有班距不畫。雲一個 InstancedMesh（4 朵 × 4 團），白天飄過並投影，放大與入夜淡出。第一班車：播放中跨過「班距由空轉有」的整點時，站珠以台北車站為中心依距離延遲彈一下、亮一下。

## Boundaries & Constraints

**Always:** 班距只讀 `basemap.json headway`（AD-1、AD-21）；經緯度只經 `project()`（AD-12）；顏色只走 token：車身 `--line-*`、自發光 `--train-glow`、雲 `--cloud`（tokens.css 已有，AD-8）；列車與雲不顯示數字、點不到（`raycast` 關掉）、不進分享卡，圖層面板標「示意」（AD-23）；InstancedMesh、套 `quality.ts`（AD-6）；減少動態或靜態模式：列車停在固定相位（看得到疏密、不動）、雲不飄、波紋改成不彈（站珠照 3.1 直接亮）；第一班車時刻與 3.4 的提示同一來源（`state/service.ts` 讀到的班距）；純函式有 vitest。

**Never:** 不改 tickets.toml、DESIGN.md、SKILL.md、資料契約與管線；不重寫 `Stations.tsx`（只加波紋的最小接口）；不碰車站卡、traits、選站狀態（3.12 進行中）；不刪原型資料夾；列車不畫在班距為 null 的小時。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 代表班距 | `[6, 6]`／`[8, 10]`／`[2, 4]` | 6／9／3 分鐘（區間中點） | null → 沒有列車 |
| 間隔 | 班距 H 分 | 同線同向相鄰兩車相距 `H × 1.6` 單位 | — |
| 尖峰 vs 午間 | 平日板南 8 點 `[6,6]`、14 點 `[8,10]` | 8 點每段車數多於 14 點（約 9.6 vs 14.4 單位一班） | — |
| 營運外 | 平日 3 點（全部 null） | 沒有列車 | — |
| 收班／首班 | 23→0 點、5→6 點（播放中） | 最後 0.1 小時縮小消失／前 0.1 小時長出 | 暫停或減少動態：直接有或沒有 |
| 換班距 | 7→8 點班距不同（播放中） | 整點前 0.25 小時平滑換間隔，不跳 | 暫停：用整點值 |
| 環狀線 | `Y` 沒有 headway 鍵 | 不畫 Y 的軌道 | — |
| approx 段 | `approx: true` 的直線補段 | 照跑（是該線的一部分） | — |
| 第一班車 | 播放中 time.t 由 5.98 → 6.01 | 觸發一次波紋 | 拖時間軸、暫停、減少動態：不觸發 |
| 雲 | 夜裡／鏡頭距離 < 95 | 透明度 → 0（影子跟著淡） | — |

</frozen-after-approval>

## Code Map

- `web/src/data/trains.ts`（新）-- 純函式：`GAP_PER_MIN = 1.6`、`headwayMinutes([a,b])`（中點）、`trainGap(headway, line, dayType, t, smooth)` → `{ gap, presence }`、`trainLines(headway)`、`trainSlots(len, gap, phase)`（沿一段的位置）、`serviceStartCrossed(headway, dayType, prevT, t)`。
- `web/src/scene/firstTrain.ts`（新）-- 波紋：模組層 `wave = { start: -1 }`（畫面動畫，不是畫面狀態）、`triggerWave(now)`、`wavePulse(elapsed)`（1→1.8→1，elastic）、`WAVE_DELAY = 0.03` 秒／單位、`waveAt(now, dist)`。
- `web/src/scene/clouds.ts`（新）-- `cloudLayout(box)`（4 朵 × 4 團，決定性）、`cloudFade(h, distance)`（`0.85 · smooth(0.05,0.6,lit) · smooth(95,150,distance)`，lit＝`max(day, twilight·0.62)`）。
- `web/src/scene/Trains.tsx`（新）-- 一個 InstancedMesh（膠囊，車身 instanceColor＝路線色、emissive `--train-glow` 乘 vColor，夜裡 0.1 + 0.7·night）；高度照 `Rails`（`TILE_TOP`＋抬起 `lifts.now`）；`useFrame` 依 `time.t` 推相位、擺車、偵測第一班車觸發 `triggerWave`。不投影（陰影圖只在光動時重畫，暫停時車影會跟不上）。lite：膠囊段數減半。
- `web/src/scene/Clouds.tsx`（新）-- 一個 InstancedMesh（`IcosahedronGeometry(1,1)`、flatShading、transparent）；`customDepthMaterial` 依透明度抖動丟棄（影子跟著淡）；飄動時要求 `shadowMap.needsUpdate`；lite：2 朵、不投影。
- `web/src/scene/Stations.tsx` -- 最小接口：`useFrame` 讀 `waveAt`，站珠縮放乘上 pulse、顏色往 `--station-glow` 推；以名稱「台北車站」的站為圓心（找不到用底座中心）。
- `web/src/state/view.ts` -- `LayerKey` 加 `train`、`cloud`，預設開。
- `web/src/scene/LayerPanel.tsx`、`scene.css` -- 「列車 示意，間隔依官方班距」「雲 裝飾」開關、色塊、來源說明一句。
- `web/src/scene/ScenePage.tsx` -- 掛 `<Trains>`（Rails 之後）、`<Clouds>`；aria-label 補列車與雲是示意。
- 重用：`Rails` 的高度算法、`Plinth.plinthBox`、`daylight.sunAt`、`useTokenColor(s)`、`quality.useTier`、`service.ts`（班距來源）、`views.lineToken`、`BaseView.tracks`（TrackView 沒有 line：在 `baseView` 帶 `line`，或 Trains 直接收 basemap tracks）。

## Tasks & Acceptance

**Execution:**
- [x] `web/src/data/trains.ts`、`trains.test.ts` -- 中點、間隔、尖峰比午間密、null 沒車、收班首班、環狀線排除、slots、首班跨越
- [x] `web/src/scene/firstTrain.ts`、`firstTrain.test.ts` -- pulse 曲線、延遲
- [x] `web/src/scene/clouds.ts`、`clouds.test.ts` -- 夜裡與放大淡出、佈局決定性
- [x] `web/src/scene/Trains.tsx`、`Clouds.tsx`、`Stations.tsx`、`state/view.ts`、`LayerPanel.tsx`、`scene.css`、`ScenePage.tsx` -- 場景與開關
- [x] `design/reviews/3.14-trains-clouds/` -- Playwright 390×844：平日 8、14 點、6 點波紋、3 點、白天雲與放大、reduced-motion，與原型同時刻並排；記 draw call、instance 數

**Acceptance Criteria:**
- Given 平日 8 點與 14 點, then 板南線上 8 點的列車比 14 點密。
- Given `?hour=3`, then 沒有列車；環狀線上任何時刻都沒有列車。
- Given 播放中走過 6 點, then 站珠從台北車站往外一圈圈彈亮一次。
- Given 白天全景, then 有雲與雲影；放大到市區, then 雲與雲影淡出。
- Given reduced-motion, then 列車與雲不動、沒有波紋。
- Given 點列車或雲, then 不出任何數字或卡片。

## Implementation Notes

- 沒有 subagent 工具：實作與 Quick lens 自審都在這個 session 做（同 3.1、3.4、3.13）；checkpoint 由協調者的委派訊息代替。plan 約 2,100 tokens，超過建議值，沒有拆。中途額度中斷，恢復後合併 origin/main e1384e8（產品計畫 v2、3.12 車站卡），只有 ScenePage 檔頭註解衝突。
- `TrackView` 加 `line`（baseView 帶入）；`Rails.LIFT` 改成 export 給列車共用高度；`state/service.ts` 加 `firstTrainCrossed()`（和 3.4 的 `firstTrainAt` 同一份班距）。
- 第一班車：觸發點是「班距由空轉有的整點」＝ 6 點（3.4 提示「約 6 點第一班車」同來源）；OD 的停駛（2–4 點）在 5 點就結束，5 點站已開、站珠照 3.1 亮起，6 點才彈波紋。只在播放中走過才觸發；拖時間軸、暫停、減少動態不觸發。站元件只加最小接口（`waveAt` 乘在站珠縮放、`waveGlow` 往 `--station-glow` 推色），沒有重寫。
- 效能（Playwright 390×844、DPR 2、swiftshader、full）：列車 1 個 InstancedMesh（每台 112 三角形，lite 50），平日 8 點 83 台、14 點 47 台、3 點 0 台（上限 240）；雲 1 個 InstancedMesh、16 團（每團 80 三角形，lite 8 團、不投影）。暫停在 8 點整個畫面 75 call（3.1 時 72）；雲在飄時陰影 pass 每秒最多重畫 20 次（約 +29 call），播放中光本來就每格在動。原型同一刻 1,565 call。
- 減少動態：列車停在固定相位（疏密照班距，看得到）、雲不飄、沒有波紋；Playwright 間隔 5 秒兩張截圖逐位元相同。
- 列車不投影（陰影圖只在光動時重畫，暫停時車還在跑，影子會脫離）。

## Plan Change Log

## Review Triage Log

Quick lens（本 session 自審）：high 0、medium 0、low 2、false 1、maybe-false 0。

| 判定 | 去向 | 發現與證據 |
| --- | --- | --- |
| low | reject（交 Piwi） | 列車車身是路線色，和同色的路線疊在一起，放大時才看得出是一節節的膠囊（原型同樣做法）；可改成往 `--train-glow` 偏淡。寫進 PR 待 Piwi 決定。 |
| low | reject（交 Piwi） | 暫停在白天時雲還在飄，陰影圖每秒最多重畫 20 次；不超過播放中的成本，但比之前暫停時 0 次多。可改成暫停時雲也停。寫進 PR。 |
| false | — | 疑慮：中途開靜態模式，波紋留在半彈狀態。`waveDirty = waving || S.waved` 會多寫一格把 pulse 歸 1。 |

## Design Notes

- 班距取法：每小時公告的是「這一小時內的發車間隔區間」，跨兩個時段的小時（例如 19 點 `[6,10]`）兩端各代表一部分；取中點代表整小時的平均密度，尖峰（`[6,6]`）自然最密。只取最短會讓離峰看起來和尖峰一樣密（板南 14 點 8 vs 8 點 6），只取最長則反過來。
- 1.6 單位／分（約 680 公尺／分，約 41 km/h，接近捷運表定速度）：相鄰兩車的距離＝班距 × 車速，所以間隔「真實的比例」；車在畫面上的速度是示意（原型 2.4 單位／秒）。
- 每段軌道各自流動（位置從段頭以固定間隔排出、段尾離開，頭尾 0.4 單位縮放進出），不是原型的「每段平均分成 n 班」：短段（approx 補段、支線）不會因為「至少 1 班」而比班距密。
- 暫停時列車照原型以 0.6 倍速度慢慢跑（城市還活著）；靜態模式與減少動態不動。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright（swiftshader）390×844 截圖放 `design/reviews/3.14-trains-clouds/`，`drawElementsInstanced` 攔截記 draw call 與 instance 數。
