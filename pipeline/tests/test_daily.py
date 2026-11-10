"""逐日每站每小時輸出（1.10）：彙總、停駛小時、場館解析、場館組的隱藏，以及已提交檔案的形狀。"""

import datetime as dt
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from city_breath_pipeline import CONTRACT_VERSION
from city_breath_pipeline.aggregate import aggregate_month
from city_breath_pipeline.export import export_daily
from city_breath_pipeline.stations import Station
from city_breath_pipeline.suppress import unprotected, venue_origin_groups
from city_breath_pipeline.venues import VENUES, Venue, VenueError, load_venues, resolve_venues

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if (p / "daily").is_dir()) if DATA.is_dir() else []

# 3 站：A、B（區 X）、V 場館站（區 Y）、R 環狀線站（區 Y，只有進站）。9/1 平日、9/5 週六。
CSV = """﻿日期,時段,進站,出站,人次
2026-09-01,08,A,V,40
2026-09-01,08,B,V,4
2026-09-01,08,R,V,12
2026-09-01,08,V,V,3
2026-09-01,08,V,A,25
2026-09-01,09,A,B,0
2026-09-01,10,A,GV,30
2026-09-05,08,A,V,7
2026-09-05,08,B,A,100
2026-10-01,08,A,V,999
"""


@pytest.fixture
def agg(tmp_path):
    p = tmp_path / "od.csv"
    p.write_text(CSV, encoding="utf-8")
    return aggregate_month(p, "2026-09", aliases={"GV": "V"}, holidays={}, arrival_dests={"V"})


def _stations():
    mk = lambda name, rec=True: Station(id="s" + name, name=name, display=name, lon=0, lat=0, exits_recorded=rec)  # noqa: E731
    return [mk("A"), mk("B"), mk("R", rec=False), mk("V")]


DISTRICTS = SimpleNamespace(station_codes={"A": "X", "B": "X", "R": "Y", "V": "Y"})


# ── 彙總 ────────────────────────────────────────────────


def test_daily_hourly_sums_entries_and_exits(agg):
    dh = {(d, n, h): (e, x) for d, n, h, e, x in agg.daily_hourly}
    d1 = dt.date(2026, 9, 1)
    assert dh[(d1, "V", 8)] == (28, 59)  # 進：自己 3 + 往 A 25；出：40+4+12+3
    assert dh[(d1, "A", 8)] == (40, 25)
    assert dh[(d1, "V", 10)] == (0, 30)  # 別名 GV → V
    assert all(isinstance(e, int) and isinstance(x, int) for *_, e, x in agg.daily_hourly)
    assert all(d.month == 9 for d, *_ in agg.daily_hourly)  # 跨月列已排除


def test_daily_arrivals_only_for_requested_dests(agg):
    rows = {(d.day, o, dest, h): n for d, o, dest, h, n in agg.daily_arrivals}
    assert rows == {
        (1, "A", "V", 8): 40, (1, "B", "V", 8): 4, (1, "R", "V", 8): 12, (1, "V", "V", 8): 3,
        (1, "A", "V", 10): 30, (5, "A", "V", 8): 7,
    }


def test_no_arrivals_without_dests(tmp_path):
    p = tmp_path / "od.csv"
    p.write_text(CSV, encoding="utf-8")
    assert aggregate_month(p, "2026-09", aliases={"GV": "V"}, holidays={}).daily_arrivals == []


# ── 輸出 ────────────────────────────────────────────────


@pytest.fixture
def daily(agg, tmp_path):
    res = export_daily(agg, _stations(), DISTRICTS, {3: ["arena"]}, tmp_path)
    files = {p.stem: json.loads(p.read_text("utf-8")) for p in (tmp_path / "2026-09" / "daily").glob("*.json")}
    return res, files


