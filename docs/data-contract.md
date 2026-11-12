# 資料契約 v4

管線（`pipeline/`）寫、網站（`web/`）讀。改任何欄位都要同時改 `pipeline/src/city_breath_pipeline/export.py` 與 `web/src/data/types.ts`，並把 `CONTRACT_VERSION` 加一（AD-1）；升版的 PR 要把 `web/public/data/` 下所有月份重建（AD-18）。

v2（1.8 起）：`stations[].district`、`districts.json`、`meta.json` 的 `sources[]`；1.9 加 `district-flows.json` 並移除 `flows.json`；1.10 加 `daily/{YYYY-MM-DD}.json`；7.1 加 `events.json` 並移除 v1 的 `daily.json`（AD-10 已列為 v2 的檔案，版本不變）。1.12 加不分月份的 `basemap.json`（AD-21；新增檔案不升版，只換內容時加 `basemapRevision`）。

v3（1.13 起）：加 `inbound/{stationId}.json`（每站的來源）；`stations[].topDestinations` 由前 5 擴成前 10，`avg` 改經 `suppress.py`、可為 `null`。所有月份與 `basemap.json` 重建成 v3（AD-18）。

v4（3.20 起）：`districts.json` 每區加 `weekday`／`holiday` 的區總量 `{ entries[24], exits[24] }`（AD-7、AD-10），給「假日前 5 區」等區排名用。其他檔案形狀不變；所有月份與 `basemap.json` 重建成 v4（AD-18），起訖數字與 v3 逐格相同（`pipeline/tests/test_published_cells.py`）。

```text
web/public/data/
  months.json                 # { v, months: ["2025-10", …, "2026-09"], latest }：依序列出每個月份資料夾
  basemap.json    ~590 KB     # 不分月份的底圖：地形、海、河川、綠地、軌道、每站路線、班距、地標（1.12）
  2026-09/                    # 每個月一個資料夾（1.7 起近 12 個月），形狀相同
    meta.json                 # 來源、授權、日數、營運時段、限制說明
    stations.json   ~139 KB   # 車站、24 小時曲線、前 10 目的地、分群、行政區
    districts.json  ~77 KB    # 行政區：代碼、名稱、中心點、簡化界線、區內車站、每小時區總量（v4）
    district-flows.json ~72 KB # 行政區×行政區×小時×日型平均人次
    events.json     ~4 KB     # 每日全市進站、異常日（全市級＋站級）、活動（7.2／7.3 起）
    od/{stationId}.json ~25KB # 起站分片：該起站到每個迄站的分時平均
    inbound/{stationId}.json ~9KB # 迄站分片：每小時前 5 起站、來源行政區、整天前 10 起站（打開「誰來」才載）
    daily/{YYYY-MM-DD}.json ~40KB # 逐日：當日每站每小時進出、場館站的來源行政區（進入某天才載）
```

## 共通規則

