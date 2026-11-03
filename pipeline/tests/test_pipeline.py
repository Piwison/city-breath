import datetime as dt
import json

import pytest

from city_breath_pipeline.aggregate import aggregate_month
from city_breath_pipeline.stations import canonical, station_id
from city_breath_pipeline.suppress import primary as suppress

CSV = """﻿日期,時段,進站,出站,人次
2026-09-01,08,景安,大坪林,30
2026-09-01,08,景安,G大坪林,10
2026-09-02,08,景安,G大坪林,20
2026-09-05,08,景安,G大坪林,7
2026-10-01,08,景安,G大坪林,999
2026-09-01,05,大坪林,O景安,3
"""


@pytest.fixture
def agg(tmp_path):
    p = tmp_path / "od.csv"
    p.write_text(CSV, encoding="utf-8")
    return aggregate_month(
        p,
        "2026-09",
        aliases={"G大坪林": "大坪林", "O景安": "景安"},
        holidays={dt.date(2026, 9, 2): "測試假日"},
    )


def test_suppress_below_ten():
    assert suppress(9.4) is None
    assert suppress(9.5) == 10
    assert suppress(0) is None
    assert suppress(None) is None
    assert suppress(123.4) == 123


def test_canonical_and_stable_id():
    assert canonical("G大坪林", {"G大坪林": "大坪林"}) == "大坪林"
    assert canonical(" 景安 ", {}) == "景安"
    assert station_id("景安") == station_id("景安")
    assert station_id("景安") != station_id("大坪林")


def test_out_of_month_rows_dropped(agg):
    assert agg.dropped_rows == 1
    assert all(d.month == 9 for d, _ in agg.days)


def test_aliases_merge_dest_names(agg):
    assert agg.dest_names == {"大坪林", "景安"}


def test_day_types_include_weekends_and_holidays(agg):
    types = dict(agg.days)
    assert types[dt.date(2026, 9, 1)] == "weekday"
    assert types[dt.date(2026, 9, 2)] == "holiday"  # 設定檔假日
    assert types[dt.date(2026, 9, 5)] == "holiday"  # 星期六
    assert agg.day_counts == {"weekday": 1, "holiday": 2}


def test_average_uses_day_type_count(agg):
    od = {(o, d, t, h): v for o, d, t, h, v in agg.od_hourly}
    # 平日只有 9/1 一天：30 + 10（別名合併）= 40
    assert od[("景安", "大坪林", "weekday", 8)] == 40
    # 假日兩天：20 + 7 = 27 → 13.5
    assert od[("景安", "大坪林", "holiday", 8)] == 13.5


def test_station_hourly_entries_and_exits(agg):
    sh = {(n, t, h): (e, x) for n, t, h, e, x in agg.station_hourly}
    assert sh[("景安", "weekday", 8)] == (40, 0)
    assert sh[("大坪林", "weekday", 8)] == (0, 40)
