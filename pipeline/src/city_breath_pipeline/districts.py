"""每站所屬行政區：只在這裡判定（AD-9）。

界線來自國土測繪中心（NLSC），臺北市與新北市用同一份；行政區 ID 是 8 碼鄉鎮市區代碼字串
（例如 "63000010"）。判定用的座標就是 stations.json 匯出的 lon/lat，人工修正寫在
config/station_districts.csv，套在判定結果之上。districts.json 的多邊形簡化後，
每站（人工修正的站除外）都必須仍落在自己區內，否則降低簡化，降到下限仍不行就報錯。
"""

from __future__ import annotations

import csv
import hashlib
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

import shapely
import shapely.affinity
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.geometry.base import BaseGeometry

from .stations import CONFIG, Station

GEO_SOURCES = CONFIG / "geo_sources.csv"
OVERRIDES = CONFIG / "station_districts.csv"

# 只需要臺北市與新北市的鄉鎮市區
COUNTY_CODES = {"63000": "臺北市", "65000": "新北市"}

# coverage_simplify 的容差（度，約為被移除三角形面積的平方根）；不通過站內檢查就減半
SIMPLIFY_TOLERANCE = 0.0016
MIN_TOLERANCE = 0.0001
COORD_DECIMALS = 5  # 約 1 公尺
NEAR_BOUNDARY_M = 150
KEEP_DETAIL_M = 250  # 簡化後跑出自己區的站，周邊這個半徑內保留原始界線

_WFS = "{http://www.opengis.net/wfs}"
_GML = "{http://www.opengis.net/gml}"


class DistrictError(ValueError):
    """行政區判定或界線檔有問題；訊息寫給維護者看。"""


# ---------- 來源 ----------


def load_geo_sources(path: Path = GEO_SOURCES) -> dict[str, dict[str, str]]:
    with path.open(encoding="utf-8") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def verify_source(raw_path: Path, source: dict[str, str]) -> None:
    """build 只吃設定檔記錄的那一版界線，避免換了檔卻沒人發現。"""
    if not raw_path.exists():
        raise DistrictError(f"找不到界線檔 {raw_path}，請先跑 `uv run city-breath fetch-geo`")
    actual = sha256_file(raw_path)
    if actual != source["sha256"]:
        raise DistrictError(
            f"{raw_path.name} 的 sha256 {actual} 與 config/geo_sources.csv 記錄的 {source['sha256']} 不符；"
            "若界線確實更新了，跑 `uv run city-breath fetch-geo --update` 並看過差異報告"
        )


# ---------- 界線 ----------


@dataclass
class District:
    code: str  # 8 碼 TOWNCODE
    name: str  # 例：中正區
    city: str  # 臺北市／新北市
    geometry: BaseGeometry  # 經緯度（EPSG:4326）


def _ring(text: str) -> list[tuple[float, float]]:
    return [tuple(float(v) for v in pair.split(",")[:2]) for pair in text.split()]  # type: ignore[misc]


def _polygons(member: ET.Element) -> list[Polygon]:
    polys = []
    for poly in member.iter(f"{_GML}Polygon"):
        outer = poly.find(f"{_GML}outerBoundaryIs/{_GML}LinearRing/{_GML}coordinates")
        if outer is None or not outer.text:
            continue
        holes = [
            _ring(c.text)
            for c in poly.findall(f"{_GML}innerBoundaryIs/{_GML}LinearRing/{_GML}coordinates")
            if c.text
        ]
        polys.append(Polygon(_ring(outer.text), holes))
    return polys


