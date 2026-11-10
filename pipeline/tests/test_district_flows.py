"""行政區起訖彙總（1.9；AD-7、AD-9、AD-10）。"""

import json
from pathlib import Path

import pytest

from city_breath_pipeline import HOURS
from city_breath_pipeline.district_flows import (
    district_index,
    district_raw,
    district_totals,
    total_count,
)
from city_breath_pipeline.export import DistrictCells, district_flows_json, suppress_od
from city_breath_pipeline.stations import Station

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if (p / "district-flows.json").exists()) if DATA.is_dir() else []


def _st(name: str, exits: bool = True) -> Station:
    return Station(id=f"s{name}", name=name, display=name, lon=121.5, lat=25.0, exits_recorded=exits)


# 甲區：A1、A2；乙區：B1、B2（B2 是出站未入檔的環狀線站）；丙區：C1
STATIONS = [_st("A1"), _st("A2"), _st("B1"), _st("B2", exits=False), _st("C1")]
CODES = {"A1": "63000010", "A2": "63000010", "B1": "65000020", "B2": "65000020", "C1": "63000050"}
DAYS = {"weekday": 20, "holiday": 10}
SERVICE = [0, 1, 5, 6, 7, 8, 23]


def _avg(total: int, t: str = "weekday") -> float:
    return total / DAYS[t]  # 與 DuckDB 的 sum(n)::double / k 相同


OD_HOURLY = [
    # (起站, 迄站, 日型, 小時, 平均)
    ("A1", "B1", "weekday", 8, _avg(13)),   # 0.65
    ("A2", "B1", "weekday", 8, _avg(187)),  # 9.35 → 站級少於 10
    ("A1", "C1", "weekday", 8, _avg(500)),
    ("A1", "B2", "weekday", 8, _avg(999)),  # 迄站出站未入檔：不計
    ("B2", "A1", "weekday", 8, _avg(400)),  # 環狀線站當起站照算
    ("A1", "A2", "holiday", 7, _avg(15, "holiday")),
]


def test_total_count_recovers_integer_totals():
    for k in (1, 7, 10, 20, 21, 31):
        for n in (0, 1, 13, 187, 999_999, 1_234_567):
            assert total_count(n / k, k) == n


def test_district_index_only_districts_with_stations_sorted():
    assert district_index(STATIONS, CODES) == ["63000010", "63000050", "65000020"]


def test_district_average_sums_totals_then_divides():
    """AD-7：甲→乙 ＝ (13 + 187) ÷ 20 ＝ 10，不是兩站平均（0.65、9.35）各自四捨五入再相加（1 + 9）。"""
    totals = district_totals(OD_HOURLY, STATIONS, CODES, DAYS)
    assert totals[("63000010", "65000020", "weekday", 8)] == 200
    index, dest, raw = district_raw(OD_HOURLY, STATIONS, CODES, DAYS, SERVICE)
    a, b, c = (index.index(x) for x in ("63000010", "65000020", "63000050"))
    assert raw[("D", a, b, "weekday", 8)] == 10.0
    assert raw[("D", a, c, "weekday", 8)] == 25.0
    assert raw[("D", a, a, "holiday", 7)] == 1.5  # 同區內也算，分母用假日天數
    assert raw[("D", b, a, "weekday", 8)] == 20.0  # 環狀線站當起站照算
    assert dest == [0, 1, 2]


def test_unrecorded_destinations_excluded():
    totals = district_totals(OD_HOURLY, STATIONS, CODES, DAYS)
    # A1→B2 的 999 人不會出現在甲→乙
    assert totals[("63000010", "65000020", "weekday", 8)] == 200


def test_raw_covers_service_hours_only_and_none_when_nobody():
    index, dest, raw = district_raw(OD_HOURLY, STATIONS, CODES, DAYS, SERVICE)
    assert len(raw) == 2 * len(SERVICE) * len(index) * len(dest)
    assert all(k[4] in SERVICE for k in raw)
    assert raw[("D", 0, 0, "weekday", 5)] is None


def test_district_flows_json_shape_and_suppression():
    od = {}
    for o, d, t, h, avg in OD_HOURLY:
        od.setdefault(o, {tt: [[None] * len(STATIONS) for _ in HOURS] for tt in DAYS})
        od[o][t][h][[s.name for s in STATIONS].index(d)] = avg
    cells = DistrictCells.build(OD_HOURLY, STATIONS, CODES, DAYS, SERVICE)
    assert cells.station_district == [0, 0, 2, 2, 1]
    res = suppress_od(od, STATIONS, {}, SERVICE, cells)
    out = district_flows_json("2026-09", cells, res.values, SERVICE)

    assert out["districts"] == ["63000010", "63000050", "65000020"]
    for t in ("weekday", "holiday"):
        assert len(out[t]) == 24
        for h, m in enumerate(out[t]):
            if h not in SERVICE:
                assert m is None  # 停止營運（AD-5）
            else:
                assert len(m) == 3 and all(len(r) == 3 for r in m)
                assert all(v is None or (isinstance(v, int) and v >= 10) for r in m for v in r)
    a, c = 0, 1
    # 甲→丙 25 ＝ od(A1→C1) 25 ＋ od(A2→C1) null：站區塊只剩一格 null → 同值取組內較前的行政區格隱藏
    assert out["weekday"][8][a][c] is None
    assert res.values[(0, 4, "weekday", 8)] == 25
    # 甲→乙 10 過門檻，但甲區那一列在上面之前就只剩甲→甲一格 null → 次要隱藏最小的甲→乙
    assert out["weekday"][8][a][2] is None
    # 主要隱藏：od A1→B1（0.65）、A2→B1（9.35）、假日 A1→A2（1.5）與它的甲→甲
    # （inbound 的來源區格 "I" 和 od、行政區格一起隱藏，另見 test_inbound.py）
    assert sorted((k for k in res.primary_keys if k[0] != "I"), key=str) == sorted(
        [(0, 2, "weekday", 8), (1, 2, "weekday", 8), (0, 1, "holiday", 7), ("D", a, a, "holiday", 7)], key=str
    )
    assert sorted(k for k in res.secondary_hidden if k[0] == "D") == sorted(
        [("D", a, 2, "weekday", 8), ("D", a, c, "weekday", 8), ("D", 2, a, "weekday", 8)]
    )
    # 乙→甲 20 ＝ od(B2→A1) 20 ＋ od(B2→A2) null：站區塊只剩一格 null，否則 20 − 20 就反推出
    # B2→A2；同值取組內順序較前的行政區格
    assert out["weekday"][8][2][a] is None
    assert res.values[(3, 0, "weekday", 8)] == 20


@pytest.mark.parametrize("month", MONTHS)
def test_committed_district_flows_shape(month):
    root = DATA / month
    flows = json.loads((root / "district-flows.json").read_text("utf-8"))
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    meta = json.loads((root / "meta.json").read_text("utf-8"))
    assert flows["month"] == month
    assert flows["districts"] == sorted({s["district"] for s in stations})
    assert all(len(c) == 8 and c.isdigit() for c in flows["districts"])
    n = len(flows["districts"])
    for t in ("weekday", "holiday"):
        assert len(flows[t]) == 24
        for h, m in enumerate(flows[t]):
            if h not in meta["serviceHours"]:
                assert m is None
                continue
            assert len(m) == n and all(len(r) == n for r in m)
            assert all(v is None or (isinstance(v, int) and v >= 10) for r in m for v in r)
    # AD-6：首頁三檔合計目標 ≤ 300 KB
    home = sum((root / f).stat().st_size for f in ("stations.json", "districts.json", "district-flows.json"))
    assert home <= 300_000
