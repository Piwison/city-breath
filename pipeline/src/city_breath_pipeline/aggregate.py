"""DuckDB 彙總：原始 OD 月檔 → 三張彙總表。

1. 站 × 小時 × 日型 的平均進站、出站人次
2. 起站 × 迄站 × 小時 × 日型 的平均人次
3. 每日每站進出總量（找異常日用）

平均值的分母是「該月該日型的天數」，沒有人搭的時段算 0（AD-7）。
"""

from __future__ import annotations

import csv
import datetime as dt
from dataclasses import dataclass
from pathlib import Path

import duckdb

from .stations import CONFIG, load_aliases


def load_holidays(path: Path = CONFIG / "holidays.csv") -> dict[dt.date, str]:
    with path.open(encoding="utf-8") as f:
        return {dt.date.fromisoformat(r["date"]): r["name"] for r in csv.DictReader(f)}


@dataclass
class MonthAggregate:
    month: str
    days: list[tuple[dt.date, str]]  # (date, day_type)
    day_counts: dict[str, int]
    service_hours: list[int]
    origin_names: set[str]
    dest_names: set[str]
    station_hourly: list[tuple]  # (name, day_type, hour, entries_avg, exits_avg)
    od_hourly: list[tuple]  # (o, d, day_type, hour, avg)
    daily_station: list[tuple]  # (date, name, entries, exits)
    raw_rows: int
    dropped_rows: int


def aggregate_month(
    raw_csv: Path,
    month: str,
    aliases: dict[str, str] | None = None,
    holidays: dict[dt.date, str] | None = None,
) -> MonthAggregate:
    aliases = aliases if aliases is not None else load_aliases()
    holidays = holidays if holidays is not None else load_holidays()
    con = duckdb.connect()
    con.execute("create table alias(raw varchar, canonical varchar)")
    if aliases:
        con.executemany("insert into alias values (?, ?)", list(aliases.items()))
    con.execute("create table hol(d date)")
    if holidays:
        con.executemany("insert into hol values (?)", [(d,) for d in holidays])

    con.execute(
        """
        create table raw as select * from read_csv(?, header=true,
          columns={'d':'DATE','h':'VARCHAR','o':'VARCHAR','dest':'VARCHAR','n':'BIGINT'})
        """,
        [str(raw_csv)],
    )
    raw_rows = con.execute("select count(*) from raw").fetchone()[0]

    # 月檔偶爾混入下個月的日期（PRD 風險表）→ 只留指定月份
    con.execute(
        """
        create table od as
        select r.d, cast(r.h as integer) as h,
               coalesce(a1.canonical, trim(r.o)) as o,
               coalesce(a2.canonical, trim(r.dest)) as dest,
               sum(r.n) as n
        from raw r
        left join alias a1 on trim(r.o) = a1.raw
        left join alias a2 on trim(r.dest) = a2.raw
        where strftime(r.d, '%Y-%m') = ? and r.n >= 0
        group by all
        """,
        [month],
    )
    dropped = con.execute(
        "select count(*) from raw where strftime(d, '%Y-%m') <> ? or n < 0", [month]
    ).fetchone()[0]

    con.execute(
        """
        create table days as
        select d,
               case when dayofweek(d) in (0, 6) or d in (select d from hol)
                    then 'holiday' else 'weekday' end as day_type
        from (select distinct d from od)
        """
    )
    con.execute("create table ndays as select day_type, count(*) as k from days group by all")

    days = con.execute("select d, day_type from days order by d").fetchall()
    day_counts = dict(con.execute("select day_type, k from ndays").fetchall())
    service_hours = [r[0] for r in con.execute("select distinct h from od order by h").fetchall()]
    origin_names = {r[0] for r in con.execute("select distinct o from od").fetchall()}
    dest_names = {r[0] for r in con.execute("select distinct dest from od").fetchall()}

    od_hourly = con.execute(
        """
        select o.o, o.dest, y.day_type, o.h, sum(o.n)::double / any_value(k.k) as avg
        from od o join days y using (d) join ndays k using (day_type)
        group by o.o, o.dest, y.day_type, o.h
        """
    ).fetchall()

    station_hourly = con.execute(
        """
        with e as (
          select o as name, y.day_type, h, sum(n) as n from od join days y using (d) group by all
        ), x as (
          select dest as name, y.day_type, h, sum(n) as n from od join days y using (d) group by all
        )
        select coalesce(e.name, x.name) as name, coalesce(e.day_type, x.day_type) as day_type,
               coalesce(e.h, x.h) as h,
               coalesce(e.n, 0)::double / k.k as entries,
               coalesce(x.n, 0)::double / k.k as exits
        from e full outer join x on e.name = x.name and e.day_type = x.day_type and e.h = x.h
        join ndays k on k.day_type = coalesce(e.day_type, x.day_type)
        """
    ).fetchall()

    daily_station = con.execute(
        """
        with e as (select d, o as name, sum(n) n from od group by all),
             x as (select d, dest as name, sum(n) n from od group by all)
        select coalesce(e.d, x.d), coalesce(e.name, x.name), coalesce(e.n, 0), coalesce(x.n, 0)
        from e full outer join x on e.d = x.d and e.name = x.name
        """
    ).fetchall()

    return MonthAggregate(
        month=month,
        days=days,
        day_counts=day_counts,
        service_hours=service_hours,
        origin_names=origin_names,
        dest_names=dest_names,
        station_hourly=station_hourly,
        od_hourly=od_hourly,
        daily_station=daily_station,
        raw_rows=raw_rows,
        dropped_rows=dropped,
    )
