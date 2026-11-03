import json
from pathlib import Path

import pytest
import shapely
import shapely.affinity
from shapely.geometry import Point, Polygon, shape

from city_breath_pipeline import districts as D
from city_breath_pipeline.stations import Station

WEB_DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"


def _village(code: str, county: str, town: str, ring: list[tuple[float, float]]) -> str:
    coords = " ".join(f"{x},{y}" for x, y in ring + ring[:1])
    county_name = {"63000": "臺北市", "65000": "新北市"}.get(county, "基隆市")
    return (
        "<gml:featureMember><WFS:VILLAGE_NLSC><WFS:Shape><gml:MultiPolygon><gml:polygonMember>"
        f"<gml:Polygon><gml:outerBoundaryIs><gml:LinearRing><gml:coordinates>{coords}</gml:coordinates>"
        "</gml:LinearRing></gml:outerBoundaryIs></gml:Polygon></gml:polygonMember></gml:MultiPolygon></WFS:Shape>"
        f"<WFS:VILLCODE>{code}001</WFS:VILLCODE><WFS:COUNTYNAME>{county_name}</WFS:COUNTYNAME>"
        f"<WFS:TOWNNAME>{town}</WFS:TOWNNAME><WFS:COUNTYCODE>{county}</WFS:COUNTYCODE>"
        f"<WFS:TOWNCODE>{code}</WFS:TOWNCODE></WFS:VILLAGE_NLSC></gml:featureMember>"
    )


def _gml(features: list[str]) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?><FeatureCollection xmlns:WFS="http://www.opengis.net/wfs" '
        'xmlns:gml="http://www.opengis.net/gml">' + "".join(features) + "</FeatureCollection>"
    )


# 兩個區以 x=121.5 為界；甲區由兩個村里組成；另有一個不在臺北／新北的村里應被略過
FEATURES = [
    _village("63000010", "63000", "甲區", [(121.4, 25.0), (121.5, 25.0), (121.5, 25.05), (121.4, 25.05)]),
    _village("63000010", "63000", "甲區", [(121.4, 25.05), (121.5, 25.05), (121.5, 25.1), (121.4, 25.1)]),
    _village("65000020", "65000", "乙區", [(121.5, 25.0), (121.6, 25.0), (121.6, 25.1), (121.5, 25.1)]),
    _village("10017010", "10017", "外區", [(121.6, 25.0), (121.7, 25.0), (121.7, 25.1), (121.6, 25.1)]),
]


def _station(name: str, lon: float, lat: float, exits: bool = True) -> Station:
    return Station(id=f"s{name}", name=name, display=name, lon=lon, lat=lat, exits_recorded=exits)


@pytest.fixture
def boundaries(tmp_path):
    p = tmp_path / "village.xml"
    p.write_text(_gml(FEATURES), encoding="utf-8")
    return D.load_districts(p)


def test_dissolve_by_towncode_keeps_only_taipei_and_new_taipei(boundaries):
    assert [(d.code, d.name, d.city) for d in boundaries] == [("63000010", "甲區", "臺北市"), ("65000020", "乙區", "新北市")]
    assert boundaries[0].geometry.area == pytest.approx(0.1 * 0.1)
    assert isinstance(boundaries[0].geometry, Polygon)  # 兩個村里合併成一塊


def test_point_in_polygon_assignment(boundaries):
    stations = [_station("西站", 121.45, 25.05), _station("東站", 121.55, 25.02)]
    a = D.assign_stations(stations, boundaries)
    assert a["西站"].code == "63000010" and a["西站"].method == "polygon"
    assert a["東站"].code == "65000020"
    # 到另一區的距離：0.05 度經度約 5 km
    assert a["西站"].nearest_other == "65000020"
    assert 4_000 < a["西站"].nearest_other_m < 6_000


def test_station_outside_every_district_fails(boundaries):
    with pytest.raises(D.DistrictError, match="不在臺北市或新北市任何一區內"):
        D.assign_stations([_station("基隆", 121.65, 25.05)], boundaries)


