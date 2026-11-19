// 通勤卡（4.2；產品計畫 v2 決定 10、11、17，走查 A3、B1）：起訖都選好（state/view.ts commuteReady）就在下方開這張卡，
// 共用卡框（兩段高度、打開就暫停、卡內時間列、標題列分享鈕）。第一行是一句答案（data/answer.ts commuteAnswer），
// 下面依序是「早一點、晚一點出門呢？」三格（點了直接換時段，A3）、同路人數與名次、這小時從起站出發最常去的前 5 站。
// 數字全部來自 computeCommute／nearbyHours（od 分片，AD-6），經 data/format.ts：少於 10 人寫「少於 10 人」、不排名（AD-3），
// 停駛寫「停止營運」不寫 0（AD-5）。時段只有一份：卡上的時段＝畫面的時刻（view.hour；writeTime 同步 commute.h），
// 卡內時間列與三格都經 clock 換時段；日型跟畫面的平日／假日。
// 分享（3.15 面板）：預覽與「存成圖片」用 4.3 的版型（share/card.ts commuteCard，render.ts 依資料重畫，AD-17），
// 「複製連結」由 state/url.ts 帶起站、迄站與時段（AD-16），打開回到同一張通勤卡。
// 計數（AD-20）：od 分片載好、卡上出現結果時送 commute_result_shown（同一組起訖一次，view.ts commuteResultShown）；
// 存圖、複製連結由分享面板送。
import { useEffect } from "react";
import { commuteAnswer } from "../data/answer";
import { computeCommute, nearbyHours, type CommuteResult } from "../data/commute";
import { formatCount, formatNumber } from "../data/format";
import { CLOSED, whenLabel } from "../data/periods";
import type { DayType, MetaFile, Station } from "../data/types";
import { useOdShard, type OdState } from "../data/useOdShard";
import { commuteCard } from "../share/card";
import { ShareAction, type ShareTarget } from "../share/SharePanel";
import { pickHour } from "../state/clock";
import { clearCommute, commuteResultShown, setCommute, useView } from "../state/view";
import { CardFrame } from "./CardFrame";
import { monthLabel } from "../share/card";

export interface CommuteCardProps {
  /** 起訖都選好、不同站的通勤（commuteReady） */
  commute: { o: string; d: string; h: number };
  month: string;
  /** 當月 stations.json 的站（索引與 od 分片的列一致，AD-2） */
  stations: readonly Station[];
  /** 站 ID → stations 的索引 */
  byId: ReadonlyMap<string, number>;
  /** meta.json（分享卡頁尾的來源與天數）；還沒載到時只有複製連結 */
  meta?: MetaFile;
  /** × 與 Esc（預設收起通勤；替代頁改成回到面板、保留起站） */
  onClose?: () => void;
}

export function CommuteCard(props: CommuteCardProps) {
  const { o, d } = props.commute;
  const od = useOdShard(props.month, o);
  // 計數（AD-20）：結果出現才算；載入中、失敗不送。同一組起訖換時段或日型不重送
  useEffect(() => {
    if (od.status === "ok") commuteResultShown(o, d);
  }, [od.status, o, d]);
  return <CommuteCardView {...props} od={od} />;
}

/**
 * 分享面板的內容（3.15）：預覽的一句話是卡上的答案；有結果（有營運）且 meta 到了才有圖可存（4.3 版型，
 * 網址由面板依畫面狀態產生後傳進來，AD-16），否則只有複製連結。
 */
export function commuteShareTarget(args: {
  origin: Pick<Station, "display">;
  dest: Pick<Station, "display">;
  dayType: DayType;
  hour: number;
  when: string;
  answer: string | undefined;
  /** computeCommute 的結果；undefined＝還沒載到、null＝停止營運 */
  result: CommuteResult | null | undefined;
  meta: MetaFile | undefined;
}): ShareTarget {
  const { origin, dest, dayType, hour, when, answer, result, meta } = args;
  return {
    kicker: "通勤同路人",
    title: `${origin.display} → ${dest.display}`,
    when,
    summary: answer ?? when,
    image: result && meta ? (url: string) => commuteCard({ meta, origin, dest, dayType, hour, result, url }) : undefined,
  };
}

const NEAR_LABEL = { [-1]: "早一小時", 0: "這個時段", 1: "晚一小時" } as const;