def parse_villages(path: Path) -> list[dict]:
    """NLSC WFS（GML 2，圖層 VILLAGE_NLSC）→ [{towncode, townname, countycode, countyname, geometry}]。"""
    villages = []
    for _, el in ET.iterparse(path, events=("end",)):
        if el.tag != f"{_WFS}VILLAGE_NLSC":
            continue
        attr = {child.tag.removeprefix(_WFS): (child.text or "").strip() for child in el}
        polys = _polygons(el)
        if polys:
            villages.append(
                {
                    "towncode": attr.get("TOWNCODE", ""),
                    "townname": attr.get("TOWNNAME", ""),
                    "countycode": attr.get("COUNTYCODE", ""),
                    "countyname": attr.get("COUNTYNAME", ""),
                    "geometry": shapely.make_valid(MultiPolygon(polys)),
                }
            )
        el.clear()
    return villages


def dissolve_districts(villages: list[dict], county_codes: dict[str, str] = COUNTY_CODES) -> list[District]:
    """村里依 TOWNCODE 合併成鄉鎮市區；只留指定縣市。依代碼排序。"""
    groups: dict[str, list[dict]] = {}
    for v in villages:
        if v["countycode"] in county_codes:
            groups.setdefault(v["towncode"], []).append(v)
    if not groups:
        raise DistrictError("界線檔裡沒有臺北市或新北市的村里，檔案可能不完整")
    out = []
    for code in sorted(groups):
        vs = groups[code]
        if len(code) != 8 or not code.isdigit():
            raise DistrictError(f"鄉鎮市區代碼格式不對：{code!r}")
        names = {v["townname"] for v in vs}
        if len(names) != 1:
            raise DistrictError(f"{code} 對到多個區名：{sorted(names)}")
        geom = shapely.union_all([v["geometry"] for v in vs])
        out.append(District(code, names.pop(), county_codes[vs[0]["countycode"]], _drop_slivers(geom)))
    return out


def _polygons_of(geom: BaseGeometry) -> list[Polygon]:
    """攤平成 Polygon 清單（MultiPolygon、GeometryCollection 逐層展開，線與點略過）。"""
    if isinstance(geom, Polygon):
        return [] if geom.is_empty else [geom]
    return [p for g in getattr(geom, "geoms", []) for p in _polygons_of(g)]


def _drop_slivers(geom: BaseGeometry, min_area: float = 1e-9) -> BaseGeometry:
    """合併村里時共邊浮點誤差可能留下極小的洞或碎片（< 約 10 m²），去掉。"""
    polys = _polygons_of(geom)
    cleaned = [
        Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= min_area])
        for p in polys
        if p.area >= min_area
    ]
    if not cleaned:
        raise DistrictError("合併或簡化後沒有留下任何面")
    return MultiPolygon(cleaned) if len(cleaned) > 1 else cleaned[0]


# ---------- 判定 ----------


@dataclass
class Assignment:
    code: str
    method: str  # "polygon" | "override"
    polygon_code: str | None  # 純界線判定的結果（override 時可能不同；不在任何區時為 None）
    reason: str = ""
    boundary_m: float | None = None  # 到所屬區（界線判定）邊界的距離
    nearest_other: str | None = None  # 最近的其他區代碼
    nearest_other_m: float | None = None


def load_overrides(path: Path = OVERRIDES) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return {r["station_name"].strip(): r for r in csv.DictReader(f) if r.get("station_name", "").strip()}


# 大臺北範圍內用固定緯度的等距近似換成公尺；緯度 24.7–25.3 之間誤差 < 0.5%，足夠判斷 150 m 內
_LAT0 = 25.03
_MX, _MY = 111_320 * math.cos(math.radians(_LAT0)), 110_574


def to_meters(geom: BaseGeometry) -> BaseGeometry:
    return shapely.transform(geom, lambda c: c * [_MX, _MY])