def test_override_applies_on_top(boundaries):
    stations = [_station("西站", 121.45, 25.05), _station("界站", 121.4999, 25.05)]
    overrides = {"界站": {"station_name": "界站", "district_code": "65000020", "reason": "出口多在乙區"}}
    a = D.assign_stations(stations, boundaries, overrides)
    assert a["界站"].code == "65000020"
    assert a["界站"].method == "override"
    assert a["界站"].polygon_code == "63000010"
    assert a["界站"].reason == "出口多在乙區"
    assert a["西站"].method == "polygon"


def test_override_must_name_known_station_and_district(boundaries):
    stations = [_station("西站", 121.45, 25.05)]
    with pytest.raises(D.DistrictError, match="不在本月車站中"):
        D.assign_stations(stations, boundaries, {"無此站": {"district_code": "63000010"}})
    with pytest.raises(D.DistrictError, match="不是臺北市或新北市的區"):
        D.assign_stations(stations, boundaries, {"西站": {"district_code": "99999999"}})


def test_load_overrides_reads_csv(tmp_path):
    p = tmp_path / "station_districts.csv"
    p.write_text("station_name,district_code,reason\n界站,65000020,測試\n", encoding="utf-8")
    assert D.load_overrides(p)["界站"]["district_code"] == "65000020"
    assert D.load_overrides(tmp_path / "none.csv") == {}


def test_every_station_has_a_district_and_inflow_partial(boundaries):
    stations = [_station("西站", 121.45, 25.05), _station("東站", 121.55, 25.02), _station("環站", 121.58, 25.08, exits=False)]
    r = D.build_districts(stations, boundaries)
    assert set(r.station_codes) == {s.name for s in stations}
    by_id = {d["id"]: d for d in r.districts}
    assert by_id["63000010"]["inflowPartial"] is False
    assert by_id["65000020"]["inflowPartial"] is True
    assert by_id["65000020"]["stations"] == [1, 2]  # stations.json 的陣列索引（AD-2）


def test_districts_json_shape(boundaries):
    r = D.build_districts([_station("西站", 121.45, 25.05)], boundaries)
    for d in r.districts:
        assert set(d) == {"id", "name", "city", "centroid", "stations", "inflowPartial", "polygon"}
        assert isinstance(d["id"], str) and len(d["id"]) == 8 and d["id"].isdigit()
        assert d["city"] in ("臺北市", "新北市")
        assert len(d["centroid"]) == 2
        geom = shape({"type": "MultiPolygon", "coordinates": d["polygon"]})
        assert geom.is_valid and geom.covers(Point(d["centroid"]))
        for ring in (r for poly in d["polygon"] for r in poly):
            assert ring[0] == ring[-1]
            assert all(len(pt) == 2 and 121 < pt[0] < 122.1 and 24.5 < pt[1] < 25.4 for pt in ring)


def _zigzag_boundaries() -> list[D.District]:
    """甲乙兩區以鋸齒線為界（齒深約 50 m）；大容差簡化會把鋸齒拉直。"""
    ys = [25.0 + i * 0.001 for i in range(101)]
    zig = [(121.5 + (0.0005 if i % 2 else 0.0), y) for i, y in enumerate(ys)]
    west = Polygon([(121.4, 25.0), *zig, (121.4, 25.1)])
    east = Polygon([*zig, (121.6, 25.1), (121.6, 25.0)])
    return [D.District("63000010", "甲區", "臺北市", west), D.District("65000020", "乙區", "新北市", east)]


def test_simplification_keeps_each_station_inside_its_district():
    ds = _zigzag_boundaries()
    # 站在甲區的一個齒尖裡，距界線約 10 m
    stations = [_station("齒尖", 121.5004, 25.051), _station("遠站", 121.45, 25.05)]
    a = D.assign_stations(stations, ds)
    assert a["齒尖"].code == "63000010"
    flat = shapely.coverage_simplify([d.geometry for d in ds], 0.01)
    assert not flat[0].covers(Point(121.5004, 25.051))  # 單純簡化會讓站跑到乙區
    simple, tol = D.simplify_districts(ds, stations, a, tolerance=0.01)
    assert tol == 0.01
    assert simple[0].covers(Point(121.5004, 25.051))
    assert simple[1].intersection(simple[0]).area == pytest.approx(0, abs=1e-12)  # 不重疊
    assert len(shapely.get_coordinates(simple[0])) < len(shapely.get_coordinates(ds[0].geometry))  # 仍有簡化