def test_one_file_per_day_with_shape(daily):
    res, files = daily
    assert sorted(files) == ["2026-09-01", "2026-09-05"]
    f = files["2026-09-01"]
    assert (f["v"], f["month"], f["date"], f["dayType"]) == (CONTRACT_VERSION, "2026-09", "2026-09-01", "weekday")
    assert files["2026-09-05"]["dayType"] == "holiday"
    assert len(f["entries"]) == 4 and all(len(r) == 24 for r in f["entries"])
    assert set(res["sizes"]) == {"daily/2026-09-01.json", "daily/2026-09-05.json"}


def test_hours_without_records_citywide_are_null(daily):
    _, files = daily
    f = files["2026-09-01"]
    # 8 點、10 點全市有人次；9 點只有 0 人次的列 → 停駛；其他小時沒有列
    for h in range(24):
        expect_open = h in (8, 10)
        assert all((r[h] is not None) == expect_open for r in f["entries"]), h
    assert f["entries"][1][10] == 0  # 全市營運、該站沒人 → 0，不是 null
    assert files["2026-09-05"]["entries"][0][10] is None  # 9/5 10 點全市無紀錄


def test_station_totals_not_suppressed_and_ring_exits_null(daily):
    _, files = daily
    f = files["2026-09-01"]
    assert f["exits"][3][8] == 59 and f["entries"][3][8] == 28
    assert f["exits"][2] is None  # 環狀線：出站未入檔
    assert files["2026-09-05"]["exits"][3][8] == 7  # 站層級少於 10 照樣公開


def test_venue_origins_suppressed_and_grouped(daily):
    res, files = daily
    v = files["2026-09-01"]["venues"]
    assert [(x["station"], x["venueIds"]) for x in v] == [(3, ["arena"])]
    rows = dict(zip(v[0]["origins"], v[0]["arrivals"]))
    # 8 點：X = 40 + 4 = 44，Y = 12 + 3 = 15 → 兩區都公開（和＝出站 59）
    assert rows["X"][8] == 44 and rows["Y"][8] == 15
    assert rows["X"][9] is None and rows["Y"][9] is None  # 全市停駛的小時
    # 10 點：X = 30，Y 無人 → Y 為唯一 null，再藏 X
    assert rows["X"][10] is None
    # 9/5：X = 7 < 10 → null；Y 無人 → 整天沒有公開格的區不列出
    assert files["2026-09-05"]["venues"][0]["origins"] == []
    assert res["suppression"] == {"cells": 2 * 2 + 1 * 2, "primary": 1, "secondary": 1}


def test_venue_station_without_exits_rejected(agg, tmp_path):
    with pytest.raises(ValueError):
        export_daily(agg, _stations(), DISTRICTS, {2: ["ring"]}, tmp_path)


# ── 場館解析 ────────────────────────────────────────────


def test_venues_resolve_through_aliases(tmp_path):
    p = tmp_path / "venues.csv"
    p.write_text("venue_id,venue_name,station_name,source\narena,場館,GV,測試\nhall,另一館,A,測試\n", encoding="utf-8")
    venues = load_venues({"GV": "V"}, p)
    assert venues[0].station == "V"
    assert resolve_venues(venues, _stations()) == {0: ["hall"], 3: ["arena"]}


def test_unknown_venue_station_fails():
    with pytest.raises(VenueError, match="對不到"):
        resolve_venues([Venue("x", "不存在", "不存在站", "")], _stations())


def test_ring_line_venue_station_fails():
    with pytest.raises(VenueError, match="環狀線"):
        resolve_venues([Venue("x", "環狀", "R", "")], _stations())


def test_duplicate_venue_id_fails(tmp_path):
    p = tmp_path / "venues.csv"
    p.write_text("venue_id,venue_name,station_name,source\na,1,A,\na,2,B,\n", encoding="utf-8")
    with pytest.raises(VenueError, match="重複"):
        load_venues({}, p)


def test_config_venues_cover_required_stations():
    names = {v.station for v in load_venues({}, VENUES)}
    assert {"台北小巨蛋", "圓山", "西門", "南港展覽館", "國父紀念館", "劍潭", "台北101/世貿"} <= names


