"""底圖 basemap.json（1.12；AD-1、AD-2、AD-9、AD-12、AD-21、AD-25）：解析、路線判定、來源檢查，以及已提交檔案。"""

import csv
import io
import json
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box

from city_breath_pipeline import CONTRACT_VERSION
from city_breath_pipeline import basemap as bm
from city_breath_pipeline import cli
from city_breath_pipeline.districts import District
from city_breath_pipeline.stations import Station
from city_breath_pipeline.venues import VENUES

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
BASEMAP = DATA / "basemap.json"


# ── 班距與路線名 ─────────────────────────────────────────────

HEADWAY = """﻿SEQNO,RouteID,LineID,ServiceDays,SpecialDays,OperationTime,Headways,UpdateTime
1,'BR-1','BR',"'{'平日',1,1,1,1,1,0,0,0}'","''","'{'06:00','24:00'}'","'{0,'06:00','07:00',4,10},{1,'07:00','09:00',2,4},{0,'09:00','17:00',4,10},{1,'17:00','19:30',2,4},{0,'19:30','23:00',4,10},{0,'23:00','00:00',12,12}'",1
2,'BR-1','BR',"'{'假日',0,0,0,0,0,1,1,1}'","''","'{'06:00','24:00'}'","'{0,'06:00','08:00',0,0},{0,'08:00','23:00',4,10},{0,'23:00','00:00',12,12}'",1
3,'BR-2','BR',"'{'平日',1,1,1,1,1,0,0,0}'","''","'{'06:00','24:00'}'","'{0,'06:00','00:00',3,3}'",1
"""


def test_headway_hours_are_source_ranges_and_null_outside_service():
    hw = bm.parse_headway(HEADWAY)
    assert list(hw) == ["BR"]  # BR-2 不在 HEADWAY_ROUTES
    wd, hd = hw["BR"]["weekday"], hw["BR"]["holiday"]
    assert len(wd) == len(hd) == 24
    assert wd[:6] == [None] * 6  # 06:00 前停駛（AD-5）
    assert wd[6] == [4, 10] and wd[7] == [2, 4]
    assert wd[19] == [2, 10]  # 19:30 換時段：取兩段的最短與最長，不取中點
    assert wd[23] == [12, 12]  # 結束寫 00:00＝到午夜
    assert hd[6] is None and hd[7] is None  # 來源寫 0＝沒有這種車
    assert hd[8] == [4, 10]


def test_headway_needs_both_day_types():
    one_day = "\n".join(HEADWAY.splitlines()[:2]) + "\n"
    with pytest.raises(bm.BasemapError, match="缺"):
        bm.parse_headway(one_day)


def test_line_names_from_quoted_csv():
    text = "﻿SEQNO,LineID,LineName,LineColor\n1,'BR',\"'{'文湖線','Wenhu Line'}'\",'#b57a25'\n"
    assert bm.parse_line_names(text) == {"BR": "文湖線"}


# ── 軌道與每站路線 ─────────────────────────────────────────────


def _st(name, lon, lat, rec=True):
    return Station(id="s" + name, name=name, display=name, lon=lon, lat=lat, exits_recorded=rec)


RULES = [
    bm.RouteRule("幹線", "R"),
    bm.RouteRule("幹線", "R-3", "北投", "新北投"),
    bm.RouteRule("環線", "Y"),
    bm.RouteRule("興建中", ""),
]


def test_branch_is_cut_between_its_two_stations():
    feats = [({"RouteName": "幹線"}, LineString([(121.50, 25.0), (121.52, 25.0), (121.5205, 25.0)])),
             ({"RouteName": "興建中"}, LineString([(121.6, 25.0), (121.7, 25.0)]))]
    pts = {"北投": Point(121.51, 25.0), "新北投": Point(121.52, 25.0)}
    tracks = bm.build_rail(feats, RULES, pts)
    by_line = {t.line: t.geom for t in tracks}
    assert set(by_line) == {"R", "R-3"}  # 興建中不畫
    assert by_line["R"].bounds[2] == pytest.approx(121.51)
    # 新北投站後約 50 m 的尾軌併進支線，不留一小截 R
    assert by_line["R-3"].bounds[0] == pytest.approx(121.51) and by_line["R-3"].bounds[2] == pytest.approx(121.5205)