def assign_stations(
    stations: list[Station],
    districts: list[District],
    overrides: dict[str, dict[str, str]] | None = None,
) -> dict[str, Assignment]:
    """站名 → 行政區。座標用 Station.lon/lat（即 stations.json 匯出的值）。"""
    overrides = overrides or {}
    codes = {d.code for d in districts}
    names = {s.name for s in stations}
    for name, row in overrides.items():
        if name not in names:
            raise DistrictError(f"station_districts.csv 的站名 {name!r} 不在本月車站中")
        if row["district_code"] not in codes:
            raise DistrictError(f"station_districts.csv 給 {name} 的代碼 {row['district_code']!r} 不是臺北市或新北市的區")
    for d in districts:
        shapely.prepare(d.geometry)
    metric = {d.code: to_meters(d.geometry) for d in districts}

    out: dict[str, Assignment] = {}
    missing = []
    for s in stations:
        pt = Point(s.lon, s.lat)
        mpt = to_meters(pt)
        hits = [d for d in districts if d.geometry.covers(pt)]
        own = hits[0] if hits else None
        boundary = mpt.distance(metric[own.code].boundary) if own else None
        others = sorted((mpt.distance(metric[d.code]), d.code) for d in districts if d is not own)
        near_m, near_code = others[0] if others else (None, None)
        ov = overrides.get(s.name)
        if ov:
            out[s.name] = Assignment(
                ov["district_code"], "override", own.code if own else None, ov.get("reason", ""), boundary, near_code, near_m
            )
        elif own:
            out[s.name] = Assignment(own.code, "polygon", own.code, "", boundary, near_code, near_m)
        else:
            missing.append(s.name)
    if missing:
        raise DistrictError(f"這些站不在臺北市或新北市任何一區內：{missing}，請在 config/station_districts.csv 補人工修正")
    return out


# ---------- 簡化與輸出 ----------


def _round(geom: BaseGeometry) -> BaseGeometry:
    return shapely.set_precision(geom, 10 ** -COORD_DECIMALS)


def simplify_districts(
    districts: list[District],
    stations: list[Station],
    assignment: dict[str, Assignment],
    tolerance: float = SIMPLIFY_TOLERANCE,
    min_tolerance: float = MIN_TOLERANCE,
) -> tuple[list[BaseGeometry], float]:
    """保持鄰區共邊的簡化，車站周邊保留原始界線；每站（人工修正除外）必須仍在自己區內。

    1. 全部區當成一個 coverage 一起簡化（鄰區共邊，不留縫也不重疊）。
    2. 簡化後跑出自己區的站，在站周邊 KEEP_DETAIL_M 公尺內換回原始界線（各區同一個圓內
       都換回原始幾何，所以仍是不重疊、不留縫的 coverage）。
    3. 座標取到 COORD_DECIMALS 位後再檢查一次；仍有站在區外就把全域容差減半重來，
       降到 min_tolerance 仍不行就報錯（AD-9）。
    """
    by_code = {d.code: i for i, d in enumerate(districts)}
    checks = [(Point(s.lon, s.lat), by_code[assignment[s.name].code], s.name)
              for s in stations if assignment[s.name].method == "polygon"]
    geoms = [d.geometry for d in districts]
    t = tolerance
    while True:
        simple = list(shapely.coverage_simplify(geoms, t)) if t > 0 else list(geoms)
        failing = [pt for pt, i, _ in checks if not simple[i].covers(pt)]
        if failing:
            mask = shapely.union_all([_disc(pt, KEEP_DETAIL_M) for pt in failing])
            simple = [_polygonal(shapely.union(shapely.difference(s, mask), shapely.intersection(o, mask)))
                      for s, o in zip(simple, geoms)]
        simple = [_polygonal(_round(g)) for g in simple]
        outside = [name for pt, i, name in checks if not simple[i].covers(pt)]
        if not outside:
            return simple, t
        if t <= min_tolerance:
            raise DistrictError(f"簡化容差降到 {t} 仍有站落在自己區外：{outside}")
        t = max(t / 2, min_tolerance)


def _disc(pt: Point, radius_m: float) -> BaseGeometry:
    """以 pt 為中心、半徑 radius_m 公尺的 12 邊形（經緯度）。"""
    return shapely.affinity.scale(pt.buffer(1, quad_segs=3), radius_m / _MX, radius_m / _MY, origin=pt)


