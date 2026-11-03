# 資料契約 v2

管線（`pipeline/`）寫、網站（`web/`）讀。改任何欄位都要同時改 `pipeline/src/city_breath_pipeline/export.py` 與 `web/src/data/types.ts`，並把 `CONTRACT_VERSION` 加一（AD-1）；升版的 PR 要把 `web/public/data/` 下所有月份重建（AD-18）。

v2（1.8 起）：`stations[].district`、`districts.json`、`meta.json` 的 `sources[]`。依架構 AD-10，v2 之後還會加 `district-flows.json`（1.9）、`daily/{YYYY-MM-DD}.json`（1.10）、`events.json`，並由那幾張票移除 `flows.json` 與 `daily.json`；在那之前兩者照舊輸出。

```text
web/public/data/
  months.json                 # { months: ["2026-09"], latest }
  2026-09/
    meta.json                 # 來源、授權、日數、營運時段、限制說明
    stations.json   ~109 KB   # 車站、24 小時曲線、前 5 目的地、分群、行政區
    districts.json  ~66 KB    # 行政區：代碼、名稱、中心點、簡化界線、區內車站
    flows.json      ~87 KB    # 每小時前 200 組起訖弧線
    daily.json                # 每日每站進站量、異常候選日
    od/{stationId}.json ~25KB # 起站分片：該起站到每個迄站的分時平均
```

## 共通規則

- 每檔有 `v`（契約版本）與 `month`。
- 小時陣列長度 24；停止營運的時段為 `null`（目前 2–4 點）。
- 檔內以 `stations.json` 的陣列索引指涉車站；跨檔與網址用站 ID（`s` + sha1(正規站名) 前 8 碼）。
- 平均 = 該月該日型總人次 ÷ 該日型天數；`weekday`／`holiday` 定義見 AD-4。
- **起訖平均四捨五入後少於 10 → `null`**，畫面顯示「少於 10 人」（AD-3）。
- **次要隱藏**（AD-3）：若某個已公開的總量等於一組起訖格子的和，而這組只有一格 `null`，管線會再把組內最小的已公開格也改成 `null`，重複到每組都是零格或至少兩格 `null`。前端照樣顯示「少於 10 人」，不得用總量反推。只在 `pipeline/src/city_breath_pipeline/suppress.py` 實作。目前檢查的組：
  - 列：某起站、某日型、某小時的各迄站 ＝ `stations.json` 該站 `entries[h]`（＝ 分片 `*Departures[h]`）。
  - 欄：某迄站、某日型、某小時的各起站 ＝ `stations.json` 該站 `exits[h]`。
  - 全日：某起站 `topDestinations` 的某迄站、某日型的各營運小時 ＝ 該筆 `avg`。
  - 組內只算出站有紀錄的迄站（環狀線車站整欄已知為 0，不算保護格）；原本無人搭的格與少於 10 人無法區分，算 `null`。
  - 總量是四捨五入前的和，格子各自四捨五入，差值只有累積的進位誤差，仍足以估出被藏的格，因此一律視為相等。
  - 被次要隱藏的格也不會出現在 `flows.json`。

## stations.json

| 欄位 | 說明 |
| --- | --- |
| `stations[].id / name / display` | ID、正規站名、顯示名（板橋分板南線／環狀線） |
| `stations[].lon / lat` | 出口座標平均 |
| `stations[].exitsRecorded` | `false`＝環狀線車站，出站人次不在資料中 |
| `stations[].district` | 所屬行政區的 8 碼代碼字串（例 `"63000050"`），對到 `districts.json` 的 `id`；前端不得自行推算（AD-9） |
| `stations[].type` | 分群 ID；出站未計的站為 `null` |
| `stations[].weekday / holiday` | `{ entries[24], exits[24] }` 平均進站、出站人次 |
| `stations[].topDestinations.{weekday,holiday}` | 全日最常去的 5 站 `{ station, avg }` |
| `types[]` | `{ id, label, description, draft, size, features, examples }`；`draft: true` 表示標籤待人工定名 |

## districts.json

臺北市 12 區＋新北市 29 區，全部列出（沒有車站的區 `stations` 為空陣列，供場景畫完整底座），依 `id` 排序。

| 欄位 | 說明 |
| --- | --- |
| `districts[].id` | 國土測繪中心鄉鎮市區 8 碼代碼字串，例 `"63000050"`；所有檔案指涉行政區都用它（AD-9） |
| `districts[].name / city` | 例 `中正區`／`臺北市` |
| `districts[].centroid` | `[lon, lat]`，原始界線的幾何中心 |
| `districts[].stations` | 區內車站，`stations.json` 的陣列索引 |
| `districts[].inflowPartial` | 區內有出站未入檔的環狀線站即為 `true`；顯示「誰來」時要附固定說明 |
| `districts[].polygon` | 簡化後的界線，GeoJSON MultiPolygon 座標 `[[[[lon, lat], …]]]`，環首尾相同，座標 5 位小數；經 `project()` 轉場景座標（AD-12） |

判定與簡化（`pipeline/src/city_breath_pipeline/districts.py`）：

- 界線：國土測繪中心全國村里界圖依 8 碼鄉鎮市區代碼合併，臺北、新北同一份；網址、取得日期、sha256 記在 `pipeline/config/geo_sources.csv`，原檔在 `data/raw/geo/`（`city-breath fetch-geo` 下載，`build` 驗 sha256）。
- 判定座標就是 `stations[].lon / lat`；人工修正寫在 `pipeline/config/station_districts.csv`（`station_name,district_code,reason`），套在判定結果之上。
- 所有區當成一個 coverage 一起簡化（鄰區共邊，不留縫、不重疊）；簡化後跑出自己區的站，在站周邊 250 m 內換回原始界線。管線檢查每站（人工修正的站除外）都落在自己區的 `polygon` 內，不在就降低簡化，仍不行就報錯。

## meta.json 的 sources

`sources[]`：每個輸入資料集一筆 `{ name, publisher, url, license, retrieved, sha256, dataset? }`（AD-1），資料來源頁只從這裡產生。舊的 `source` 物件暫留給現有骨架。

## flows.json

`weekday[hour]`、`holiday[hour]`：`[起站索引, 迄站索引, 平均人次][]`，依人次由大到小，最多 200 組，不含同站進出。

## od/{stationId}.json

| 欄位 | 說明 |
| --- | --- |
| `weekday[hour][destIndex]` | 平均人次或 `null`（少於 10 人，或次要隱藏）；整個小時為 `null` 表示停止營運 |
| `holiday[hour][destIndex]` | 同上 |
| `weekdayDepartures[hour]` / `holidayDepartures[hour]` | 該時段從此站出發的總平均人次 |

## daily.json

`dates[]`、`dayTypes[]`、`cityEntries[]`（全市進站總量）、`stations{id: 每日進站[]}`、`anomalyCandidates[]`（與同星期幾中位數差距 ≥ 15% 的日子）。