def test_unknown_route_and_missing_branch_station_fail():
    with pytest.raises(bm.BasemapError, match="沒列的 RouteName"):
        bm.build_rail([({"RouteName": "新線"}, LineString([(0, 0), (1, 1)]))], RULES, {})
    with pytest.raises(bm.BasemapError, match="不在本月車站"):
        bm.build_rail([({"RouteName": "幹線"}, LineString([(121.5, 25.0), (121.52, 25.0)]))], RULES, {})


def test_station_lines_ring_override_nearest_and_gaps():
    tracks = [bm.Track("BL", LineString([(121.40, 25.0), (121.45, 25.0)])),
              bm.Track("Y", LineString([(121.45, 25.0005), (121.45, 25.1)])),
              bm.Track("G", LineString([(121.40, 24.99), (121.42, 24.99)]))]
    stations = [
        _st("板橋", 121.4499, 25.0),  # BL 與 Y 都在 150 m 內
        _st("Y板橋", 121.4501, 25.0002, rec=False),  # 環狀線站：只有 Y
        _st("新埔", 121.4499, 25.0001),  # 人工修正：只有 BL
        _st("頂埔", 121.39, 25.0),  # 150 m 內沒有軌道：取最近的 BL，並列為缺段
        _st("七張", 121.42, 24.9915),  # 人工修正；G 約 166 m、BL 約 940 m，兩條都要補直線
    ]
    sl = bm.assign_station_lines(stations, tracks, {"新埔": ["BL"], "七張": ["G", "BL"]})
    assert sl.lines == {"板橋": ["BL", "Y"], "Y板橋": ["Y"], "新埔": ["BL"], "頂埔": ["BL"], "七張": ["G", "BL"]}
    assert sl.method["Y板橋"] == "ring" and sl.method["頂埔"] == "nearest" and sl.method["新埔"] == "override"
    gaps = {(n, l) for n, l, _ in sl.gaps}
    assert gaps == {("頂埔", "BL"), ("七張", "G"), ("七張", "BL")}
    more = bm.add_gap_tracks(tracks, stations, sl.gaps)
    approx = [t for t in more if t.approx]
    assert {t.line for t in approx} == {"BL", "G"}
    assert all(t.geom.coords[-1] in [(s.lon, s.lat) for s in stations] for t in approx)


def test_station_too_far_from_any_track_fails():
    tracks = [bm.Track("BL", LineString([(121.40, 25.0), (121.45, 25.0)]))]
    with pytest.raises(bm.BasemapError, match="超過"):
        bm.assign_station_lines([_st("遠站", 121.40, 25.2)], tracks)
    with pytest.raises(bm.BasemapError, match="不在本月車站"):
        bm.assign_station_lines([_st("甲", 121.4, 25.0)], tracks, {"乙": ["BL"]})


def test_config_station_lines_and_routes_are_valid():
    assert set(bm.load_station_line_overrides()) == {"新埔", "七張"}
    rules = bm.load_routes()
    assert {r.line for r in rules if r.line} == set(bm.LINE_IDS)


# ── 水利署 SHP、來源檢查 ─────────────────────────────────────────


def _riverpoly_zip(path: Path) -> None:
    """仿水利署 RIVERPOLY.zip：riverpoly/riverpoly.{shp,shx,dbf,prj}，EPSG:3826；一個面在臺北、一個在南部。"""
    to3826 = Transformer.from_crs(4326, 3826, always_xy=True)
    shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
    w = shapefile.Writer(shp=shp, shx=shx, dbf=dbf, shapeType=shapefile.POLYGON)
    w.field("RIVERNAME", "C")
    for name, (x0, y0) in (("淡水河", (121.45, 25.10)), ("高屏溪", (120.45, 22.60))):
        ring = [to3826.transform(x, y) for x, y in ((x0, y0), (x0, y0 + 0.01), (x0 + 0.01, y0 + 0.01), (x0 + 0.01, y0), (x0, y0))]
        w.poly([ring])
        w.record(name)
    w.close()
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("riverpoly/riverpoly.shp", shp.getvalue())
        z.writestr("riverpoly/riverpoly.shx", shx.getvalue())
        z.writestr("riverpoly/riverpoly.dbf", dbf.getvalue())
        z.writestr("riverpoly/riverpoly.prj", CRS.from_epsg(3826).to_wkt("WKT1_ESRI"))


