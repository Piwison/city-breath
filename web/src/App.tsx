// 開發骨架：驗證資料契約與地圖效能用。視覺設計待 hallmark 流程產出後替換（見 CLAUDE.md）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { CityMap } from "./map/CityMap";
import { computeCommute, formatCount, type CommuteResult } from "./data/commute";
import { loadFlows, loadMeta, loadMonths, loadOdShard, loadStations } from "./data/load";
import type { DayType, FlowsFile, MetaFile, StationsFile } from "./data/types";

const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function App() {
  const [month, setMonth] = useState<string>();
  const [meta, setMeta] = useState<MetaFile>();
  const [st, setSt] = useState<StationsFile>();
  const [flows, setFlows] = useState<FlowsFile>();
  const [error, setError] = useState<string>();
  const [dayType, setDayType] = useState<DayType>("weekday");
  const [hour, setHour] = useState(8);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    loadMonths()
      .then(async ({ latest }) => {
        setMonth(latest);
        const [m, s, f] = await Promise.all([loadMeta(latest), loadStations(latest), loadFlows(latest)]);
        setMeta(m);
        setSt(s);
        setFlows(f);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const service = meta?.serviceHours ?? [];
  useEffect(() => {
    if (!playing || !service.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setInterval(() => {
      setHour((h) => service[(service.indexOf(h) + 1) % service.length]);
    }, reduce ? 2000 : 900);
    return () => clearInterval(t);
  }, [playing, service]);

  const onSelect = useCallback((i: number) => setSelected(i), []);
  const arcs = useMemo(() => flows?.[dayType][hour] ?? [], [flows, dayType, hour]);

  if (error) return <main className="shell"><p role="alert">{error}</p></main>;
  if (!st || !meta || !month) return <main className="shell"><p>載入資料中…</p></main>;

  const station = selected === null ? null : st.stations[selected];
  const type = station?.type == null ? null : st.types[station.type];

  return (
    <main className="shell">
      <header className="bar">
        <h1>城市呼吸</h1>
        <p>{month} 北捷每日分時起訖人次（{meta.dayCounts.weekday} 個平日、{meta.dayCounts.holiday} 個假日）</p>
      </header>

      <CityMap stations={st.stations} arcs={arcs} dayType={dayType} hour={hour} selected={selected} onSelect={onSelect} />

      <section className="controls" aria-label="時間軸">
        <button type="button" onClick={() => setPlaying((p) => !p)}>{playing ? "暫停" : "播放一整天"}</button>
        <label>
          <span>{pad(hour)}</span>
          <input
            type="range"
            min={0}
            max={service.length - 1}
            value={Math.max(0, service.indexOf(hour))}
            onChange={(e) => setHour(service[Number(e.target.value)])}
          />
        </label>
        <fieldset>
          <legend>日型</legend>
          {(["weekday", "holiday"] as const).map((t) => (
            <label key={t}>
              <input type="radio" name="daytype" checked={dayType === t} onChange={() => setDayType(t)} />
              {t === "weekday" ? "平日平均" : "假日平均"}
            </label>
          ))}
        </fieldset>
        <p>2:00–4:59 停止營運，城市在睡覺。</p>
      </section>

      {station && (
        <section className="panel" aria-label="車站個性">
          <h2>{station.display}</h2>
          {type ? <p>{type.label}{type.draft ? "（暫定）" : ""}：{type.description}</p> : <p>環狀線出站人次未公開，暫無分類。</p>}
          <p>{pad(hour)} 進站 {formatCount(station[dayType].entries[hour] ?? 0)}、出站 {formatCount(station[dayType].exits[hour] ?? 0)}</p>
          <ol>
            {station.topDestinations[dayType].map((d) => (
              <li key={d.station}>{st.stations[d.station].display}：每天 {d.avg.toLocaleString("zh-TW")} 人</li>
            ))}
          </ol>
        </section>
      )}

      <CommuteForm month={month} st={st} service={service} />
    </main>
  );
}

function CommuteForm({ month, st, service }: { month: string; st: StationsFile; service: number[] }) {
  const [o, setO] = useState("");
  const [d, setD] = useState("");
  const [h, setH] = useState(8);
  const [res, setRes] = useState<CommuteResult | null>();
  const sorted = useMemo(
    () => st.stations.map((s, i) => ({ s, i })).sort((a, b) => a.s.display.localeCompare(b.s.display, "zh-TW")),
    [st],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (o === "" || d === "") return;
    const oi = Number(o);
    const shard = await loadOdShard(month, st.stations[oi].id);
    setRes(computeCommute(shard, oi, Number(d), "weekday", h));
  }

  return (
    <form className="panel" onSubmit={submit} aria-label="通勤同路人">
      <h2>每天有多少人跟你同路？</h2>
      <select value={o} onChange={(e) => setO(e.target.value)} required aria-label="起站">
        <option value="">起站</option>
        {sorted.map(({ s, i }) => <option key={s.id} value={i}>{s.display}</option>)}
      </select>
      <select value={d} onChange={(e) => setD(e.target.value)} required aria-label="迄站">
        <option value="">迄站</option>
        {sorted.filter(({ s }) => s.exitsRecorded).map(({ s, i }) => <option key={s.id} value={i}>{s.display}</option>)}
      </select>
      <select value={h} onChange={(e) => setH(Number(e.target.value))} aria-label="出發時段">
        {service.map((x) => <option key={x} value={x}>{pad(x)}</option>)}
      </select>
      <button type="submit">看結果</button>
      {res === null && <p>這個時段停止營運。</p>}
      {res && (
        <p>
          平日 {pad(h)}，平均 {res.companionsLabel}和你一樣從 {st.stations[Number(o)].display} 到 {st.stations[Number(d)].display}
          {res.rank && `，是這站這時段第 ${res.rank} 熱門的目的地（共 ${res.rankedOf} 個）`}。
        </p>
      )}
    </form>
  );
}
