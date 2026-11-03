"""異常日與「平常」（7.1，AD-14）：排除當日的中位數、門檻、形狀、決定性，以及已提交的 events.json。"""

import datetime as dt
import json
from pathlib import Path

import pytest

from city_breath_pipeline import anomaly
from city_breath_pipeline.aggregate import MonthAggregate
from city_breath_pipeline.anomaly import detect, normal, to_json
from city_breath_pipeline.export import export_events
from city_breath_pipeline.stations import Station

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if (p / "events.json").exists()) if DATA.is_dir() else []

D = lambda day: dt.date(2026, 9, day)  # noqa: E731  2026-09-07、14、21、28 是週一
MONDAYS = [D(7), D(14), D(21), D(28)]


def _station(name, rec=True):
    return Station(id="s" + name, name=name, display=name, lon=0, lat=0, exits_recorded=rec)


# ── 平常 ────────────────────────────────────────────────


def test_normal_excludes_the_day_itself():
    s = dict(zip(MONDAYS, [100, 120, 130, 500]))
    assert normal(s, D(28)) == 120  # median(100, 120, 130)，不含當日 500
    assert normal(s, D(7)) == 130  # median(120, 130, 500)


def test_normal_uses_same_weekday_only_and_even_count_median():
    s = dict(zip(MONDAYS, [100, 120, 130, 500])) | {D(8): 9999, D(15): 1}
    assert normal(s, D(7)) == 130
    assert normal(s | {D(1): 50}, D(1)) == pytest.approx(5000)  # 週二：median(9999, 1)


def test_normal_none_without_other_same_weekday():
    assert normal({D(1): 100, D(2): 200}, D(1)) is None


# ── 門檻 ────────────────────────────────────────────────


def test_city_threshold_both_directions_inclusive():
    assert anomaly.is_city_anomaly(85, 100) and anomaly.is_city_anomaly(115, 100)
    assert not anomaly.is_city_anomaly(86, 100) and not anomaly.is_city_anomaly(114, 100)
    assert not anomaly.is_city_anomaly(0, None) and not anomaly.is_city_anomaly(10, 0)


def test_station_threshold_needs_ratio_and_extra():
    assert anomaly.is_station_anomaly(3000, 2000)  # 1.5 倍、多 1,000
    assert not anomaly.is_station_anomaly(2999, 2000)  # 倍數不足
    assert not anomaly.is_station_anomaly(925, 600)  # 1.54 倍但只多 325 人
    assert not anomaly.is_station_anomaly(1000, 3000)  # 只抓多，不抓少
    assert not anomaly.is_station_anomaly(5000, None) and not anomaly.is_station_anomaly(5000, 0)


# ── detect ──────────────────────────────────────────────

# 四個週一＋一個週二。A：一般站，9/21 出站暴增；R：環狀線站（出站不在資料中）；B：小站。
STATIONS = [_station("A"), _station("B"), _station("R", rec=False)]
DAYS = [(d, "holiday" if d == D(28) else "weekday") for d in MONDAYS] + [(D(1), "weekday")]
ROWS = [
    # (date, name, entries, exits)
    (D(7), "A", 10_000, 10_000), (D(14), "A", 10_400, 10_200), (D(21), "A", 10_200, 22_343),
    (D(28), "A", 6_000, 6_100), (D(1), "A", 10_000, 10_000),
    (D(7), "B", 600, 600), (D(14), "B", 620, 610), (D(21), "B", 925, 990), (D(28), "B", 400, 400),
    # R 的出站欄位理論上不會有值；這裡故意放一個 2 倍的出站，確認不會被當成異常
    (D(7), "R", 100_000, 50_000), (D(14), "R", 101_000, 50_000), (D(21), "R", 99_000, 99_999),
    (D(28), "R", 60_000, 50_000), (D(1), "R", 100_000, 50_000),
]


@pytest.fixture
def det():
    return detect(DAYS, ROWS, STATIONS)


def test_city_level_holiday(det):
    city = det.city()
    assert [a.date for a in city] == [D(28)]
    a = city[0]
    assert a.station is None and a.measure == "entries"
    assert a.value == 66_400 and a.baseline == 110_600  # median(110 600, 112 020, 110 125)
    assert a.ratio == pytest.approx(66_400 / 110_600)


def test_city_days_have_ratio_or_none(det):
    days = {x.date: x for x in det.days}
    assert days[D(28)].day_type == "holiday" and days[D(28)].city_entries == 66_400
    assert days[D(1)].city_ratio is None  # 週二只有一天，沒有基準
    assert days[D(7)].city_ratio == pytest.approx(110_600 / 110_125)  # median(112 020, 110 125, 66 400)


def test_station_level_spike(det):
    st = det.stations()
    assert [(a.date, a.station, a.measure) for a in st] == [(D(21), 0, "exits")]
    a = st[0]
    assert a.value == 22_343 and a.baseline == 10_000  # median(10 000, 10 200, 6 100)
    assert a.ratio == pytest.approx(2.2343)


def test_circle_line_exits_ignored(det):
    assert all(a.station != 2 for a in det.stations())  # R 的 9/21 出站 99 999 不算


