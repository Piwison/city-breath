"""異常日與「平常」（AD-14）：整個專案只在這裡判定。

「平常」＝同月同星期幾、排除當日本身的中位數；全市級與站級用同一個 ``normal()``。

- 全市級：當日全市進站與平常差 ≥ 15%（多或少都算）。AD-4 的假日檢查也看這一層。
- 站級（7.2 定案）：某站當日進站或出站同時滿足
  1. ≥ 平常 × 1.3（多三成）；
  2. 多出 ≥ 1,000 人（擋住小站的小人數）；
  3. modified z-score ≥ 3.5（Iglewicz & Hoaglin 1993）：把該站該方向整月每天的「當日 ÷ 平常」倍數
     當成一組，M = 0.6745 × (倍數 − 中位數) ÷ MAD。整月本來就大起大落的站（例如開學讓同星期幾的
     中位數混進放假日的輔大）不會因此被當成異常；MAD 為 0（每天都一樣）時這條視為通過。
  只抓「多」：站的「少」多半是全市假日，已由全市級呈現。

人次是當日總量，小時歸在進站時段（AD-15）；站的參照是 ``stations.json`` 的陣列索引（AD-2）。
"""

from __future__ import annotations

import datetime as dt
import statistics
from collections import defaultdict
from dataclasses import dataclass
from fractions import Fraction

from .stations import Station

# 門檻用分數做精確比較：剛好 15%、剛好 1.3 倍、剛好 z = 3.5 都算（浮點的 1.15 − 1 會略小於 0.15）
CITY_MIN_CHANGE = Fraction(15, 100)
STATION_MIN_RATIO = Fraction(13, 10)
STATION_MIN_EXTRA = 1000
STATION_MIN_Z = Fraction(7, 2)
MAD_SCALE = Fraction(6745, 10000)  # 常態分布下 MAD ≈ 0.6745σ
THRESHOLDS = {
    "city": float(CITY_MIN_CHANGE),
    "stationRatio": float(STATION_MIN_RATIO),
    "stationExtra": STATION_MIN_EXTRA,
    "stationZ": float(STATION_MIN_Z),
    "provisional": False,  # 7.2 定案
}


def normal(series: dict[dt.date, int], day: dt.date) -> float | None:
    """同月同星期幾、排除 ``day`` 本身的中位數；沒有其他同星期幾的日子時為 ``None``。

    ``series`` 只放同一個月的日子（每月各自計算，不跨月）。
    """
    others = sorted(v for d, v in series.items() if d != day and d.weekday() == day.weekday())
    return statistics.median(others) if others else None


@dataclass(frozen=True)
class Day:
    date: dt.date
    day_type: str
    city_entries: int
    city_ratio: float | None  # 對平常的倍數；無基準時 None


@dataclass(frozen=True)
class Anomaly:
    date: dt.date
    station: int | None  # None＝全市級
    measure: str  # "entries"｜"exits"；全市級固定 "entries"
    value: int
    baseline: float

    @property
    def ratio(self) -> float:
        return self.value / self.baseline


@dataclass(frozen=True)
class Detection:
    days: list[Day]
    anomalies: list[Anomaly]  # 依日期、再依站索引（全市級在前）排序

    def city(self) -> list[Anomaly]:
        return [a for a in self.anomalies if a.station is None]

    def stations(self) -> list[Anomaly]:
        return [a for a in self.anomalies if a.station is not None]


def is_city_anomaly(value: int, baseline: float | None) -> bool:
    if not baseline:
        return False
    base = Fraction(baseline)  # 中位數只會是整數或 .5，轉分數不失真
    return abs(value - base) >= CITY_MIN_CHANGE * base


def is_station_anomaly(value: int, baseline: float | None, z: Fraction | None = None) -> bool:
    """倍數與人數兩條；``z`` 是 ``station_z()`` 的結果（``None``＝MAD 為 0，該條視為通過）。"""
    if not baseline:
        return False
    base = Fraction(baseline)
    big = value >= STATION_MIN_RATIO * base and value - base >= STATION_MIN_EXTRA
    return big and (z is None or z >= STATION_MIN_Z)


