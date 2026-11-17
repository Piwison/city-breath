# 來源清單：資料與字型

網站用到的外部資料與素材，以及它們的授權。3.15 建立（自帶字型，決定 19、AD-17）；3.17 的「關於與資料來源」頁之後會用到這份清單。

- **資料的權威來源是資料檔本身**（AD-1）：每個輸入資料集都記在 `web/public/data/{月份}/meta.json` 的 `sources[]` 與 `web/public/data/basemap.json` 的 `sources[]`（名稱、機關、網址、授權、取得日期、sha256），資料來源頁只從那兩處產生。下表是 2026-11-17 從那兩處抄出的摘要，方便查授權；兩邊不一致時以資料檔為準。
- 網站不向任何外部網址載入資料、圖磚、地形、字型或音檔（AD-1）；字型與圖示都在 `web/public/`。

## 資料

| 資料集 | 提供機關 | 網址 | 授權 |
| --- | --- | --- | --- |
| 臺北捷運每日分時各站 OD 流量統計資料 | 臺北大眾捷運股份有限公司 | https://data.gov.tw/dataset/128506 | 政府資料開放授權條款－第1版 |
| 臺北捷運車站出入口座標 | 臺北大眾捷運股份有限公司 | https://data.gov.tw/dataset/128428 | 政府資料開放授權條款－第1版 |
| 臺北捷運路線資料服務（路線色） | 臺北大眾捷運股份有限公司 | https://data.taipei/dataset/detail?id=cb9b4bd5-a648-41be-9287-11bc5b3e2343 | 政府資料開放授權條款－第1版 |
| 臺北捷運路線發車班距頻率資料服務 | 臺北大眾捷運股份有限公司 | https://data.taipei/dataset/detail?id=6d15899a-ff77-4a39-8203-a3addfe1fa28 | 政府資料開放授權條款－第1版 |
| 臺北都會區大眾捷運系統路網圖 | 臺北市政府捷運工程局 | https://data.taipei/dataset/detail?id=afccd2ac-75b1-4362-9099-45983e332776 | 政府資料開放授權條款－第1版 |
| 全國村里界圖（依鄉鎮市區代碼合併為鄉鎮市區界） | 內政部國土測繪中心 | https://data.gov.tw/dataset/7438 | 政府資料開放授權條款－第1版 |
| 臺北市河流 | 臺北市政府工務局水利工程處 | https://data.taipei/dataset/detail?id=9b854e09-b44e-4e02-ae5a-47b860fdba20 | 政府資料開放授權條款－第1版 |
| 河川河道 | 經濟部水利署 | https://data.gov.tw/dataset/25781 | 政府資料開放授權條款－第1版 |
| 臺北市水綠地圖集：公園綠地_公園、河濱高灘地 | 臺北市政府工務局 | https://data.taipei/dataset/detail?id=5b277432-f534-4d09-a24c-d3f6b514e042 | 政府資料開放授權條款－第1版 |
| Copernicus DEM GLO-30（N24、N25 E121 圖塊） | European Space Agency（Copernicus） | https://copernicus-dem-30m.s3.amazonaws.com/readme.html | Copernicus DEM 授權（GLO-30 Public 免費提供給公眾）；© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA |
| 臺北小巨蛋場地租用資訊 | 臺北大眾捷運股份有限公司 | https://data.taipei/dataset/detail?id=f0497727-b2cd-46fa-87c8-c6af6bb9eada | 政府資料開放授權條款－第1版 |
| 中山堂演出訊息 | 臺北市中山堂管理所 | https://data.taipei/dataset/detail?id=bf51fdc3-6823-427a-8713-5e2471dec597 | 政府資料開放授權條款－第1版 |
| 地標位置（`pipeline/config/landmarks.csv`，每列附 Wikidata 項目網址） | Wikidata | https://www.wikidata.org/ | CC0 1.0 |

## 字型

| 字型 | 用在哪裡 | 檔案 | 來源 | 授權 |
| --- | --- | --- | --- | --- |
| Manrope（400、700）基本拉丁與數字子集 | 分享圖與連結預覽圖的數字與英文（`--font-num`，決定 19）；介面仍用系統字 | `web/public/fonts/manrope-num-400.woff2`、`manrope-num-700.woff2`；授權全文 `web/public/fonts/OFL.txt` | npm 套件 `@fontsource/manrope` 5.3.0 的 latin 子集，再用 `web/scripts/subset_fonts.py`（fontTools）裁成 U+0020–007E 與幾個標點；原作 The Manrope Project Authors（https://github.com/sharanda/manrope） | SIL Open Font License 1.1 |
| 中文 | 介面與分享圖的中文 | 不隨網站發布 | 使用者裝置的系統字型（`--font`：Noto Sans TC、PingFang TC、Microsoft JhengHei） | — |

改字型或子集時：更新 `@fontsource/manrope` 版本後在 `web/` 跑 `uv run --with "fonttools[woff]" python scripts/subset_fonts.py`，並改這張表。

## 網站圖示與連結預覽圖

`web/public/favicon.svg`、`apple-touch-icon.png`、`og.png` 是本專案自己畫的（`web/src/share/mark.ts`、`render.ts` 的 `drawLinkPreview`，顏色取自 tokens.css），沒有外部素材；中文字是產生時的系統字型（Noto Sans CJK，SIL OFL 1.1）點陣化在圖裡。重新產生：`npm run dev` 後跑 `node scripts/brand-assets.mjs`。
