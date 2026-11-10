"""行政區×行政區×小時×日型的起訖平均（architecture AD-7、AD-9、AD-10）。

站屬於哪一區只看 1.8 判定的 ``DistrictResult.station_codes``，這裡不再推算。

平均的分母是該月該日型的天數；行政區平均由站的「總人次」先加總再除（AD-7），不是把站平均相加。
``agg.od_hourly`` 的平均是 DuckDB 算的 ``整數總人次 ÷ 天數``，``round(avg * 天數)`` 可以精確還原
整數總人次，所以加總全用整數做，結果與加總順序無關（同輸入同輸出）。

迄站只算出站有紀錄的站：環狀線車站的出站不在原始資料中，算進去只會是 0，也不能拿來保護別格。
回傳的是未四捨五入、未隱藏的平均；門檻與次要隱藏一律交給 suppress.py。
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping

from . import DAY_TYPES
from .stations import Station


def total_count(avg: float, days: int) -> int:
    """把 DuckDB 給的平均還原成整數總人次（平均 = 總人次 ÷ 天數）。"""
    return round(avg * days)


def district_index(stations: list[Station], codes: Mapping[str, str]) -> list[str]:
    """district-flows.json 的列／欄：有車站的區，依 8 碼代碼排序。"""
    return sorted({codes[s.name] for s in stations})


def district_totals(
    od_hourly: Iterable[tuple],
    stations: list[Station],
    codes: Mapping[str, str],
    day_counts: Mapping[str, int],
) -> dict[tuple[str, str, str, int], int]:
    """``(起區代碼, 迄區代碼, 日型, 小時)`` → 整數總人次；迄站只算 ``exits_recorded``。"""
    by_name = {s.name: s for s in stations}
    totals: dict[tuple[str, str, str, int], int] = defaultdict(int)
    for o, d, day_type, h, avg in od_hourly:
        if avg is None or not by_name[d].exits_recorded:
            continue
        totals[(codes[o], codes[d], day_type, h)] += total_count(avg, day_counts[day_type])
    return dict(totals)


def district_raw(
    od_hourly: Iterable[tuple],
    stations: list[Station],
    codes: Mapping[str, str],
    day_counts: Mapping[str, int],
    service_hours: list[int],
) -> tuple[list[str], list[int], dict[tuple[str, int, int, str, int], float | None]]:
    """回傳（行政區代碼索引、可當迄區的索引、suppress.py 用的原始平均）。

    原始平均的鍵是 ``("D", 起區索引, 迄區索引, 日型, 小時)``，只含營運小時；沒人搭的格是 ``None``。
    迄區只列區內至少有一個出站有紀錄的站的區（目前每區都有）。
    """
    index = district_index(stations, codes)
    pos = {code: i for i, code in enumerate(index)}
    dest = sorted({pos[codes[s.name]] for s in stations if s.exits_recorded})
    totals = district_totals(od_hourly, stations, codes, day_counts)
    raw: dict[tuple[str, int, int, str, int], float | None] = {}
    for t in DAY_TYPES:
        k = day_counts.get(t, 0)
        for h in service_hours:
            for fi, f in enumerate(index):
                for ti in dest:
                    n = totals.get((f, index[ti], t, h))
                    raw[("D", fi, ti, t, h)] = n / k if n else None
    return index, dest, raw


def inbound_raw(
    od_hourly: Iterable[tuple],
    stations: list[Station],
    codes: Mapping[str, str],
    day_counts: Mapping[str, int],
    service_hours: list[int],
) -> tuple[dict[tuple[str, int, int, str, int], float | None], dict[tuple[int, str, int], int]]:
    """inbound 分片的來源區格（1.13）：``("I", 來源區索引, 迄站索引, 日型, 小時)`` → 未隱藏的平均。

    來源區是起站所屬的區（含迄站自己，即同站進出），區的索引同 ``district_index``；迄站只算
    ``exits_recorded``，只含營運小時，沒人搭的格是 ``None``。同時回傳 ``(迄站索引, 日型, 小時)`` →
    各來源區整數總人次之和，供呼叫端檢查它等於公開的出站量（欄組成立的前提）。
    """
    index = district_index(stations, codes)
    pos = {code: i for i, code in enumerate(index)}
    station_pos = {s.name: i for i, s in enumerate(stations)}
    recorded = [i for i, s in enumerate(stations) if s.exits_recorded]
    totals: dict[tuple[int, int, str, int], int] = defaultdict(int)
    for o, d, day_type, h, avg in od_hourly:
        di = station_pos[d]
        if avg is None or not stations[di].exits_recorded:
            continue
        totals[(pos[codes[o]], di, day_type, h)] += total_count(avg, day_counts[day_type])
    raw: dict[tuple[str, int, int, str, int], float | None] = {}
    sums: dict[tuple[int, str, int], int] = defaultdict(int)
    for t in DAY_TYPES:
        k = day_counts.get(t, 0)
        for h in service_hours:
            for fi in range(len(index)):
                for di in recorded:
                    n = totals.get((fi, di, t, h))
                    raw[("I", fi, di, t, h)] = n / k if n else None
                    sums[(di, t, h)] += n or 0
    return raw, dict(sums)
