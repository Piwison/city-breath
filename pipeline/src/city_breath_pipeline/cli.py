"""命令列入口。

    uv run city-breath fetch --month 2026-09          # 下載月檔與出口座標到 data/raw/
    uv run city-breath build --month 2026-09          # 彙總並輸出到 web/public/data/
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
import time
import urllib.request
from pathlib import Path

from .aggregate import aggregate_month
from .export import export_month
from .stations import build_stations, canonical, load_aliases, load_exit_coordinates

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


def cmd_build(args) -> None:
    raw = Path(args.raw) if args.raw else RAW / f"od_{args.month.replace('-', '')}.csv"
    t = time.time()
    aliases = load_aliases()
    agg = aggregate_month(raw, args.month, aliases)
    coords = load_exit_coordinates(RAW / "exits.csv")
    stations = build_stations(agg.origin_names, agg.dest_names, coords)
    # 防呆：所有原始站名都應該在別名表或直接對得上
    unknown = {canonical(n, aliases) for n in agg.origin_names | agg.dest_names} - {s.name for s in stations}
    if unknown:
        raise SystemExit(f"未對應的站名：{sorted(unknown)}")
    result = export_month(agg, stations, Path(args.out))
    m = result["meta"]
    print(f"{args.month}：{m['rawRows']:,} 列，排除 {m['droppedRows']:,} 列，{m['stationCount']} 站，"
          f"日數 {m['dayCounts']}，營運時段 {m['serviceHours']}")
    print(f"分群 k={m['clustering']['k']} silhouette={m['clustering']['silhouette']}")
    for ty in result["clusters"].types:
        flag = "（草稿）" if ty["draft"] else ""
        print(f"  #{ty['id']} {ty['label']}{flag} {ty['size']} 站，例：{'、'.join(ty['examples'])}  {ty['features']}")
    total = sum(result["sizes"].values())
    biggest = sorted(result["sizes"].items(), key=lambda kv: -kv[1])[:4]
    print(f"輸出 {len(result['sizes'])} 檔共 {total / 1e6:.2f} MB；最大：" + "、".join(f"{k} {v / 1e3:.0f} KB" for k, v in biggest))
    print(f"耗時 {time.time() - t:.1f}s")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="city-breath")
    sub = p.add_subparsers(required=True)
    f = sub.add_parser("fetch", help="下載 OD 月檔與車站出口座標")
    f.add_argument("--month", required=True, help="YYYY-MM")
    f.add_argument("--force", action="store_true")
    f.set_defaults(func=cmd_fetch)
    b = sub.add_parser("build", help="彙總並輸出靜態資料")
    b.add_argument("--month", required=True, help="YYYY-MM")
    b.add_argument("--raw", help="原始 OD CSV（預設 data/raw/od_YYYYMM.csv）")
    b.add_argument("--out", default=str(WEB_DATA))
    b.set_defaults(func=cmd_build)
    args = p.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    sys.exit(main())