def _polygonal(geom: BaseGeometry) -> BaseGeometry:
    """只留面（交集、取精度可能留下線或點），去掉碎片。"""
    if isinstance(geom, (Polygon, MultiPolygon)):
        return _drop_slivers(geom)
    return _drop_slivers(shapely.union_all(_polygons_of(geom)))


def _coords(geom: BaseGeometry) -> list:
    polys = _polygons_of(geom)
    r = lambda ring: [[round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)] for x, y in ring.coords]  # noqa: E731
    return [[r(p.exterior), *[r(h) for h in p.interiors]] for p in polys if not p.is_empty]


@dataclass
class DistrictResult:
    """build 交給 export 的結果：每站代碼、districts.json 的內容、報告用的細節。"""

    station_codes: dict[str, str]
    districts: list[dict]
    tolerance: float
    assignment: dict[str, Assignment] = field(default_factory=dict)
    source: dict[str, str] = field(default_factory=dict)


def build_districts(
    stations: list[Station],
    districts: list[District],
    overrides: dict[str, dict[str, str]] | None = None,
    source: dict[str, str] | None = None,
) -> DistrictResult:
    assignment = assign_stations(stations, districts, overrides)
    simple, tol = simplify_districts(districts, stations, assignment)
    index = {s.name: i for i, s in enumerate(stations)}
    out = []
    for d, g in zip(districts, simple):
        members = [index[s.name] for s in stations if assignment[s.name].code == d.code]
        c = d.geometry.centroid
        out.append(
            {
                "id": d.code,
                "name": d.name,
                "city": d.city,
                "centroid": [round(c.x, COORD_DECIMALS), round(c.y, COORD_DECIMALS)],
                "stations": members,
                "inflowPartial": any(not stations[i].exits_recorded for i in members),
                "polygon": _coords(g),
            }
        )
    return DistrictResult({n: a.code for n, a in assignment.items()}, out, tol, assignment, source or {})


def load_districts(raw_path: Path, source: dict[str, str] | None = None) -> list[District]:
    if source is not None:
        verify_source(raw_path, source)
    return dissolve_districts(parse_villages(raw_path))


# ---------- 差異報告 ----------


def _short(name: str) -> str:
    return name.removesuffix("區")


def diff_rows(
    stations: list[Station],
    result: DistrictResult,
    draft: dict[str, str],
    api: dict[str, str] | None = None,
    near_m: float = NEAR_BOUNDARY_M,
) -> list[dict]:
    """官方≠草稿、離界線 near_m 內、人工修正、或與 NLSC 點位查詢 API 不一致的站。"""
    names = {d["id"]: d["name"] for d in result.districts}
    rows = []
    for s in stations:
        a = result.assignment[s.name]
        official = names[a.code]
        d = draft.get(s.name)
        api_name = (api or {}).get(s.name)
        flags = []
        if d is None:
            flags.append("草稿缺")
        elif _short(official) != _short(d):
            flags.append("與草稿不同")
        if a.nearest_other_m is not None and a.nearest_other_m <= near_m:
            flags.append("近界線")
        if a.method == "override":
            flags.append("人工修正")
        # API 以地籍判定，點落在道路等無地號處會查無（None），不算不一致
        if api_name is not None and _short(api_name) != _short(official):
            flags.append("與 API 不同")
        if flags:
            rows.append(
                {
                    "station": s.name,
                    "display": s.display,
                    "official": official,
                    "code": a.code,
                    "draft": d or "",
                    "api": api_name or "",
                    "near": names.get(a.nearest_other or "", ""),
                    "near_m": a.nearest_other_m,
                    "lon": s.lon,
                    "lat": s.lat,
                    "flags": flags,
                }
            )
    return rows


