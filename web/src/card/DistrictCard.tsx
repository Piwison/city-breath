// 行政區卡（3.6；原型 renderDistrictCard 移植）：這一小時／整天、這區的人去哪與誰來這裡前 3（點了聚焦那條緞帶、
// 鏡頭飛過去）、這區的車站與此刻進出人數（第一個是此刻最忙，點了開車站小卡），卡內圖例寫明藍與橘紅的意思（走查 F5）。
// 數字都由 views.ts／traits.ts 的純函式算：null 不排名、不當 0（AD-3），整天只加有公開人數的小時。
import { whenLabel } from "../data/periods";
import { busiestStations } from "../data/traits";
import type { DistrictFlowsFile, DistrictsFile } from "../data/types";
import { districtRanks, FLOW_KEYS, flowKey, type DistrictRank, type FlowSource, type StationIndex } from "../data/views";
import { FlowLegend, type LegendLink } from "../scene/FlowLegend";
import { closeCard, selectStation, setFocus, setRange, useView } from "../state/view";
import { CardFrame } from "./CardFrame";

const fmt = (n: number) => Math.round(n).toLocaleString("zh-TW");
export const monthLabel = (month: string) => `${month.slice(0, 4)} 年 ${Number(month.slice(5))} 月`;

export interface DistrictCardProps {
  id: string;
  flows: DistrictFlowsFile;
  districts: DistrictsFile;
  source: FlowSource;
  stations: StationIndex;
  legend: LegendLink;
}

/** 排名列的名稱：區內移動寫「大安區內」（手機兩欄放得下）。 */
const rankName = (r: DistrictRank, names: Map<string, string>) => `${names.get(r.id) ?? r.id}${r.self ? "內" : ""}`;

function RankList({ list, kind, district, names }: { list: DistrictRank[]; kind: "out" | "in"; district: string; names: Map<string, string> }) {
  const focus = useView((s) => s.focus);
  if (list.length === 0) return <p className="card-note">每個方向都少於 10 人。</p>;
  const top = list.slice(0, 3);
  const more = list.slice(3, 5);
  const max = top[0].value || 1;
  const token = FLOW_KEYS.district[kind === "out" ? 0 : 1].token;
  return (
    <>
    <ol className="card-rank">
      {top.map((r) => {
        const key = kind === "out" ? flowKey({ from: district, to: r.id }) : flowKey({ from: r.id, to: district });
        const on = focus === key;
        return (
          <li key={r.id}>
            <button type="button" aria-pressed={on} onClick={() => setFocus(on ? null : key)}>
              <span className="n">{rankName(r, names)}</span>
              <span className="v num">{fmt(r.value)} 人</span>
              <span className="s" aria-hidden="true">
                <i style={{ width: `${((r.value / max) * 100).toFixed(1)}%`, background: `var(${token})` }} />
              </span>
            </button>
          </li>
        );
      })}
    </ol>
      {more.length > 0 && (
        <p className="card-more">
          {more.map((r, k) => (
            <span key={r.id}>
              {k > 0 && "・"}
              {k + 4}. {rankName(r, names)} <span className="num">{fmt(r.value)}</span> 人
            </span>
          ))}
        </p>
      )}
    </>
  );
}

export function DistrictCard({ id, flows, districts, source, stations, legend }: DistrictCardProps) {
  const hour = useView((s) => s.hour);
  const dayType = useView((s) => s.dayType);
  const range = useView((s) => s.range);
  const whole = range === "day";
  const d = districts.districts.find((x) => x.id === id);
  const names = new Map(districts.districts.map((x) => [x.id, x.name]));
  const ranks = districtRanks(flows, dayType, range, hour, id);
  const operating = source.operating(dayType, hour);
  const list = busiestStations(stations.stations, stations.byDistrict.get(id) ?? [], dayType, whole ? "day" : hour);
  const busiest = list.find((x) => x.volume.value !== null)?.index;
  const outKey = FLOW_KEYS.district;
  return (
    <CardFrame
      kind="district"
      kicker="行政區"
      title={d?.name ?? id}
      when={whenLabel(dayType, whole ? "day" : hour, whole || operating)}
      onClose={closeCard}
      footer={<FlowLegend source={source} link={legend} />}
    >
      <div className="card-range" role="group" aria-label="範圍">
        <button type="button" aria-pressed={!whole} onClick={() => setRange("hour")}>
          這一小時
        </button>
        <button type="button" aria-pressed={whole} onClick={() => setRange("day")}>
          整天
        </button>
      </div>
      {ranks.operating ? (
        <div className="card-cols">
          <div>
            <h3>
              <i className="card-dot" style={{ background: `var(${outKey[0].token})` }} aria-hidden="true" />
              這區的人去哪
            </h3>
            <RankList list={ranks.out} kind="out" district={id} names={names} />
          </div>
          <div>
            <h3>
              <i className="card-dot" style={{ background: `var(${outKey[1].token})` }} aria-hidden="true" />
              誰來這裡
            </h3>
            <RankList list={ranks.in} kind="in" district={id} names={names} />
          </div>
        </div>
      ) : (
        <p className="card-note">這個時段停止營運，沒有列車。</p>
      )}
      <h3 className="card-sec">這區的車站・{whole ? "整天" : "此刻"}進出人數（點了看那一站）</h3>
      <div className="card-chips">
        {list.map(({ index, volume }) => {
          const s = stations.stations[index];
          return (
            <button key={s.id} type="button" onClick={() => selectStation(s.id)}>
              <i style={{ background: `var(${stations.token(index)})` }} aria-hidden="true" />
              {index === busiest && <span className="top">最忙</span>}
              {s.display}
              <span className="v num">
                {volume.value === null ? "停止營運" : `${fmt(volume.value)} 人`}
                {volume.entriesOnly && volume.value !== null ? "（只有進站）" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="card-note">
        {monthLabel(flows.month)}
        {dayType === "weekday" ? "平日" : "假日"}平均。
        {whole ? "整天＝各小時的平均人次加總，只算有公開人數的小時；地圖上的流向仍是這一小時。" : "每小時平均人次。"}
        少於 10 人的方向不列出。
        {d?.inflowPartial ? "這區有環狀線車站，出站未入檔，「誰來」會少算。" : ""}
      </p>
    </CardFrame>
  );
}