def test_wra_shp_is_reprojected_and_clipped_to_bbox(tmp_path):
    z = tmp_path / "RIVERPOLY.zip"
    _riverpoly_zip(z)
    polys = bm.read_shp_polygons(z, (121.3, 24.8, 121.7, 25.3))
    assert len(polys) == 1  # 南部的高屏溪不在底座範圍
    x0, y0, x1, y1 = polys[0].bounds
    assert (x0, y0, x1, y1) == pytest.approx((121.45, 25.10, 121.46, 25.11), abs=1e-6)
    # 解壓成資料夾也讀得到
    folder = tmp_path / "raw" / "basemap" / "RIVERPOLY"
    folder.mkdir(parents=True)
    with zipfile.ZipFile(z) as zz:
        for n in zz.namelist():
            (folder / Path(n).name).write_bytes(zz.read(n))
    assert len(bm.read_shp_polygons(folder, (121.3, 24.8, 121.7, 25.3))) == 1


def _row(**kw):
    base = {"key": "k", "file": "basemap/a.json", "name": "甲", "publisher": "機關", "url": "https://example.org/a",
            "dataset": "https://example.org", "license": "授權", "retrieved": "", "sha256": "", "optional": "false", "note": ""}
    return {**base, **kw}


def test_check_sources_requires_registered_sha_and_tolerates_missing_optional(tmp_path):
    raw = tmp_path
    (raw / "basemap").mkdir()
    f = raw / "basemap" / "a.json"
    f.write_text("{}")
    sha = bm.fingerprint(f)
    wra = _row(key="wra_riverpoly", file="basemap/RIVERPOLY.zip", optional="true")
    ok = bm.check_sources(raw, {"a": _row(sha256=sha), "wra_riverpoly": wra})
    assert ok.present == {"a": f} and ok.missing == [wra]
    with pytest.raises(bm.BasemapError, match="還沒登記"):
        bm.check_sources(raw, {"a": _row()})
    with pytest.raises(bm.BasemapError, match="不符"):
        bm.check_sources(raw, {"a": _row(sha256="0" * 64)})
    with pytest.raises(bm.BasemapError, match="找不到"):
        bm.check_sources(raw, {"b": _row(file="basemap/b.json", sha256=sha)})
    entry = bm.source_entry(wra, missing=True)
    assert entry["missing"] is True and entry["sha256"] == "" and entry["url"] == wra["url"]


def test_fetch_basemap_falls_back_to_manual_file_or_prints_hint(tmp_path, monkeypatch, capsys):
    raw = tmp_path / "raw"
    (raw / "basemap").mkdir(parents=True)
    cfg = tmp_path / "basemap_sources.csv"
    rows = [_row(key="a", file="basemap/a.json"),
            _row(key="wra_riverpoly", file="basemap/RIVERPOLY.zip", optional="true",
                 url="https://gic.wra.gov.tw/x", dataset="https://data.gov.tw/dataset/25781")]
    bm.write_sources(rows, cfg)
    monkeypatch.setattr(bm, "BASEMAP_SOURCES", cfg)
    monkeypatch.setattr(cli, "RAW", raw)

    def fake_download(url, dest):
        if "gic.wra" in url:
            raise ConnectionResetError("連不到")
        dest.write_text('{"ok":1}')

    monkeypatch.setattr(cli, "_download", fake_download)
    cli.main(["fetch-basemap"])
    out = capsys.readouterr().out
    assert "請手動下載" in out and "https://gic.wra.gov.tw/x" in out and str(raw / "basemap" / "RIVERPOLY.zip") in out
    after = bm.load_sources(cfg)
    assert after["a"]["sha256"] == bm.fingerprint(raw / "basemap" / "a.json") and after["a"]["retrieved"]
    assert after["wra_riverpoly"]["sha256"] == ""
    # 手動放入後再跑：下載仍失敗，登記本機檔的 sha256 與取得日期
    _riverpoly_zip(raw / "basemap" / "RIVERPOLY.zip")
    cli.main(["fetch-basemap"])
    after = bm.load_sources(cfg)
    assert after["wra_riverpoly"]["sha256"] == bm.fingerprint(raw / "basemap" / "RIVERPOLY.zip")
    assert after["wra_riverpoly"]["retrieved"]


