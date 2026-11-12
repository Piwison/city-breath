// 圖層面板（右上）：流向、河川、綠地、捷運路線、區名的開關。開關是畫面狀態，只在 state/view.ts，不保存（AD-16）。
// 車站柱（3.1）是真實資料；建築與樹（3.13）是示意層，名稱旁標「示意」（AD-23）。列車、雲、音效的開關由之後的票加進 LAYERS。
import { useId, useState } from "react";
import { setLayer, useView, type LayerKey } from "../state/view";

const LAYERS: { key: LayerKey; name: string; note?: string }[] = [
  { key: "flow", name: "行政區流向", note: "前 12 大" },
  { key: "rail", name: "捷運路線" },
  { key: "station", name: "車站", note: "柱高依此刻進出" },
  { key: "water", name: "河川" },
  { key: "green", name: "公園綠地", note: "僅臺北市" },
  { key: "building", name: "建築與樹", note: "示意" },
  { key: "label", name: "區名" },
];

export function LayerPanel() {
  const [open, setOpen] = useState(false);
  const layers = useView((s) => s.layers);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className="hud scene-layer-btn"
        aria-label="圖層"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 1.8L14.5 5 8 8.2 1.5 5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M1.5 8L8 11.2 14.5 8M1.5 11L8 14.2 14.5 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      </button>
      <div id={panelId} className="hud scene-layer-panel" role="group" aria-label="圖層" hidden={!open}>
        <h2>圖層</h2>
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
          流向：臺北大眾捷運公司「每日分時各站 OD 流量統計資料」，依行政區加總後取該月平日或假日平均（小時是進站時段）；線寬與人數成正比，少於 10 人的不顯示。地形：Copernicus DEM GLO-30（ESA），切成六層台地，垂直誇張 1.5 倍。捷運路線：臺北市政府捷運工程局路網圖，路線色取自臺北捷運路線資料服務（環狀線暫定）。河川：臺北市政府工務局水利工程處、經濟部水利署。綠地：臺北市政府工務局，新北市沒有公開範圍。車站柱：同一份 OD 資料的各站每小時進站＋出站（該月平日或假日平均），柱高依人數的平方根；環狀線的出站由新北捷運營運、不在資料裡，只算進站；凌晨停止營運時沒有柱、站珠熄燈。建築與樹是示意，不是真實建物：疏密依附近車站的平日全日進出站人數，整區高低隨此刻該區車站的進出人數起伏；山上、河上與公園不蓋房子。
        </p>
      </div>
    </>
  );
}
