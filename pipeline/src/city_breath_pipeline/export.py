"""把彙總結果寫成網站讀的靜態小檔（資料契約見 docs/data-contract.md）。"""

from __future__ import annotations

import datetime as dt
import json
import statistics
from collections import defaultdict
from pathlib import Path

from . import CONTRACT_VERSION, DAY_TYPES, HOURS, SUPPRESS_BELOW, TOP_ARCS_PER_HOUR
from .aggregate import MonthAggregate
from .cluster import ClusterResult, cluster_stations
from .stations import Station

SOURCE = {
    "name": "臺北捷運每日分時各站 OD 流量統計資料",
    "publisher": "臺北大眾捷運股份有限公司",
    "url": "https://data.gov.tw/dataset/128506",
    "license": "政府資料開放授權條款－第1版",
    "coordinates": "臺北捷運車站出入口座標 https://data.gov.tw/dataset/128428",
}


def suppress(avg: float | None) -> int | None:
    """起訖人次：四捨五入後少於 10 一律不給數字（AD-3）。"""
    if avg is None:
        return None
    v = round(avg)
    return v if v >= SUPPRESS_BELOW else None


def _write(path: Path, obj) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    path.write_text(data, encoding="utf-8")
    return len(data.encode("utf-8"))


def build_profiles(agg: MonthAggregate) -> dict[str, dict]:
    service = set(agg.service_hours)
    blank = lambda: [None if h not in service else 0 for h in HOURS]  # noqa: E731
    prof: dict[str, dict] = defaultdict(lambda: {t: {"entries": blank(), "exits": blank()} for t in DAY_TYPES})
    for name, day_type, h, ent, ext in agg.station_hourly:
        p = prof[name][day_type]
        p["entries"][h] = round(ent)
        p["exits"][h] = round(ext)
    return dict(prof)


