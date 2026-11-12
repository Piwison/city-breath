"""把彙總結果寫成網站讀的靜態小檔（資料契約見 docs/data-contract.md）。"""

from __future__ import annotations

import datetime as dt
import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path

from . import CONTRACT_VERSION, DAY_TYPES, HOURS, SUPPRESS_BELOW
from .aggregate import MonthAggregate
from .anomaly import detect as detect_anomalies, to_json as anomalies_json
from .cluster import ClusterResult, assign_types
from .district_flows import district_profiles, district_raw, inbound_raw, total_count
from .schedules import link as link_schedules
from .districts import DistrictResult
from .stations import Station
from .suppress import Suppressed, district_groups, inbound_groups, new_in_v3, od_groups, venue_origin_groups
from .suppress import apply as apply_suppression

SOURCE = {
    "name": "臺北捷運每日分時各站 OD 流量統計資料",
    "publisher": "臺北大眾捷運股份有限公司",
    "url": "https://data.gov.tw/dataset/128506",
    "license": "政府資料開放授權條款－第1版",
    "coordinates": "臺北捷運車站出入口座標 https://data.gov.tw/dataset/128428",
}


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


def suppress_od(
    od: dict[str, dict[str, list[list[float | None]]]],
    stations: list[Station],
    allday_raw: dict[tuple[str, int, int, str], float | None],
    service_hours: list[int],
    district_cells: DistrictCells | None = None,
    published_allday: Iterable[tuple] = (),
) -> Suppressed:
    """把起站×迄站×日型×小時的平均（與全日格、行政區格、來源區格）經 suppress.py 隱藏。

    回傳 ``Suppressed``；od 格的鍵是 ``(oi, di, t, h)``，全日格 ``("A", oi, di, t)``（``allday_raw``，
    只放要公開的配對），行政區格 ``("D", fi, ti, t, h)``，來源區格 ``("I", fi, di, t, h)``。
    這幾種格子彼此有共同的組（見 ``suppress.od_groups``、``district_groups``、``inbound_groups``），
    所以一定要在同一次 ``apply`` 一起處理。
    """
    index = {s.name: i for i, s in enumerate(stations)}
    origins = sorted(index[name] for name in od)
    recorded = [i for i, s in enumerate(stations) if s.exits_recorded]
    by_index = {index[name]: by_type for name, by_type in od.items()}
    raw: dict = {
        (oi, di, t, h): by_index[oi][t][h][di]
        for oi in origins
        for t in DAY_TYPES
        for h in service_hours
        for di in recorded
    }
    shown_cols = set(recorded)
    pairs = [k[1:] for k in allday_raw]
    if any(oi not in by_index or di not in shown_cols for oi, di, _ in pairs):
        raise ValueError("全日格只能是有分片的起站到出站有紀錄的迄站")
    raw.update(allday_raw)
    groups = od_groups(origins, recorded, pairs, service_hours)
    if district_cells is not None:
        args = (len(district_cells.index), district_cells.dest, origins, recorded,
                district_cells.station_district, service_hours)
        raw.update(district_cells.raw)
        raw.update(district_cells.inbound)
        groups += district_groups(*args)
        groups += inbound_groups(*args)
    return apply_suppression(raw, groups, prefer=new_in_v3(published_allday))


def districts_json(rows: list[dict], agg: MonthAggregate, stations: list[Station], codes: dict[str, str]) -> list[dict]:
    """districts.py 的每區內容加上 ``weekday``／``holiday`` 區總量（契約 v4，``district_profiles``）。

    沒有車站的區沒有資料，兩者為 ``None``。區總量是已公開站總量之和，不經 suppress.py（AD-3）。
    """
    totals = district_profiles(agg.station_hourly, stations, codes, agg.day_counts, agg.service_hours)
    return [{**d, "weekday": None, "holiday": None, **totals.get(d["id"], {})} for d in rows]


