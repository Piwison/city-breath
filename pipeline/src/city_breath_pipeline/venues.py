"""場館與對應車站（pipeline/config/venues.csv，architecture AD-13）。

場館站的站名經 ``stations.canonical()`` 正規化（AD-2），對不到車站就讓 build 失敗。
逐日檔（1.10）用它決定哪些站要輸出「來源行政區 × 小時」；之後的活動匯入只讀這份表。
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from .stations import CONFIG, Station, canonical

VENUES = CONFIG / "venues.csv"


class VenueError(ValueError):
    """venues.csv 的站名對不到車站，或場館站的出站不在資料中。"""


@dataclass(frozen=True)
class Venue:
    id: str
    name: str
    station: str  # 正規站名
    source: str


def load_venues(aliases: dict[str, str], path: Path = VENUES) -> list[Venue]:
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    venues = [Venue(r["venue_id"].strip(), r["venue_name"].strip(), canonical(r["station_name"], aliases),
                    r.get("source", "").strip()) for r in rows]
    ids = [v.id for v in venues]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        raise VenueError(f"venues.csv 有重複的 venue_id：{dup}")
    return venues


def resolve_venues(venues: list[Venue], stations: list[Station]) -> dict[int, list[str]]:
    """場館站的 ``stations.json`` 索引 → 該站的 venue_id（依 venues.csv 順序）。

    站名對不到、或該站出站未入檔（環狀線）都丟 ``VenueError``：後者沒有到站人次可以算。
    """
    index = {s.name: i for i, s in enumerate(stations)}
    unknown = sorted({v.station for v in venues if v.station not in index})
    if unknown:
        raise VenueError(f"venues.csv 的站名對不到車站：{unknown}（請用正規站名，或補 config/station_aliases.csv）")
    partial = sorted({v.station for v in venues if not stations[index[v.station]].exits_recorded})
    if partial:
        raise VenueError(f"venues.csv 的場館站出站人次不在資料中（環狀線），無法輸出來源行政區：{partial}")
    out: dict[int, list[str]] = {}
    for v in venues:
        out.setdefault(index[v.station], []).append(v.id)
    return dict(sorted(out.items()))
