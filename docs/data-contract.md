# 資料契約 v1

管線（`pipeline/`）寫、網站（`web/`）讀。改任何欄位都要同時改 `pipeline/src/city_breath_pipeline/export.py` 與 `web/src/data/types.ts`，並把 `CONTRACT_VERSION` 加一（AD-1）。

```text
web/public/data/
  months.json                 # { months: ["2026-09"], latest }
  2026-09/
    meta.json                 # 來源、授權、日數、營運時段、限制說明
    stations.json   ~106 KB   # 車站、24 小時曲線、前 5 目的地、分群
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

## stations.json

| 欄位 | 說明 |
| --- | --- |
| `stations[].id / name / display` | ID、正規站名、顯示名（板橋分板南線／環狀線） |
| `stations[].lon / lat` | 出口座標平均 |
| `stations[].exitsRecorded` | `false`＝環狀線車站，出站人次不在資料中 |
| `stations[].type` | 分群 ID；出站未計的站為 `null` |
| `stations[].weekday / holiday` | `{ entries[24], exits[24] }` 平均進站、出站人次 |
| `stations[].topDestinations.{weekday,holiday}` | 全日最常去的 5 站 `{ station, avg }` |
| `types[]` | `{ id, label, description, draft, size, features, examples }`；`draft: true` 表示標籤待人工定名 |

## flows.json

`weekday[hour]`、`holiday[hour]`：`[起站索引, 迄站索引, 平均人次][]`，依人次由大到小，最多 200 組，不含同站進出。

## od/{stationId}.json

| 欄位 | 說明 |
| --- | --- |
| `weekday[hour][destIndex]` | 平均人次或 `null`（少於 10 人）；整個小時為 `null` 表示停止營運 |
| `holiday[hour][destIndex]` | 同上 |
| `weekdayDepartures[hour]` / `holidayDepartures[hour]` | 該時段從此站出發的總平均人次 |

## daily.json

`dates[]`、`dayTypes[]`、`cityEntries[]`（全市進站總量）、`stations{id: 每日進站[]}`、`anomalyCandidates[]`（與同星期幾中位數差距 ≥ 15% 的日子）。
