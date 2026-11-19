// 通勤輸入（4.1，取代骨架搬來的 CommuteForm）：起站、迄站用「找你的站」同一個搜尋挑（依路線分組、最近用過在最上面），
// 出發時段選單列出 0–23 點，資料裡停駛的時段（meta.json serviceHours 沒有的小時，和時間軸一樣只看資料、不寫死）
// 標「停止營運」不能選。起訖預設留空，已選了一站就帶入當起站（view.ts openCommute）。起訖都選好就直接算，不另按送出。
// 起訖與時段在 state/view.ts 的 commute（AD-16）；面板只管「正在挑起站還是迄站」這種暫時的 UI 狀態。
// 起訖都選好（commuteReady）就換成通勤卡（4.2，card/CommuteCard.tsx）：首頁由 ScenePage 的 Bottom 開、這個面板收起；
// 替代頁在面板下面開。時段只有一份（畫面的時刻）：選單經 clock 換時段，view.ts 的 writeTime 同步 commute.h。
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchModel } from "../data/stationSearch";
import type { MetaFile, Station } from "../data/types";
import { pickHour } from "../state/clock";
import { commuteReady, setCommute, useView, type Commute } from "../state/view";
import { startSearch, StationSearch } from "./StationSearch";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export interface CommuteData {
  month: string;
  /** 當月 stations.json 的站（索引與 od 分片一致，AD-2） */
  stations: readonly Station[];
  model: SearchModel;
  meta: MetaFile;
}

/** 有營運的預設時段：畫面上的整點；那一小時停駛就用 8 點（不在營運時段就取第一個營運的小時）。 */
export function serviceHour(h: number, service: readonly number[]): number {
  if (service.includes(h)) return h;
  return service.includes(8) ? 8 : (service[0] ?? 8);
}

/** 時段選單的一列：停駛的小時寫「停止營運」且不能選。 */
export function hourOptions(service: readonly number[]): { h: number; label: string; disabled: boolean }[] {
  return HOURS.map((h) =>
    service.includes(h) ? { h, label: `${h} 點出發`, disabled: false } : { h, label: `${h} 點・停止營運`, disabled: true },
  );
}

export function CommuteInput({ data }: { data: CommuteData }) {
  const commute = useView((s) => s.commute);
  const [picking, setPicking] = useState<"origin" | "dest" | null>(null);
  const service = data.meta.serviceHours;
  // 打開時畫面上的整點停駛：換成有營運的時段（經 clock，畫面的時刻跟著換）。通勤卡開著時不動：卡內時間列可以停在停駛時段
  useEffect(() => {
    if (commute && !commuteReady(commute) && !service.includes(commute.h)) pickHour(serviceHour(commute.h, service));
  }, [commute, service]);
  if (!commute) return null;

  // 打開搜尋（AD-20）：起訖欄位打開的搜尋也算
  const open = (which: "origin" | "dest") => startSearch(() => setPicking(which));

  if (picking)
    return (
      <div className="find-pick">
        <button type="button" className="find-back" onClick={() => setPicking(null)}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {picking === "origin" ? "選起站" : "選迄站"}
        </button>
        <StationSearch
          model={data.model}
          mode={picking}
          label={picking === "origin" ? "選起站" : "選迄站"}
          onPick={(id) => {
            setCommute(picking === "origin" ? { o: id } : { d: id });
            setPicking(null);
          }}
        />
      </div>
    );

  return <CommuteForm data={data} commute={commute} open={open} />;
}

function CommuteForm({ data, commute, open }: { data: CommuteData; commute: Commute; open: (w: "origin" | "dest") => void }) {
  const { model, month, meta } = data;
  const dayType = useView((s) => s.dayType);
  const name = (id: string | null) => (id ? model.stations[model.byId.get(id) ?? -1]?.display : undefined);
  const oi = commute.o ? model.byId.get(commute.o) : undefined;
  const di = commute.d ? model.byId.get(commute.d) : undefined;
  const destRef = useRef<HTMLButtonElement>(null);
  // 帶入起站（車站卡「從這站找通勤」）：焦點移到迄站
  useEffect(() => {
    if (commute.o && !commute.d) destRef.current?.focus({ preventScroll: true });
  }, [commute.o, commute.d]);
  const options = useMemo(() => hourOptions(meta.serviceHours), [meta]);

  return (
    <form className="commute-form" aria-label="通勤同路人" onSubmit={(e) => e.preventDefault()}>
      <div className="commute-fields">
        <button type="button" className="commute-field" onClick={() => open("origin")} aria-label={`起站：${name(commute.o) ?? "還沒選"}，點一下選起站`}>
          <span className="k">起站</span>
          <span className="v" data-empty={oi === undefined ? "" : undefined}>
            {name(commute.o) ?? "選起站"}
          </span>
        </button>
        <button
          ref={destRef}
          type="button"
          className="commute-field"
          onClick={() => open("dest")}
          aria-label={`迄站：${name(commute.d) ?? "還沒選"}，點一下選迄站`}
        >
          <span className="k">迄站</span>
          <span className="v" data-empty={di === undefined ? "" : undefined}>
            {name(commute.d) ?? "選迄站"}
          </span>
        </button>
        <label className="commute-field commute-hour">
          <span className="k">出發時段</span>
          <select value={commute.h} onChange={(e) => pickHour(Number(e.target.value))} aria-label="出發時段">
            {options.map((o) => (
              <option key={o.h} value={o.h} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="commute-note">
        {dayType === "weekday" ? "平日" : "假日"}平均（{month}）。環狀線車站沒有出站紀錄，不能當迄站。
      </p>
      {oi !== undefined && oi === di && <p className="commute-status">起站和迄站是同一站，換一個迄站看看。</p>}
    </form>
  );
}