- 每檔有 `v`（契約版本）與 `month`。
- 小時陣列長度 24；停止營運的時段為 `null`（目前 2–4 點）。
- 檔內以 `stations.json` 的陣列索引指涉車站；跨檔與網址用站 ID（`s` + sha1(正規站名) 前 8 碼）。
- **索引只在同一個月份資料夾內有效**（AD-2）：各月的車站集合可能不同（例：2025-10 的 OD 月檔沒有廣慈/奉天宮，該月 119 站），同一站在不同月份的索引可能不同；站 ID 由站名決定，跨月份不變。`loadDaily`、`loadEvents`、`loadOdShard`、`loadInboundShard` 都會一併取同月 `stations.json` 檢查。
- 所有月份同一個契約版本（AD-18）；`months.json` 列出的月份與資料夾一一對應（`pipeline/tests/test_months.py` 檢查）。月份資料夾上線後不可變。
- 平均 = 該月該日型總人次 ÷ 該日型天數；`weekday`／`holiday` 定義見 AD-4。
- **起訖平均四捨五入後少於 10 → `null`**，畫面顯示「少於 10 人」（AD-3）。
- **次要隱藏**（AD-3）：若某個已公開的總量等於一組起訖格子的和，而這組只有一格 `null`，管線會再把組內最小的已公開格也改成 `null`，重複到每組都是零格或至少兩格 `null`。前端照樣顯示「少於 10 人」，不得用總量反推。只在 `pipeline/src/city_breath_pipeline/suppress.py` 實作。目前檢查的組：
  - 列：某起站、某日型、某小時的各迄站 ＝ `stations.json` 該站 `entries[h]`（＝ 分片 `*Departures[h]`）。
  - 欄：某迄站、某日型、某小時的各起站 ＝ `stations.json` 該站 `exits[h]`。
  - 全日：某起訖、某日型的全日格（`topDestinations` 與 inbound `allDay` 的 `avg`，同一格）＝ 各營運小時之和。全日格本身也是起訖數字（< 10 照樣 `null`），所以組成員是全日格＋各小時 od 格。
  - 行政區列：某起區、某日型、某小時的各迄區 ＝ 區內各站 `entries[h]` 之和（見 district-flows.json；v4 起直接公開為 `districts.json` 的 `entries[h]`）。
  - 行政區欄：某迄區、某日型、某小時的各起區 ＝ 區內各站 `exits[h]` 之和（v4 起直接公開為 `districts.json` 的 `exits[h]`）。
  - 站區塊：行政區格 (A, B) ＝ A 內各起站到 B 內各迄站的 od 格之和。組成員是這格行政區格＋整塊 od 格：行政區格公開而 od 只剩一格 `null` 可用減法反推，行政區格是唯一 `null` 也能把 od 加總反推，所以 od 分片與 district-flows.json 一起隱藏，od 分片因此也可能多出次要隱藏的格。
  - 來源區欄（inbound）：某迄站、某日型、某小時的各來源區 ＝ `stations.json` 該站 `exits[h]`。
  - 來源區列：某來源區、某日型、某小時的各迄站 ＝ 區內各站 `entries[h]` 之和。
  - 來源區塊：來源區格 ＋ 區內各起站到這個迄站的 od 格（理由同站區塊）。
  - 行政區與來源區：district-flows 格 (A, B) ＋ A 到 B 內各迄站的來源區格。
  - od、全日格、行政區格、來源區格在同一次 `suppress.py` 一起隱藏（彼此有共同的組）。
  - **已公開過的格不再新藏**（AD-3，1.13 起）：v3 新增的格（來源區格，以及 `topDestinations` 第 6–10 名與 inbound `allDay` 中 v2 沒公開過的全日格）和舊格同組時，只藏新格，並先挑不會逼別組改藏舊格的那一格；組內沒有新格才照「最小的已公開格」。repo 是公開的，v2 的數字在 git 歷史裡，新藏舊格會讓舊值加上新總量減出兩版都隱藏的格。少數避不開的 od 格（某迄站某小時有一個來源區少於 10 人、其餘來源區的站區塊 od 全公開）列在 `pipeline/tests/fixtures/od_v2_exceptions.json`，`test_published_cells.py` 確認 od 分片相對 v2 沒有多出其他 `null`。
  - 組內只算出站有紀錄的迄站（環狀線車站整欄已知為 0，不算保護格）；原本無人搭的格與少於 10 人無法區分，算 `null`。
  - 總量是四捨五入前的和，格子各自四捨五入，差值只有累積的進位誤差，仍足以估出被藏的格，因此一律視為相等。

## stations.json

| 欄位 | 說明 |
| --- | --- |
| `stations[].id / name / display` | ID、正規站名、顯示名（板橋分板南線／環狀線） |
| `stations[].lon / lat` | 出口座標平均 |
| `stations[].exitsRecorded` | `false`＝環狀線車站，出站人次不在資料中 |
| `stations[].district` | 所屬行政區的 8 碼代碼字串（例 `"63000050"`），對到 `districts.json` 的 `id`；前端不得自行推算（AD-9） |
| `stations[].type` | 車站類型 id（對到 `types[].id`，所有月份同一個 id 是同一型，AD-27）；出站未計的站（環狀線）或當月平日沒有進出的站為 `null` |
| `stations[].weekday / holiday` | `{ entries[24], exits[24] }` 平均進站、出站人次 |
| `stations[].topDestinations.{weekday,holiday}` | 全日最常去的 10 站 `{ station, avg }`（v3 起由 5 擴成 10，C5），依全日總人次排序、同人次依正規站名倒序，不含同站進出與 0 人；`avg` ＝ 各小時整數總人次加總 ÷ 日型天數再四捨五入，少於 10 或次要隱藏為 `null`（名次照列） |
| `types[]` | `{ id, label, description, draft, size, features, examples }`，依 `id` 排序、`types[i].id == i`，每月固定 4 筆 |

車站類型（1.6 起；AD-27）：類型是固定的，不是每月重新分群。`city-breath fit-types` 用 2025-10～2026-09 共 12 個月、出站有紀錄的站的平日曲線（6–23 點與 0 點的進、出站占比）與假日／平日總量比一起 k-means（k=4）一次，中心存在 `pipeline/config/station_type_centroids.json`；每月 `build` 只把各站歸到最近的中心。名稱與一句話由 Piwi 定在 `pipeline/config/station_types.csv`。

