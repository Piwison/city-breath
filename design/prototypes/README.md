# 設計原型

- `city-breath-diorama.html`：Three.js 微縮城市原型（2026-11-03），單一 HTML、資料內嵌（2026-09 平日）。瀏覽器直接開啟即可；Three.js r170 由 jsDelivr 載入。
  - 五種地圖模式：光點列車、漣漪、建築亮燈、吸吐熱度、光柱。
  - 路線站序是手動整理，正式版要以 OSM／TDX 核對；河流、山、台北 101 為示意。
- `reference-diorama.jpg`：Piwi 用生圖 app 做的方向參考圖。
- 線上版：https://claude.ai/artifact/UrKFeyYK71bztwDFWjTJse（私人連結）
- `city-breath-flows.html`：人潮流向原型（2026-11-03）。光點從出發行政區飛到目的行政區；點行政區看「去哪裡／從哪來」；九月特別日子（SEMICON、士林大象踩街、IVE 演唱會已查證，其餘標待確認）。線上版：https://claude.ai/artifact/CGHp3LXC4hMXVPsFLK2aB4（私人連結）
  - 資料是原型用的一次性計算（行政區逐時起訖、逐日爆量偵測），正式版要進管線與資料契約。
  - `design/research/station_district.json`：車站對行政區的對照，依記憶整理，待用行政區界核對。