# ── district-flows.json（1.9；AD-7、AD-9、AD-10）與 inbound 的來源區格（1.13）────────


@dataclass
class DistrictCells:
    """行政區格與來源區格的原始平均與索引（彙總在 district_flows.py）。"""

    index: list[str]  # 列／欄的 8 碼代碼
    dest: list[int]  # 可當迄區的索引
    raw: dict  # ("D", fi, ti, t, h) → 未隱藏的平均
    station_district: list[int]  # 第 i 站所屬區的索引
    inbound: dict = field(default_factory=dict)  # ("I", fi, di, t, h) → 未隱藏的平均
    inbound_sums: dict = field(default_factory=dict)  # (di, t, h) → 各來源區整數總人次之和

    @classmethod
    def build(
        cls,
        od_hourly: list[tuple],
        stations: list[Station],
        codes: dict[str, str],
        day_counts: dict[str, int],
        service_hours: list[int],
    ) -> DistrictCells:
        index, dest, raw = district_raw(od_hourly, stations, codes, day_counts, service_hours)
        inbound, sums = inbound_raw(od_hourly, stations, codes, day_counts, service_hours)
        pos = {code: i for i, code in enumerate(index)}
        return cls(index, dest, raw, [pos[codes[s.name]] for s in stations], inbound, sums)


def district_flows_json(month: str, cells: DistrictCells, values: dict, service_hours: list[int]) -> dict:
    """``weekday[h][起區][迄區]``：平均人次或 ``None``；停止營運的小時整格 ``None``。"""
    n = len(cells.index)
    out = {"v": CONTRACT_VERSION, "month": month, "districts": cells.index}
    for t in DAY_TYPES:
        out[t] = [
            [[values.get(("D", fi, ti, t, h)) for ti in range(n)] for fi in range(n)] if h in service_hours else None
            for h in HOURS
        ]
    return out


TOP_DESTINATIONS = 10  # stations.json 的 topDestinations：全日最常去的站數（C5）
V2_TOP_DESTINATIONS = 5  # 契約 v2 公開過的前幾名（已在 git 歷史，算舊格）
TOP_ORIGINS_HOURLY = 5  # inbound 分片每小時列出的起站數（D1）
TOP_ORIGINS_ALLDAY = 10  # inbound 分片整天列出的起站數


def inbound_json(
    month: str,
    s: Station,
    index: dict[str, int],
    top_origins: dict[tuple[str, str], list[tuple[int, str]]],
    cells: DistrictCells,
    values: dict,
    service_hours: list[int],
    origins: list[int],
) -> dict:
    """一個迄站的 inbound 分片。所有數字取自 suppress.py 的結果 ``values``，不另外判斷門檻。

    - ``top[h]``：該小時隱藏後仍公開的 od 格中最大的 5 個起站（不含同站進出），值與 od 分片相同；
      只從公開格挑，所以排名不帶 od 分片以外的資訊。同值依站索引。
    - ``districts[h][i]``：從 ``cells.index[i]`` 這區的車站在 h 點進站、在此站出站的平均（含同站進出）。
    - ``allDay``：全日總人次前 10 的起站，值是全日格（與起站側的 topDestinations 同一格）。
    停止營運的小時（AD-5）整格 ``None``。
    """
    di = index[s.name]
    body: dict = {"v": CONTRACT_VERSION, "month": month, "dest": s.id, "districts": cells.index}
    for t in DAY_TYPES:
        tops, by_district = [], []
        for h in HOURS:
            if h not in service_hours:
                tops.append(None)
                by_district.append(None)
                continue
            shown = [(values[(oi, di, t, h)], oi) for oi in origins if oi != di and values[(oi, di, t, h)] is not None]
            shown.sort(key=lambda x: (-x[0], x[1]))
            tops.append([{"station": oi, "avg": v} for v, oi in shown[:TOP_ORIGINS_HOURLY]])
            by_district.append([values[("I", fi, di, t, h)] for fi in range(len(cells.index))])
        body[t] = {
            "top": tops,
            "districts": by_district,
            "allDay": [
                {"station": index[o], "avg": values[("A", index[o], di, t)]} for _, o in top_origins[(s.name, t)]
            ],
        }
    return body