def test_simplification_fails_when_station_cannot_stay_inside(monkeypatch):
    ds = _zigzag_boundaries()
    stations = [_station("遠站", 121.45, 25.05)]
    a = D.assign_stations(stations, ds)
    # 模擬取精度後整區位移：降到最小容差仍不在區內就報錯
    monkeypatch.setattr(D, "_round", lambda g: shapely.affinity.translate(g, xoff=1.0))
    with pytest.raises(D.DistrictError, match="仍有站落在自己區外"):
        D.simplify_districts(ds, stations, a, tolerance=0.004, min_tolerance=0.001)


def test_overridden_station_is_not_checked_against_polygon():
    ds = _zigzag_boundaries()
    stations = [_station("改區", 121.45, 25.05)]
    a = D.assign_stations(stations, ds, {"改區": {"district_code": "65000020", "reason": "測試"}})
    simple, _ = D.simplify_districts(ds, stations, a, tolerance=0.01)
    assert not simple[1].covers(Point(121.45, 25.05))  # 不在乙區也不報錯


def test_source_sha256_must_match(tmp_path):
    p = tmp_path / "village.xml"
    p.write_text(_gml(FEATURES), encoding="utf-8")
    D.verify_source(p, {"sha256": D.sha256_file(p)})
    with pytest.raises(D.DistrictError, match="sha256"):
        D.verify_source(p, {"sha256": "0" * 64})
    with pytest.raises(D.DistrictError, match="fetch-geo"):
        D.verify_source(tmp_path / "missing.xml", {"sha256": "0" * 64})


def test_geo_sources_config_is_complete():
    src = D.load_geo_sources()["town_boundary"]
    for key in ("file", "name", "publisher", "url", "license", "retrieved", "sha256"):
        assert src[key], key
    assert len(src["sha256"]) == 64


def test_diff_rows_flags_draft_mismatch_and_near_boundary(boundaries):
    stations = [_station("西站", 121.45, 25.05), _station("界站", 121.4995, 25.05), _station("東站", 121.55, 25.02)]
    r = D.build_districts(stations, boundaries)
    rows = {x["station"]: x for x in D.diff_rows(stations, r, {"西站": "甲", "界站": "乙", "東站": "乙"})}
    assert "西站" not in rows and "東站" not in rows
    assert rows["界站"]["flags"] == ["與草稿不同", "近界線"]
    assert rows["界站"]["official"] == "甲區"
    text = D.render_report("2026-09", stations, r, list(rows.values()))
    assert "與草稿不同：1 站" in text and "| 界站 |" in text


def test_all_published_files_use_current_contract_version():
    """AD-18：升版時所有月份都要重建，不可混用契約版本。"""
    from city_breath_pipeline import CONTRACT_VERSION

    stale = [str(p.relative_to(WEB_DATA)) for p in WEB_DATA.rglob("*.json")
             if json.loads(p.read_text("utf-8")).get("v") != CONTRACT_VERSION]
    assert stale == []


@pytest.mark.skipif(not (WEB_DATA / "2026-09" / "districts.json").exists(), reason="尚未輸出 2026-09")
def test_published_month_is_consistent():
    """已提交的輸出：每站都有區、站落在自己區的簡化多邊形內、districts.json 夠小。"""
    month = WEB_DATA / "2026-09"
    stations = json.loads((month / "stations.json").read_text("utf-8"))
    districts = json.loads((month / "districts.json").read_text("utf-8"))
    assert stations["v"] == districts["v"]
    assert (month / "districts.json").stat().st_size < 100_000
    polys = {d["id"]: shape({"type": "MultiPolygon", "coordinates": d["polygon"]}) for d in districts["districts"]}
    overrides = D.load_overrides()
    for i, s in enumerate(stations["stations"]):
        assert s["district"] in polys, s["name"]
        if s["name"] not in overrides:
            assert polys[s["district"]].covers(Point(s["lon"], s["lat"])), s["name"]
        assert i in next(d["stations"] for d in districts["districts"] if d["id"] == s["district"])
    for d in districts["districts"]:
        members = [stations["stations"][i] for i in d["stations"]]
        assert d["inflowPartial"] == any(not m["exitsRecorded"] for m in members)