| `types[]` 欄位 | 說明 |
| --- | --- |
| `id` | 0 臥室站、1 住商站、2 人氣站、3 辦公站（依中心的早上淨流向由小到大），所有月份相同 |
| `label` / `description` | 名稱與一句話，所有月份相同 |
| `draft` | 目前一律 `false`（Piwi 2026-11-11 定名）；日後重新擬合、中心檔的 `namesConfirmed` 還沒改回 `true` 之前為 `true` |
| `size` | 當月歸到這型的站數 |
| `features` | 類型中心的特徵（`amNet` 早上 7–9 點出站占比減進站占比，>0 早上湧入；`pmNet` 17–19 點同理；`lateShare` 21–0 點占比；`holidayRatio` 假日／平日日均總量比；`n` 特徵小時數），描述類型本身，所有月份相同 |
| `examples` | 當月這型平日進站最多的 5 站（正規站名） |

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
| `districts[].weekday / holiday` | v4 起。`{ entries[24], exits[24] }`：區內車站在該小時的平均進站、出站人次（區總量）；沒有車站的區為 `null` |

區總量（v4，3.20；`district_flows.py` 的 `district_profiles`）：

- **平均的分母**（AD-7）：區內各站當月該日型、該小時的**整數總人次先加總**，再除以該日型天數，最後四捨五入（剛好 .5 時取偶數，與 `stations.json` 相同）。不是把 `stations.json` 已四捨五入的站平均相加，所以和站平均之和可能差幾人。前端的區排名只讀這兩個陣列，不自己加站平均。
- **停止營運**（AD-5）：月平均全月都沒有紀錄的小時（目前 2–4 點）為 `null`；營運中但沒人為 `0`。
- 小時是進站時段（AD-15）。區只來自 `stations[].district`（AD-9），區內車站即 `districts[].stations`。
- `entries` 含區內所有車站，包括環狀線站。**`exits` 只算出站有紀錄的站**：環狀線站（`exitsRecorded: false`）的出站不在原始資料中，所以 `inflowPartial: true` 的區（目前板橋、中和、新莊、新店）出站**少算**，顯示時要附固定說明。區內沒有任何出站有紀錄的站時 `build` 失敗（目前沒有這種區）。
- **不隱藏、不新增隱藏組**（AD-3）：區總量是站層級總量之和，`entries[h]` 恰是 district-flows 行政區列組（起區各迄區之和）的總量，`exits[h]` 恰是行政區欄組（迄區各起區之和）的總量，這兩組本來就以「區內各站之和」當作已公開的總量來保護。所以 v4 不新增任何組，v3 公開的起訖格（od、district-flows、inbound、`topDestinations`、逐日場館來源區）一格都沒變；`test_published_cells.py` 以 v3 的摘要（`fixtures/published_v3.json`）檢查。

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
- 同一區的「去哪」比例＝該列各格 ÷ 列總和；列總和要自行加總公開的格（被隱藏的格不在內），或改用 `districts.json` 該區的 `entries[h]`（v4）當分母。
- 數字與 od 分片經同一次 `suppress.py` 隱藏，兩邊不會互相洩漏（見上方次要隱藏的「站區塊」）。

## od/{stationId}.json

| 欄位 | 說明 |
| --- | --- |
| `weekday[hour][destIndex]` | 平均人次或 `null`（少於 10 人，或次要隱藏）；整個小時為 `null` 表示停止營運 |
| `holiday[hour][destIndex]` | 同上 |
| `weekdayDepartures[hour]` / `holidayDepartures[hour]` | 該時段從此站出發的總平均人次 |

## inbound/{stationId}.json

1.13 起（v3；AD-3、AD-6、AD-10）。每個出站有紀錄的迄站一片，打開車站卡的「誰來」才載入（`loadInboundShard(month, stationId)` 會一併取同月 `stations.json` 與 `district-flows.json` 檢查 `month`、站索引與區的順序）。環狀線站（`exitsRecorded: false`）出站不在資料中，**沒有這個分片**。2026-09 共 109 片約 0.94 MB，單片約 8–9 KB。

