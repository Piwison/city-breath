"""車站主檔：站名正規化、穩定 ID、座標。

站名正規化只在這裡做（AD-2）。網站與其他模組只認 canonical 名稱與 station id。
"""

from __future__ import annotations

import csv
import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "config"


def station_id(canonical: str) -> str:
    """由正規站名產生穩定、ASCII 的 ID（跨月份不變，只要站名不變）。"""
    return "s" + hashlib.sha1(canonical.encode("utf-8")).hexdigest()[:8]


def load_aliases(path: Path = CONFIG / "station_aliases.csv") -> dict[str, str]:
    with path.open(encoding="utf-8") as f:
        return {r["raw_name"]: r["canonical"] for r in csv.DictReader(f)}


def load_display_names(path: Path = CONFIG / "station_names.csv") -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8") as f:
        return {r["canonical"]: r for r in csv.DictReader(f)}


def canonical(raw: str, aliases: dict[str, str]) -> str:
    return aliases.get(raw.strip(), raw.strip())


# 「頂埔站出口1」「台北車站M5」→ 頂埔、台北車（後者由 station_names.csv 對回台北車站）
_EXIT_RE = re.compile(r"^(.+?)站(?:出口|[A-Z]\d)")


def load_exit_coordinates(path: Path) -> dict[str, tuple[float, float]]:
    """臺北捷運車站出入口座標（data.gov.tw 128428，Big5）→ 每站出口平均座標。"""
    sums: dict[str, list[float]] = {}
    with path.open(encoding="big5", errors="replace") as f:
        for row in csv.DictReader(f):
            m = _EXIT_RE.match(row["出入口名稱"])
            name = m.group(1) if m else row["出入口名稱"]
            acc = sums.setdefault(name, [0.0, 0.0, 0])
            acc[0] += float(row["經度"])
            acc[1] += float(row["緯度"])
            acc[2] += 1
    return {k: (v[0] / v[2], v[1] / v[2]) for k, v in sums.items()}


@dataclass
class Station:
    id: str
    name: str
    display: str
    lon: float
    lat: float
    exits_recorded: bool
    extra: dict = field(default_factory=dict)


def build_stations(
    origin_names: set[str],
    dest_names: set[str],
    exit_coords: dict[str, tuple[float, float]],
    display: dict[str, dict[str, str]] | None = None,
) -> list[Station]:
    """origin_names / dest_names 皆為正規化後的名稱。"""
    display = display if display is not None else load_display_names()
    stations: list[Station] = []
    missing: list[str] = []
    for name in sorted(origin_names | dest_names):
        meta = display.get(name, {})
        exit_name = meta.get("exit_name") or name
        coord = exit_coords.get(exit_name)
        if coord is None:
            missing.append(name)
            continue
        lon, lat = coord
        if name == "Y板橋":  # 與板南線板橋共用出口座標，略為錯開避免光點重疊
            lon += 0.0006
        stations.append(
            Station(
                id=station_id(name),
                name=name,
                display=meta.get("display") or name,
                lon=round(lon, 6),
                lat=round(lat, 6),
                exits_recorded=name in dest_names,
            )
        )
    if missing:
        raise ValueError(f"找不到座標的車站：{missing}，請補 config/station_names.csv")
    return stations
