// 通勤同路人（由開發骨架 App.tsx 搬來，3.5）：選起站、迄站、時段，看平日平均有多少人同路，並可存成分享卡（4.3）。
// 正式的「找車站／通勤」入口與通勤卡由 epic-commute-card 4.1 做；這裡先讓分享卡在首頁換成場景後仍可用。
// 起訖分片在送出時才載（AD-6）；stations.json、meta.json 在第一次打開時載。
import { useEffect, useMemo, useState } from "react";
import { computeCommute, type CommuteResult } from "../data/commute";
import { loadMeta, loadMonths, loadOdShard, loadStations } from "../data/load";
import type { MetaFile, StationsFile } from "../data/types";
import { commuteCard } from "../share/card";
import { ShareButton } from "../share/ShareButton";
import { shareUrl } from "../state/url";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

interface Data {
  month: string;
  meta: MetaFile;
  st: StationsFile;
}

export function CommuteForm() {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    loadMonths()
      .then(async ({ latest }) => {
        const [meta, st] = await Promise.all([loadMeta(latest), loadStations(latest)]);
        if (alive) setData({ month: latest, meta, st });
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  if (error) return <p role="alert">資料載入失敗：{error}</p>;
  if (!data) return <p className="commute-status">載入車站中…</p>;
  return <Form {...data} />;
}

function Form({ month, meta, st }: Data) {
  const service = meta.serviceHours;
  const [o, setO] = useState("");
  const [d, setD] = useState("");
  const [h, setH] = useState(8);
  const [res, setRes] = useState<CommuteResult | null>();
  const [error, setError] = useState<string>();
  // 結果對應的起訖與時段（送出後再改選單不影響已顯示的結果與分享卡）
  const [asked, setAsked] = useState<{ o: number; d: number; h: number }>();
  const sorted = useMemo(
    () => st.stations.map((s, i) => ({ s, i })).sort((a, b) => a.s.display.localeCompare(b.s.display, "zh-TW")),
    [st],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (o === "" || d === "") return;
    const oi = Number(o);
    setError(undefined);
    try {
      const shard = await loadOdShard(month, st.stations[oi].id);
      setAsked({ o: oi, d: Number(d), h });
      setRes(computeCommute(shard, oi, Number(d), "weekday", h));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className="commute-form" onSubmit={submit} aria-label="通勤同路人">
      <h2>每天有多少人跟你同路？</h2>
      <div className="fields">
        <select value={o} onChange={(e) => setO(e.target.value)} required aria-label="起站">
          <option value="">起站</option>
          {sorted.map(({ s, i }) => (
            <option key={s.id} value={i}>
              {s.display}
            </option>
          ))}
        </select>
        <select value={d} onChange={(e) => setD(e.target.value)} required aria-label="迄站">
          <option value="">迄站</option>
          {sorted
            .filter(({ s }) => s.exitsRecorded)
            .map(({ s, i }) => (
              <option key={s.id} value={i}>
                {s.display}
              </option>
            ))}
        </select>
        <select value={h} onChange={(e) => setH(Number(e.target.value))} aria-label="出發時段">
          {service.map((x) => (
            <option key={x} value={x}>
              {pad(x)} 出發
            </option>
          ))}
        </select>
        <button type="submit" className="commute-submit">
          看結果
        </button>
      </div>
      <p className="commute-note">平日平均（{month}）。環狀線車站沒有出站紀錄，不能當迄站。</p>
      {error && <p role="alert">{error}</p>}
      {res === null && <p>這個時段停止營運。</p>}
      {res && asked && (
        <>
          <p>
            平日 {pad(asked.h)}，平均 {res.companionsLabel}和你一樣從 {st.stations[asked.o].display} 到 {st.stations[asked.d].display}
            {res.rank && `，是這站這時段第 ${res.rank} 熱門的目的地（共 ${res.rankedOf} 個）`}。
          </p>
          <ShareButton
            card={() => {
              const [os, ds] = [st.stations[asked.o], st.stations[asked.d]];
              const url = shareUrl({ month, dayType: "weekday", commute: { o: os.id, d: ds.id, h: asked.h } });
              return commuteCard({ meta, origin: os, dest: ds, dayType: "weekday", hour: asked.h, result: res, url });
            }}
          />
        </>
      )}
    </form>
  );
}