@pytest.mark.parametrize("month", MONTHS)
def test_config_venues_resolve_against_committed_stations(month):
    raw = json.loads((DATA / month / "stations.json").read_text("utf-8"))["stations"]
    stations = [Station(s["id"], s["name"], s["display"], s["lon"], s["lat"], s["exitsRecorded"]) for s in raw]
    assert len(resolve_venues(load_venues({}, VENUES), stations)) == 7


def test_venue_origin_groups_shape():
    groups = venue_origin_groups([3, 7], ["X", "Y", "Z"], [8, 9])
    assert len(groups) == 4
    assert [(3, "X", 8), (3, "Y", 8), (3, "Z", 8)] in groups
    assert all(len({k[0] for k in g}) == 1 and len({k[2] for k in g}) == 1 for g in groups)


# ── 已提交的逐日檔 ──────────────────────────────────────


def test_committed_daily_present():
    assert MONTHS, "web/public/data/ 沒有任何月份的 daily/，逐組檢查不會執行"


def _month(month):
    root = DATA / month
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    files = [json.loads(p.read_text("utf-8")) for p in sorted((root / "daily").glob("*.json"))]
    return stations, files


@pytest.mark.parametrize("month", MONTHS)
def test_committed_daily_shape(month):
    stations, files = _month(month)
    meta = json.loads((DATA / month / "meta.json").read_text("utf-8"))
    assert len(files) == sum(meta["dayCounts"].values())
    for f in files:
        assert f["v"] == CONTRACT_VERSION and f["month"] == month and f["date"].startswith(month)
        assert f["dayType"] in ("weekday", "holiday")
        assert len(f["entries"]) == len(f["exits"]) == len(stations)
        closed = {h for h in range(24) if f["entries"][0][h] is None}
        for s, ent, ext in zip(stations, f["entries"], f["exits"]):
            assert len(ent) == 24 and {h for h in range(24) if ent[h] is None} == closed
            if s["exitsRecorded"]:
                assert len(ext) == 24 and {h for h in range(24) if ext[h] is None} == closed
            else:
                assert ext is None
        # 全月都停駛的小時（meta.serviceHours 以外）每天都停駛；個別日子可以多開
        # （例：2025-11-01 白晝之夜凌晨 2 點仍有進站，但當月其他天 2 點停駛）
        assert set(range(24)) - set(meta["serviceHours"]) <= closed and closed


@pytest.mark.parametrize("month", MONTHS)
def test_committed_venue_groups_have_zero_or_two_nulls(month):
    """攻擊者的視角：某場館站某小時的各來源區之和 ＝ 同檔 exits；每組都要零格或至少兩格 null。"""
    stations, files = _month(month)
    all_districts = sorted({s["district"] for s in stations})
    checked = 0
    for f in files:
        assert len(f["venues"]) == 7
        for v in f["venues"]:
            vi = v["station"]
            assert stations[vi]["exitsRecorded"]
            assert set(v["origins"]) <= set(all_districts) and len(v["arrivals"]) == len(v["origins"])
            cells = {(vi, dc, h): None for dc in all_districts for h in range(24)}
            for dc, row in zip(v["origins"], v["arrivals"]):
                assert len(row) == 24
                for h, x in enumerate(row):
                    assert x is None or x >= 10
                    cells[(vi, dc, h)] = x
            open_hours = [h for h in range(24) if f["exits"][vi][h] is not None]
            groups = venue_origin_groups([vi], all_districts, open_hours)
            assert unprotected(cells, groups) == [], (f["date"], stations[vi]["name"])
            for g in groups:
                h = g[0][2]
                shown = [cells[k] for k in g if cells[k] is not None]
                assert sum(shown) <= f["exits"][vi][h]
                if len(shown) == len(g):
                    assert sum(shown) == f["exits"][vi][h]
                checked += 1
    assert checked > 0
