// 圖層（3.24 起在首頁「⋯更多」裡；原本是右上角的面板）：流向、河川、綠地、捷運路線、區名的開關。開關是畫面狀態，只在 state/view.ts，不保存（AD-16）。
// 車站柱（3.1）是真實資料；建築與樹（3.13）、列車（3.14）是示意層，名稱旁標「示意」，雲是裝飾（AD-23）。音效的開關由之後的票加進 LAYERS。
import { setLayer, useView, type LayerKey } from "../state/view";

const LAYERS: { key: LayerKey; name: string; note?: string }[] = [
  { key: "flow", name: "行政區流向", note: "前 12 大" },
  { key: "rail", name: "捷運路線" },
  { key: "station", name: "車站", note: "柱高依這小時進出，放大才出現" },
  { key: "water", name: "河川" },
  { key: "green", name: "公園綠地", note: "僅臺北市" },
  { key: "building", name: "建築與樹", note: "示意" },
  { key: "train", name: "列車", note: "示意，間隔依官方班距" },
  { key: "cloud", name: "雲", note: "裝飾" },
  { key: "label", name: "區名" },
];

/** 圖層開關清單與來源註記（3.24 起在首頁「⋯更多」的「圖層」裡展開；原本是右上角的浮層）。 */
export function LayerList() {
  const layers = useView((s) => s.layers);
  return (
    <div className="layer-list" role="group" aria-label="圖層">
      {LAYERS.map(({ key, name, note }) => (
        <label key={key}>
          <span className={`sw sw-${key}`} aria-hidden="true">
            {key === "label" ? "字" : ""}
          </span>
          <span>
            {name}
            {note && <small> {note}</small>}
          </span>
          <input type="checkbox" checked={layers[key]} onChange={(e) => setLayer(key, e.target.checked)} />
        </label>
      ))}
      <p className="src">
        流向：臺北大眾捷運公司「每日分時各站 OD 流量統計資料」，依行政區加總後取該月平日或假日平均（小時是進站時段）；線寬與人數成正比，少於 10 人的不顯示。地形：Copernicus DEM GLO-30（ESA），切成六層台地，垂直誇張 1.5 倍。捷運路線：臺北市政府捷運工程局路網圖，路線色取自臺北捷運路線資料服務（環狀線暫定）。河川：臺北市政府工務局水利工程處、經濟部水利署。綠地：臺北市政府工務局，新北市沒有公開範圍。車站柱：同一份 OD 資料的各站每小時進站＋出站（該月平日或假日平均），柱高依人數的平方根，全城視角不畫柱、放大或點一區才出現；環狀線的出站由新北捷運營運、不在資料裡，只算進站；凌晨停止營運時沒有柱、站珠熄燈。建築與樹是示意，不是真實建物：疏密依附近車站的平日全日進出站人數，整區高低隨這小時該區車站的進出人數起伏；山上、河上與公園不蓋房子。列車是示意，不是真實列車的位置：同一條線相鄰兩班的間隔依臺北捷運公司公告的各線每小時發車班距（區間的中點）換算，尖峰較密；營運時間外沒有列車，環狀線沒有班距資料不畫。雲只是裝飾。
      </p>
    </div>
  );
}
