// 圖層面板（右上）：河川、綠地、捷運路線、區名的開關。開關是畫面狀態，只在 state/view.ts，不保存（AD-16）。
// 流向、車站、列車、建築、雲、音效的開關由之後的票加進 LAYERS。
import { useId, useState } from "react";
import { setLayer, useView, type LayerKey } from "../state/view";

const LAYERS: { key: LayerKey; name: string; note?: string }[] = [
  { key: "rail", name: "捷運路線" },
  { key: "water", name: "河川" },
  { key: "green", name: "公園綠地", note: "僅臺北市" },
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
          地形：Copernicus DEM GLO-30（ESA），切成六層台地，垂直誇張 2 倍。捷運路線：臺北市政府捷運工程局路網圖，路線色取自臺北捷運路線資料服務（環狀線暫定）。河川：臺北市政府工務局水利工程處、經濟部水利署。綠地：臺北市政府工務局，新北市沒有公開範圍。
        </p>
      </div>
    </>
  );
}