def export_month(
    agg: MonthAggregate,
    stations: list[Station],
    out_root: Path,
    districts: DistrictResult,
    sources: list[dict] | None = None,
) -> dict:
    out = out_root / agg.month
    index = {s.name: i for i, s in enumerate(stations)}
    by_name = {s.name: s for s in stations}
    profiles = build_profiles(agg)
    for s in stations:  # 沒有任何進出紀錄的站也要有空曲線
        profiles.setdefault(s.name, {t: {"entries": [None] * 24, "exits": [None] * 24} for t in DAY_TYPES})

    # 車站類型：歸到 config 的固定中心（AD-27），不每月重新分群
    clusters: ClusterResult = assign_types(profiles, {s.name for s in stations if s.exits_recorded})

    # 起站 → 迄站 → 日型 → 小時 平均
    od: dict[str, dict[str, dict[str, list]]] = defaultdict(
        lambda: {t: [[None] * len(stations) for _ in HOURS] for t in DAY_TYPES}
    )
    # 全日加總用整數總人次（與加總順序無關，重跑結果相同）
    allday: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for o, d, day_type, h, avg in agg.od_hourly:
        od[o][day_type][h][index[d]] = avg
        allday[(o, day_type)][d] += total_count(avg, agg.day_counts[day_type])
    arriving: dict[tuple[str, str], dict[str, int]] = defaultdict(dict)  # (迄站, 日型) → 起站 → 全日總人次
    for (o, t), dests in allday.items():
        for d, n in dests.items():
            arriving[(d, t)][o] = n

    def top(counts: dict[str, int], own: str, n: int) -> list[tuple[int, str]]:
        """全日總人次前 n 名（不含同站進出、不含 0 人），同人次依站名倒序（與 v2 相同，可重現）。"""
        return sorted(((v, x) for x, v in counts.items() if x != own and v > 0), reverse=True)[:n]

    # 全日最常去的 10 站（stations.json 的 topDestinations，C5）與最常來的 10 站（inbound 的 allDay，D1）
    top_dests = {(s.name, t): top(allday[(s.name, t)], s.name, TOP_DESTINATIONS) for s in stations for t in DAY_TYPES}
    top_origins = {
        (s.name, t): top(arriving[(s.name, t)], s.name, TOP_ORIGINS_ALLDAY)
        for s in stations
        if s.exits_recorded
        for t in DAY_TYPES
    }
    # 全日格：兩邊列出的起訖配對，數字經 suppress.py（< 10 也要隱藏，並和各小時 od 格成組）
    allday_raw: dict[tuple[str, int, int, str], float | None] = {}
    for (name, t), ranked in top_dests.items():
        for n, d in ranked:
            allday_raw[("A", index[name], index[d], t)] = n / agg.day_counts[t]
    for (name, t), ranked in top_origins.items():
        for n, o in ranked:
            allday_raw[("A", index[o], index[name], t)] = n / agg.day_counts[t]

    district_cells = DistrictCells.build(
        agg.od_hourly, stations, districts.station_codes, agg.day_counts, agg.service_hours
    )
    # 欄組的前提：某迄站某小時各來源區之和 ＝ stations.json 公開的出站量（未四捨五入前完全相等）
    exits_total = {
        (index[name], t, h): total_count(ext, agg.day_counts[t]) for name, t, h, _, ext in agg.station_hourly
    }
    for (di, t, h), n in district_cells.inbound_sums.items():
        if n != exits_total.get((di, t, h), 0):
            raise RuntimeError(f"{stations[di].name} {t} {h} 點：來源區合計 {n} ≠ 出站 {exits_total.get((di, t, h), 0)}")
    # v2 已公開的全日格（topDestinations 前 5）算舊格：不為了保護新格而改藏它們（AD-3）
    published_allday = [
        ("A", index[name], index[d], t) for (name, t), ranked in top_dests.items() for _, d in ranked[:V2_TOP_DESTINATIONS]
    ]
    suppression = suppress_od(od, stations, allday_raw, agg.service_hours, district_cells, published_allday)
    od_values = suppression.values

    sizes: dict[str, int] = {}

    # od/{id}.json：選了起站才載入的分片；格子一律取經 suppress.py 的值
    recorded = [i for i, s in enumerate(stations) if s.exits_recorded]
    for name, by_type in od.items():
        s = by_name[name]
        oi = index[name]
        shard = {"v": CONTRACT_VERSION, "origin": s.id, "month": agg.month}
        for t in DAY_TYPES:
            rows = []
            for h in HOURS:
                if h not in agg.service_hours:
                    rows.append(None)
                    continue
                row = [None] * len(stations)
                for di in recorded:
                    row[di] = od_values[(oi, di, t, h)]
                rows.append(row)
            shard[t] = rows
            shard[t + "Departures"] = [
                round(sum(v for v in row if v)) if h in agg.service_hours else None for h, row in enumerate(by_type[t])
            ]
        sizes[f"od/{s.id}.json"] = _write(out / "od" / f"{s.id}.json", shard)

    # district-flows.json：行政區×行政區×小時×日型（數字與 od 分片一起經 suppress.py）
    sizes["district-flows.json"] = _write(
        out / "district-flows.json",
        district_flows_json(agg.month, district_cells, od_values, agg.service_hours),
    )

    # inbound/{id}.json：打開車站卡的「誰來」才載入（1.13，AD-6、AD-10）；環狀線站沒有出站紀錄，不產生
    inbound_dir = out / "inbound"
    if inbound_dir.is_dir():  # 整個資料夾重產，不留舊檔
        for old in inbound_dir.glob("*.json"):
            old.unlink()
    origin_indices = sorted(index[name] for name in od)
    for s in stations:
        if not s.exits_recorded:
            continue
        shard = inbound_json(agg.month, s, index, top_origins, district_cells, od_values, agg.service_hours,
                             origin_indices)
        sizes[f"inbound/{s.id}.json"] = _write(inbound_dir / f"{s.id}.json", shard)

    # stations.json：主畫面與車站個性卡
    st_out = []
    for s in stations:
        p = profiles[s.name]
        tops = {
            t: [{"station": index[d], "avg": od_values[("A", index[s.name], index[d], t)]} for _, d in top_dests[(s.name, t)]]
            for t in DAY_TYPES
        }
        type_id = clusters.assignment.get(s.name)
        st_out.append(
            {
                "id": s.id,
                "name": s.name,
                "display": s.display,
                "lon": s.lon,
                "lat": s.lat,
                "exitsRecorded": s.exits_recorded,
                "district": districts.station_codes[s.name],
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

    # districts.json：行政區界線與每區車站（AD-9、AD-10；判定在 districts.py），v4 起加區總量（3.20，AD-7）
    sizes["districts.json"] = _write(
        out / "districts.json",
        {"v": CONTRACT_VERSION, "month": agg.month,
         "districts": districts_json(districts.districts, agg, stations, districts.station_codes)},
    )

    # v1 的 daily.json 在 7.1 移除（AD-10）：每日全市總量與異常日改在 events.json（export_events）
    stale = out / "daily.json"
    if stale.exists():
        stale.unlink()

    meta = {
        "v": CONTRACT_VERSION,
        "month": agg.month,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "source": SOURCE,
        "sources": sources or [],
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
            "若某組起訖只有一格不顯示、可由公開的總量減出，同組最小的一格也會一併不顯示。",
            "車站所屬行政區依國土測繪中心界線與車站出口平均座標判定，位在區界上的車站可能與一般認知不同。",
            "行政區起訖的平均是區內各站總人次先加總再除以天數；抵達環狀線車站的人次不在資料中，"
            "區內有環狀線車站的行政區，「誰來」會偏少。",
        ],
    }
    sizes["meta.json"] = _write(out / "meta.json", meta)

    months_path = out_root / "months.json"
    months = json.loads(months_path.read_text("utf-8"))["months"] if months_path.exists() else []
    months = sorted(set(months) | {agg.month})
    _write(months_path, {"v": CONTRACT_VERSION, "months": months, "latest": months[-1]})

    return {
        "sizes": sizes,
        "meta": meta,
        "clusters": clusters,
        "suppression": suppression_summary(suppression),
    }


# ── daily/{YYYY-MM-DD}.json（1.10；AD-3、AD-5、AD-6、AD-10、AD-13、AD-15）──────────
# 每天一檔，進入某一天才載入。站層級總量（每站每小時進、出）不受 < 10 限制；場館站的
# 「來源行政區 × 小時」到站人次是起訖數字，經 suppress.py（venue_origin_groups）隱藏。


def export_daily(
    agg: MonthAggregate,
    stations: list[Station],
    districts: DistrictResult,
    venue_stations: dict[int, list[str]],
    out_root: Path,
) -> dict:
    """寫出 ``{month}/daily/{date}.json``；``venue_stations`` 是 venues.resolve_venues 的結果。

    回傳 ``{"sizes": {相對路徑: bytes}, "suppression": {...}}``。
    """
    out = out_root / agg.month / "daily"
    if out.is_dir():  # 整個資料夾重產，不留舊檔
        for old in out.glob("*.json"):
            old.unlink()
    n = len(stations)
    index = {s.name: i for i, s in enumerate(stations)}
    code_of = [districts.station_codes[s.name] for s in stations]  # AD-9：區只來自 districts.py
    origin_districts = sorted(set(code_of))
    for vi in venue_stations:
        if not stations[vi].exits_recorded:
            raise ValueError(f"場館站 {stations[vi].name} 的出站不在資料中，無法輸出來源行政區")

    entries = {d: [[0] * 24 for _ in range(n)] for d, _ in agg.days}
    exits = {d: [[0] * 24 for _ in range(n)] for d, _ in agg.days}
    city = {d: [0] * 24 for d, _ in agg.days}
    for d, name, h, ent, ext in agg.daily_hourly:
        i = index[name]
        entries[d][i][h] = int(ent)
        exits[d][i][h] = int(ext)
        city[d][h] += int(ent)

    arrivals: dict[tuple, int] = defaultdict(int)  # (date, 場館站, 來源區, h) → 人次
    for d, o, dest, h, cnt in agg.daily_arrivals:
        vi = index[dest]
        if vi in venue_stations:
            arrivals[(d, vi, code_of[index[o]], h)] += int(cnt)

    sizes: dict[str, int] = {}
    stats = {"cells": 0, "primary": 0, "secondary": 0}
    for d, day_type in agg.days:
        open_hours = [h for h in HOURS if city[d][h] > 0]  # 當日全市沒有人次的小時＝停止營運（AD-5）
        closed = [h for h in HOURS if h not in open_hours]
        ent_out, ext_out = entries[d], exits[d]
        for i in range(n):
            for h in closed:
                ent_out[i][h] = None
                ext_out[i][h] = None

        raw = {
            (vi, dc, h): arrivals.get((d, vi, dc, h))
            for vi in venue_stations
            for dc in origin_districts
            for h in open_hours
        }
        for vi in venue_stations:  # 各來源區之和必須等於公開的出站量，否則組定義不成立
            for h in open_hours:
                total = sum(raw[(vi, dc, h)] or 0 for dc in origin_districts)
                if total != ext_out[vi][h]:
                    raise RuntimeError(f"{d} {stations[vi].name} {h} 點：來源區合計 {total} ≠ 出站 {ext_out[vi][h]}")
        sup = apply_suppression(raw, venue_origin_groups(list(venue_stations), origin_districts, open_hours))
        stats["cells"] += len(raw)
        stats["primary"] += sup.primary_hidden
        stats["secondary"] += len(sup.secondary_hidden)

        venues_out = []
        for vi, ids in venue_stations.items():
            origins, rows = [], []
            for dc in origin_districts:
                row = [sup.values[(vi, dc, h)] if h in open_hours else None for h in HOURS]
                if any(v is not None for v in row):  # 整天都不公開的區不列出（等同全為 null）
                    origins.append(dc)
                    rows.append(row)
            venues_out.append({"station": vi, "venueIds": ids, "origins": origins, "arrivals": rows})

        body = {
            "v": CONTRACT_VERSION,
            "month": agg.month,
            "date": d.isoformat(),
            "dayType": day_type,
            "entries": ent_out,
            "exits": [row if s.exits_recorded else None for s, row in zip(stations, ext_out)],
            "venues": venues_out,
        }
        sizes[f"daily/{d.isoformat()}.json"] = _write(out / f"{d.isoformat()}.json", body)
    return {"sizes": sizes, "suppression": stats}


# ── events.json（7.1；AD-2、AD-4、AD-10、AD-13、AD-14）──────────────────────────
# 異常日與「平常」只在 anomaly.py 判定，這裡只負責寫檔。events[]（場館檔期、人工活動）
# 由 7.2／7.3 填入並配對 anomalies[].eventIds；在那之前一律為空陣列（前端顯示「原因未查證」）。


def export_events(
    agg: MonthAggregate,
    stations: list[Station],
    out_root: Path,
    schedules: list | None = None,
    venue_stations: dict[int, list[str]] | None = None,
) -> dict:
    """寫出 ``{month}/events.json``；回傳 ``{"sizes", "detection", "linked"}``。

    ``schedules`` 是 ``schedules.load()`` 的場館檔期（7.2），和站級異常配對後寫進 ``events[]``
    與 ``anomalies[].eventIds``（AD-13、AD-14）。
    """
    det = detect_anomalies(agg.days, agg.daily_station, stations)
    linked = link_schedules(schedules or [], det.anomalies, venue_stations or {})
    body = {"v": CONTRACT_VERSION, "month": agg.month, **anomalies_json(det, linked.event_ids), "events": linked.events}
    return {"sizes": {"events.json": _write(out_root / agg.month / "events.json", body)}, "detection": det,
            "linked": linked}


def suppression_summary(suppression: Suppressed) -> dict[str, dict[str, int]]:
    """build 摘要：od 格、全日格、行政區格、來源區格各自的格數、主要隱藏、次要隱藏。"""
    kinds = {"A": "allday", "D": "district", "I": "inbound"}
    out = {kind: {"cells": 0, "primary": 0, "secondary": 0} for kind in ("od", "allday", "district", "inbound")}
    kind = lambda k: kinds.get(k[0], "od")  # noqa: E731
    for k in suppression.values:
        out[kind(k)]["cells"] += 1
    for k in suppression.primary_keys:
        out[kind(k)]["primary"] += 1
    for k in suppression.secondary_hidden:
        out[kind(k)]["secondary"] += 1
    return out


# ── basemap.json（1.12；AD-1、AD-12、AD-21、AD-25）──────────────────────────────
# 不分月份，只由 basemap.py 組出內容；形狀見 docs/data-contract.md 的 basemap.json。


def export_basemap(body: dict, out_root: Path) -> int:
    """寫出 ``web/public/data/basemap.json``，回傳 bytes。"""
    assert body["v"] == CONTRACT_VERSION and "basemapRevision" in body
    return _write(out_root / "basemap.json", body)
