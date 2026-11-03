# 資料契約 v2

管線（`pipeline/`）寫、網站（`web/`）讀。改任何欄位都要同時改 `pipeline/src/city_breath_pipeline/export.py` 與 `web/src/data/types.ts`，並把 `CONTRACT_VERSION` 加一（AD-1）；升版的 PR 要把 `web/public/data/` 下所有月份重建（AD-18）。

v2（1.8 起）：`stations[].district`、`districts.json`、`meta.json` 的 `sources[]`；1.10 加 `daily/{YYYY-MM-DD}.json`；7.1 加 `events.json` 並移除 v1 的 `daily.json`（AD-10 已列為 v2 的檔案，版本不變）。依架構 AD-10，`district-flows.json` 由 1.9 加入並移除 `flows.json`。

```text
web/public/data/
  months.json                 # { months: ["2026-09"], latest }
  2026-09/
    meta.json                 # 來源、授權、日數、營運時段、限制說明
    stations.json   ~109 KB   # 車站、24 小時曲線、前 5 目的地、分群、行政區
    districts.json  ~66 KB    # 行政區：代碼、名稱、中心點、簡化界線、區內車站
    flows.json      ~87 KB    # 每小時前 200 組起訖弧線
    events.json     ~4 KB     # 每日全市進站、異常日（全市級＋站級）、活動（7.2／7.3 起）
    od/{stationId}.json ~25KB # 起站分片：該起站到每個迄站的分時平均
    daily/{YYYY-MM-DD}.json ~40KB # 逐日：當日每站每小時進出、場館站的來源行政區（進入某天才載）
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

## events.json

7.1 起（AD-10、AD-13、AD-14）。異常日與「平常」只在 `pipeline/src/city_breath_pipeline/anomaly.py` 判定，結果只在這個檔；前端只查表，不自己套門檻、不比對日期區間。v1 的 `daily.json` 已移除：每日全市總量看 `days[]`，每站每天的進出看 `daily/`。

**「平常」**＝同月、同星期幾、**排除當日本身**的中位數；全市級與站級用同一個定義。同月沒有其他同星期幾的日子，或平常為 0，就不判定。人次是當日總量（小時歸進站時段，AD-15）。

| 欄位 | 說明 |
| --- | --- |
| `thresholds` | `{ city, stationRatio, stationExtra, stationZ, provisional }`，即下面的門檻；7.2 起 `provisional: false`（站級門檻定案） |
| `days[]` | 每天一筆，依日期排序：`{ date, dayType, cityEntries, cityRatio }` |
| `days[].cityEntries` | 當日全市進站總量（整數） |
| `days[].cityRatio` | 當日 ÷ 平常，3 位小數；沒有基準時 `null` |
| `anomalies[]` | 異常，依日期、再依站索引排序（全市級在前）：`{ date, station, measure, ratio, baseline, eventIds }` |
| `anomalies[].station` | `null`＝**全市級**；否則是**站級**，值為同月 `stations.json` 的陣列索引（AD-2） |
| `anomalies[].measure` | `ratio`、`baseline` 指的是 `"entries"`（進站）或 `"exits"`（出站）；全市級固定 `"entries"`。同站同日進、出都過門檻時取倍數大的一邊 |
| `anomalies[].ratio` | 當日 ÷ 平常，3 位小數 |
| `anomalies[].baseline` | 平常，四捨五入成整數 |
| `anomalies[].eventIds` | 對到 `events[].id`，排序、不重複；**空陣列＝畫面顯示「原因未查證」**。全市級一律為空 |
| `events[]` | 活動，依場館、起日排序：`{ id, startDate, endDate, venue, stations[], name, source, url, verified }`。自動檔期只收配到至少一筆異常的；人工活動全收（沒配到的 `build` 會提醒） |
| `events[].id` | `<source>-<venue>-<起日 YYYYMMDD>`（例：`auto-taipei-arena-20260907`、`manual-nangang-exhibition-20260902`），同來源同場館同起日再加 `-2`、`-3`。同一天同站可同時配到 auto 與 manual |
| `events[].startDate / endDate` | `YYYY-MM-DD`，含首尾。小巨蛋、花博是**租用期**（含進場與拆台）；中山堂是同名節目當月最早／最晚的演出日；人工活動照 `events.csv` |
| `events[].venue` | `pipeline/config/venues.csv` 的 `venue_id` |
| `events[].stations` | `stations.json` 的陣列索引 |
| `events[].source` | `"auto"`（臺北市資料大平臺場館檔期，7.2）或 `"manual"`（`pipeline/config/events.csv`，7.3） |
| `events[].url` / `verified` | 來源網址（auto 為資料集頁 `https://data.taipei/dataset/detail?id=…`；manual 為查證用的新聞或官網）；是否經人工查證（auto 為 `false`，manual 照表） |

**演出日與配對（7.2）**：租用期含進場與拆台，不另外輸出演出日。管線把站級異常配給「場館的車站（`venues.csv`）相同、日期是候選日」的檔期：小巨蛋、花博的候選日是租用期每一天，中山堂是實際演出日。所以演出日＝期間內場館站有站級異常、`eventIds` 指向該檔期的日子；前端只查 `eventIds`，不比對日期區間。

