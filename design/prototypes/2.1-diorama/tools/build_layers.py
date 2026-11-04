"""2.1 原型第二輪的疊圖資料：捷運路線、河川、綠地，依 21 個行政區切開。

只給原型用（design/prototypes/2.1-diorama/layers.json）。正式版要改成管線輸出（AD-1、AD-12），
另開 story；這支腳本記錄來源與處理方式，讓那張票照著做。

用法（需 pyproj、shapely）：
    python3 -I build_layers.py <原始檔資料夾> <repo 根目錄> <輸出 layers.json>

原始檔（不進版控，從 data.taipei 下載；授權：政府資料開放授權條款第 1 版）：
    mrt_network.json   臺北都會區大眾捷運系統路網圖（臺北市政府捷運局，EPSG:3826）
                       https://data.taipei/dataset/detail?id=afccd2ac-75b1-4362-9099-45983e332776
    rivers.kml         臺北市河流（臺北市政府工務局水利處，河川用地面，WGS84）
                       https://data.taipei/dataset/detail?id=9b854e09-b44e-4e02-ae5a-47b860fdba20
    wg_park.json       臺北市水綠地圖集：公園（臺北市政府工務局，EPSG:3826）
    wg_riverside.json  臺北市水綠地圖集：河濱高灘地
                       https://data.taipei/dataset/detail?id=5b277432-f534-4d09-a24c-d3f6b514e042
    lines.csv          臺北捷運路線資料服務（臺北捷運公司，路線色碼）
                       https://data.taipei/dataset/detail?id=cb9b4bd5-a648-41be-9287-11bc5b3e2343

限制：河川與綠地只有臺北市的資料，新北各區的河段（例如大漢溪）與公園沒有收錄。
"""
import json
import sys
import xml.etree.ElementTree as ET

from pyproj import Transformer
from shapely import transform as shp_transform
from shapely.geometry import LineString, MultiPolygon, Polygon, shape
from shapely.ops import unary_union

RAW, REPO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
MONTH = "2026-09"

# 路網圖的 RouteName 是興建時期的路段名，對到現行營運路線（路線代碼與色碼見 lines.csv）。
ROUTE_TO_LINE = {
    "淡水線": "R", "信義線": "R",
    "蘆洲線": "O", "中和線": "O", "新莊線": "O",
    "板橋線": "BL", "南港線": "BL",
    "新店線": "G", "松山線": "G", "小南門線": "G",
    "碧潭支線": "G-3",
    "木柵線": "BR", "內湖線": "BR",
    "環狀線": "Y",
}
SKIP_ROUTES = {"信義線東延段"}  # 興建中，尚未營運
LINE_NAMES = {
    "BR": "文湖線", "R": "淡水信義線", "G": "松山新店線", "O": "中和新蘆線", "BL": "板南線",
    "R-3": "新北投支線", "G-3": "小碧潭支線", "Y": "環狀線",
}
XINBEITOU = (121.5030, 25.1368)  # 新北投站附近；淡水線的短支段若在這附近就是新北投支線

tm2 = Transformer.from_crs(3826, 4326, always_xy=True)


def to_wgs84(geom):
    return shp_transform(geom, lambda xy: list(zip(*tm2.transform(xy[:, 0], xy[:, 1]))), include_z=False)


