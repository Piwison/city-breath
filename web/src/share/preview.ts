// 分享卡預覽（share-preview.html，只在開發時用，不進 build）：用最新月份的真實資料畫幾種情境。
// 數字全部來自 od 分片（computeCommute），這裡只挑起訖站與時段。
import "../styles/app.css";
import { computeCommute } from "../data/commute";
import { loadMeta, loadMonths, loadOdShard, loadStations } from "../data/load";
import { shareUrl } from "../state/url";
import { commuteCard, type ShareCard } from "./card";
import { renderShareCard } from "./render";

const SCENARIOS: { name: string; label: string; o: string; d: string; h: number }[] = [
  { name: "1-number", label: "一般數字", o: "板橋（板南線）", d: "台北車站", h: 8 },
  { name: "2-under-10", label: "少於 10 人", o: "台北101/世貿", d: "南港軟體園區", h: 8 },
  { name: "3-long-names", label: "長站名", o: "台北101/世貿", d: "廣慈/奉天宮", h: 8 },
  { name: "4-night", label: "夜間", o: "台北車站", d: "淡水", h: 23 },
];

async function build(): Promise<{ name: string; label: string; card: ShareCard; dataUrl: string }[]> {
  const { latest: month } = await loadMonths();
  const [meta, st] = await Promise.all([loadMeta(month), loadStations(month)]);
  const index = (display: string) => {
    const i = st.stations.findIndex((s) => s.display === display);
    if (i < 0) throw new Error(`${month} 沒有 ${display}`);
    return i;
  };
  const out = [];
  for (const s of SCENARIOS) {
    const [oi, di] = [index(s.o), index(s.d)];
    const [os, ds] = [st.stations[oi], st.stations[di]];
    const result = computeCommute(await loadOdShard(month, os.id), oi, di, "weekday", s.h);
    if (!result) throw new Error(`${s.label}：${s.h} 點停止營運`);
    const url = shareUrl({ month, dayType: "weekday", commute: { o: os.id, d: ds.id, h: s.h } }, `${location.origin}/`);
    const card = commuteCard({ meta, origin: os, dest: ds, dayType: "weekday", hour: s.h, result, url });
    const blob = await renderShareCard(card);
    const dataUrl = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
    out.push({ name: s.name, label: s.label, card, dataUrl });
  }
  return out;
}

const done = build();
(window as unknown as { __shareCards: typeof done }).__shareCards = done;

done.then(
  (cards) => {
    const root = document.getElementById("root")!;
    root.style.gridTemplateColumns = "repeat(auto-fill, minmax(270px, 1fr))";
    for (const c of cards) {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = c.dataUrl;
      img.alt = `${c.label}分享卡`;
      img.width = 270;
      const cap = document.createElement("figcaption");
      cap.textContent = c.label;
      fig.append(img, cap);
      root.append(fig);
    }
  },
  (e: Error) => {
    document.getElementById("root")!.textContent = e.message;
  },
);