門檻：

- **全市級**：`|cityEntries ÷ 平常 − 1| ≥ 0.15`（多或少都算）。也是 AD-4 的假日檢查：`build` 會列出全市級異常日，平日卻少 15% 以上時提示可能漏列 `config/holidays.csv`。
- **站級（7.2 定案）**：某站當日進站或出站同時滿足三條：
  1. **≥ 平常 × 1.3**；
  2. **多出 ≥ 1,000 人**（擋住小站的小人數）；
  3. **modified z-score ≥ 3.5**（Iglewicz & Hoaglin）：該站該方向整月每天「當日 ÷ 平常」的倍數為一組，`M = 0.6745 × (倍數 − 中位數) ÷ MAD`。整月本來就大起大落的站（例如開學讓同星期幾的中位數混進放假日）不會被當成異常；MAD 為 0 時這條視為通過。

  只抓「多」，「少」多半是全市假日，已在全市級。環狀線站（`exitsRecorded: false`）只看進站。
- 剛好等於門檻也算（管線以分數精確比較）。

**人工活動表（7.3）**：`pipeline/config/events.csv`，欄位 `startDate,endDate,venue_id,name,url,verified`（日期 `YYYY-MM-DD`、`venue_id` 必須在 `venues.csv`、`verified` 為 `true`／`false`）。`build` 驗整份表，**沒有 `http(s)://` 來源網址的列讓 build 失敗**；與當月重疊的列和自動檔期用同一套規則配對（候選日＝起訖間每一天），車站只來自 `venues.csv`。

**場館檔期快照**：`uv run city-breath fetch-events --month YYYY-MM` 從臺北市資料大平臺抓小巨蛋場地租用（每月一個資源，BIG-5）、花博公園展館（年度資源）、中山堂演出（滾動資源）到 `data/raw/events/YYYYMM/`，`sources.json` 記網址、sha256、取得日期；資源尚未發布（例如花博當年度檔）記為 missing，`build` 會印出提醒。用到的快照列進 `meta.json` 的 `sources[]`（`dataset` 為該資源的下載網址）。沒有快照時 `build` 失敗。

`loadEvents(month)` 會一併取同月 `stations.json`，檢查 `month` 相同、所有站索引在範圍內（AD-2）。

## daily/{YYYY-MM-DD}.json

1.10 起（AD-10）。該月每一天一檔，網站只在進入某一天時載入（AD-6，`loadDaily(month, date)` 會一併取同月 `stations.json` 檢查 `month` 與站數）。2026-09 共 30 檔約 1.19 MB，單檔約 39–40 KB（gzip 約 13 KB）。

| 欄位 | 說明 |
| --- | --- |
| `date` / `dayType` | `YYYY-MM-DD`；`weekday`／`holiday`（AD-4） |
| `entries[stationIndex][hour]` | 當日該站該小時的進站人次（整數），依 `stations.json` 陣列索引排列 |
| `exits[stationIndex][hour]` | 出站人次；`exitsRecorded: false` 的站（環狀線）整列為 `null` |
| `venues[]` | `pipeline/config/venues.csv` 的場館站，依站索引排序：`{ station, venueIds[], origins[], arrivals[][24] }` |
| `venues[].station` | 場館站的 `stations.json` 陣列索引 |
| `venues[].venueIds` | 對到此站的 `venue_id`（同站可有多個場館） |
| `venues[].origins` | 來源行政區 8 碼代碼（AD-9），依代碼排序；只列當天至少有一格公開數字的區 |
| `venues[].arrivals[i][hour]` | 從 `origins[i]` 的車站在 `hour` 點進站、到此場館站出站的人次；`null`＝少於 10 人或次要隱藏 |

- 小時是進站時段（AD-15）：出站量與到站來源都歸在進站的那個小時。
- **停止營運**（AD-5）：當日全市進站人次為 0（含原始檔沒有列）的小時，所有站、所有場館格皆為 `null`；全市有營運、該站沒有人次則為 `0`。
- **站層級總量不隱藏**（AD-3）：`entries`、`exits` 少於 10 照樣公開，但算作「已公開的總量」。
- **場館來源行政區照起訖規則隱藏**（AD-3，`suppress.py` 的 `venue_origin_groups`）：單日人次少於 10 → `null`；某場館站某小時的各來源行政區（含場館站自己的區，即同站進出）之和恰等於同檔 `exits[站][hour]`，所以每個（場館站, 小時）是一組，組內只有一格 `null` 時再隱藏組內最小的已公開格。沒列在 `origins` 的區整天都算 `null` 格。前端不得用 `exits` 減出被隱藏的格。
- 來源行政區由管線依起站的 `stations[].district` 加總（AD-9），前端不自行歸區。

### pipeline/config/venues.csv

`venue_id,venue_name,station_name,source`。`station_name` 寫正規站名（例 `台北小巨蛋`、`台北101/世貿`），經 `stations.canonical()` 與別名表解析；對不到車站，或對到出站未入檔的環狀線站，`build` 直接失敗。之後的活動匯入（AD-13）只讀這份表。
