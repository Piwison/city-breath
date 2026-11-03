# 資料契約 v2

管線（`pipeline/`）寫、網站（`web/`）讀。改任何欄位都要同時改 `pipeline/src/city_breath_pipeline/export.py` 與 `web/src/data/types.ts`，並把 `CONTRACT_VERSION` 加一（AD-1）；升版的 PR 要把 `web/public/data/` 下所有月份重建（AD-18）。

v2（1.8 起）：`stations[].district`、`districts.json`、`meta.json` 的 `sources[]`。依架構 AD-10，v2 的檔案由各票陸續加入，不再另外升版：1.9 加 `district-flows.json` 並移除 `flows.json`；之後還有 `daily/{YYYY-MM-DD}.json`（1.10，同時移除 `daily.json`）與 `events.json`。

```text
web/public/data/
  months.json                 # { months: ["2026-09"], latest }
  2026-09/
    meta.json                 # 來源、授權、日數、營運時段、限制說明
    stations.json   ~109 KB   # 車站、24 小時曲線、前 5 目的地、分群、行政區
    districts.json  ~66 KB    # 行政區：代碼、名稱、中心點、簡化界線、區內車站
    district-flows.json ~72 KB # 行政區×行政區×小時×日型平均人次
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
  - 行政區列：某起區、某日型、某小時的各迄區 ＝ 區內各站 `entries[h]` 之和（見 district-flows.json）。
  - 行政區欄：某迄區、某日型、某小時的各起區 ＝ 區內各站 `exits[h]` 之和。
  - 站區塊：行政區格 (A, B) ＝ A 內各起站到 B 內各迄站的 od 格之和。組成員是這格行政區格＋整塊 od 格：行政區格公開而 od 只剩一格 `null` 可用減法反推，行政區格是唯一 `null` 也能把 od 加總反推，所以 od 分片與 district-flows.json 一起隱藏，od 分片因此也可能多出次要隱藏的格。
  - 組內只算出站有紀錄的迄站（環狀線車站整欄已知為 0，不算保護格）；原本無人搭的格與少於 10 人無法區分，算 `null`。
  - 總量是四捨五入前的和，格子各自四捨五入，差值只有累積的進位誤差，仍足以估出被藏的格，因此一律視為相等。

## stations.json

| 欄位 | 說明 |
| --- | --- |
| `stations[].id / name / display` | ID、正規站名、顯示名（板橋分板南線／環狀線） |
| `stations[].lon / lat` | 出口座標平均 |
| `stations[].exitsRecorded` | `false`＝環狀線車站，出站人次不在資料中 |
| `stations[].district` | 所屬行政區的 8 碼代碼字串（例 `"63000050"`），對到 `districts.json` 的 `id`；前端不得自行推算（AD-9） |
| `stations[].type` | 分群 ID；出站未計的站為 `null` |
| `stations[].weekday / holiday` | `{ entries[24], exits[24] }` 平均進站、出站人次 |
| `stations[].topDestinations.{weekday,holiday}` | 全日最常去的 5 站 `{ station, avg }`；`avg` ＝ 各小時整數總人次加總 ÷ 日型天數，再四捨五入 |
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

## district-flows.json

行政區×行政區×小時×日型的平均人次（AD-10；1.9 起，取代 v1 的 `flows.json`）。首頁與「點行政區看去哪、誰來」用。

| 欄位 | 說明 |
| --- | --- |
| `districts[]` | 列與欄的索引：有車站的行政區 8 碼代碼字串，依代碼排序（2026-09 為 21 區）；名稱、界線、`inflowPartial` 從 `districts.json` 以 `id` 查 |
| `weekday[hour][from][to]` | 從 `districts[from]` 的車站在 `hour` 點進站、在 `districts[to]` 的車站出站的平均人次；`null`＝少於 10 人或次要隱藏。整個小時為 `null` 表示停止營運 |
| `holiday[hour][from][to]` | 同上，假日平均 |

- **平均的分母**（AD-7）：先把區內各站的整數總人次加總，再除以該日型天數，最後四捨五入；不是把站平均相加，所以一格可能過門檻、而它的每一組站對都少於 10 人。
- `hour` 是進站時段（AD-15）：「h 點出發」，抵達可能在下一個小時。
- `from == to` 是區內移動，包含同站進出。
- **迄站只算出站有紀錄的站**：環狀線車站（`stations[].exitsRecorded == false`）的出站不在原始資料中，不計入任何欄。因此 `districts[].inflowPartial == true` 的區（目前板橋、中和、新莊、新店），「誰來」那一欄**少算**了到區內環狀線車站的人，顯示時要附固定說明；從這些站出發的人（起站）照常計入。
- 同一區的「去哪」比例＝該列各格 ÷ 列總和；列總和要自行加總公開的格（被隱藏的格不在內），或改用區內各站 `stations[].{weekday,holiday}.entries[h]` 之和當分母。
- 數字與 od 分片經同一次 `suppress.py` 隱藏，兩邊不會互相洩漏（見上方次要隱藏的「站區塊」）。

## od/{stationId}.json

| 欄位 | 說明 |
| --- | --- |
| `weekday[hour][destIndex]` | 平均人次或 `null`（少於 10 人，或次要隱藏）；整個小時為 `null` 表示停止營運 |
| `holiday[hour][destIndex]` | 同上 |
| `weekdayDepartures[hour]` / `holidayDepartures[hour]` | 該時段從此站出發的總平均人次 |

## daily.json

`dates[]`、`dayTypes[]`、`cityEntries[]`（全市進站總量）、`stations{id: 每日進站[]}`、`anomalyCandidates[]`（與同星期幾中位數差距 ≥ 15% 的日子）。
