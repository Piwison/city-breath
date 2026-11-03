"""命令列入口。

    uv run city-breath fetch --month 2026-09          # 下載月檔與出口座標到 data/raw/
    uv run city-breath fetch-geo                      # 下載行政區界線到 data/raw/geo/
    uv run city-breath build --month 2026-09          # 彙總並輸出到 web/public/data/
    uv run city-breath district-report --month 2026-09 --draft ../design/research/station_district.json
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from . import districts as geo
from .aggregate import aggregate_month
from .export import SOURCE, export_daily, export_events, export_month
from .stations import build_stations, canonical, load_aliases, load_exit_coordinates
from .venues import VenueError, load_venues, resolve_venues

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "data" / "raw"
WEB_DATA = ROOT / "web" / "public" / "data"
INDEX_URL = (
    "https://data.taipei/api/dataset/63f31c7e-7fc3-418b-bd82-b95158755b4d/"
    "resource/eb481f58-1238-4cff-8caa-fa7bb20cb4f4/download"
)
EXITS_URL = (
    "https://data.taipei/api/dataset/cfa4778c-62c1-497b-b704-756231de348b/"
    "resource/307a7f61-e302-4108-a817-877ccbfca7c1/download"
)


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url, timeout=600) as r, tmp.open("wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.replace(dest)


def monthly_url(month: str) -> str:
    year, mon = (int(x) for x in month.split("-"))
    with urllib.request.urlopen(INDEX_URL, timeout=60) as r:
        rows = list(csv.DictReader(io.StringIO(r.read().decode("utf-8-sig"))))
    for row in rows:
        if int(row["西元年"]) == year and int(row["月"]) == mon:
            return row["URL"].replace("http://", "https://", 1)
    raise SystemExit(f"索引中找不到 {month}，最新是 {rows[-1]['西元年']}-{int(rows[-1]['月']):02d}")


def cmd_fetch(args) -> None:
    dest = RAW / f"od_{args.month.replace('-', '')}.csv"
    if dest.exists() and not args.force:
        print(f"已存在 {dest}（--force 重新下載）")
    else:
        url = monthly_url(args.month)
        print(f"下載 {url}")
        _download(url, dest)
        print(f"完成 {dest} {dest.stat().st_size / 1e6:.0f} MB")
    exits = RAW / "exits.csv"
    if not exits.exists() or args.force:
        _download(EXITS_URL, exits)
        print(f"完成 {exits}")


def cmd_fetch_geo(args) -> None:
    """下載行政區界線；sha256 與 config/geo_sources.csv 不同時要加 --update 才改寫設定。"""
    sources = geo.load_geo_sources()
    rows = list(sources.values())
    changed = False
    for row in rows:
        dest = RAW / row["file"]
        new = dest.with_name(dest.name + ".new")
        print(f"下載 {row['name']}：{row['url']}")
        _download(row["url"], new)
        sha = geo.sha256_file(new)
        if sha == row["sha256"]:
            new.replace(dest)
            print(f"完成 {dest}（sha256 與設定相符）")
            continue
        print(f"注意：下載到的 sha256 {sha} 與設定的 {row['sha256']} 不同，界線可能已更新")
        if args.update:
            new.replace(dest)
            row["sha256"], row["retrieved"] = sha, dt.date.today().isoformat()
            changed = True
        else:
            print(f"原檔不動，新檔留在 {new}；確認後用 `fetch-geo --update` 換上並寫回 config/geo_sources.csv，"
                  "再跑 build 與 district-report")
    if changed:
        with geo.GEO_SOURCES.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
        print(f"已更新 {geo.GEO_SOURCES}")


def _file_source(path: Path, **fields) -> dict:
    stamp = dt.datetime.fromtimestamp(path.stat().st_mtime).date().isoformat()
    return {**fields, "retrieved": stamp, "sha256": geo.sha256_file(path)}


def _load_month(args):
    raw = Path(args.raw) if getattr(args, "raw", None) else RAW / f"od_{args.month.replace('-', '')}.csv"
    aliases = load_aliases()
    venues = load_venues(aliases)  # 場館站（1.10）：逐日檔的來源行政區只算這些迄站
    agg = aggregate_month(raw, args.month, aliases, arrival_dests={v.station for v in venues})
    coords = load_exit_coordinates(RAW / "exits.csv")
    stations = build_stations(agg.origin_names, agg.dest_names, coords)
    # 防呆：所有原始站名都應該在別名表或直接對得上
    unknown = {canonical(n, aliases) for n in agg.origin_names | agg.dest_names} - {s.name for s in stations}
    if unknown:
        raise SystemExit(f"未對應的站名：{sorted(unknown)}")
    try:
        venue_stations = resolve_venues(venues, stations)
    except VenueError as e:
        raise SystemExit(str(e)) from e
    return raw, agg, stations, venue_stations


def _districts(stations):
    src = geo.load_geo_sources()["town_boundary"]
    try:
        boundaries = geo.load_districts(RAW / src["file"], src)
        return geo.build_districts(stations, boundaries, geo.load_overrides(), src)
    except geo.DistrictError as e:
        raise SystemExit(str(e)) from e


def cmd_build(args) -> None:
    t = time.time()
    raw, agg, stations, venue_stations = _load_month(args)
    districts = _districts(stations)
    src = districts.source
    sources = [
        _file_source(raw, name=SOURCE["name"], publisher=SOURCE["publisher"], url=SOURCE["url"], license=SOURCE["license"]),
        _file_source(RAW / "exits.csv", name="臺北捷運車站出入口座標", publisher=SOURCE["publisher"],
                     url="https://data.gov.tw/dataset/128428", license=SOURCE["license"]),
        {"name": src["name"], "publisher": src["publisher"], "url": src["url"], "dataset": src["dataset"],
         "license": src["license"], "retrieved": src["retrieved"], "sha256": src["sha256"]},
    ]
    result = export_month(agg, stations, Path(args.out), districts, sources)
    m = result["meta"]
    print(f"{args.month}：{m['rawRows']:,} 列，排除 {m['droppedRows']:,} 列，{m['stationCount']} 站，"
          f"日數 {m['dayCounts']}，營運時段 {m['serviceHours']}")
    print(f"分群 k={m['clustering']['k']} silhouette={m['clustering']['silhouette']}")
    sup = result["suppression"]
    print(f"起訖格 {sup['cells']:,}：少於 10 人隱藏 {sup['primary']:,} 格，次要隱藏 {sup['secondary']:,} 格")
    for ty in result["clusters"].types:
        flag = "（草稿）" if ty["draft"] else ""
        print(f"  #{ty['id']} {ty['label']}{flag} {ty['size']} 站，例：{'、'.join(ty['examples'])}  {ty['features']}")
    overrides = sum(a.method == "override" for a in districts.assignment.values())
    print(f"行政區 {len(districts.districts)} 個，{len(districts.station_codes)} 站都有行政區（人工修正 {overrides} 站），"
          f"簡化容差 {districts.tolerance}，districts.json {result['sizes']['districts.json'] / 1e3:.0f} KB")
    daily = export_daily(agg, stations, districts, venue_stations, Path(args.out))
    dsup = daily["suppression"]
    print(f"逐日檔 {len(daily['sizes'])} 個共 {sum(daily['sizes'].values()) / 1e3:.0f} KB（最大 "
          f"{max(daily['sizes'].values()) / 1e3:.0f} KB）；場館站 {len(venue_stations)} 站，來源行政區格 "
          f"{dsup['cells']:,}：少於 10 人隱藏 {dsup['primary']:,} 格，次要隱藏 {dsup['secondary']:,} 格")
    result["sizes"].update(daily["sizes"])
    events = export_events(agg, stations, Path(args.out))
    _report_anomalies(events["detection"], stations)
    result["sizes"].update(events["sizes"])
    total = sum(result["sizes"].values())
    biggest = sorted(result["sizes"].items(), key=lambda kv: -kv[1])[:4]
    print(f"輸出 {len(result['sizes'])} 檔共 {total / 1e6:.2f} MB；最大：" + "、".join(f"{k} {v / 1e3:.0f} KB" for k, v in biggest))
    print(f"耗時 {time.time() - t:.1f}s")


def _report_anomalies(det, stations) -> None:
    """events.json 的摘要；平日卻比平常少 15% 以上的日子，提示可能漏列假日（AD-4）。"""
    city = det.city()
    print("全市級異常日：" + ("、".join(f"{a.date:%m/%d} {a.ratio:.2f}" for a in city) or "無"))
    types = {d.date: d.day_type for d in det.days}
    for a in city:
        if a.ratio < 1 and types[a.date] == "weekday":
            print(f"注意：{a.date} 是平日但全市進站只有平常的 {a.ratio:.0%}，是否漏列 config/holidays.csv？")
    top = sorted(det.stations(), key=lambda a: -a.ratio)[:5]
    print(f"站級異常 {len(det.stations())} 筆（暫定門檻）；最高："
          + "、".join(f"{a.date:%m/%d} {stations[a.station].name} {a.ratio:.2f}" for a in top))


NLSC_POINT_API = "https://api.nlsc.gov.tw/other/TownVillagePointQuery/{lon}/{lat}/4326"


def nlsc_point_query(lon: float, lat: float) -> str | None:
    """國土測繪中心官方點位查詢：回傳鄉鎮市區名（例：中正區）；查不到為 None。只用於差異報告。"""
    with urllib.request.urlopen(NLSC_POINT_API.format(lon=lon, lat=lat), timeout=30) as r:
        body = r.read().decode("utf-8")
    m = re.search(r"<townName>([^<]+)</townName>", body)
    return m.group(1) if m else None


def cmd_district_report(args) -> None:
    _, _, stations, _ = _load_month(args)
    districts = _districts(stations)
    draft = json.loads(Path(args.draft).read_text("utf-8"))
    api = None
    if args.check_api:
        api = {}
        for s in stations:
            api[s.name] = nlsc_point_query(s.lon, s.lat)
            time.sleep(0.1)
    rows = geo.diff_rows(stations, districts, draft, api)
    out = Path(args.out)
    out.write_text(geo.render_report(args.month, stations, districts, rows, api), encoding="utf-8")
    print(f"寫出 {out}：{len(rows)} 站需要看")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="city-breath")
    sub = p.add_subparsers(required=True)
    f = sub.add_parser("fetch", help="下載 OD 月檔與車站出口座標")
    f.add_argument("--month", required=True, help="YYYY-MM")
    f.add_argument("--force", action="store_true")
    f.set_defaults(func=cmd_fetch)
    g = sub.add_parser("fetch-geo", help="下載行政區界線（國土測繪中心）")
    g.add_argument("--update", action="store_true", help="sha256 不同時寫回 config/geo_sources.csv")
    g.set_defaults(func=cmd_fetch_geo)
    r = sub.add_parser("district-report", help="官方行政區與手寫草稿的差異報告")
    r.add_argument("--month", required=True, help="YYYY-MM")
    r.add_argument("--draft", required=True, help="草稿 JSON：正規站名 → 區名")
    r.add_argument("--out", required=True, help="輸出的 Markdown 路徑")
    r.add_argument("--check-api", action="store_true", help="逐站以國土測繪中心點位查詢 API 交叉驗證（需連網）")
    r.set_defaults(func=cmd_district_report)
    b = sub.add_parser("build", help="彙總並輸出靜態資料")
    b.add_argument("--month", required=True, help="YYYY-MM")
    b.add_argument("--raw", help="原始 OD CSV（預設 data/raw/od_YYYYMM.csv）")
    b.add_argument("--out", default=str(WEB_DATA))
    b.set_defaults(func=cmd_build)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
