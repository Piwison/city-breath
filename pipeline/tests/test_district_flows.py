"""行政區起訖彙總（1.9；AD-7、AD-9、AD-10）。"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from city_breath_pipeline import HOURS
from city_breath_pipeline.district_flows import (
    district_index,
    district_profiles,
    district_raw,
    district_totals,
    total_count,
)
from city_breath_pipeline.export import DistrictCells, district_flows_json, districts_json, suppress_od
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


# ── districts.json 的區總量（3.20，契約 v4；AD-5、AD-7）──

STATION_HOURLY = [
    # (站, 日型, 小時, 平均進站, 平均出站)：與 OD_HOURLY 一致，另加 23 點兩站各 0.4 人
    ("A1", "weekday", 8, _avg(13 + 500 + 999), _avg(400)),
    ("A2", "weekday", 8, _avg(187), 0.0),
    ("B1", "weekday", 8, 0.0, _avg(13 + 187)),
    ("B2", "weekday", 8, _avg(400), _avg(999)),  # 環狀線站：出站不在資料中，不計
    ("C1", "weekday", 8, 0.0, _avg(500)),
    ("A1", "holiday", 7, _avg(15, "holiday"), 0.0),
    ("A2", "holiday", 7, 0.0, _avg(15, "holiday")),
    ("A1", "weekday", 23, _avg(8), 0.0),
    ("A2", "weekday", 23, _avg(8), 0.0),
]


def test_district_profiles_sum_totals_then_divide():
    """AD-7：甲區 23 點兩站各 0.4 人，站平均各自四捨五入是 0＋0，區總量是 (8＋8) ÷ 20 ＝ 0.8 → 1。"""
    p = district_profiles(STATION_HOURLY, STATIONS, CODES, DAYS, SERVICE)
    assert sorted(p) == ["63000010", "63000050", "65000020"]
    a, b, c = p["63000010"], p["65000020"], p["63000050"]
    assert a["weekday"]["entries"][23] == 1
    assert a["weekday"]["entries"][8] == round((13 + 500 + 999 + 187) / 20)  # 85
    assert a["weekday"]["exits"][8] == 20
    assert a["holiday"]["entries"][7] == 2 and a["holiday"]["exits"][7] == 2  # 15 ÷ 10，分母用假日天數
    assert b["weekday"]["entries"][8] == 20  # 環狀線站當起站照算
    assert b["weekday"]["exits"][8] == 10  # B2 的 999 人不算：inflowPartial 的區少算
    assert c["weekday"]["entries"][8] == 0 and c["weekday"]["exits"][8] == 25


def test_district_profiles_null_when_closed_zero_when_nobody():
    """AD-5：不在營運時段為 null；營運中但沒人為 0。"""
    p = district_profiles(STATION_HOURLY, STATIONS, CODES, DAYS, SERVICE)
    for by_type in p.values():
        for t in DAYS:
            for m in ("entries", "exits"):
                row = by_type[t][m]
                assert len(row) == 24
                assert all((v is None) == (h not in SERVICE) for h, v in enumerate(row))
    assert p["63000050"]["holiday"]["entries"][5] == 0


def test_district_without_recorded_exits_fails():
    stations = [_st("X", exits=False)]
    with pytest.raises(ValueError, match="65000099"):
        district_profiles([], stations, {"X": "65000099"}, DAYS, SERVICE)


def test_districts_json_adds_totals_and_null_for_districts_without_stations():
    rows = [
        {"id": "63000010", "name": "甲", "stations": [0, 1]},
        {"id": "63000099", "name": "沒有車站", "stations": []},
    ]
    agg = SimpleNamespace(station_hourly=STATION_HOURLY, day_counts=DAYS, service_hours=SERVICE)
    out = districts_json(rows, agg, STATIONS, CODES)
    assert out[0]["name"] == "甲" and out[0]["weekday"]["entries"][23] == 1
    assert out[1]["weekday"] is None and out[1]["holiday"] is None
    assert "weekday" not in rows[0]  # 不改動 districts.py 給的內容


@pytest.mark.parametrize("month", MONTHS)
def test_committed_district_totals(month):
    """每區總量的形狀，且與 stations.json 的站平均之和只差四捨五入（每站最多 0.5，區本身再 0.5）。"""
    root = DATA / month
    body = json.loads((root / "districts.json").read_text("utf-8"))
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    service = json.loads((root / "meta.json").read_text("utf-8"))["serviceHours"]
    for d in body["districts"]:
        if not d["stations"]:
            assert d["weekday"] is None and d["holiday"] is None
            continue
        members = [stations[i] for i in d["stations"]]
        assert all(s["district"] == d["id"] for s in members)  # AD-9：區只來自管線
        for t in ("weekday", "holiday"):
            for m in ("entries", "exits"):
                row = d[t][m]
                assert len(row) == 24
                counted = [s for s in members if m == "entries" or s["exitsRecorded"]]
                for h, v in enumerate(row):
                    if h not in service:
                        assert v is None
                        continue
                    assert isinstance(v, int) and v >= 0
                    assert abs(v - sum(s[t][m][h] for s in counted)) <= (len(counted) + 1) / 2


# 手算（不經管線）：duckdb 直接讀 2026-09 原始 CSV，日型照 holidays.csv（平日 20 天、假日 10 天），
# 加總大安區 11 站在該小時進站（進站欄）與出站（迄站欄）的人次。
HAND_2026_09 = {
    ("大安區", "weekday", "entries", 8): 15404,  # 308,081 ÷ 20 ＝ 15,404.05
    ("大安區", "weekday", "exits", 8): 36078,  # 721,564 ÷ 20 ＝ 36,078.2
    ("大安區", "holiday", "entries", 14): 16034,  # 160,336 ÷ 10 ＝ 16,033.6
    ("大安區", "holiday", "exits", 14): 18836,  # 188,365 ÷ 10 ＝ 18,836.5：剛好 .5 取偶數，與 stations.json 相同
    ("蘆洲區", "weekday", "entries", 8): 11369,  # 227,380 ÷ 20
    ("蘆洲區", "weekday", "exits", 8): 1004,  # 20,086 ÷ 20 ＝ 1,004.3
    ("蘆洲區", "holiday", "entries", 14): 2186,  # 21,862 ÷ 10 ＝ 2,186.2
    ("蘆洲區", "holiday", "exits", 14): 1562,  # 15,616 ÷ 10 ＝ 1,561.6
}


@pytest.mark.skipif("2026-09" not in MONTHS, reason="沒有 2026-09 資料")
def test_district_totals_match_hand_count_2026_09():
    body = json.loads((DATA / "2026-09" / "districts.json").read_text("utf-8"))
    by_name = {d["name"]: d for d in body["districts"]}
    got = {k: by_name[k[0]][k[1]][k[2]][k[3]] for k in HAND_2026_09}
    assert got == HAND_2026_09
