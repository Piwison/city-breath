// 車站小卡（3.6 最小版）：從行政區卡或站珠點進來，看這站此刻的進站、出站與合計，可回到行政區卡。
// 3.12 把個性、整天長條、前 5 目的地與去哪幾區、從這站找通勤加進同一張卡；卡框與卡內時間列已共用。
import { whenLabel } from "../data/periods";
import { stationVolume } from "../data/traits";
import type { LineId } from "../data/types";
import { lineToken, type FlowSource, type StationIndex } from "../data/views";
import { closeCard, selectStation, useView } from "../state/view";
import { CardFrame } from "./CardFrame";
import { monthLabel } from "./DistrictCard";

const fmt = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("zh-TW"));

export function StationCard({
  id,
  stations,
  source,
  lineNames,
  districtName,
}: {
  id: string;
  stations: StationIndex;
  source: FlowSource;
  lineNames: Map<LineId, string>;
  districtName?: string;
}) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const i = stations.byId.get(id);
  if (i === undefined) return null;
  const s = stations.stations[i];
  const v = stationVolume(s, dayType, hour);
  const operating = source.operating(dayType, hour) && v.value !== null;
  return (
    <CardFrame
      kind="station"
      kicker="車站"
      title={s.display}
      when={whenLabel(dayType, hour, operating)}
      back={districtName ? { label: districtName, onClick: () => selectStation(null) } : undefined}
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
      {operating ? (
        <div className="card-stats">
          <div>
            <b className="num">{fmt(v.entries)}</b>
            <span>此刻進站（人）</span>
          </div>
          <div>
            <b className="num">{v.entriesOnly ? "未入檔" : fmt(v.exits)}</b>
            <span>此刻出站（人）</span>
          </div>
          <div>
            <b className="num">{fmt(v.value)}</b>
            <span>此刻進出（人）</span>
          </div>
        </div>
      ) : (
        <p className="card-note">這個時段停止營運，沒有列車。</p>
      )}
      <p className="card-note">
        {monthLabel(stations.month)}
        {dayType === "weekday" ? "平日" : "假日"}每小時平均人次。
        {v.entriesOnly ? "環狀線的出站由新北捷運營運、不在這份資料裡，進出只算進站。" : ""}
      </p>
    </CardFrame>
  );
}