def export_month(agg: MonthAggregate, stations: list[Station], out_root: Path) -> dict:
    out = out_root / agg.month
    index = {s.name: i for i, s in enumerate(stations)}
    by_name = {s.name: s for s in stations}
    profiles = build_profiles(agg)
    for s in stations:  # 沒有任何進出紀錄的站也要有空曲線
        profiles.setdefault(s.name, {t: {"entries": [None] * 24, "exits": [None] * 24} for t in DAY_TYPES})

    clusters: ClusterResult = cluster_stations(
        profiles, {s.name for s in stations if s.exits_recorded}, agg.service_hours
    )

    # 起站 → 迄站 → 日型 → 小時 平均
    od: dict[str, dict[str, dict[str, list]]] = defaultdict(
        lambda: {t: [[None] * len(stations) for _ in HOURS] for t in DAY_TYPES}
    )
    allday: dict[tuple[str, str], dict[str, float]] = defaultdict(lambda: defaultdict(float))
    per_hour: dict[tuple[str, int], list[tuple[float, int, int]]] = defaultdict(list)
    for o, d, day_type, h, avg in agg.od_hourly:
        oi, di = index[o], index[d]
        od[o][day_type][h][di] = avg
        allday[(o, day_type)][d] += avg
        if o != d:
            per_hour[(day_type, h)].append((avg, oi, di))

    sizes: dict[str, int] = {}

    # od/{id}.json：選了起站才載入的分片
    for name, by_type in od.items():
        s = by_name[name]
        shard = {"v": CONTRACT_VERSION, "origin": s.id, "month": agg.month}
        for t in DAY_TYPES:
            shard[t] = [[suppress(v) for v in row] if h in agg.service_hours else None for h, row in enumerate(by_type[t])]
            shard[t + "Departures"] = [
                round(sum(v for v in row if v)) if h in agg.service_hours else None for h, row in enumerate(by_type[t])
            ]
        sizes[f"od/{s.id}.json"] = _write(out / "od" / f"{s.id}.json", shard)

    # flows.json：每小時前 200 組起訖弧線
    flows = {"v": CONTRACT_VERSION, "month": agg.month, "top": TOP_ARCS_PER_HOUR}
    for t in DAY_TYPES:
        flows[t] = []
        for h in HOURS:
            top = sorted(per_hour.get((t, h), []), reverse=True)[:TOP_ARCS_PER_HOUR]
            flows[t].append([[oi, di, round(a)] for a, oi, di in top if round(a) >= SUPPRESS_BELOW])
    sizes["flows.json"] = _write(out / "flows.json", flows)

    # stations.json：主畫面與車站個性卡
    st_out = []
    for s in stations:
        p = profiles[s.name]
        tops = {}
        for t in DAY_TYPES:
            dests = sorted(((v, d) for d, v in allday[(s.name, t)].items() if d != s.name), reverse=True)[:5]
            tops[t] = [{"station": index[d], "avg": round(v)} for v, d in dests]
        type_id = clusters.assignment.get(s.name)
        st_out.append(
            {
                "id": s.id,
                "name": s.name,
                "display": s.display,
                "lon": s.lon,
                "lat": s.lat,
                "exitsRecorded": s.exits_recorded,
                "type": type_id,
                "weekday": p["weekday"],
                "holiday": p["holiday"],
                "topDestinations": tops,
            }
        )
    sizes["stations.json"] = _write(
        out / "stations.json",
        {"v": CONTRACT_VERSION, "month": agg.month, "stations": st_out, "types": clusters.types},
    )

    # daily.json：每日每站總量＋城市級異常候選（與同星期幾中位數比較）
    dates = [d for d, _ in agg.days]
    day_type = {d: t for d, t in agg.days}
    city = defaultdict(int)
    per_station: dict[str, dict[dt.date, int]] = defaultdict(dict)
    for d, name, ent, _ext in agg.daily_station:
        city[d] += ent
        per_station[name][d] = ent
    by_dow: dict[int, list[int]] = defaultdict(list)
    for d in dates:
        by_dow[d.weekday()].append(city[d])
    anomalies = []
    for d in dates:
        med = statistics.median(by_dow[d.weekday()])
        ratio = city[d] / med if med else 1
        if abs(ratio - 1) >= 0.15:
            anomalies.append({"date": d.isoformat(), "ratio": round(ratio, 3), "dayType": day_type[d]})
    sizes["daily.json"] = _write(
        out / "daily.json",
        {
            "v": CONTRACT_VERSION,
            "month": agg.month,
            "dates": [d.isoformat() for d in dates],
            "dayTypes": [day_type[d] for d in dates],
            "cityEntries": [city[d] for d in dates],
            "stations": {by_name[n].id: [per_station[n].get(d, 0) for d in dates] for n in per_station if n in by_name},
            "anomalyCandidates": anomalies,
        },
    )

    meta = {
        "v": CONTRACT_VERSION,
        "month": agg.month,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "dayCounts": agg.day_counts,
        "serviceHours": agg.service_hours,
        "stationCount": len(stations),
        "suppressBelow": SUPPRESS_BELOW,
        "rawRows": agg.raw_rows,
        "droppedRows": agg.dropped_rows,
        "clustering": {"k": clusters.k, "silhouette": clusters.silhouette},
        "notes": [
            "環狀線（新北捷運營運）車站只出現在進站欄位，出站人次未計入本資料。",
            "起訖人次為進出站配對，不是實際乘車路徑。",
            f"起訖平均人次少於 {SUPPRESS_BELOW} 一律不顯示數字。",
        ],
    }
    sizes["meta.json"] = _write(out / "meta.json", meta)

    months_path = out_root / "months.json"
    months = json.loads(months_path.read_text("utf-8"))["months"] if months_path.exists() else []
    months = sorted(set(months) | {agg.month})
    _write(months_path, {"v": CONTRACT_VERSION, "months": months, "latest": months[-1]})

    return {"sizes": sizes, "meta": meta, "clusters": clusters}