def polys(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "Polygon":
        return [geom]
    return [g for g in getattr(geom, "geoms", []) if g.geom_type == "Polygon"]


def lines(geom):
    if geom.is_empty:
        return []
    if geom.geom_type == "LineString":
        return [geom]
    out = []
    for g in getattr(geom, "geoms", []):
        out.extend(lines(g))
    return out


def rnd(coords):
    return [[round(x, 5), round(y, 5)] for x, y in coords]


# 21 個流向行政區
flows = json.load(open(f"{REPO}/web/public/data/{MONTH}/district-flows.json"))
dj = {d["id"]: d for d in json.load(open(f"{REPO}/web/public/data/{MONTH}/districts.json"))["districts"]}
DIST = {}
for did in flows["districts"]:
    d = dj[did]
    DIST[did] = MultiPolygon([Polygon(p[0], p[1:]) for p in d["polygon"]]).buffer(0)

# 河川用地（KML）
ns = "{http://www.opengis.net/kml/2.2}"
river_parts = []
for poly in ET.parse(f"{RAW}/rivers.kml").getroot().iter(f"{ns}Polygon"):
    def ring(el):
        return [tuple(map(float, c.split(",")[:2])) for c in el.text.split()]
    outer = poly.find(f"{ns}outerBoundaryIs/{ns}LinearRing/{ns}coordinates")
    if outer is None:
        continue
    inners = [ring(e) for e in poly.findall(f"{ns}innerBoundaryIs/{ns}LinearRing/{ns}coordinates")]
    o = ring(outer)
    if len(o) > 3:
        river_parts.append(Polygon(o, inners).buffer(0))
water = unary_union(river_parts).buffer(0.00002).buffer(-0.00002)

green_parts = []
for name in ("wg_park.json", "wg_riverside.json"):
    for f in json.load(open(f"{RAW}/{name}"))["features"]:
        green_parts.append(to_wgs84(shape(f["geometry"])).buffer(0))
green = unary_union(green_parts).difference(water)

rail = []
for f in json.load(open(f"{RAW}/mrt_network.json"))["features"]:
    route = f["properties"]["RouteName"]
    if route in SKIP_ROUTES:
        continue
    line = ROUTE_TO_LINE[route]
    g = to_wgs84(shape(f["geometry"]))
    if route == "淡水線" and g.length < 0.02:
        c = g.centroid
        if abs(c.x - XINBEITOU[0]) < 0.01 and abs(c.y - XINBEITOU[1]) < 0.01:
            line = "R-3"
    for ls in lines(g):
        rail.append((line, ls))

M2 = 111_000 * 100_700  # 1 平方度約多少平方公尺（北緯 25 度）
out = {"month": MONTH, "lines": LINE_NAMES, "districts": {}, "sources": [
    {"layer": "捷運路線", "title": "臺北都會區大眾捷運系統路網圖", "publisher": "臺北市政府捷運局", "url": "https://data.taipei/dataset/detail?id=afccd2ac-75b1-4362-9099-45983e332776"},
    {"layer": "河川", "title": "臺北市河流（河川用地）", "publisher": "臺北市政府工務局水利處", "url": "https://data.taipei/dataset/detail?id=9b854e09-b44e-4e02-ae5a-47b860fdba20"},
    {"layer": "綠地", "title": "臺北市水綠地圖集：公園、河濱高灘地", "publisher": "臺北市政府工務局", "url": "https://data.taipei/dataset/detail?id=5b277432-f534-4d09-a24c-d3f6b514e042"},
    {"layer": "路線色", "title": "臺北捷運路線資料服務", "publisher": "臺北捷運公司", "url": "https://data.taipei/dataset/detail?id=cb9b4bd5-a648-41be-9287-11bc5b3e2343"},
], "notes": ["河川與綠地只有臺北市資料，新北各區沒有收錄。", "信義線東延段興建中，未畫。", "授權：政府資料開放授權條款第 1 版。"]}
size = {"water": 0, "green": 0, "rail": 0}
for did, dpoly in DIST.items():
    entry = {"water": [], "green": [], "rail": []}
    for kind, geom, tol, min_m2 in (("water", water, 0.00010, 1500), ("green", green, 0.00008, 3000)):
        for p in polys(geom.intersection(dpoly)):
            p = p.simplify(tol, preserve_topology=True)
            if p.is_empty or p.area * M2 < min_m2:
                continue
            for q in polys(p):
                entry[kind].append([rnd(q.exterior.coords)] + [rnd(r.coords) for r in q.interiors if Polygon(r).area * M2 > min_m2])
                size[kind] += 1
    for line, ls in rail:
        for piece in lines(ls.intersection(dpoly)):
            piece = piece.simplify(0.00004)
            if piece.length < 0.0005:
                continue
            entry["rail"].append({"line": line, "coords": rnd(piece.coords)})
            size["rail"] += 1
    out["districts"][did] = entry
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("pieces", size)
