// 「找你的站」的搜尋清單（4.1，決定 15）：可打字（顯示名、正規站名、「/」的每一段都找得到）、依路線分組、站序照路線、
// 轉乘站在每條線下都出現；最近用過的 5 站在最上面（state/progress.ts，AD-22）。主按鈕的搜尋、通勤的起站與迄站共用這一份，
// 不支援 3D 的替代頁也是。挑到的站記成「最近用過」；挑迄站時，出站未入檔（環狀線）的站不選，改顯示說明（走查 A7）。
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { filterGroups, recentIn, type SearchModel, type SearchStation } from "../data/stationSearch";
import { lineToken } from "../data/views";
import { rememberStation, useRecentStations } from "../state/progress";
import { track } from "../track";

export type SearchMode = "station" | "origin" | "dest";

/** 打開搜尋（主按鈕、通勤的起站或迄站欄位）：送 commute_input_started（AD-20，不帶 props），再打開。 */
export function startSearch(open: () => void) {
  track("commute_input_started");
  open();
}

/** 環狀線不能當迄站的說明（面板與清單共用）。 */
export const RING_NOTE = "環狀線的出站由新北捷運營運、不在這份資料裡，沒有出站紀錄，不能當迄站。";

function Dots({ s }: { s: SearchStation }) {
  return (
    <span className="find-dots" aria-hidden="true">
      {s.lines.map((l) => (
        <i key={l} style={{ background: `var(${lineToken(l)})` }} />
      ))}
    </span>
  );
}

export function StationSearch({
  model,
  mode,
  onPick,
  label,
  autoFocus = true,
  footer,
}: {
  model: SearchModel;
  mode: SearchMode;
  /** 挑到一站（站 ID）；已經記進「最近用過」 */
  onPick: (id: string) => void;
  /** 輸入框的名字（「找車站」「選起站」「選迄站」） */
  label: string;
  autoFocus?: boolean;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const recentIds = useRecentStations();
  const recent = useMemo(() => recentIn(recentIds, model, query), [recentIds, model, query]);
  const groups = useMemo(() => filterGroups(model, query), [model, query]);

  useEffect(() => {
    if (autoFocus) input.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const pick = (i: number) => {
    const s = model.stations[i];
    if (mode === "dest" && !s.exitsRecorded) {
      setRefused(s.display);
      return;
    }
    setRefused(null);
    rememberStation(s.id);
    onPick(s.id);
  };
  const first = recent[0] ?? groups[0]?.stations[0];

  const item = (i: number, key: string) => {
    const s = model.stations[i];
    const blocked = mode === "dest" && !s.exitsRecorded;
    return (
      <li key={key}>
        <button type="button" className="find-item" data-blocked={blocked ? "" : undefined} onClick={() => pick(i)}>
          <Dots s={s} />
          <span className="find-name">{s.display}</span>
          {blocked && <small>不能當迄站</small>}
        </button>
      </li>
    );
  };

  return (
    <div className="find-search">
      <div className="find-input">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M10.4 10.4L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRefused(null);
          }}
          onKeyDown={(e) => {
            // Enter：有打字時選清單第一站
            if (e.key === "Enter" && query.trim() && first !== undefined) {
              e.preventDefault();
              pick(first);
            }
          }}
          aria-label={label}
          aria-controls={listId}
          placeholder="打站名，例如：忠孝"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      {refused && (
        <p className="find-refused" role="alert">
          「{refused}」是環狀線的站：{RING_NOTE}
        </p>
      )}
      <div id={listId} className="find-list">
        {recent.length > 0 && (
          <section aria-label="最近用過">
            <h3 className="find-head">最近用過</h3>
            <ul>{recent.map((i) => item(i, `r-${model.stations[i].id}`))}</ul>
          </section>
        )}
        {groups.map((g) => (
          <section key={g.line ?? "other"} aria-label={g.name}>
            <h3 className="find-head">
              {g.line && <i className="find-line" style={{ background: `var(${lineToken(g.line)})` }} aria-hidden="true" />}
              {g.name}
              {g.line === "Y" && <small>沒有出站紀錄，不能當迄站</small>}
            </h3>
            <ul>{g.stations.map((i) => item(i, `${g.line}-${model.stations[i].id}`))}</ul>
          </section>
        ))}
        {groups.length === 0 && <p className="find-empty">找不到「{query.trim()}」。試試站名的前兩個字。</p>}
        {footer}
      </div>
    </div>
  );
}
