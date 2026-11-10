- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-data-pipeline/tickets/story-untitled-11-plan.md`
  summary: `stations.json` 的 `topDestinations.avg` 與 `daily.json` 的站順序每次 build 會有 ±1 或順序差異，同一份原始檔重跑結果不完全一樣。
  evidence: 1.11 重跑 2026-09 時，約 35 筆 topDestinations avg 差 1、兩組前 5 名次序互換、daily.json `stations` 鍵順序改變；原因是 export.py 以 DuckDB 未排序的結果逐筆累加浮點數（avg 為 n/20 或 n/10，常落在 .5 邊界），以及依查詢順序建 dict。修法候選：`math.fsum` 或先排序再加總、依站索引排序鍵。1.11 未修，也未提交這兩檔的重產結果。
- source_plan: `_bmad-output/initiative-city-breath/tickets/epic-commute-card/tickets/story-untitled-plan.md`
  summary: 在 iPhone Safari 實機確認「存成圖片」能叫出系統分享面板，而不是因使用者手勢在產圖後失效而改走下載。
  evidence: 未驗證（maybe-false，若成立為 medium）：render 是先 await 產圖再呼叫 navigator.share，Safari 對 transient activation 較嚴；在 iPhone 按一次即可確定，若失效可改成先產圖、第二次點擊才分享。
