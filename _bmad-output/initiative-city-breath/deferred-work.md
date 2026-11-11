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