| 欄位 | 說明 |
| --- | --- |
| `dest` | 迄站的站 ID |
| `districts[]` | 來源行政區 8 碼代碼，與同月 `district-flows.json` 的 `districts` 完全相同（同順序）；名稱從 `districts.json` 查 |
| `weekday` / `holiday` | `{ top, districts, allDay }`，平日／假日平均 |
| `*.top[hour]` | 該小時到此站人次最多的 5 個起站 `{ station, avg }`，依人數排序（同人數依站索引）；不含同站進出。**只從隱藏後仍公開的 od 格挑**，值與 od 分片的同一格相同，所以不會有 `null`，也不帶 od 分片以外的資訊。公開的格不到 5 個就少於 5 筆 |
| `*.districts[hour][i]` | 從 `districts[i]` 這區的車站在 `hour` 點進站、在此站出站的平均人次；`null`＝少於 10 人或次要隱藏 |
| `*.allDay` | 全日總人次前 10 的起站 `{ station, avg }`，排序與 `topDestinations` 相同（全日總人次、同人次依正規站名倒序；不含同站進出與 0 人）；`avg` 與起站那邊 `topDestinations` 的同一格相同，少於 10 或次要隱藏為 `null`（名次照列） |

- `top`、`districts` 在停止營運的小時為 `null`（AD-5）。小時是進站時段（AD-15）。
- 來源區**含同站進出**、也含環狀線起站，所以各區之和恰等於 `stations[].{weekday,holiday}.exits[hour]`（管線檢查整數總人次相等，不等就 `build` 失敗）。前端不得用 `exits` 減出被隱藏的格。
- 區的平均照 AD-7：區內各起站的整數總人次先加總再除以天數。起站所屬區只來自 `stations[].district`（AD-9）。
- 隱藏規則見上方「次要隱藏」的來源區與全日組；所有數字經 `suppress.py`。

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

## basemap.json

1.12 起（AD-21、AD-12、AD-25）。放在 `web/public/data/` 根目錄、不分月份，首頁載一次（目標 ≤ 1 MB 未壓縮，AD-6；2026-11-10 約 590 KB）。只由管線產生：`city-breath fetch-basemap` 下載原始檔，`city-breath build` 在建**最新月份**時重寫（站與路線以那個月的車站為準；建舊月份不動它）。處理在 `pipeline/src/city_breath_pipeline/basemap.py`。

幾何一律經緯度、5 位小數，經 `project()` 轉場景座標（AD-12）。面是 GeoJSON MultiPolygon 座標 `[面][環][點]`，第一個環是外框、其餘是洞，環首尾相同。

| 欄位 | 說明 |
| --- | --- |
| `v` | 契約版本（同 `CONTRACT_VERSION`）。改形狀照 AD-18 升版 |
| `basemapRevision` | 只換內容（新的 DEM、河道）就加一（`basemap.py` 的 `BASEMAP_REVISION`） |
| `stationsMonth` | 站與路線依這個月份（最新月份）的車站產生 |
| `bbox` | 底座範圍 `[西, 南, 東, 北]`：21 區外框四周各加最大邊長的 8% |
| `levels` | 台地高度（公尺）`[40, 120, 250, 400, 600, 850]`。存真實高程，場景高度只經 `projection.ts` 的 `elevation()` |
| `lines[]` | `{ id, name }`，`id` 固定為 `BR`、`R`、`R-3`、`G`、`G-3`、`O`、`BL`、`Y`；顏色 token＝`--line-` 加小寫、去連字號的 ID（`R-3` → `--line-r3`），**JSON 不放色碼** |
| `districts[]` | 有車站的行政區（同 district-flows 的 21 區），依代碼排序：`{ id, water, green, terrain }` |
| `districts[].water` | 區內的河川面：臺北市河流（河川用地）＋水利署河川河道；河道面含高灘地，臺北市已有河濱高灘地綠地的地方畫成綠地 |
| `districts[].green` | 區內的公園與河濱高灘地（臺北市水綠地圖集）；**新北市沒有資料** |
| `districts[].terrain` | 長度 6；第 k 個是區內「高程 ≥ `levels[k]`」的面，已扣掉水面 |
| `outside.terrain` | 同上，底座上、21 區以外的部分 |
| `sea` | 海：高程 ≤ 0.5 公尺且連成 1 km² 以上、在 21 區以外 |
| `outsideWater` | 底座上、21 區以外的河 |
| `grid` | 高程等級格網 `{ lon0, lat0, step, nx, ny, rows }`：`rows[j][i]` 是 `(lon0 + i·step, lat0 − j·step)` 的等級字元 `0`–`6`（高程 ≥ 幾層）；`projection.ts` 的 `terrainLevelAt()` 讀它 |
| `tracks[]` | 捷運軌道 `{ line, coords, di, approx }`，整條線不切區；`di[k]` 是第 k 個頂點所在的 `districts[]` 索引（−1＝不在有車站的區）；`approx: true`＝路網圖缺段，從同線最近的軌道端點以直線補到車站 |
| `stationLines` | 站 ID → 路線（依上面的 ID 順序）。用站 ID 而非索引（AD-2 的例外）：前端用目前月份的 `stations.json` 換成索引，當月沒有的站略過。環狀線站（`exitsRecorded: false`）一律 `["Y"]` |
| `headway` | 路線 → `{ weekday, holiday }`，各 24 格；每格是該小時內公告的發車間隔 `[最短, 最長]`（分鐘），一小時跨兩個時段就取兩段的最短與最長。不在營運時段（來源 06:00–24:00）或來源寫 0 的小時為 `null`。環狀線不在資料裡，沒有這個鍵（不畫列車，AD-23） |
| `landmarks[]` | `{ id, name, kind, lon, lat, station, district, venue }`（AD-25）：`station` 是站 ID、`district` 是 8 碼代碼、`venue` 是 `venues.csv` 的 `venue_id` 或 `null`。前端只把 `kind` 對到示意造型 |
| `sources[]` | 同 `meta.json` 的形狀 `{ name, publisher, url, dataset?, license, retrieved, sha256 }`，資料來源頁從這裡產生。選用來源缺檔時多 `missing: true`、`note`，`retrieved`、`sha256` 為空字串 |
| `notes[]` | 給資料來源頁的說明（地形是 DSM、新北沒有綠地、班距取哪些路線等） |

