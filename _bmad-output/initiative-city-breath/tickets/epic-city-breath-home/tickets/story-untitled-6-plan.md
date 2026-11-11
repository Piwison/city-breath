---
title: '點行政區看去哪、誰來並展開站'
type: 'feature'
ticket: '6'
created: '2026-11-11'
status: 'in-progress'
baseline_revision: '9be96ae70a388a68b0b729dc877277915b7e6044'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: ''
review_source: ''
lenses_ran: []
review_loop_iteration: 0
context: ['{project-root}/DESIGN.md', '{project-root}/.claude/skills/diorama-game-juice/SKILL.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 首頁只看得到全城前 12 大流向，點行政區沒有反應；回答不了「我住的區的人去哪、誰來」（R2），卡片讀到一半時間還在跑（走查 F1），橘／藍各代表什麼畫面上沒說（F5）。

**Approach:** 點一個行政區（raycaster）→ 區抬起、其他區微沉、鏡頭飛過去、緞帶換成這區前 5 去哪（藍）與前 5 誰來（橘紅）並從起點畫出（gsap）；下方時間軸換成行政區卡（這一小時／整天、去哪與誰來前 3、這區的車站與此刻進出人數、最忙車站），區內的站以站珠展開、可再點站。卡框與卡內時間列（‹ 時間 ›＋平日／假日）做成共用元件，打開就暫停、標明時段與日型。

**Piwi 2026-11-12 追加（3.5／3.3 留下的問題，經協調者轉達；票面由協調者另記）：**
1. 放大後緞帶寬度上限 18 → 24 螢幕像素（緞帶、光點、圖例同一倍數）。
2. 雙向流向分左右車道：A→B 與 B→A 同時畫出時，各往自己前進方向的右側偏移，不再疊在一起；全城與選區模式都適用。
3. 網址不要一直變：播放中不寫網址；暫停、拖時間軸、切日型、選區等使用者操作後才寫（仍只經 `state/url.ts`、replaceState）。按播放時把 hour 從網址拿掉，播放中重新整理照原本從清晨自動播放。
4. 系統開了減少動態的人仍可關掉靜態模式或按播放，維持現狀。

## Boundaries & Constraints

**Always:** 去哪／誰來排序、整天加總、站的此刻進出都是 `views.ts`／`traits.ts`／`periods.ts` 的純函式並有 vitest；`null` 不排名、不當 0，整天只加公開的小時、全部 null 才是「少於 10 人」（AD-3）；整小時 null＝停止營運（AD-5）；站屬哪區只看 `stations.json` 的 `district`（AD-9）；選區、選站、整天／這一小時、聚焦的流向只在 `web/src/state/view.ts`（AD-16），這張不寫進網址（3.15 才做）；場景圖層只吃 FlowFrame／StationFrame（AD-19）；顏色只走 token，去哪／誰來的緞帶與光點仍各一個 draw call（vertex color）；一次性動作（抬起、緞帶畫出）用 gsap 3.15.0，reduced-motion 或靜態模式時直接切換；點站的命中半徑 22px（手機 44px 目標）。

**Never:** 不做車站卡完整內容（3.12，這張只放進出人數的最小版）、站柱高度（3.1）、分享鈕與網址（3.15、3.16）、地標、徽章；不改 DESIGN.md、SKILL.md、tickets.toml、CLAUDE.md、資料契約；不刪原型；盡量不動 Terrain.tsx（3.13 在改 scene），區的抬起從外部改 `district-<id>` group。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 永和平日 8 點去哪 | 2026-09 | 中正 1,505、中山 1,411、大安 1,026、信義 756 | — |
| 大安假日整天去哪 | 2026-09 | 中正、大安（區內）、信義 | — |
| 整天加總 | 某格部分小時 null | 只加公開的小時；全部 null → 不排名 | — |
| 停止營運 | 3 點、這一小時 | 卡上「這個時段停止營運」、沒有緞帶 | — |
| 全少於 10 人 | 有營運但這區的格全 null | 「每個方向都少於 10 人」 | — |
| 環狀線站 | exitsRecorded=false | 只算進站並註明出站未入檔 | — |
| 打開卡片 | 播放中 | 停止播放，關卡後維持暫停 | — |
| 換時段 | 卡開著按 › 或切假日 | 卡、緞帶、站珠一起更新 | — |
| reduced-motion | 點區 | 直接抬起、鏡頭直接切、緞帶不畫出 | — |
| 雙向車道 | 同時畫 A→B 與 B→A | 兩條各往前進方向右側偏移、不重疊 | 只有單向時不偏移 |
| 網址 | 播放中整點變了 / 暫停 / 按播放 | 不寫 / 寫 day＋hour / 寫 day、拿掉 hour | replaceState 失敗略過 |

</frozen-after-approval>

## Code Map

- `web/src/state/view.ts` -- 加 `district`、`station`（站 ID）、`range`（hour／day）、`focus`（流向鍵）與 action；`cardOpened()`＝停止播放。
- `web/src/data/views.ts` -- `FlowFrame.kind`（out／in）；`districtFlows`、`districtRanks`（這一小時／整天，含區內）、`FlowSource.district()`；`FLOW_KEYS.district`；`StationFrame`、`stationFrames`。
- `web/src/data/traits.ts`（新）-- `stationVolume`、`busiestStations`（AD-26 的起點，3.12／3.10 擴充）。
- `web/src/data/periods.ts` -- `whenLabel(dayType, hour, range)`：「平日 8 點」「假日整天」。
- `web/src/card/CardFrame.tsx`、`card.css`（新）-- 共用卡框（標題、時段日型、動作槽、關閉、footer）與 `CardTimeRow`。
- `web/src/card/DistrictCard.tsx`、`StationCard.tsx`（新）-- 行政區卡、最小車站卡。
- `web/src/scene/Flows.tsx` -- 選區模式、vertex color、聚焦變淡、畫出動畫（shader 的 reveal）、端點跟著抬起。
- `web/src/scene/DistrictPick.tsx`（新）-- 點擊判斷（移動 < 6px）、raycaster 打 `district-<id>` 的地塊、站用螢幕距離、按壓回饋。
- `web/src/scene/DistrictLift.tsx`、`lift.ts`（新）-- gsap 抬起／微沉、陰影重畫；`liftOf(id)` 給標籤、軌道、3.13 用。
- `web/src/scene/DistrictStations.tsx`（新）-- 站珠 InstancedMesh＋站名 DOM。
- `web/src/scene/Rails.tsx`、`DistrictLabels.tsx` -- 跟著抬起；選中的區名藏起。
- `web/src/scene/CameraRig.tsx` -- `link.fly(x, z, d)`（原型 lookAt，手機目標往南偏）。
- `web/src/scene/FlowLegend.tsx`、`ScenePage.tsx`、`scene.css` -- 選區模式的圖例、載 stations.json、卡片取代時間軸、安全區量測。
- `design/prototypes/2.1-diorama/index.html` 1185–1260、1397–1425、1563–1630 -- 移植來源（不刪）。

## Tasks & Acceptance

**Execution:**
- [ ] `web/src/data/views.ts`、`traits.ts`、`periods.ts`＋測試 -- 去哪／誰來、整天、站量、時段標籤
- [ ] `web/src/state/view.ts`＋`view.test.ts` -- 選取狀態與 cardOpened
- [ ] `web/src/card/*` -- 共用卡框、時間列、行政區卡、最小車站卡
- [ ] `web/src/scene/Flows.tsx`、`FlowLegend.tsx` -- 選區模式、聚焦、畫出動畫、圖例
- [ ] `web/src/scene/DistrictPick.tsx`、`DistrictLift.tsx`、`lift.ts`、`DistrictStations.tsx`、`Rails.tsx`、`DistrictLabels.tsx`、`CameraRig.tsx`、`ScenePage.tsx`、`scene.css`、`package.json`（gsap） -- 場景串接
- [ ] `design/reviews/3.6-district-card/` -- Playwright 截圖與原型並排

**Acceptance Criteria:**
- Given 播放中, when 點大安區, then 時間停住、區抬起、鏡頭飛過去、卡上寫「平日 N 點」、緞帶藍橘紅、圖例寫藍＝這區的人去哪、橘紅＝誰來這裡。
- Given 行政區卡, when 按 › 或切假日或整天, then 卡、緞帶與站珠一起更新，卡上的時段日型跟著換。
- Given 行政區卡, when 點去哪第一名, then 那條緞帶以外變淡、鏡頭飛到那條緞帶。
- Given 選了區, when 點站珠或卡上的站, then 開車站小卡（此刻進出 N 人），可回到行政區卡。
- Given 關閉卡片, then 回到全城流向、維持暫停。
- `npm test`、`npm run build` 通過；draw call 記在 Implementation Notes。

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Design Notes

- 區內（大安→大安）列在卡片的去哪／誰來（verify 要求，原型排除），標「（區內）」；地圖不畫區內緞帶，點了只飛回該區。
- 整天只用在卡片，地圖緞帶仍是這一小時（原型相同，卡上註明）。
- 選取不進網址：3.15 再把 `district`、`station` 加到 `state/url.ts`。

## Verification

**Commands:**
- `cd web && npm test` -- 全部通過
- `cd web && npm run build` -- 通過

**Manual checks (if no CLI):**
- Playwright 390×844（swiftshader）：永和平日 8 點、大安假日整天、卡開著換時段、點卡上的站、reduced-motion，與原型同情境並排。
