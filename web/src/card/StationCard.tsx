// 車站卡（3.12；原型 renderStationCard 移植，3.6 的最小版小卡擴充）：共用卡框（打開就暫停、標明時段與日型、卡內時間列），
// 這一站的個性（traits.ts：全線名次前 20 的兩個特質，AD-26）、這一小時的進站／出站／進出、整天 24 格長條（點了停播放並跳到那個時段）、
// 這一小時從這站出發最常去的前 5 站（od 分片，選了站才載，AD-6）與這 5 站在哪幾區、「從這站找通勤」（寫起站，4.1 接手）。
// 點目的地：地圖上那條站對站緞帶以外變淡、鏡頭飛過去，再一個按鈕開那一站。
// 環狀線站出站未入檔（A7）：出站寫「未入檔」並附說明，不排名、沒有個性；目的地照 od 分片。
// 類型標籤、一句話、整天前 10、同類型站與誰來這站由 epic-station-personality 加進同一張卡。
import { whenLabel } from "../data/periods";
import { daySeries, stationTraits, stationVolume } from "../data/traits";
import type { LineId } from "../data/types";
import { useOdShard, type OdState } from "../data/useOdShard";
import {
  destinationDistricts,
  flowKey,
  lineToken,
  STATION_DESTINATIONS,
  stationDestinations,
  type FlowSource,
  type StationIndex,
} from "../data/views";
import { seek } from "../state/clock";
import { closeCard, selectStation, setFocus, setPlaying, startCommute, useView } from "../state/view";
import { CardFrame } from "./CardFrame";
import { monthLabel } from "./DistrictCard";

const fmt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("zh-TW"));

/** 點整天長條的某一格：停止播放、跳到那個時段（卡、緞帶、柱高跟著換）。 */
export function pickHour(h: number) {
  setPlaying(false);
  seek(h);
}

/** 長條的高度比例：當天最大值為 1；有人但很少時留一點看得到的高度；停止營運為 null。 */
export function barRatios(series: readonly (number | null)[]): (number | null)[] {
  const max = Math.max(1, ...series.map((v) => v ?? 0));
  return series.map((v) => (v === null ? null : Math.max(0.04, v / max)));
}

export interface StationCardProps {
  id: string;
  stations: StationIndex;
  source: FlowSource;
  lineNames: Map<LineId, string>;
  /** 行政區代碼 → 名稱（districts.json，AD-9） */
  districtNames: Map<string, string>;
  /** 從行政區卡進來時，回到那一區（「‹ 大安區」） */
  backTo?: string;
}

export function StationCard(props: StationCardProps) {
  const od = useOdShard(props.stations.month, props.id);
  return <StationCardView {...props} od={od} />;
}

/** 卡片本體（od 分片從外面給，測試可以直接餵）。 */
export function StationCardView({ id, stations, source, lineNames, districtNames, backTo, od }: StationCardProps & { od: OdState }) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const focus = useView((s) => s.focus);
  const i = stations.byId.get(id);
  if (i === undefined) return null;
  const s = stations.stations[i];
  const v = stationVolume(s, dayType, hour);
  const operating = source.operating(dayType, hour) && v.value !== null;
  const personality = stationTraits(stations.stations, i);
  const series = daySeries(s, dayType);
  const bars = barRatios(series);
  const day = dayType === "weekday" ? "平日" : "假日";
  const districtName = districtNames.get(s.district);
  return (
    <CardFrame
      kind="station"
      kicker={districtName ? `車站・${districtName}` : "車站"}
      title={s.display}
      when={whenLabel(dayType, hour, operating)}
      back={backTo ? { label: backTo, onClick: () => selectStation(null) } : undefined}
      onClose={closeCard}
    >
      <div className="card-lines">
        {stations.lines(i).map((l) => (
          <span key={l}>
            <i style={{ background: `var(${lineToken(l)})` }} aria-hidden="true" />
            {lineNames.get(l) ?? l}
          </span>
        ))}
      </div>

      {personality.ranked && (
        <div className="card-story">
          <b>{personality.traits.length ? "這一站的個性" : "這一站"}</b>
          {(personality.traits.length ? personality.traits : personality.fallback ? [personality.fallback] : []).map((t) => (
            <p key={t.key}>{t.text}</p>
          ))}
        </div>
      )}

      {operating ? (
        <div className="card-stats">
          <div>
            <b className="num">{fmt(v.entries)}</b>
            <span>這小時進站（人）</span>
          </div>
          <div>
            <b className="num">{v.entriesOnly ? "未入檔" : fmt(v.exits)}</b>
            <span>這小時出站（人）</span>
          </div>
          <div>
            <b className="num">{fmt(v.value)}</b>
            <span>{v.entriesOnly ? "這小時進出（只算進站）" : "這小時進出（人）"}</span>
          </div>
        </div>
      ) : (
        <p className="card-note">這個時段停止營運，沒有列車。</p>
      )}
      {v.entriesOnly && (
        <p className="card-note card-warn">
          環狀線的出站由新北捷運營運、不在這份資料裡（未入檔）：這站的進出只算進站，所以不列個性與全線名次。
        </p>
      )}

      <div className="card-spark-wrap">
        <h3 className="card-sec">{day}整天每小時{v.entriesOnly ? "進站" : "進出"}・點一下跳到那個時段</h3>
        <div className="card-spark" role="group" aria-label={`${day}整天每小時${v.entriesOnly ? "進站" : "進出"}人數，點一下跳到那個時段`}>
          {bars.map((r, h) => (
            <button
              key={h}
              type="button"
              aria-label={series[h] === null ? `${h} 點 停止營運` : `${h} 點 ${fmt(series[h])} 人`}
              aria-current={h === hour ? "true" : undefined}
              data-off={r === null ? "" : undefined}
              onClick={() => pickHour(h)}
            >
              <i style={{ transform: `scaleY(${r ?? 0})` }} />
            </button>
          ))}
        </div>
        <div className="card-spark-axis" aria-hidden="true">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>23 點</span>
        </div>
      </div>

      <Destinations od={od} origin={i} stations={stations} districtNames={districtNames} focus={focus} />

      <div className="card-actions">
        <button type="button" className="card-action" onClick={() => startCommute(s.id)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="3.5" cy="12.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12.5" cy="3.5" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5.3 11.4C8 9.5 6 6.5 10.7 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          從這站找通勤
        </button>
      </div>
      <p className="card-note">
        {monthLabel(stations.month)}
        {day}每小時平均人次。個性是這個月平日和全線出站有紀錄的站相比（假日倍數＝假日÷平日），每月重算。
      </p>
    </CardFrame>
  );
}