def render_report(
    month: str,
    stations: list[Station],
    result: DistrictResult,
    rows: list[dict],
    api: dict[str, str | None] | None = None,
) -> str:
    """給 Piwi 掃的 Markdown 差異報告。"""
    src = result.source
    differ = [r for r in rows if "與草稿不同" in r["flags"] or "草稿缺" in r["flags"]]
    near_only = [r for r in rows if r not in differ]
    api_bad = [r for r in rows if "與 API 不同" in r["flags"]]
    used = [d for d in result.districts if d["stations"]]

    def m(v: float | None) -> str:
        return "—" if v is None else f"{v:.0f}"

    def line(r: dict) -> str:
        loc = f"[{r['lon']:.5f}, {r['lat']:.5f}](https://www.google.com/maps?q={r['lat']},{r['lon']})"
        api_col = f" {r['api'] or '查無地號'} |" if api is not None else ""
        return (f"| {r['display']} | **{r['official']}** `{r['code']}` | {r['draft'] or '—'} | {r['near']} | "
                f"{m(r['near_m'])} |{api_col} {loc} | {'、'.join(r['flags'])} |")

    api_head = " NLSC API |" if api is not None else ""
    api_sep = " --- |" if api is not None else ""
    head = (f"| 站 | 官方（代碼） | 草稿 | 最近的他區 | 距離 m |{api_head} 座標（出口平均） | 標記 |\n"
            f"| --- | --- | --- | --- | ---: |{api_sep} --- | --- |")
    out = [
        f"# 1.8 每站行政區：官方判定與手寫草稿的差異（{month}）",
        "",
        f"- 界線：{src.get('publisher', '')}〈{src.get('name', '')}〉，取得 {src.get('retrieved', '')}，"
        f"sha256 `{src.get('sha256', '')[:12]}…`（網址與完整雜湊在 `pipeline/config/geo_sources.csv`）。",
        "- 判定座標：`stations.json` 的 `lon/lat`（出口座標平均），與網站用的是同一組。",
        "- 草稿：`design/research/station_district.json`（手寫）。",
        f"- 結果：{len(stations)} 站都有行政區，分在 {len(used)} 個區；全部 {len(result.districts)} 區"
        "（臺北市 12＋新北市 29）都寫進 `districts.json`。",
        f"- **與草稿不同：{len(differ)} 站**；離其他區界線 {NEAR_BOUNDARY_M} m 內、與草稿相同：{len(near_only)} 站。",
    ]
    if api is not None:
        missing = sum(1 for v in api.values() if v is None)
        out.append(
            f"- 交叉驗證：逐站呼叫國土測繪中心點位查詢 API（TownVillagePointQuery），與界線判定不一致 {len(api_bad)} 站"
            f"（{missing} 站落在道路等無地號處，API 查無，不計）。這支 API 以地籍判定，與村里界線相差幾公尺屬正常。"
        )
    out += [
        "",
        "「距離」是站點到最近的其他區的距離。距離很小（例如 20 m 內）的站，多半是出口平均座標剛好落在當作區界的道路上，"
        "官方判定只差幾公尺。要改某站的行政區，在 `pipeline/config/station_districts.csv` 加一列"
        "（`station_name,district_code,reason`），重跑 `build`。",
        "",
        "## 與草稿不同",
        "",
        head,
        *[line(r) for r in differ],
        "",
        f"## 離界線 {NEAR_BOUNDARY_M} m 內（與草稿相同）",
        "",
        head,
        *[line(r) for r in near_only],
        "",
        "## 各區車站數",
        "",
        "| 區 | 代碼 | 縣市 | 車站數 | 有環狀線站（「誰來」不完整） |",
        "| --- | --- | --- | ---: | --- |",
        *[f"| {d['name']} | `{d['id']}` | {d['city']} | {len(d['stations'])} | {'是' if d['inflowPartial'] else ''} |"
          for d in used],
        "",
    ]
    return "\n".join(out)