# ── 地標 ─────────────────────────────────────────────────────


def _district(code, x0, x1):
    return District(code, code, "臺北市", Polygon([(x0, 24.9), (x1, 24.9), (x1, 25.1), (x0, 25.1)]))


def test_landmarks_resolve_station_alias_and_district():
    stations = [_st("大坪林", 121.5, 25.0)]
    bounds = [_district("63000010", 121.4, 121.5), _district("63000020", 121.5, 121.6)]
    lm = bm.Landmark("x", "某地", "tower", 121.55, 25.0, "G大坪林", "taipei-arena", "https://www.wikidata.org/wiki/Q1")
    [out] = bm.resolve_landmarks([lm], stations, bounds, {"G大坪林": "大坪林"}, {"taipei-arena"})
    assert out == {"id": "x", "name": "某地", "kind": "tower", "lon": 121.55, "lat": 25.0, "station": "s大坪林",
                   "district": "63000020", "venue": "taipei-arena"}
    for bad, msg in (
        (bm.Landmark("y", "外海", "boats", 121.9, 25.0, "大坪林", "", "https://a"), "0 個行政區"),
        (bm.Landmark("z", "某地", "tower", 121.55, 25.0, "不存在", "", "https://a"), "不在本月車站"),
        (bm.Landmark("w", "某地", "tower", 121.55, 25.0, "大坪林", "nope", "https://a"), "不在 venues.csv"),
    ):
        with pytest.raises(bm.BasemapError, match=msg):
            bm.resolve_landmarks([bad], stations, bounds, {}, {"taipei-arena"})


def test_build_skips_basemap_for_older_months(tmp_path, capsys):
    (tmp_path / "months.json").write_text(
        json.dumps({"v": CONTRACT_VERSION, "months": ["2025-10", "2026-09"], "latest": "2026-09"}))
    cli._build_basemap(SimpleNamespace(month="2025-10", out=str(tmp_path)), [], None, [], [])
    assert "不重寫" in capsys.readouterr().out
    assert not (tmp_path / "basemap.json").exists()


def test_landmarks_csv_rows_have_source_urls():
    rows = bm.load_landmarks()
    assert len(rows) == 14
    assert all(r.source_url.startswith("https://www.wikidata.org/wiki/Q") for r in rows)


def test_pack_drops_slivers_and_rounds():
    big = box(121.5, 25.0, 121.51, 25.01)
    tiny = box(121.6, 25.0, 121.60001, 25.00001)
    out = bm.pack(MultiPolygon([big, tiny]), 0.0, 1500)
    assert len(out) == 1
    assert all(len(str(v).split(".")[-1]) <= 5 for ring in out[0] for pt in ring for v in pt)


# ── 已提交的 basemap.json ───────────────────────────────────────


def _latest():
    months = json.loads((DATA / "months.json").read_text("utf-8"))
    month = months["latest"]
    return month, json.loads((DATA / month / "stations.json").read_text("utf-8"))["stations"]


@pytest.fixture(scope="module")
def published():
    assert BASEMAP.exists(), "web/public/data/basemap.json 還沒產生"
    return json.loads(BASEMAP.read_text("utf-8"))


