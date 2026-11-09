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
    headway.csv        臺北捷運路線發車班距頻率資料服務（臺北捷運公司）
                       https://data.taipei/dataset/detail?id=6d15899a-ff77-4a39-8203-a3addfe1fa28
    cop_N25_00_E121_00.tif / cop_N24_00_E121_00.tif（第四個參數的資料夾）
                       Copernicus DEM GLO-30（ESA，© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018，
                       依 Copernicus 計畫授權免費使用）https://copernicus-dem-30m.s3.amazonaws.com/
    ntpc_river_10.geojson / ntpc_river_8.geojson
                       新北市政府水利局地理資訊服務的「中央管河川」「市管河川」面（水利署水利規劃分署 108 年資料）
                       https://wrd.ntpc.gov.tw/arcgis/rest/services/Rain/river_00131/MapServer/10 與 /8
                       （query?where=1=1&outFields=RIVERNAME&outSR=4326&maxAllowableOffset=0.00005&f=geojson）
                       這個地圖服務沒有標示開放授權；正式版改用水利署的「河川河道」開放資料（data.gov.tw 25781，
                       SHP 在 gic.wra.gov.tw，本環境連不到）。

限制：公園綠地只有臺北市的資料；新北的公園清單（data.ntpc.gov.tw）只有地址、沒有範圍。
"""
import csv
import json
import math
import re
import sys
import xml.etree.ElementTree as ET

from pyproj import Transformer
from shapely import transform as shp_transform
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, shape
from shapely.ops import unary_union

RAW, REPO, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
DEM_DIR = sys.argv[4] if len(sys.argv) > 4 else None  # Copernicus GLO-30 兩塊：N25_00_E121_00、N24_00_E121_00
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
tp_water = unary_union(river_parts)

green_parts = []
for name in ("wg_park.json", "wg_riverside.json"):
    for f in json.load(open(f"{RAW}/{name}"))["features"]:
        green_parts.append(to_wgs84(shape(f["geometry"])).buffer(0))
green = unary_union(green_parts).difference(tp_water)

# 新北（與臺北交界的大河）：中央管河川面含高灘地；臺北市那側已有高灘地綠地，就讓綠地優先
ntpc = unary_union([shape(f["geometry"]).buffer(0) for n in ("ntpc_river_10.geojson", "ntpc_river_8.geojson")
                    for f in json.load(open(f"{RAW}/{n}"))["features"]])
water = unary_union([tp_water, ntpc.difference(green)]).buffer(0.00002).buffer(-0.00002)

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

# 路網圖缺了延伸段的端點站（例如板南線頂埔段）：用直線把最近的同線軌道端點接到車站，並記在 approx
stations = json.load(open(f"{REPO}/web/public/data/{MONTH}/stations.json"))["stations"]
approx = []
for st in stations:
    p = Point(st["lon"], st["lat"])
    d, line, ls = min(((ls.distance(p), line, ls) for line, ls in rail), key=lambda x: x[0])
    if 0.006 <= d < 0.03:
        ends = [Point(ls.coords[0]), Point(ls.coords[-1])]
        e = min(ends, key=lambda q: q.distance(p))
        rail.append((line, LineString([(e.x, e.y), (p.x, p.y)])))
        approx.append(f"{st['display']}（{LINE_NAMES.get(line, line)}）")

M2 = 111_000 * 100_700  # 1 平方度約多少平方公尺（北緯 25 度）

# 班距：每條線每小時的平均發車間隔（分鐘），用主路線（X-1）；小碧潭支線用 G-3。營運外為 null。
headway = {}
for r in csv.DictReader(open(f"{RAW}/headway.csv", encoding="utf-8-sig")):
    route = r["RouteID"].strip("'")
    line = {"BR-1": "BR", "R-1": "R", "G-1": "G", "G-3": "G-3", "O-1": "O", "BL-1": "BL"}.get(route)
    if not line:
        continue
    day = "weekday" if "平日" in r["ServiceDays"] else "holiday"
    periods = [(int(a[:2]) * 60 + int(a[3:]), (int(b[:2]) or 24) * 60 + int(b[3:]), (int(lo) + int(hi)) / 2)
               for _, a, b, lo, hi in re.findall(r"\{(\d),'(\d\d:\d\d)','(\d\d:\d\d)',(\d+),(\d+)\}", r["Headways"])]
    hours = []
    for h in range(24):
        m = h * 60 + 30
        hw = next((v for a, b, v in periods if a <= m < b), None)
        hours.append(hw if hw else None)
    headway.setdefault(line, {})[day] = hours

# 整條路線（不切區）給列車動畫用，每個頂點記下它在哪一區（-1 表示不在 21 區內）
dist_ids = list(DIST)
def which(lon, lat):
    p = Point(lon, lat)
    for k, did in enumerate(dist_ids):
        if DIST[did].contains(p):
            return k
    return -1
tracks = []
for line, ls in rail:
    ls = ls.simplify(0.00004)
    if ls.length < 0.002:
        continue
    pts = rnd(ls.coords)
    tracks.append({"line": line, "coords": pts, "di": [which(x, y) for x, y in pts]})

# 每站經過哪幾條線：站點 150 公尺內有該線軌道
station_lines = {}
for st in stations:
    p = Point(st["lon"], st["lat"])
    near = sorted({line for line, ls in rail if ls.distance(p) < 0.0015})
    if not near:  # 端點站：軌道圖資停在站前，改取 600 公尺內最近的一條
        d, line = min((ls.distance(p), line) for line, ls in rail)
        near = [line] if d < 0.006 else []
    station_lines[st["id"]] = near

out = {"month": MONTH, "lines": LINE_NAMES, "districts": {}, "tracks": tracks, "headway": headway, "stationLines": station_lines, "approxTrack": approx, "sources": [
    {"layer": "捷運路線", "title": "臺北都會區大眾捷運系統路網圖", "publisher": "臺北市政府捷運局", "url": "https://data.taipei/dataset/detail?id=afccd2ac-75b1-4362-9099-45983e332776"},
    {"layer": "河川", "title": "臺北市河流（河川用地）", "publisher": "臺北市政府工務局水利處", "url": "https://data.taipei/dataset/detail?id=9b854e09-b44e-4e02-ae5a-47b860fdba20"},
    {"layer": "河川", "title": "中央管河川、市管河川（新北市政府水利局地圖服務）", "publisher": "新北市政府水利局；水利署水利規劃分署", "url": "https://wrd.ntpc.gov.tw/arcgis/rest/services/Rain/river_00131/MapServer"},
    {"layer": "列車間隔", "title": "臺北捷運路線發車班距頻率資料服務", "publisher": "臺北捷運公司", "url": "https://data.taipei/dataset/detail?id=6d15899a-ff77-4a39-8203-a3addfe1fa28"},
    {"layer": "綠地", "title": "臺北市水綠地圖集：公園、河濱高灘地", "publisher": "臺北市政府工務局", "url": "https://data.taipei/dataset/detail?id=5b277432-f534-4d09-a24c-d3f6b514e042"},
    {"layer": "路線色", "title": "臺北捷運路線資料服務", "publisher": "臺北捷運公司", "url": "https://data.taipei/dataset/detail?id=cb9b4bd5-a648-41be-9287-11bc5b3e2343"},
], "notes": ["公園綠地只有臺北市資料。", "新北河川取自新北市政府水利局地圖服務，未標示開放授權，正式版改用水利署河川河道開放資料。", "信義線東延段興建中，未畫。環狀線不在臺北捷運班距資料內，不畫列車。", "data.taipei 資料授權：政府資料開放授權條款第 1 版。"]}
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

# ── 地形：把盆地四周的山做成一層層的等高線台地（真實高程，垂直方向在前端誇張） ──
if DEM_DIR:
    import numpy as np
    import rasterio
    from rasterio import features
    from rasterio.merge import merge
    from scipy.ndimage import gaussian_filter
    from shapely.geometry import box

    allp = unary_union(list(DIST.values()))
    lo0, la0, lo1, la1 = allp.bounds
    kx = math.cos(math.radians((la0 + la1) / 2))
    scale = 100 / max((lo1 - lo0) * kx, la1 - la0)
    mla, mlo = 8 / scale, 8 / (scale * kx)          # 前端底座四周各留 8 單位
    B = (lo0 - mlo, la0 - mla, lo1 + mlo, la1 + mla)
    srcs = [rasterio.open(f"{DEM_DIR}/cop_{t}.tif") for t in ("N25_00_E121_00", "N24_00_E121_00")]
    dem, tr = merge(srcs, bounds=B, res=(1 / 1800, 1 / 1800))   # 約 60 公尺
    dem = gaussian_filter(np.where(dem[0] < -100, 0, dem[0]).astype("float32"), 1.2)
    LEVELS = [40, 120, 250, 400, 600, 850]
    plinth = box(*B)
    outside = plinth.difference(allp.buffer(0.0002))
    def vec(mask, min_km2=0.25, tol=0.0007):
        geoms = [shape(g) for g, v in features.shapes(mask.astype("uint8"), mask=mask, transform=tr) if v == 1]
        u = unary_union(geoms).buffer(0.0005).buffer(-0.0005).simplify(tol, preserve_topology=True)
        return [p for p in polys(u) if p.area * M2 / 1e6 > min_km2]
    terr = {"levels": LEVELS, "bbox": [round(v, 5) for v in B], "districts": {}, "outside": []}
    level_geoms = [unary_union(vec(dem >= L)) for L in LEVELS]
    def pack(g):
        out_ = []
        for q in polys(g):
            if q.area * M2 / 1e6 < 0.12:
                continue
            out_.append([rnd(q.exterior.coords)] + [rnd(r.coords) for r in q.interiors if Polygon(r).area * M2 / 1e6 > 0.12])
        return out_
    for did, dpoly in DIST.items():
        terr["districts"][did] = [pack(g.intersection(dpoly).difference(water)) for g in level_geoms]
    terr["outside"] = [pack(g.intersection(outside)) for g in level_geoms]
    # 海：高程 0 以下、在 21 區以外；底座外圍的河（新北、臺北河川面在 21 區以外的部分）
    sea = unary_union(vec(dem <= 0.5, min_km2=1.0, tol=0.0008)).intersection(outside)
    terr["sea"] = pack(sea)
    terr["outsideWater"] = pack(unary_union([tp_water, ntpc]).intersection(outside).simplify(0.0002))
    # 高程等級格網（前端放樹、放站、擋掉山上的建築用）：每格存 0–6 的等級
    step = 0.003
    nx, ny = int((B[2] - B[0]) / step) + 1, int((B[3] - B[1]) / step) + 1
    inv = ~tr
    grid = []
    for j in range(ny):
        la = B[3] - j * step
        row = []
        for i in range(nx):
            c, r = inv * (B[0] + i * step, la)
            r, c = min(max(int(r), 0), dem.shape[0] - 1), min(max(int(c), 0), dem.shape[1] - 1)
            e = dem[r, c]
            row.append(str(sum(e >= L for L in LEVELS)))
        grid.append("".join(row))
    terr["grid"] = {"lon0": round(B[0], 5), "lat0": round(B[3], 5), "step": step, "nx": nx, "ny": ny, "rows": grid}
    out["terrain"] = terr
    out["sources"].append({"layer": "地形", "title": "Copernicus DEM GLO-30", "publisher": "European Space Agency／Copernicus", "url": "https://copernicus-dem-30m.s3.amazonaws.com/readme.html"})
    print("terrain levels", [len(polys(g)) for g in level_geoms], "grid", nx, ny)

json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("pieces", size)