處理細節：

- **地形**：Copernicus DEM GLO-30（數值地表模型，含建物與植被）兩塊圖塊合併、重取樣成 1/1800 度（約 60 公尺）、高斯平滑後依六層門檻向量化。切區用 `districts.json` 的簡化界線（和網站畫的行政區薄片同形狀）。
- **軌道**：臺北市捷運局路網圖的 `RouteName` 是興建時期的路段名，對到營運路線寫在 `pipeline/config/mrt_routes.csv`；新北投支線含在淡水線的長線段裡，由 `cut_from`／`cut_to`（北投、新北投）切出。信義線東延段興建中，不畫。
- **每站路線**：環狀線站固定 `Y`；`pipeline/config/station_lines.csv` 的人工修正（附理由）優先；其餘取 150 公尺內有軌道的線，都沒有就取最近一條（3 公里內）。站離自己某條線的軌道超過 150 公尺就以直線補（`approx`）。
- **班距**：臺北捷運路線發車班距頻率資料，各線取 RouteID 為「線-1」的路線，另有 `R-3`（新北投支線）、`G-3`（小碧潭支線）；同線其他 RouteID（例如 `O-2`）未列。
- **地標**：見下方 landmarks.csv。

### pipeline/config/basemap_sources.csv

`key,file,name,publisher,url,dataset,license,retrieved,sha256,optional,note`。`file` 是 `data/raw/` 下的路徑。`fetch-basemap` 下載每個來源：csv 還沒有 sha256 就登記；sha256 不同時原檔不動、新檔留成 `.new`，要加 `--update` 才換上並寫回（之後 `BASEMAP_REVISION` 加一）。下載失敗時若本機已有手動放入的檔就登記那個檔；`optional: true` 的來源都沒有就印手動下載說明、不中斷。`build` 只吃 csv 記錄的那一版：必要來源缺檔或 sha256 不符就失敗；選用來源缺檔時警告並在 `sources[]` 記 `missing`。

水利署河川河道（data.gov.tw 25781）的 SHP 在 `gic.wra.gov.tw`，部分網路連不到：手動下載後原樣存成 `data/raw/basemap/RIVERPOLY.zip`（或解壓成 `data/raw/basemap/RIVERPOLY/` 資料夾，裡面一個 `.shp`），再跑 `fetch-basemap` 登記。座標系統讀 `.prj`（TWD97 TM2，EPSG:3826），轉成經緯度後只取底座範圍內的面。新北市水利局的地圖服務沒有標示授權，不進輸出。

### pipeline/config/landmarks.csv

`id,name,kind,lon,lat,station_name,venue_id,source_url,note`（AD-25）。`station_name` 寫正規站名，經 `stations.canonical()` 與別名表解析成站 ID；`venue_id` 留空或對到 `venues.csv`；`source_url` 是位置來源（目前都是 Wikidata 項目，CC0）。所屬行政區由管線用 AD-9 同一份國土測繪中心界線（未簡化）判定；站名對不到、場館不存在、或座標不在臺北市與新北市任何一區，`build` 失敗。