def station_z(series: dict[dt.date, int]) -> dict[dt.date, Fraction | None]:
    """整月每天「當日 ÷ 平常」倍數的 modified z-score；沒有基準的日子不在結果裡。

    值為 ``None`` 表示該站該方向的 MAD 為 0（倍數每天都一樣），任何偏離都算突出。
    """
    ratios = {}
    for d, v in series.items():
        base = normal(series, d)
        if base:
            ratios[d] = Fraction(v) / Fraction(base)
    if not ratios:
        return {}
    med = statistics.median(sorted(ratios.values()))
    mad = statistics.median(sorted(abs(r - med) for r in ratios.values()))
    return {d: (MAD_SCALE * (r - med) / mad if mad else None) for d, r in ratios.items()}


def detect(
    days: list[tuple[dt.date, str]],
    daily_station: list[tuple],
    stations: list[Station],
) -> Detection:
    """``days``：(date, dayType)；``daily_station``：(date, 正規站名, 進站, 出站)，即 MonthAggregate 的同名欄位。"""
    dates = sorted(d for d, _ in days)
    day_type = dict(days)
    index = {s.name: i for i, s in enumerate(stations)}
    zero = {d: 0 for d in dates}
    entries: dict[int, dict[dt.date, int]] = defaultdict(lambda: dict(zero))
    exits: dict[int, dict[dt.date, int]] = defaultdict(lambda: dict(zero))
    for d, name, ent, ext in daily_station:
        i = index[name]
        entries[i][d] += int(ent)
        exits[i][d] += int(ext)
    city = dict(zero)
    for series in entries.values():
        for d, v in series.items():
            city[d] += v

    out_days: list[Day] = []
    found: list[Anomaly] = []
    for d in dates:
        base = normal(city, d)
        out_days.append(Day(d, day_type[d], city[d], city[d] / base if base else None))
        if is_city_anomaly(city[d], base):
            found.append(Anomaly(d, None, "entries", city[d], base))

    for i, s in enumerate(stations):
        measures = [("entries", entries.get(i, zero))]
        if s.exits_recorded:  # 環狀線站的出站不在資料中（AD-10 已知狀況）
            measures.append(("exits", exits.get(i, zero)))
        zs = {measure: station_z(series) for measure, series in measures}
        for d in dates:
            hits = []
            for measure, series in measures:
                base = normal(series, d)
                if d in zs[measure] and is_station_anomaly(series[d], base, zs[measure][d]):
                    hits.append(Anomaly(d, i, measure, series[d], base))
            if hits:  # 同站同日進、出都過門檻時取倍數大的一邊（同倍數取進站）
                found.append(max(hits, key=lambda a: (a.ratio, a.measure == "entries")))

    found.sort(key=lambda a: (a.date, -1 if a.station is None else a.station))
    return Detection(out_days, found)


def to_json(det: Detection, event_ids: dict[tuple[dt.date, int], list[str]] | None = None) -> dict:
    """``events.json`` 的 ``days``、``anomalies`` 與 ``thresholds``（``events`` 由呼叫端加）。

    ``event_ids``：(日期, 站索引) → ``events[].id``，由 ``schedules.link()`` 配對（7.2）。
    """
    event_ids = event_ids or {}
    return {
        "thresholds": THRESHOLDS,
        "days": [
            {
                "date": x.date.isoformat(),
                "dayType": x.day_type,
                "cityEntries": x.city_entries,
                "cityRatio": None if x.city_ratio is None else round(x.city_ratio, 3),
            }
            for x in det.days
        ],
        "anomalies": [
            {
                "date": a.date.isoformat(),
                "station": a.station,
                "measure": a.measure,
                "ratio": round(a.ratio, 3),
                "baseline": round(a.baseline),
                "eventIds": [] if a.station is None else list(event_ids.get((a.date, a.station), [])),
            }
            for a in det.anomalies
        ],
    }