function Destinations({
  od,
  origin,
  stations,
  districtNames,
  focus,
}: {
  od: OdState;
  origin: number;
  stations: StationIndex;
  districtNames: Map<string, string>;
  focus: string | null;
}) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const head = (
    <h3 className="card-sec card-sec-key">
      <i className="card-dot" style={{ background: "var(--flow-out)" }} aria-hidden="true" />
      從這站出發最常去・這一小時（藍色緞帶）
    </h3>
  );
  if (od.status !== "ok")
    return (
      <div>
        {head}
        <p className="card-note" role={od.status === "error" ? "alert" : undefined}>
          {od.status === "error" ? `目的地資料載入失敗：${od.message}` : "載入這站的起訖資料中…"}
        </p>
      </div>
    );
  const dest = stationDestinations(od.shard, origin, dayType, hour);
  if (!dest.operating)
    return (
      <div>
        {head}
        <p className="card-note">這個時段停止營運，沒有列車。</p>
      </div>
    );
  if (dest.top.length === 0)
    return (
      <div>
        {head}
        <p className="card-note">這一小時每個方向都少於 10 人。</p>
      </div>
    );
  const all = stations.stations;
  const from = all[origin].id;
  const max = dest.top[0].value || 1;
  const areas = destinationDistricts(dest.top, all);
  const focused = dest.top.find((d) => focus === flowKey({ from, to: all[d.index].id }));
  return (
    <div>
      {head}
      <ol className="card-rank card-dest">
        {dest.top.map((d, k) => {
          const to = all[d.index];
          const key = flowKey({ from, to: to.id });
          const on = focus === key;
          return (
            <li key={to.id}>
              <button type="button" aria-pressed={on} onClick={() => setFocus(on ? null : key)}>
                <span className="n">
                  <span className="k num">{k + 1}</span>
                  {to.display}
                </span>
                <span className="v num">{fmt(d.value)} 人</span>
                <span className="s" aria-hidden="true">
                  <i style={{ width: `${((d.value / max) * 100).toFixed(1)}%`, background: "var(--flow-out)" }} />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {focused && (
        <button type="button" className="card-link" onClick={() => selectStation(all[focused.index].id)}>
          看「{all[focused.index].display}」這一站 ›
        </button>
      )}
      <p className="card-more">
        去哪幾區：
        {areas.map((a, k) => (
          <span key={a.id}>
            {k > 0 && "・"}
            {districtNames.get(a.id) ?? a.id} <span className="num">{fmt(a.value)}</span> 人
          </span>
        ))}
        （上面 {dest.top.length} 站依所在區加總）
      </p>
      {dest.top.length < STATION_DESTINATIONS && <p className="card-note">其餘方向都少於 10 人，不列出。</p>}
      <p className="card-note">點一站看那條緞帶；少於 10 人的方向不列出、也不畫。</p>
    </div>
  );
}
