"""多月份（1.7，AD-1、AD-2、AD-18）：所有月份同一個契約版本，months.json 與資料夾一致。"""

import csv
import datetime as dt
import json
from pathlib import Path

import pytest

from city_breath_pipeline import CONTRACT_VERSION
from city_breath_pipeline.stations import CONFIG, station_id

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
FOLDERS = sorted(p.name for p in DATA.iterdir() if p.is_dir()) if DATA.is_dir() else []


def test_months_json_matches_folders():
    body = json.loads((DATA / "months.json").read_text("utf-8"))
    assert body["v"] == CONTRACT_VERSION
    assert body["months"] == FOLDERS, "months.json 要列出 web/public/data/ 下每個月份資料夾，且只列這些"
    assert body["months"] == sorted(set(body["months"]))
    assert body["latest"] == body["months"][-1]
    for m in body["months"]:
        dt.datetime.strptime(m, "%Y-%m")


def test_months_are_consecutive():
    """近 12 個月（R2）：月份連續、不缺月。"""
    months = [dt.datetime.strptime(m, "%Y-%m") for m in FOLDERS]
    for a, b in zip(months, months[1:]):
        assert (b.year * 12 + b.month) - (a.year * 12 + a.month) == 1, f"{a:%Y-%m} 與 {b:%Y-%m} 之間缺月"


@pytest.mark.parametrize("month", FOLDERS)
def test_every_file_has_current_contract_version_and_month(month):
    """AD-18：網站一次只支援一個契約版本，所有月份的每個 JSON 都是 CONTRACT_VERSION；month 欄位與資料夾一致。"""
    files = sorted((DATA / month).rglob("*.json"))
    assert files
    for path in files:
        body = json.loads(path.read_text("utf-8"))
        rel = path.relative_to(DATA)
        assert body.get("v") == CONTRACT_VERSION, f"{rel} 的 v={body.get('v')}，應為 {CONTRACT_VERSION}"
        assert body.get("month") == month, f"{rel} 的 month={body.get('month')}"


@pytest.mark.parametrize("month", FOLDERS)
def test_meta_sources_have_sha256(month):
    """AD-1：每個輸入資料集都列在 meta.json 的 sources[]，帶取得日期與 sha256。"""
    meta = json.loads((DATA / month / "meta.json").read_text("utf-8"))
    assert meta["sources"]
    for s in meta["sources"]:
        assert s["name"] and s["url"] and s["retrieved"]
        assert len(s["sha256"]) == 64


@pytest.mark.parametrize("month", FOLDERS)
def test_station_indices_stay_inside_their_month(month):
    """AD-2：站索引只在同月有效；同一站名在各月的 ID 相同（ID 由站名決定）。"""
    stations = json.loads((DATA / month / "stations.json").read_text("utf-8"))["stations"]
    assert all(s["id"] == station_id(s["name"]) for s in stations)
    assert len({s["id"] for s in stations}) == len(stations)
    meta = json.loads((DATA / month / "meta.json").read_text("utf-8"))
    assert meta["stationCount"] == len(stations)


def test_holidays_table_is_sorted_unique_weekdays():
    """AD-4：holidays.csv 只需列平日放假的日子（週末本來就是 holiday）；不重複、照日期排序。"""
    with (CONFIG / "holidays.csv").open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    dates = [dt.date.fromisoformat(r["date"]) for r in rows]
    assert dates == sorted(set(dates))
    assert all(d.weekday() < 5 for d in dates)
    assert all(r["name"] and r["verified_by"] for r in rows)