/** 卡片本體（od 分片從外面給，測試可以直接餵）。 */
export function CommuteCardView({ commute, month, stations, byId, meta, onClose = clearCommute, od }: CommuteCardProps & { od: OdState }) {
  const dayType = useView((s) => s.dayType);
  const oi = byId.get(commute.o);
  const di = byId.get(commute.d);
  if (oi === undefined || di === undefined) return null;
  const [os, ds] = [stations[oi], stations[di]];
  const h = commute.h;
  // undefined＝od 分片還沒到；null＝這小時停止營運
  const res = od.status === "ok" ? computeCommute(od.shard, oi, di, dayType, h) : undefined;
  const operating = res !== null;
  const when = whenLabel(dayType, h, operating);
  const answer =
    res === undefined
      ? undefined
      : commuteAnswer({ origin: os.display, dest: ds.display, dayType, hour: h, operating, companions: res?.companions ?? null });
  const day = dayType === "weekday" ? "平日" : "假日";

  return (
    <CardFrame
      kind="commute"
      kicker="通勤同路人"
      title={
        <>
          {os.display}
          <span aria-hidden="true"> → </span>
          <span className="card-sr">到</span>
          {ds.display}
        </>
      }
      when={when}
      actions={
        <ShareAction target={() => commuteShareTarget({ origin: os, dest: ds, dayType, hour: h, when, answer, result: res, meta })} />
      }
      // 換起訖：回到通勤面板，起站與時段保留、迄站清空（焦點落在迄站）
      back={{ label: "換起訖站", onClick: () => setCommute({ d: null }) }}
      onClose={onClose}
      answer={answer}
    >
      {od.status === "error" ? (
        <p className="card-note" role="alert">
          資料載入失敗：{od.message}
        </p>
      ) : od.status !== "ok" ? (
        <p className="card-note">載入{os.display}的起訖資料中…</p>
      ) : (
        <>
          <div className="commute-near-wrap">
            <h3 className="card-sec">早一點、晚一點出門呢？・點一下換時段</h3>
            <div className="commute-near" role="group" aria-label="早一小時、這個時段、晚一小時的同路人數，點一下換時段">
              {nearbyHours(od.shard, oi, di, dayType, h).map((c) => {
                const value = c.operating ? formatCount(c.companions) : CLOSED;
                return (
                  <button
                    key={c.offset}
                    type="button"
                    aria-current={c.offset === 0 ? "true" : undefined}
                    disabled={!c.operating}
                    aria-label={`${NEAR_LABEL[c.offset]}，${c.hour} 點出發：${value}`}
                    onClick={() => pickHour(c.hour)}
                  >
                    <span className="k">{NEAR_LABEL[c.offset]}</span>
                    <b className="num">{c.hour} 點</b>
                    <span className="v num">{value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {res ? (
            <div className="card-stats">
              <div>
                <b className="num">{formatNumber(res.companions)}</b>
                <span>平均同路（人）</span>
              </div>
              <div>
                <b className="num">{res.rank !== null ? `第 ${res.rank}` : res.companions === null ? "不排名" : "—"}</b>
                <span>{res.companions === null ? "少於 10 人不排名" : `熱門目的地（共 ${res.rankedOf} 站）`}</span>
              </div>
              <div>
                <b className="num">{formatNumber(res.departures, CLOSED)}</b>
                <span>這小時從{os.display}出發（人）</span>
              </div>
            </div>
          ) : (
            <p className="card-note">這個時段停止營運，沒有列車。</p>
          )}

          {res && (
            <div>
              <h3 className="card-sec">從{os.display}出發最常去・這一小時</h3>
              {res.top.length === 0 ? (
                <p className="card-note">這一小時每個方向都少於 10 人。</p>
              ) : (
                <ol className="card-rank commute-top">
                  {res.top.map((t, k) => {
                    const to = stations[t.station];
                    const you = t.station === di;
                    const max = res.top[0].avg || 1;
                    return (
                      <li key={to.id} data-you={you ? "" : undefined}>
                        <span className="n">
                          <span className="k num">{k + 1}</span>
                          {to.display}
                          {you && <span className="commute-you">你的迄站</span>}
                        </span>
                        <span className="v num">{formatCount(t.avg)}</span>
                        <span className="s" aria-hidden="true">
                          <i style={{ width: `${((t.avg / max) * 100).toFixed(1)}%`, background: you ? "var(--commute)" : "var(--flow-out)" }} />
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </>
      )}

      <p className="card-note">
        {monthLabel(month)}
        {day}平均{meta ? `（${meta.dayCounts[dayType]} 天）` : ""}。同路＝同一小時從{os.display}進站、在{ds.display}出站的人；
        起訖是進出站配對，不是實際乘車路徑。少於 10 人不顯示數字、不排名。
      </p>
    </CardFrame>
  );
}