def test_published_basemap_header_and_size(published):
    assert BASEMAP.stat().st_size <= bm.MAX_BYTES
    assert published["v"] == CONTRACT_VERSION
    assert isinstance(published["basemapRevision"], int) and published["basemapRevision"] >= 1
    assert published["stationsMonth"] == _latest()[0]
    assert published["levels"] == [40, 120, 250, 400, 600, 850]
    assert [x["id"] for x in published["lines"]] == list(bm.LINE_IDS)
    assert all(x["name"] for x in published["lines"])
    assert "#" not in BASEMAP.read_text("utf-8"), "JSON 不放色碼（AD-21）"


def test_published_every_station_has_lines_ring_is_y(published):
    month, stations = _latest()
    lines = published["stationLines"]
    assert set(lines) == {s["id"] for s in stations}
    assert len(stations) == 120 or month != "2026-09"
    for s in stations:
        assert lines[s["id"]], s["name"]
        assert set(lines[s["id"]]) <= set(bm.LINE_IDS)
        if not s["exitsRecorded"]:
            assert lines[s["id"]] == ["Y"], s["name"]


def test_published_headway_24_hours_null_outside_service(published):
    hw = published["headway"]
    assert set(hw) == set(bm.LINE_IDS) - {"Y"}  # 環狀線不在班距資料
    for line, days in hw.items():
        assert set(days) == {"weekday", "holiday"}
        for cells in days.values():
            assert len(cells) == 24
            assert cells[2:5] == [None, None, None], line  # 停止營運（AD-5）
            for c in cells:
                assert c is None or (len(c) == 2 and 0 < c[0] <= c[1]), (line, c)


def test_published_landmarks_point_to_existing_district_and_station(published):
    month, stations = _latest()
    ids = {s["id"] for s in stations}
    districts = {d["id"] for d in json.loads((DATA / month / "districts.json").read_text("utf-8"))["districts"]}
    with VENUES.open(encoding="utf-8") as f:
        venues = {r["venue_id"] for r in csv.DictReader(f)}
    assert len(published["landmarks"]) == len(bm.load_landmarks())
    for lm in published["landmarks"]:
        assert lm["district"] in districts, lm["id"]
        assert lm["station"] in ids, lm["id"]
        assert lm["venue"] is None or lm["venue"] in venues, lm["id"]
        assert set(lm) == {"id", "name", "kind", "lon", "lat", "station", "district", "venue"}


def test_published_sources_cover_every_input(published):
    names = {s["name"]: s for s in published["sources"]}
    for key, row in bm.load_sources().items():
        assert row["name"] in names, key
        s = names[row["name"]]
        if s.get("missing"):
            assert bm.is_optional(row), f"必要來源 {key} 不能缺"
        else:
            assert s["sha256"] == row["sha256"] and s["retrieved"] == row["retrieved"], key
    for s in published["sources"]:
        assert s["name"] and s["url"] and s["license"]
        assert s.get("missing") or len(s["sha256"]) == 64


def test_published_geometry_is_lonlat_inside_plinth(published):
    month, stations = _latest()
    x0, y0, x1, y1 = published["bbox"]
    codes = sorted({s["district"] for s in stations})
    assert [d["id"] for d in published["districts"]] == codes
    n = len(published["districts"])
    for t in published["tracks"]:
        assert t["line"] in bm.LINE_IDS and isinstance(t["approx"], bool)
        assert len(t["di"]) == len(t["coords"]) and all(-1 <= k < n for k in t["di"])
        assert all(x0 <= x <= x1 and y0 <= y <= y1 for x, y in t["coords"])
    for d in published["districts"]:
        assert len(d["terrain"]) == 6
        for mp in (d["water"], d["green"], *d["terrain"]):
            for poly in mp:
                for ring in poly:
                    assert ring[0] == ring[-1] and len(ring) >= 4
                    assert all(x0 <= x <= x1 and y0 <= y <= y1 for x, y in ring)
    g = published["grid"]
    assert len(g["rows"]) == g["ny"] and all(len(r) == g["nx"] and set(r) <= set("0123456") for r in g["rows"])
