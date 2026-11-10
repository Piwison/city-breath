"""不分月份的底圖：web/public/data/basemap.json（AD-21）。

原型 design/prototypes/2.1-diorama/tools/build_layers.py 的做法搬進管線：
地形台地與高程等級格網（Copernicus DEM）、海與底座外的河、依行政區切開的河川與綠地、捷運軌道、
每站所屬路線、各線每小時班距，以及 config/landmarks.csv 的地標（AD-25）。

- 原始檔由 `city-breath fetch-basemap` 下載到 data/raw/basemap/，網址、取得日期、sha256 記在
  config/basemap_sources.csv；build 只吃 csv 記錄的那一版。
- 幾何一律經緯度、5 位小數（AD-12）；高程存公尺，垂直誇張在前端 projection.ts。
- 行政區用 AD-9 同一份國土測繪中心界線（未簡化的原始幾何）切與判定。
- 路線 ID 固定（AD-21），JSON 不放色碼；車站用站 ID（AD-2 的例外）。
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import shapely
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import substring

from . import CONTRACT_VERSION, DAY_TYPES, HOURS
from .districts import District, sha256_file, to_meters
from .stations import CONFIG, Station, canonical

BASEMAP_SOURCES = CONFIG / "basemap_sources.csv"
LANDMARKS = CONFIG / "landmarks.csv"
MRT_ROUTES = CONFIG / "mrt_routes.csv"
STATION_LINES = CONFIG / "station_lines.csv"
# landmarks.csv 的座標向 Wikidata 查詢的日期；改座標時一起改
LANDMARKS_RETRIEVED = "2026-11-10"

# 只換內容（新的 DEM、補上水利署河道）就加一；改形狀照 AD-18 升 CONTRACT_VERSION
BASEMAP_REVISION = 1

LEVELS = (40, 120, 250, 400, 600, 850)  # 公尺（AD-21）
LINE_IDS = ("BR", "R", "R-3", "G", "G-3", "O", "BL", "Y")
# 環狀線由新北捷運營運，不在臺北捷運路線資料（mrt_lines.csv）裡
EXTRA_LINE_NAMES = {"Y": "環狀線"}
# 班距：主路線（RouteID X-1）與兩條支線；RouteID R-3、G-3 與路線資料的 LineID 同名
HEADWAY_ROUTES = {"BR-1": "BR", "R-1": "R", "R-3": "R-3", "G-1": "G", "G-3": "G-3", "O-1": "O", "BL-1": "BL"}

MAX_BYTES = 1_000_000  # AD-6：basemap.json 目標 ≤ 1 MB 未壓縮
COORD_DECIMALS = 5
NEAR_TRACK_M = 150  # 站與軌道距離在這以內就算這站有這條線
MAX_GAP_M = 3000  # 軌道缺段以直線補的上限；更遠代表對錯線或資料有問題
BRANCH_CUT_M = 300  # 支線切段：兩端車站離線段在這以內才切
M2_PER_DEG2 = 111_000 * 100_700  # 北緯 25 度附近 1 平方度約多少平方公尺（只用來丟掉碎片）
DEM_RES = 1 / 1800  # 約 60 公尺（GLO-30 的一半解析度）
GRID_STEP = 0.003  # 高程等級格網約 300 公尺一格
TERRAIN_TOL = 0.0002  # 台地切區後再簡化（約 20 公尺）
PLINTH_MARGIN = 0.08  # 底座四周留最大邊長的 8%（原型：100 單位的模型留 8 單位）


class BasemapError(ValueError):
    """底圖原始檔或設定有問題；訊息寫給維護者看。"""


# ── 來源 ─────────────────────────────────────────────────


def load_sources(path: Path | None = None) -> dict[str, dict[str, str]]:
    with (path or BASEMAP_SOURCES).open(encoding="utf-8") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def write_sources(rows: list[dict[str, str]], path: Path | None = None) -> None:
    with (path or BASEMAP_SOURCES).open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader()
        w.writerows(rows)


def is_optional(row: dict[str, str]) -> bool:
    return row.get("optional", "").strip().lower() == "true"


def local_path(raw: Path, row: dict[str, str]) -> Path | None:
    """原始檔在本機的位置；zip 也可以解壓成同名資料夾（裡面要有一個 .shp）。都沒有就 None。"""
    p = raw / row["file"]
    if p.exists():
        return p
    if p.suffix == ".zip":
        folder = p.with_suffix("")
        if folder.is_dir() and list(folder.glob("*.shp")):
            return folder
    return None


def fingerprint(path: Path) -> str:
    """檔案的 sha256；資料夾（解壓的 SHP）則是 .shp＋.dbf 內容依序串接的 sha256。"""
    if path.is_file():
        return sha256_file(path)
    import hashlib

    h = hashlib.sha256()
    shp = _single_shp(path)
    for part in (shp, shp.with_suffix(".dbf")):
        if part.exists():
            h.update(part.read_bytes())
    return h.hexdigest()


def _single_shp(folder: Path) -> Path:
    shps = sorted(folder.glob("*.shp"))
    if len(shps) != 1:
        raise BasemapError(f"{folder} 裡要剛好一個 .shp，找到 {len(shps)} 個")
    return shps[0]


@dataclass
class SourceCheck:
    present: dict[str, Path]  # key → 本機檔
    missing: list[dict[str, str]]  # 缺的選用來源（csv 列）


def check_sources(raw: Path, sources: dict[str, dict[str, str]]) -> SourceCheck:
    """build 只吃 csv 記錄的那一版：必要來源缺檔或 sha256 不符就失敗；選用來源缺檔記為 missing。"""
    present, missing = {}, []
    for key, row in sources.items():
        p = local_path(raw, row)
        if p is None:
            if is_optional(row):
                missing.append(row)
                continue
            raise BasemapError(f"找不到底圖原始檔 {raw / row['file']}（{row['name']}），請先跑 `uv run city-breath fetch-basemap`")
        if not row["sha256"]:
            raise BasemapError(f"{row['file']} 還沒登記 sha256，請跑 `uv run city-breath fetch-basemap` 寫進 config/basemap_sources.csv")
        actual = fingerprint(p)
        if actual != row["sha256"]:
            raise BasemapError(
                f"{p.name} 的 sha256 {actual} 與 config/basemap_sources.csv 記錄的 {row['sha256']} 不符；"
                "若來源確實更新了，跑 `uv run city-breath fetch-basemap --update`，build 後把 BASEMAP_REVISION 加一"
            )
        present[key] = p
    return SourceCheck(present, missing)


def manual_download_hint(row: dict[str, str], raw: Path) -> str:
    dest = raw / row["file"]
    return (
        f"{row['publisher']}〈{row['name']}〉（{row['dataset']}）下載失敗。這個網址在部分網路環境連不到，請手動下載：\n"
        f"  1. 用瀏覽器開 {row['url']}\n"
        f"  2. 下載到的 zip 原樣存成 {dest}（不用解壓）；若瀏覽器自動解壓成資料夾，"
        f"把整個資料夾（含 .shp、.shx、.dbf、.prj）改名放到 {dest.with_suffix('')}/\n"
        "  3. 再跑一次 `uv run city-breath fetch-basemap`，會登記這個檔的 sha256 與取得日期\n"
        "  4. 跑 `uv run city-breath build --month <最新月份>` 重產 basemap.json（新北河川會補上；"
        "basemap.py 的 BASEMAP_REVISION 加一）\n"
        "  在那之前 build 照常跑，basemap.json 只有臺北市河川，sources 會記下這筆缺檔。"
    )


# ── 讀檔 ─────────────────────────────────────────────────


_TM2 = None


def _tm2():
    global _TM2
    if _TM2 is None:
        from pyproj import Transformer

        _TM2 = Transformer.from_crs(3826, 4326, always_xy=True)
    return _TM2


def _reproject(geom: BaseGeometry, transformer) -> BaseGeometry:
    return shapely.transform(geom, lambda xy: list(zip(*transformer.transform(xy[:, 0], xy[:, 1]))))


def tm2_to_wgs84(geom: BaseGeometry) -> BaseGeometry:
    return _reproject(geom, _tm2())


def read_geojson(path: Path, crs3826: bool = True) -> list[tuple[dict, BaseGeometry]]:
    body = json.loads(path.read_text("utf-8-sig"))
    out = []
    for f in body["features"]:
        if not f.get("geometry"):
            continue
        g = shape(f["geometry"])
        out.append((f.get("properties") or {}, tm2_to_wgs84(g) if crs3826 else g))
    return out


_KML = "{http://www.opengis.net/kml/2.2}"


def read_kml_polygons(path: Path) -> list[Polygon]:
    def ring(el: ET.Element) -> list[tuple[float, float]]:
        return [tuple(map(float, c.split(",")[:2])) for c in (el.text or "").split()]  # type: ignore[misc]

    out = []
    for poly in ET.parse(path).getroot().iter(f"{_KML}Polygon"):
        outer = poly.find(f"{_KML}outerBoundaryIs/{_KML}LinearRing/{_KML}coordinates")
        if outer is None:
            continue
        o = ring(outer)
        if len(o) < 4:
            continue
        holes = [ring(e) for e in poly.findall(f"{_KML}innerBoundaryIs/{_KML}LinearRing/{_KML}coordinates")]
        out.append(shapely.make_valid(Polygon(o, [h for h in holes if len(h) >= 4])))
    return out


def read_shp_polygons(path: Path, bbox: tuple[float, float, float, float]) -> list[BaseGeometry]:
    """水利署河川河道 SHP（zip 或解壓的資料夾）→ 經緯度的面，只留與 bbox 相交的。座標系統讀 .prj。"""
    import shapefile
    from pyproj import CRS, Transformer

    if path.is_dir():
        shp = _single_shp(path)
        parts = {ext: shp.with_suffix(ext).read_bytes() if shp.with_suffix(ext).exists() else None
                 for ext in (".shp", ".shx", ".dbf", ".prj")}
    else:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".shp")]
            if len(names) != 1:
                raise BasemapError(f"{path.name} 裡要剛好一個 .shp，找到 {names}")
            stem = names[0][:-4]
            lower = {n.lower(): n for n in z.namelist()}
            parts = {ext: z.read(lower[(stem + ext).lower()]) if (stem + ext).lower() in lower else None
                     for ext in (".shp", ".shx", ".dbf", ".prj")}
    if parts[".prj"] is None:
        raise BasemapError(f"{path.name} 缺 .prj，無法判斷座標系統")
    crs = CRS.from_wkt(parts[".prj"].decode("utf-8", errors="replace"))
    transformer = None if crs.equals(CRS.from_epsg(4326)) else Transformer.from_crs(crs, 4326, always_xy=True)
    reader = shapefile.Reader(
        shp=io.BytesIO(parts[".shp"]),
        shx=io.BytesIO(parts[".shx"]) if parts[".shx"] else None,
        dbf=io.BytesIO(parts[".dbf"]) if parts[".dbf"] else None,
        encodingErrors="replace",
    )
    clip = box(*bbox)
    out = []
    for sh in reader.iterShapes():
        if not sh.points:
            continue
        g = shape(sh.__geo_interface__)
        if transformer is not None:
            g = _reproject(g, transformer)
        if g.intersects(clip):
            out.append(shapely.make_valid(g))
    return out


# ── 路線與班距 ─────────────────────────────────────────────


def parse_line_names(text: str) -> dict[str, str]:
    """mrt_lines.csv（欄位值帶單引號，例 `'BR'`、`'{'文湖線','Wenhu Line'}'`）→ {LineID: 中文名}。"""
    out = {}
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        line = r["LineID"].strip("'")
        m = re.search(r"\{'([^']+)'", r["LineName"])
        if m:
            out[line] = m.group(1)
    return out


_PERIOD = re.compile(r"\{(\d),'(\d\d):(\d\d)','(\d\d):(\d\d)',(\d+),(\d+)\}")


def parse_headway(text: str) -> dict[str, dict[str, list[list[int] | None]]]:
    """班距 csv → {line: {weekday|holiday: 24 格}}，每格是該小時內的發車間隔區間 `[最短, 最長]`（分鐘）。

    一小時內跨兩個時段就取兩段的最短與最長；不在營運時段、或來源寫 0（沒有這種車）的小時為 None。
    只取 HEADWAY_ROUTES 列出的 RouteID。
    """
    out: dict[str, dict[str, list]] = {}
    for r in csv.DictReader(io.StringIO(text.lstrip("﻿"))):
        line = HEADWAY_ROUTES.get(r["RouteID"].strip("'"))
        if not line:
            continue
        if "平日" in r["ServiceDays"]:
            day = "weekday"
        elif "假日" in r["ServiceDays"]:
            day = "holiday"
        else:
            raise BasemapError(f"班距資料 {r['RouteID']} 的 ServiceDays 看不懂：{r['ServiceDays']}")
        periods = []
        for _, h0, m0, h1, m1, lo, hi in _PERIOD.findall(r["Headways"]):
            start, end = int(h0) * 60 + int(m0), int(h1) * 60 + int(m1)
            if end <= start:  # 00:00 或 24:00 結束＝到午夜
                end += 24 * 60
            periods.append((start, end, int(lo), int(hi)))
        if not periods:
            raise BasemapError(f"班距資料 {r['RouteID']} {day} 沒有時段")
        hours: list[list[int] | None] = []
        for h in HOURS:
            a, b = h * 60, h * 60 + 60
            live = [(lo, hi) for s, e, lo, hi in periods if s < b and e > a and lo > 0 and hi > 0]
            hours.append([min(lo for lo, _ in live), max(hi for _, hi in live)] if live else None)
        if day in out.get(line, {}):
            raise BasemapError(f"班距資料 {line} {day} 出現兩次")
        out.setdefault(line, {})[day] = hours
    for line, days in out.items():
        if set(days) != set(DAY_TYPES):
            raise BasemapError(f"班距資料 {line} 缺 {set(DAY_TYPES) - set(days)}")
    return {k: out[k] for k in LINE_IDS if k in out}


@dataclass
class RouteRule:
    route: str
    line: str  # 空字串＝不畫
    cut_from: str = ""
    cut_to: str = ""


def load_routes(path: Path | None = None) -> list[RouteRule]:
    with (path or MRT_ROUTES).open(encoding="utf-8") as f:
        rules = [RouteRule(r["route_name"].strip(), r["line"].strip(), r["cut_from"].strip(), r["cut_to"].strip())
                 for r in csv.DictReader(f)]
    for r in rules:
        if r.line and r.line not in LINE_IDS:
            raise BasemapError(f"mrt_routes.csv：{r.route} 的路線 {r.line!r} 不在 {LINE_IDS}")
    return rules


def _lines_of(geom: BaseGeometry) -> list[LineString]:
    if geom.is_empty:
        return []
    if isinstance(geom, LineString):
        return [geom]
    return [ls for g in getattr(geom, "geoms", []) for ls in _lines_of(g)]


@dataclass
class Track:
    line: str
    geom: LineString
    approx: bool = False
    note: str = ""


def build_rail(
    features: list[tuple[dict, BaseGeometry]],
    rules: list[RouteRule],
    station_points: dict[str, Point],
) -> list[Track]:
    """路網圖 → 路線軌道。RouteName 對到路線；有 cut_from／cut_to 的規則把兩站之間那段切成支線。"""
    main = {r.route: r.line for r in rules if not r.cut_from}
    cuts = [r for r in rules if r.cut_from]
    unknown = sorted({p.get("RouteName") for p, _ in features} - set(main))
    if unknown:
        raise BasemapError(f"路網圖有 mrt_routes.csv 沒列的 RouteName：{unknown}")
    pieces: list[Track] = []
    for props, g in features:
        line = main[props["RouteName"]]
        if not line:
            continue
        pieces += [Track(line, ls) for ls in _lines_of(g) if ls.length > 1e-6]
    for rule in cuts:
        a, b = station_points.get(rule.cut_from), station_points.get(rule.cut_to)
        if a is None or b is None:
            raise BasemapError(f"mrt_routes.csv 支線 {rule.line} 的站 {rule.cut_from}／{rule.cut_to} 不在本月車站")
        parent = main.get(rule.route)
        done = False
        out: list[Track] = []
        for t in pieces:
            if t.line != parent or done:
                out.append(t)
                continue
            mt = to_meters(t.geom)
            if mt.distance(to_meters(a)) > BRANCH_CUT_M or mt.distance(to_meters(b)) > BRANCH_CUT_M:
                out.append(t)
                continue
            da, db = sorted((t.geom.project(a), t.geom.project(b)))
            # 線段若在支線那端只多出一小截（< BRANCH_CUT_M，例：新北投站後的尾軌），併進支線
            if to_meters(substring(t.geom, 0, da)).length < BRANCH_CUT_M:
                da = 0.0
            if to_meters(substring(t.geom, db, t.geom.length)).length < BRANCH_CUT_M:
                db = t.geom.length
            for s, e, ln in ((0, da, parent), (da, db, rule.line), (db, t.geom.length, parent)):
                if e - s > 1e-6:
                    out.append(Track(ln, substring(t.geom, s, e)))
            done = True
        if not done:
            raise BasemapError(f"找不到同時經過 {rule.cut_from}、{rule.cut_to} 的 {rule.route} 線段，無法切出 {rule.line}")
        pieces = out
    return pieces


def load_station_line_overrides(path: Path | None = None) -> dict[str, list[str]]:
    path = path or STATION_LINES
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        out = {r["station_name"].strip(): r["lines"].split() for r in csv.DictReader(f) if r["station_name"].strip()}
    for name, lines in out.items():
        bad = [x for x in lines if x not in LINE_IDS]
        if not lines or bad:
            raise BasemapError(f"station_lines.csv：{name} 的路線 {lines} 有不認得的 ID")
    return out


@dataclass
class StationLines:
    lines: dict[str, list[str]]  # 站名 → 路線（LINE_IDS 順序）
    method: dict[str, str]  # 站名 → "geometry" | "nearest" | "override" | "ring"
    gaps: list[tuple[str, str, float]] = field(default_factory=list)  # (站名, 路線, 距離 m)：要以直線補


def assign_station_lines(
    stations: list[Station], tracks: list[Track], overrides: dict[str, list[str]] | None = None
) -> StationLines:
    """每站的路線：環狀線站（出站未入檔）固定 Y；人工修正優先；其餘取 150 m 內有軌道的線，
    都沒有就取最近的一條（3 km 內）。最後列出站與自己路線軌道距離超過 150 m 的，交給 add_gap_tracks 補直線。"""
    overrides = overrides or {}
    names = {s.name for s in stations}
    stray = sorted(set(overrides) - names)
    if stray:
        raise BasemapError(f"station_lines.csv 的站名不在本月車站：{stray}")
    metric = [(t.line, to_meters(t.geom)) for t in tracks]
    order = {k: i for i, k in enumerate(LINE_IDS)}
    lines, method, gaps = {}, {}, []
    for s in stations:
        p = to_meters(Point(s.lon, s.lat))
        dist: dict[str, float] = {}
        for line, g in metric:
            d = p.distance(g)
            dist[line] = min(d, dist.get(line, math.inf))
        if not s.exits_recorded:
            chosen, how = ["Y"], "ring"
        elif s.name in overrides:
            chosen, how = list(overrides[s.name]), "override"
        else:
            chosen = [k for k, d in dist.items() if d <= NEAR_TRACK_M]
            how = "geometry"
            if not chosen:
                k = min(dist, key=dist.get)
                if dist[k] > MAX_GAP_M:
                    raise BasemapError(f"{s.name} 離最近的軌道（{k}）{dist[k]:.0f} m，超過 {MAX_GAP_M} m")
                chosen, how = [k], "nearest"
        chosen = sorted(set(chosen), key=order.__getitem__)
        for k in chosen:
            d = dist.get(k, math.inf)
            if d > MAX_GAP_M:
                raise BasemapError(f"{s.name} 的路線 {k} 軌道在 {d:.0f} m 外，超過 {MAX_GAP_M} m")
            if d > NEAR_TRACK_M:
                gaps.append((s.name, k, d))
        lines[s.name], method[s.name] = chosen, how
    return StationLines(lines, method, gaps)


def add_gap_tracks(tracks: list[Track], stations: list[Station], gaps: list[tuple[str, str, float]]) -> list[Track]:
    """路網圖缺段（例：板南線頂埔段）：把同線最近的軌道端點用直線接到車站，標 approx。"""
    by_name = {s.name: s for s in stations}
    out = list(tracks)
    for name, line, _ in gaps:
        s = by_name[name]
        p = Point(s.lon, s.lat)
        ends = [Point(c) for t in tracks if t.line == line for c in (t.geom.coords[0], t.geom.coords[-1])]
        e = min(ends, key=lambda q: to_meters(q).distance(to_meters(p)))
        out.append(Track(line, LineString([(e.x, e.y), (p.x, p.y)]), approx=True, note=f"{s.display}（{line}）"))
    return out


# ── 幾何輸出 ─────────────────────────────────────────────


def _r(v: float) -> float:
    return round(v, COORD_DECIMALS)


def _ring(coords) -> list[list[float]]:
    return [[_r(x), _r(y)] for x, y, *_ in coords]


def polygons_of(geom: BaseGeometry) -> list[Polygon]:
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [p for g in getattr(geom, "geoms", []) for p in polygons_of(g)]


def pack(geom: BaseGeometry, tol: float, min_m2: float) -> list:
    """面 → GeoJSON MultiPolygon 座標：簡化、丟掉小於 min_m2 的面與洞、5 位小數。"""
    out = []
    for p in polygons_of(geom):
        p = p.simplify(tol, preserve_topology=True)
        for q in polygons_of(p):
            if q.area * M2_PER_DEG2 < min_m2:
                continue
            ext = _ring(q.exterior.coords)
            if len(ext) < 4:
                continue
            holes = [_ring(r.coords) for r in q.interiors if Polygon(r).area * M2_PER_DEG2 >= min_m2]
            out.append([ext, *[h for h in holes if len(h) >= 4]])
    return out


def _union(geoms: list[BaseGeometry]) -> BaseGeometry:
    return shapely.union_all([shapely.make_valid(g) for g in geoms]) if geoms else Polygon()


# ── 地形 ─────────────────────────────────────────────────


@dataclass
class Terrain:
    bbox: tuple[float, float, float, float]
    levels: list[BaseGeometry]  # 每層「高程 ≥ L」的面
    sea: BaseGeometry
    grid: dict


def plinth_bbox(area: BaseGeometry) -> tuple[float, float, float, float]:
    lo0, la0, lo1, la1 = area.bounds
    kx = math.cos(math.radians((la0 + la1) / 2))
    span = max((lo1 - lo0) * kx, la1 - la0)
    mla, mlo = span * PLINTH_MARGIN, span * PLINTH_MARGIN / kx
    return (_r(lo0 - mlo), _r(la0 - mla), _r(lo1 + mlo), _r(la1 + mla))


def build_terrain(dem_paths: list[Path], bbox: tuple[float, float, float, float]) -> Terrain:
    """DEM → 六層「≥ L 公尺」的面、海（≤ 0.5 公尺且連成 1 km² 以上）、高程等級格網（每格 0–6）。"""
    import numpy as np
    import rasterio
    from rasterio import features
    from rasterio.merge import merge
    from scipy.ndimage import gaussian_filter

    srcs = [rasterio.open(p) for p in dem_paths]
    try:
        dem, tr = merge(srcs, bounds=bbox, res=(DEM_RES, DEM_RES))
    finally:
        for s in srcs:
            s.close()
    # 海面沒有圖塊（視為 0）；極端負值是無資料
    dem = gaussian_filter(np.where(dem[0] < -100, 0, dem[0]).astype("float32"), 1.2)

    def vec(mask, min_km2: float = 0.25, tol: float = 0.0007) -> BaseGeometry:
        geoms = [shape(g) for g, v in features.shapes(mask.astype("uint8"), mask=mask, transform=tr) if v == 1]
        u = _union(geoms).buffer(0.0005).buffer(-0.0005).simplify(tol, preserve_topology=True)
        return _union([p for p in polygons_of(u) if p.area * M2_PER_DEG2 / 1e6 > min_km2])

    levels = [vec(dem >= L) for L in LEVELS]
    sea = vec(dem <= 0.5, min_km2=1.0, tol=0.0008)
    nx = int(round((bbox[2] - bbox[0]) / GRID_STEP)) + 1
    ny = int(round((bbox[3] - bbox[1]) / GRID_STEP)) + 1
    inv = ~tr
    rows = []
    for j in range(ny):
        la = bbox[3] - j * GRID_STEP
        row = []
        for i in range(nx):
            c, r = inv * (bbox[0] + i * GRID_STEP, la)
            r = min(max(int(r), 0), dem.shape[0] - 1)
            c = min(max(int(c), 0), dem.shape[1] - 1)
            row.append(str(sum(dem[r, c] >= L for L in LEVELS)))
        rows.append("".join(row))
    grid = {"lon0": _r(bbox[0]), "lat0": _r(bbox[3]), "step": GRID_STEP, "nx": nx, "ny": ny, "rows": rows}
    return Terrain(bbox, levels, sea, grid)


# ── 地標 ─────────────────────────────────────────────────


@dataclass
class Landmark:
    id: str
    name: str
    kind: str
    lon: float
    lat: float
    station_name: str
    venue: str
    source_url: str


def load_landmarks(path: Path | None = None) -> list[Landmark]:
    with (path or LANDMARKS).open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out, seen = [], set()
    for r in rows:
        lid = r["id"].strip()
        if not re.fullmatch(r"[a-z0-9-]+", lid) or lid in seen:
            raise BasemapError(f"landmarks.csv 的 id {lid!r} 要是小寫英數與連字號且不重複")
        seen.add(lid)
        if not r["source_url"].startswith(("https://", "http://")):
            raise BasemapError(f"landmarks.csv 的 {lid} 沒有位置來源網址")
        if not r["kind"].strip() or not r["name"].strip():
            raise BasemapError(f"landmarks.csv 的 {lid} 缺 name 或 kind")
        out.append(Landmark(lid, r["name"].strip(), r["kind"].strip(), float(r["lon"]), float(r["lat"]),
                            r["station_name"].strip(), r["venue_id"].strip(), r["source_url"].strip()))
    return out


def resolve_landmarks(
    landmarks: list[Landmark],
    stations: list[Station],
    boundaries: list[District],
    aliases: dict[str, str],
    venue_ids: set[str],
) -> list[dict]:
    """站名經別名對到站 ID（AD-2）；行政區用 AD-9 同一份界線判定（AD-25）；場館代碼要在 venues.csv。"""
    by_name = {s.name: s for s in stations}
    errors, out = [], []
    for lm in landmarks:
        st = by_name.get(canonical(lm.station_name, aliases))
        if st is None:
            errors.append(f"{lm.id}：車站 {lm.station_name!r} 不在本月車站")
            continue
        if lm.venue and lm.venue not in venue_ids:
            errors.append(f"{lm.id}：場館 {lm.venue!r} 不在 venues.csv")
            continue
        pt = Point(lm.lon, lm.lat)
        hits = [d.code for d in boundaries if d.geometry.covers(pt)]
        if len(hits) != 1:
            errors.append(f"{lm.id}：座標 ({lm.lon}, {lm.lat}) 落在 {len(hits)} 個行政區（臺北市、新北市）")
            continue
        out.append({"id": lm.id, "name": lm.name, "kind": lm.kind, "lon": _r(lm.lon), "lat": _r(lm.lat),
                    "station": st.id, "district": hits[0], "venue": lm.venue or None})
    if errors:
        raise BasemapError("landmarks.csv 有問題：\n  " + "\n  ".join(errors))
    return out


# ── 組裝 ─────────────────────────────────────────────────


@dataclass
class BasemapInputs:
    stations: list[Station]
    station_codes: dict[str, str]  # 站名 → 8 碼（districts.station_codes）
    district_polygons: dict[str, BaseGeometry]  # 8 碼 → districts.json 的簡化界線（切區用）
    boundaries: list[District]  # 臺北市、新北市全部的區（未簡化；判定地標所屬區用，與判站同一套）
    sources: dict[str, dict[str, str]]  # basemap_sources.csv
    check: SourceCheck
    aliases: dict[str, str]
    venue_ids: set[str]
    extra_sources: list[dict]  # 界線、出口座標、地標表（已是 sources[] 的形狀）
    month: str


def source_entry(row: dict[str, str], missing: bool = False) -> dict:
    e = {"name": row["name"], "publisher": row["publisher"], "url": row["url"], "dataset": row["dataset"],
         "license": row["license"], "retrieved": row["retrieved"], "sha256": row["sha256"]}
    if missing:
        e.update(missing=True, retrieved="", sha256="", note="原始檔未取得，這一版底圖沒有用到")
    return e


def build_basemap(inp: BasemapInputs) -> tuple[dict, dict]:
    """回傳 (basemap.json 內容, 摘要)。"""
    P = inp.check.present
    codes = sorted(set(inp.station_codes.values()))
    missing_codes = [c for c in codes if c not in inp.district_polygons]
    if missing_codes:
        raise BasemapError(f"車站所在的區 {missing_codes} 不在 districts.json")
    # 切區用 districts.json 的簡化界線：和網站畫的行政區薄片同一個形狀，切出來的河川、綠地、台地才貼得齊
    dist_geoms = [shapely.make_valid(inp.district_polygons[c]) for c in codes]
    for g in dist_geoms:
        shapely.prepare(g)
    area = _union(dist_geoms)
    bbox = plinth_bbox(area)
    plinth = box(*bbox)
    outside = plinth.difference(area.buffer(0.0002))

    # 河川與綠地
    tp_water = _union(read_kml_polygons(P["taipei_rivers"]))
    green = _union([g for key in ("taipei_parks", "taipei_riverside") for _, g in read_geojson(P[key])]).difference(tp_water)
    wra = _union(read_shp_polygons(P["wra_riverpoly"], bbox)) if "wra_riverpoly" in P else Polygon()
    # 水利署河道面含高灘地；臺北市那側已有高灘地綠地，讓綠地優先（同原型）
    water = _union([tp_water, wra.difference(green)]).buffer(0.00002).buffer(-0.00002)

    # 地形
    terrain = build_terrain([P["dem_n25"], P["dem_n24"]], bbox)

    # 軌道與每站路線
    points = {s.name: Point(s.lon, s.lat) for s in inp.stations}
    rail = build_rail(read_geojson(P["mrt_network"]), load_routes(), points)
    sl = assign_station_lines(inp.stations, rail, load_station_line_overrides())
    rail = add_gap_tracks(rail, inp.stations, sl.gaps)
    names = parse_line_names(P["mrt_lines"].read_text("utf-8-sig"))
    lines = [{"id": k, "name": names.get(k) or EXTRA_LINE_NAMES.get(k)} for k in LINE_IDS]
    if any(x["name"] is None for x in lines):
        raise BasemapError(f"路線資料缺名稱：{[x['id'] for x in lines if x['name'] is None]}")
    headway = parse_headway(P["mrt_headway"].read_text("utf-8-sig"))

    def which(lon: float, lat: float) -> int:
        pt = Point(lon, lat)
        for k, g in enumerate(dist_geoms):
            if g.covers(pt):
                return k
        return -1

    tracks = []
    for t in rail:
        g = t.geom if t.approx else t.geom.simplify(0.00004)
        if g.length < 0.0005 and not t.approx:
            continue
        coords = _ring(g.coords)
        tracks.append({"line": t.line, "coords": coords, "di": [which(x, y) for x, y in coords], "approx": t.approx})
    tracks.sort(key=lambda t: (LINE_IDS.index(t["line"]), t["approx"], t["coords"]))

    # 依區切開
    districts = []
    for c, g in zip(codes, dist_geoms):
        districts.append({
            "id": c,
            "water": pack(water.intersection(g), 0.00010, 1500),
            "green": pack(green.intersection(g), 0.00008, 3000),
            "terrain": [pack(lv.intersection(g).difference(water), TERRAIN_TOL, 120_000) for lv in terrain.levels],
        })

    landmarks = resolve_landmarks(load_landmarks(), inp.stations, inp.boundaries, inp.aliases, inp.venue_ids)

    sources = [source_entry(row, missing=key not in P) for key, row in inp.sources.items()] + inp.extra_sources
    notes = [
        "地形：Copernicus DEM GLO-30 是數值地表模型（含建物與植被），重取樣成約 60 公尺並平滑後，切成 "
        + "／".join(str(x) for x in LEVELS) + " 公尺六層；高程存公尺，垂直誇張在網站端。",
        "公園綠地只有臺北市資料；新北市沒有公開的公園範圍。",
        "信義線東延段興建中，未畫。路網圖缺段以直線補上，標 approx。",
        "河川：臺北市河流（河川用地）與水利署河川河道合併；河道面含高灘地，臺北市已有河濱高灘地綠地的地方畫成綠地。",
        "班距是臺北捷運公司公告的發車間隔區間（分鐘），各線取 RouteID 為「線-1」的路線，另有新北投（R-3）、"
        "小碧潭（G-3）支線；同線其他 RouteID 未列。環狀線不在這份資料裡，沒有班距。",
        "地標位置取自 Wikidata（CC0），造型是示意；所屬行政區由管線依國土測繪中心界線判定。",
    ]
    if inp.check.missing:
        notes.append("缺檔、這一版沒有用到的來源：" + "、".join(r["name"] for r in inp.check.missing)
                     + "（見 sources 中 missing 為 true 者）；缺水利署河川河道時只有臺北市河川。")

    body = {
        "v": CONTRACT_VERSION,
        "basemapRevision": BASEMAP_REVISION,
        "stationsMonth": inp.month,
        "bbox": list(bbox),
        "levels": list(LEVELS),
        "lines": lines,
        "districts": districts,
        "outside": {"terrain": [pack(lv.intersection(outside), TERRAIN_TOL, 120_000) for lv in terrain.levels]},
        "sea": pack(terrain.sea.intersection(outside), TERRAIN_TOL, 1e6),
        "outsideWater": pack(_union([tp_water, wra]).intersection(outside), 0.0002, 1500),
        "grid": terrain.grid,
        "tracks": tracks,
        "stationLines": {s.id: sl.lines[s.name] for s in sorted(inp.stations, key=lambda s: s.id)},
        "headway": headway,
        "landmarks": landmarks,
        "sources": sources,
        "notes": notes,
    }
    summary = {
        "stations": len(inp.stations),
        "lineMethods": {m: sum(1 for v in sl.method.values() if v == m) for m in sorted(set(sl.method.values()))},
        "approx": [t.note for t in rail if t.approx],
        "missing": [r["name"] for r in inp.check.missing],
        "tracks": len(tracks),
        "landmarks": len(landmarks),
    }
    return body, summary


def multipolygon(coords: list) -> BaseGeometry:
    """GeoJSON MultiPolygon 座標（districts.json 的 polygon）→ shapely。"""
    return shapely.make_valid(MultiPolygon([Polygon(p[0], p[1:]) for p in coords]))