def test_picks_larger_ratio_when_both_measures_hit():
    rows = [(d, "A", 10_000, 10_000) for d in MONDAYS[:3]] + [(D(28), "A", 30_000, 20_000)]
    det = detect([(d, "weekday") for d in MONDAYS], rows, [_station("A")])
    assert [(a.measure, a.value) for a in det.stations()] == [("entries", 30_000)]


def test_missing_rows_count_as_zero_and_sorted():
    rows = [(D(7), "A", 5_000, 5_000), (D(14), "A", 5_000, 5_000), (D(21), "B", 9_000, 9_000),
            (D(28), "A", 5_000, 5_000), (D(28), "B", 0, 0), (D(14), "B", 0, 0), (D(7), "B", 0, 0)]
    det = detect([(d, "weekday") for d in MONDAYS], rows, [_station("A"), _station("B")])
    # B 平常是 0，無基準不判定；A 的 9/21 沒有列＝0；全市 9/21 是 9 000 對平常 5 000
    assert det.stations() == []
    keys = [(a.date, a.station) for a in det.anomalies]
    assert keys == sorted(keys, key=lambda k: (k[0], -1 if k[1] is None else k[1]))


def test_unknown_station_name_fails():
    with pytest.raises(KeyError):
        detect([(D(7), "weekday")], [(D(7), "不存在", 1, 1)], [_station("A")])


# ── 輸出 ────────────────────────────────────────────────


def _agg():
    return MonthAggregate(
        month="2026-09", days=DAYS, day_counts={}, service_hours=[], origin_names=set(), dest_names=set(),
        station_hourly=[], od_hourly=[], daily_station=ROWS, raw_rows=0, dropped_rows=0,
    )


def test_events_json_shape(tmp_path):
    export_events(_agg(), STATIONS, tmp_path)
    body = json.loads((tmp_path / "2026-09" / "events.json").read_text("utf-8"))
    assert list(body) == ["v", "month", "thresholds", "days", "anomalies", "events"]
    assert (body["v"], body["month"], body["events"]) == (2, "2026-09", [])
    assert body["thresholds"] == {"city": 0.15, "stationRatio": 1.5, "stationExtra": 1000, "provisional": True}
    assert body["days"][0] == {"date": "2026-09-01", "dayType": "weekday", "cityEntries": 110_000, "cityRatio": None}
    assert body["anomalies"] == [
        {"date": "2026-09-21", "station": 0, "measure": "exits", "ratio": 2.234, "baseline": 10000, "eventIds": []},
        {"date": "2026-09-28", "station": None, "measure": "entries", "ratio": 0.6, "baseline": 110600,
         "eventIds": []},
    ]


def test_deterministic_regardless_of_row_order(tmp_path):
    a = to_json(detect(DAYS, ROWS, STATIONS))
    b = to_json(detect(list(reversed(DAYS)), list(reversed(ROWS)), STATIONS))
    assert json.dumps(a) == json.dumps(b)


# ── 已提交的 events.json ────────────────────────────────


def test_committed_events_present_and_daily_json_gone():
    assert MONTHS, "web/public/data/ 沒有任何月份的 events.json"
    assert not list(DATA.glob("*/daily.json")), "v1 的 daily.json 在 7.1 移除（AD-10）"


@pytest.mark.parametrize("month", MONTHS)
def test_committed_events_shape(month):
    root = DATA / month
    body = json.loads((root / "events.json").read_text("utf-8"))
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    meta = json.loads((root / "meta.json").read_text("utf-8"))
    assert body["v"] == 2 and body["month"] == month
    assert len(body["days"]) == sum(meta["dayCounts"].values())
    assert [d["date"] for d in body["days"]] == sorted(d["date"] for d in body["days"])
    dates = {d["date"]: d for d in body["days"]}
    for a in body["anomalies"]:
        assert a["date"] in dates and a["eventIds"] == [] and a["baseline"] > 0
        if a["station"] is None:
            assert abs(a["ratio"] - 1) >= 0.15 - 1e-9 and a["ratio"] == dates[a["date"]]["cityRatio"]
        else:
            assert 0 <= a["station"] < len(stations) and a["ratio"] >= 1.5
            assert a["measure"] == "entries" or stations[a["station"]]["exitsRecorded"]


def test_committed_2026_09_acceptance():
    """7.1 驗收：9/13 小巨蛋、9/5 劍潭在站級；9/28 教師節在全市級。"""
    root = DATA / "2026-09"
    if not (root / "events.json").exists():
        pytest.skip("沒有 2026-09")
    body = json.loads((root / "events.json").read_text("utf-8"))
    names = [s["name"] for s in json.loads((root / "stations.json").read_text("utf-8"))["stations"]]
    station_hits = {(a["date"], names[a["station"]]) for a in body["anomalies"] if a["station"] is not None}
    city_hits = {a["date"] for a in body["anomalies"] if a["station"] is None}
    assert {("2026-09-13", "台北小巨蛋"), ("2026-09-05", "劍潭")} <= station_hits
    assert "2026-09-28" in city_hits
