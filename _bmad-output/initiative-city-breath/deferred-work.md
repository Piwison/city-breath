- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-data-pipeline/tickets/story-untitled-11-plan.md`
  summary: `stations.json` 的 `topDestinations.avg` 與 `daily.json` 的站順序每次 build 會有 ±1 或順序差異，同一份原始檔重跑結果不完全一樣。
  evidence: 1.11 重跑 2026-09 時，約 35 筆 topDestinations avg 差 1、兩組前 5 名次序互換、daily.json `stations` 鍵順序改變；原因是 export.py 以 DuckDB 未排序的結果逐筆累加浮點數（avg 為 n/20 或 n/10，常落在 .5 邊界），以及依查詢順序建 dict。修法候選：`math.fsum` 或先排序再加總、依站索引排序鍵。1.11 未修，也未提交這兩檔的重產結果。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-commute-card/tickets/story-untitled-plan.md`
  summary: 在 iPhone Safari 實機確認「存成圖片」能叫出系統分享面板，而不是因使用者手勢在產圖後失效而改走下載。
  evidence: 未驗證（maybe-false，若成立為 medium）：render 是先 await 產圖再呼叫 navigator.share，Safari 對 transient activation 較嚴；在 iPhone 按一次即可確定，若失效可改成先產圖、第二次點擊才分享。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-city-breath-home/tickets/story-untitled-plan.md`
  summary: CLAUDE.md「已知狀況」最後兩條（骨架還用 maplibre-gl＋deck.gl、`web/src/App.tsx` 是開發骨架）在 3.5 之後已過時，要刪掉或改寫。
  evidence: 3.5 刪了 `App.tsx`、`map/CityMap.tsx` 與 maplibre-gl、deck.gl（`web/src/deps.test.ts` 擋回）；CLAUDE.md 屬 agent-context 檔，build 不改，由 Piwi 或 Sofia 更新。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-city-breath-home/tickets/story-untitled-plan.md`
  summary: A→B 與 B→A 的流向緞帶走同一條曲線、互相疊住（原型也是），可考慮分左右車道；落點漣漪也還沒做。
  evidence: 2026-09 平日 18 點前三有大安→中正與中正→大安，兩條緞帶與光點重疊；漣漪原型用 16 個獨立 mesh，3.5 為守 draw call 預算沒做，可在 3.6 或 3.7 以 InstancedMesh 補。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-city-breath-home/tickets/story-untitled-6-plan.md`
  summary: 行政區只能用指標點畫布選取，鍵盤與螢幕報讀沒有進入行政區卡的路（原型同樣）。
  evidence: 3.6 的選取在 `web/src/scene/Selection.tsx` 只聽畫布的 pointer 事件；可由 4.1 的找車站搜尋加上行政區、或 3.15 的網址直接開卡補上。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-city-breath-home/tickets/story-untitled-6-plan.md`
  summary: 按下行政區時的壓扁只作用在 Terrain 的 `district-<id>` group，3.13 的建築與樹只跟著抬起、不跟著壓扁。
  evidence: `DistrictLift` 改 group 的 scale.y；`Blocks` 的 shader 只讀 `lift`（`lifts.ref`），沒有按壓比例。要一起壓扁得在 Blocks 加一個 uniform。

- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-city-breath-home/tickets/story-untitled-12-plan.md`
  summary: 3.12 第二個 PR：車站卡的類型標籤與一句話（整年最常見的型，管線輸出不分月份的 station-types.json，當月不同時加一行小字），含 data-contract、pytest 與 vitest。
  evidence: 產品計畫 v2（2026-11-14，決定 13、14）在 3.12 實作途中改了票面；協調者指示第一個 PR 照原 plan 範圍完成，類型標籤由同一張票的第二個 PR 補上。

- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-source-and-launch/tickets/story-vercel-plan.md`
  summary: 預覽期 robots.txt 的 Disallow all 可能讓 LINE、Threads 的連結預覽抓不到標題與圖，6.4 用真的分享連結確認。
  evidence: 未驗證（maybe-false，若成立為 medium）；尊重 robots.txt 的預覽爬蟲不會抓頁面。在 6.4 把部署網址貼到 LINE 與 Threads 看有沒有預覽即可確認；不行就移除 robots.txt 的 Disallow、只留 X-Robots-Tag: noindex。
  resolution: 2026-11-18 Piwi 同意先移除 Disallow（robots.txt 改 `Allow: /`），只留 X-Robots-Tag: noindex；6.4 仍用真的分享連結確認預覽。

- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-commute-card/tickets/story-untitled-1-plan.md`
  summary: 找你的站的站序目前由前端用同線各站座標的最小生成樹推出（`web/src/data/stationSearch.ts` lineOrder），可改由管線輸出官方站序（例如 basemap.json 加每線的站 ID 清單）。
  evidence: 資料契約沒有站序；4.1 不改契約。推出的順序對 2026-09 的八條線都和官方一致（vitest 釘住淡水信義線、文湖線、板南線、中和新蘆線），只有中和新蘆線蘆洲支線的接點落在台北橋而不是大橋頭（清單上支線整段排在主線之後，不影響找站）；新站或路線改線時要再看一次。
