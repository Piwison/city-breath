"""命令列入口。

    uv run city-breath fetch --month 2026-09          # 下載月檔與出口座標到 data/raw/
    uv run city-breath fetch-geo                      # 下載行政區界線到 data/raw/geo/
    uv run city-breath fetch-events --month 2026-09   # 場館檔期快照到 data/raw/events/202609/
    uv run city-breath fetch-basemap                  # 底圖原始檔（DEM、路網、河川、綠地、班距）到 data/raw/basemap/
    uv run city-breath build --month 2026-09          # 彙總並輸出到 web/public/data/
    uv run city-breath fit-types --months 2025-10..2026-09  # 重新擬合固定的車站類型中心（很少用，AD-27）
    uv run city-breath station-types                  # 擬合月份重建後：每站整年最常見的型 → station-types.json
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

from . import basemap as bm
from . import cluster as types_
from . import districts as geo
from . import schedules as sched
from .aggregate import aggregate_month
from .export import (
    SOURCE,
    StationTypesError,
    build_profiles,
    export_basemap,
    export_daily,
    export_events,
    export_month,
    export_station_types,
    station_types_json,
)
from .stations import build_stations, canonical, load_aliases, load_exit_coordinates
from .venues import VENUES, VenueError, load_venues, resolve_venues

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


def cmd_fetch_basemap(args) -> None:
    """下載底圖原始檔到 data/raw/basemap/（AD-21）。

    csv 還沒有 sha256 的來源直接登記；sha256 不同時要加 --update 才換檔並改寫設定。
    下載失敗而本機已有手動放入的檔（例：水利署河川河道），就登記那個檔；選用來源都沒有就印手動下載說明。
    """
    sources = bm.load_sources()
    rows = list(sources.values())
    changed, failed = False, []
    for row in rows:
        dest = RAW / row["file"]
        new = dest.with_name(dest.name + ".new")
        print(f"下載 {row['name']}：{row['url']}")
        try:
            _download(row["url"], new)
        except Exception as e:  # noqa: BLE001 —— 網路錯誤種類很多，一律改走手動檔
            for leftover in (new, new.with_suffix(new.suffix + ".part")):
                leftover.unlink(missing_ok=True)
            local = bm.local_path(RAW, row)
            if local is None:
                if bm.is_optional(row):
                    print(f"注意：{type(e).__name__}: {e}\n" + bm.manual_download_hint(row, RAW))
                else:
                    print(f"錯誤：{row['name']} 下載失敗（{type(e).__name__}: {e}），本機也沒有 {dest}")
                    failed.append(row["name"])
                continue
            sha = bm.fingerprint(local)
            print(f"下載失敗（{type(e).__name__}），改用本機已有的 {local}")
            if sha == row["sha256"]:
                print("  sha256 與設定相符")
            elif not row["sha256"] or args.update:
                stamp = dt.datetime.fromtimestamp(local.stat().st_mtime).date().isoformat()
                row["sha256"], row["retrieved"] = sha, stamp
                changed = True
                print(f"  登記 sha256 {sha}、取得日期 {stamp}（檔案修改日期）")
            else:
                print(f"  注意：sha256 {sha} 與設定的 {row['sha256']} 不同；確認後用 `fetch-basemap --update` 寫回")
            continue
        sha = geo.sha256_file(new)
        if sha == row["sha256"]:
            new.replace(dest)
            print(f"完成 {dest}（sha256 與設定相符）")
        elif not row["sha256"] or args.update:
            new.replace(dest)
            row["sha256"], row["retrieved"] = sha, dt.date.today().isoformat()
            changed = True
            print(f"完成 {dest}，登記 sha256 {sha}")
        else:
            print(f"注意：{row['name']} 的 sha256 {sha} 與設定的 {row['sha256']} 不同，來源可能已更新；"
                  f"原檔不動，新檔留在 {new}。確認後用 `fetch-basemap --update` 換上，build 後把 BASEMAP_REVISION 加一")
    if changed:
        bm.write_sources(rows)
        print(f"已更新 {bm.BASEMAP_SOURCES}")
    if failed:
        raise SystemExit(f"必要的底圖來源沒有取得：{failed}")


def _events_dir(month: str) -> Path:
    return RAW / "events" / month.replace("-", "")


def cmd_fetch_events(args) -> None:
    """抓臺北市資料大平臺的場館檔期當月快照（7.2，AD-13）；資源尚未發布的資料集記為 missing，不中斷。"""
    dest = _events_dir(args.month)
    try:
        manifest = sched.fetch(args.month, dest)
    except sched.ScheduleError as e:
        raise SystemExit(str(e)) from e
    for entry in manifest:
        if entry["status"] == "ok":
            print(f"完成 {entry['name']}：{entry['resource']} → {dest / entry['file']}")
        else:
            print(f"注意：{entry['name']} {entry['note']}，本月沒有這個場館的自動檔期")
    print(f"寫出 {dest / sched.MANIFEST}")


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
    """回傳 (DistrictResult, 未簡化的界線)；底圖用同一份界線切區與判定地標（AD-9、AD-25）。"""
    src = geo.load_geo_sources()["town_boundary"]
    try:
        boundaries = geo.load_districts(RAW / src["file"], src)
        return geo.build_districts(stations, boundaries, geo.load_overrides(), src), boundaries
    except geo.DistrictError as e:
        raise SystemExit(str(e)) from e


def cmd_build(args) -> None:
    t = time.time()
    try:  # 場館檔期快照（7.2）與人工活動表（7.3）先讀：沒抓、或表有錯就早點失敗
        snapshot = sched.load(args.month, _events_dir(args.month))
        manual = sched.load_manual(args.month, {v.id for v in load_venues(load_aliases())})
    except sched.ScheduleError as e:
        raise SystemExit(str(e)) from e
    raw, agg, stations, venue_stations = _load_month(args)
    districts, boundaries = _districts(stations)
    src = districts.source
    sources = [
        _file_source(raw, name=SOURCE["name"], publisher=SOURCE["publisher"], url=SOURCE["url"], license=SOURCE["license"]),
        _file_source(RAW / "exits.csv", name="臺北捷運車站出入口座標", publisher=SOURCE["publisher"],
                     url="https://data.gov.tw/dataset/128428", license=SOURCE["license"]),
        {"name": src["name"], "publisher": src["publisher"], "url": src["url"], "dataset": src["dataset"],
         "license": src["license"], "retrieved": src["retrieved"], "sha256": src["sha256"]},
    ]
    sources += snapshot.sources
    try:
        result = export_month(agg, stations, Path(args.out), districts, sources)
    except types_.StationTypeError as e:
        raise SystemExit(str(e)) from e
    m = result["meta"]
    print(f"{args.month}：{m['rawRows']:,} 列，排除 {m['droppedRows']:,} 列，{m['stationCount']} 站，"
          f"日數 {m['dayCounts']}，營運時段 {m['serviceHours']}")
    print(f"車站類型：固定 {m['clustering']['k']} 型（config/station_type_centroids.json），"
          f"當月輪廓係數 {m['clustering']['silhouette']}")
    for kind, label in (("od", "站起訖格"), ("allday", "全日前 10 格"), ("district", "行政區起訖格"),
                        ("inbound", "來源行政區格")):
        sup = result["suppression"][kind]
        print(f"{label} {sup['cells']:,}：少於 10 人隱藏 {sup['primary']:,} 格，次要隱藏 {sup['secondary']:,} 格")
    for ty in result["clusters"].types:
        flag = "（草稿）" if ty["draft"] else ""
        print(f"  #{ty['id']} {ty['label']}{flag} {ty['size']} 站，例：{'、'.join(ty['examples'])}  {ty['features']}")
    overrides = sum(a.method == "override" for a in districts.assignment.values())
    inbound = {k: v for k, v in result["sizes"].items() if k.startswith("inbound/")}
    print(f"inbound 分片 {len(inbound)} 個共 {sum(inbound.values()) / 1e3:.0f} KB（最大 {max(inbound.values()) / 1e3:.1f} KB）")
    print(f"行政區 {len(districts.districts)} 個，{len(districts.station_codes)} 站都有行政區（人工修正 {overrides} 站），"
          f"簡化容差 {districts.tolerance}，districts.json {result['sizes']['districts.json'] / 1e3:.0f} KB")
    daily = export_daily(agg, stations, districts, venue_stations, Path(args.out))
    dsup = daily["suppression"]
    print(f"逐日檔 {len(daily['sizes'])} 個共 {sum(daily['sizes'].values()) / 1e3:.0f} KB（最大 "
          f"{max(daily['sizes'].values()) / 1e3:.0f} KB）；場館站 {len(venue_stations)} 站，來源行政區格 "
          f"{dsup['cells']:,}：少於 10 人隱藏 {dsup['primary']:,} 格，次要隱藏 {dsup['secondary']:,} 格")
    result["sizes"].update(daily["sizes"])
    events = export_events(agg, stations, Path(args.out), snapshot.schedules + manual, venue_stations)
    _report_anomalies(events["detection"], stations)
    _report_schedules(snapshot, events["linked"], events["detection"], stations)
    result["sizes"].update(events["sizes"])
    # 底圖也用到的兩個輸入：車站出口座標（站的位置）與行政區界線（切區、判定地標）
    shared = {"臺北捷運車站出入口座標", src["name"]}
    _build_basemap(args, stations, districts, boundaries, [s for s in sources if s["name"] in shared])
    total = sum(result["sizes"].values())
    biggest = sorted(result["sizes"].items(), key=lambda kv: -kv[1])[:4]
    print(f"輸出 {len(result['sizes'])} 檔共 {total / 1e6:.2f} MB；最大：" + "、".join(f"{k} {v / 1e3:.0f} KB" for k, v in biggest))
    print(f"耗時 {time.time() - t:.1f}s")


def _build_basemap(args, stations, districts, boundaries, extra_sources) -> None:
    """不分月份的 basemap.json（AD-21）：只在建最新月份時重寫，站與路線以最新月份的車站為準。"""
    out = Path(args.out)
    latest = json.loads((out / "months.json").read_text("utf-8"))["latest"]
    if args.month != latest:
        print(f"basemap.json 以最新月份（{latest}）的車站產生，本次（{args.month}）不重寫")
        return
    try:
        sources = bm.load_sources()
        check = bm.check_sources(RAW, sources)
        for row in check.missing:
            print(f"注意：底圖來源〈{row['name']}〉缺檔（{RAW / row['file']}），這一版底圖沒有用到；"
                  "取得方式見 `uv run city-breath fetch-basemap` 印出的說明")
        landmarks = bm.LANDMARKS
        extra = list(extra_sources) + [{
            "name": "地標位置（pipeline/config/landmarks.csv，每列附 Wikidata 項目網址）", "publisher": "Wikidata",
            "url": "https://www.wikidata.org/", "license": "CC0 1.0", "retrieved": bm.LANDMARKS_RETRIEVED,
            "sha256": geo.sha256_file(landmarks),
        }]
        inp = bm.BasemapInputs(
            stations=stations, station_codes=districts.station_codes, boundaries=boundaries, sources=sources,
            district_polygons={d["id"]: bm.multipolygon(d["polygon"]) for d in districts.districts},
            check=check, aliases=load_aliases(), venue_ids={v.id for v in load_venues(load_aliases(), VENUES)},
            extra_sources=extra, month=args.month,
        )
        body, summary = bm.build_basemap(inp)
    except bm.BasemapError as e:
        raise SystemExit(str(e)) from e
    size = export_basemap(body, out)
    print(f"basemap.json {size / 1e3:.0f} KB（revision {body['basemapRevision']}）：{summary['stations']} 站的路線"
          f"（{summary['lineMethods']}），軌道 {summary['tracks']} 段，直線補段：{'、'.join(summary['approx']) or '無'}，"
          f"地標 {summary['landmarks']} 個")
    if size > bm.MAX_BYTES:
        raise SystemExit(f"basemap.json {size:,} bytes 超過 {bm.MAX_BYTES:,}（AD-6），請加大簡化容差")


def _month_list(spec: str) -> list[str]:
    """``2025-10..2026-09`` 或 ``2025-10,2025-11``。"""
    if ".." in spec:
        a, b = (dt.datetime.strptime(x, "%Y-%m") for x in spec.split(".."))
        out, y, mo = [], a.year, a.month
        while (y, mo) <= (b.year, b.month):
            out.append(f"{y}-{mo:02d}")
            y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
        return out
    return [x.strip() for x in spec.split(",") if x.strip()]


def cmd_fit_types(args) -> None:
    """重新擬合固定的車站類型中心（AD-27）。用原始月檔算 profile，不讀網站 JSON。

    只在 Piwi 要重新定義類型時跑；跑完要請 Piwi 對照 config/station_types.csv 的名稱，再重建所有月份。
    """
    months = _month_list(args.months)
    missing = [m for m in months if not (RAW / f"od_{m.replace('-', '')}.csv").exists()]
    if missing:
        raise SystemExit(f"缺原始月檔：{missing}；先跑 `uv run city-breath fetch --month YYYY-MM`")
    samples = []
    for m in months:
        args.month = m
        _, agg, stations, _ = _load_month(args)
        profiles = build_profiles(agg)
        recorded = [s.name for s in stations if s.exits_recorded and s.name in profiles]
        samples += [(m, n, profiles[n]) for n in recorded]
        print(f"{m}：{len(recorded)} 站")
    body = types_.fit_types(samples)
    body["command"] = f"uv run city-breath fit-types --months {args.months}"
    types_.write_centroids(body, Path(args.out))
    names = types_.load_type_names()
    print(f"寫出 {args.out}：{body['samples']} 筆（{body['stations']} 站 × 月），k={body['method']['k']}，"
          f"輪廓係數 {body['silhouette']}，整段期間都歸同一型的站 {body['stableStations']}/{body['stations']}")
    for t in body["types"]:
        label = names.get(t["id"], {}).get("label", "（未定名）")
        print(f"  #{t['id']} {label}：最常歸到這型的站 {t['stations']}，{t['features']}")
    print("注意：類型 id 依早上淨流向排序；請 Piwi 對照 config/station_types.csv 的名稱與一句話，確認後把中心檔的 "
          "namesConfirmed 改成 true（在那之前 build 輸出 draft=true），再重建所有月份，最後跑 "
          "`city-breath station-types` 更新每站整年最常見的型")


def cmd_station_types(args) -> None:
    """每站在擬合月份裡最常歸到的型（產品計畫 v2 決定 13，AD-27）→ 不分月份的 station-types.json。

    讀擬合月份已發布的 stations.json 的 type（build 用固定中心歸類的結果），不讀原始月檔。
    """
    try:
        centroids = types_.load_centroids()
    except types_.StationTypeError as e:
        raise SystemExit(str(e)) from e
    months = _month_list(args.months) if args.months else list(centroids["months"])
    out = Path(args.out)
    monthly = {}
    for m in months:
        path = out / m / "stations.json"
        if path.exists():
            monthly[m] = json.loads(path.read_text("utf-8"))
    try:
        body = station_types_json(months, monthly, centroids)
    except StationTypesError as e:
        raise SystemExit(str(e)) from e
    size = export_station_types(body, out)
    rows = body["stations"].values()
    changed = sum(r["votes"] < r["months"] for r in rows)
    ties = sum(2 * r["votes"] == r["months"] for r in rows)
    print(f"station-types.json {size / 1e3:.1f} KB：{len(body['stations'])} 站（{months[0]}～{months[-1]}），"
          f"有換過型的 {changed} 站，其中最常見的型只占一半月份的 {ties} 站（同票時取較近月份）")


def _report_anomalies(det, stations) -> None:
    """events.json 的摘要；平日卻比平常少 15% 以上的日子，提示可能漏列假日（AD-4）。"""
    city = det.city()
    print("全市級異常日：" + ("、".join(f"{a.date:%m/%d} {a.ratio:.2f}" for a in city) or "無"))
    types = {d.date: d.day_type for d in det.days}
    for a in city:
        if a.ratio < 1 and types[a.date] == "weekday":
            print(f"注意：{a.date} 是平日但全市進站只有平常的 {a.ratio:.0%}，是否漏列 config/holidays.csv？")
    top = sorted(det.stations(), key=lambda a: -a.ratio)[:5]
    print(f"站級異常 {len(det.stations())} 筆；最高："
          + "、".join(f"{a.date:%m/%d} {stations[a.station].name} {a.ratio:.2f}" for a in top))


def _report_schedules(snapshot, linked, det, stations) -> None:
    """場館檔期配對摘要（7.2）：配到的檔期、沒配到的檔期數、尚未發布的資料集、仍是「原因未查證」的站級異常。"""
    for entry in snapshot.missing:
        print(f"注意：{entry['name']} {entry['note']}")
    for e in linked.events:
        days = sorted(d for (d, i), ids in linked.event_ids.items() if e["id"] in ids)
        print(f"  檔期 {e['startDate']}～{e['endDate']} {e['name']} → 異常日 {'、'.join(f'{d:%m/%d}' for d in days)}")
    auto = [e for e in linked.events if e["source"] == "auto"]
    print(f"場館檔期 {len(snapshot.schedules)} 筆，配到異常 {len(auto)} 筆；人工活動 {len(linked.events) - len(auto)} 筆")
    for s in linked.unmatched:
        if s.source == "manual":
            print(f"注意：人工活動「{s.name}」（{s.start}～{s.end}，{s.venue}）沒有配到站級異常，仍寫進 events.json")
    left = [a for a in det.stations() if (a.date, a.station) not in linked.event_ids]
    print(f"原因未查證的站級異常 {len(left)} 筆：" + ("、".join(f"{a.date:%m/%d} {stations[a.station].name}" for a in left) or "無"))


NLSC_POINT_API = "https://api.nlsc.gov.tw/other/TownVillagePointQuery/{lon}/{lat}/4326"


def nlsc_point_query(lon: float, lat: float) -> str | None:
    """國土測繪中心官方點位查詢：回傳鄉鎮市區名（例：中正區）；查不到為 None。只用於差異報告。"""
    with urllib.request.urlopen(NLSC_POINT_API.format(lon=lon, lat=lat), timeout=30) as r:
        body = r.read().decode("utf-8")
    m = re.search(r"<townName>([^<]+)</townName>", body)
    return m.group(1) if m else None


def cmd_district_report(args) -> None:
    _, _, stations, _ = _load_month(args)
    districts, _ = _districts(stations)
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
    m = sub.add_parser("fetch-basemap", help="下載底圖原始檔（DEM、路網圖、河川、綠地、路線、班距）")
    m.add_argument("--update", action="store_true", help="sha256 不同時換上新檔並寫回 config/basemap_sources.csv")
    m.set_defaults(func=cmd_fetch_basemap)
    e = sub.add_parser("fetch-events", help="下載場館檔期快照（小巨蛋、花博、中山堂）")
    e.add_argument("--month", required=True, help="YYYY-MM")
    e.set_defaults(func=cmd_fetch_events)
    r = sub.add_parser("district-report", help="官方行政區與手寫草稿的差異報告")
    r.add_argument("--month", required=True, help="YYYY-MM")
    r.add_argument("--draft", required=True, help="草稿 JSON：正規站名 → 區名")
    r.add_argument("--out", required=True, help="輸出的 Markdown 路徑")
    r.add_argument("--check-api", action="store_true", help="逐站以國土測繪中心點位查詢 API 交叉驗證（需連網）")
    r.set_defaults(func=cmd_district_report)
    t = sub.add_parser("fit-types", help="用多個月份重新擬合固定的車站類型中心（AD-27）")
    t.add_argument("--months", required=True, help="2025-10..2026-09 或 2025-10,2025-11")
    t.add_argument("--out", default=str(types_.CENTROIDS))
    t.set_defaults(func=cmd_fit_types)
    st = sub.add_parser("station-types", help="每站整年最常見的型，寫出不分月份的 station-types.json（AD-27）")
    st.add_argument("--months", help="預設為中心檔的擬合月份")
    st.add_argument("--out", default=str(WEB_DATA))
    st.set_defaults(func=cmd_station_types)
    b = sub.add_parser("build", help="彙總並輸出靜態資料")
    b.add_argument("--month", required=True, help="YYYY-MM")
    b.add_argument("--raw", help="原始 OD CSV（預設 data/raw/od_YYYYMM.csv）")
    b.add_argument("--out", default=str(WEB_DATA))
    b.set_defaults(func=cmd_build)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
