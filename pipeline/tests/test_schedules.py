"""場館檔期自動匯入（7.2，AD-13）：BIG-5 解碼、解析、選資源、快照、租用期→演出日、配對，與已提交的 events.json。"""

import datetime as dt
import hashlib
import json
from pathlib import Path

import pytest

from city_breath_pipeline import schedules as S
from city_breath_pipeline.anomaly import Anomaly

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
D = lambda day: dt.date(2026, 9, day)  # noqa: E731
ARENA, EXPO, HALL = S.DATASETS

ARENA_CSV = """廠商,租用起始日,租用結束日,活動名稱,活動類型
理想國演藝股份有限公司,20260907,20260913,IVE 2026 台北演唱會,娛樂
華納國際音樂股份有限公司,20260914,20260919,蕭煌奇2026年巡迴演唱會-台北小巨蛋,娛樂
寬宏藝術經紀股份有限公司,20260920,20260921,漢斯季默 2026 世界巡迴音樂會,藝文
某公司,20260828,20260902,跨月租用,娛樂
某公司,20261001,20261003,下個月,娛樂
"""

HALL_CSV = """﻿演出日期,演出時間,節目名稱,演出單位,相關網址,演出地點,入場方式,售票系統,內容摘要,
20260919,17:00,2026中山堂廣場音樂節,,,廣場,無售票,,,
20260920,19:00,2026中山堂廣場音樂節,,,廣場,無售票,,,
20260923,19:30,第八屆台北樂活合唱節,,,中正廳,售票,,,
20260924,19:30,第八屆台北樂活合唱節,,,中正廳,售票,,,
20260829至20260902,09:30,特展,,,第一、二展覽室,免費入場,,,
20250909,19:30,去年的節目,,,中正廳,售票,,,
"""

EXPO_CSV = """﻿序號,場館名稱,活動名稱,主辦單位,租[借]用開始時間,租[借]用結束時間,人次
1,爭艷館,寵物用品展,某公司,2026/9/25,2026/9/28,"69,180"
2,圓山廣場-花海,八月的活動,某單位,2026/8/1,2026/8/2,-
"""


# ── 解碼 ────────────────────────────────────────────────


def test_decode_big5_and_utf8_bom():
    assert S.decode(ARENA_CSV.encode("cp950")) == ARENA_CSV  # 小巨蛋的檔案是 BIG-5（含「煌」「蕭」）
    assert S.decode(HALL_CSV.encode("utf-8")) == HALL_CSV.lstrip("﻿")
    with pytest.raises(S.ScheduleError):
        S.decode(b"\x80\x80\x80")


# ── 解析 ────────────────────────────────────────────────


def test_parse_rentals_keeps_periods_overlapping_the_month():
    got = S.parse(ARENA_CSV.encode("cp950"), ARENA, "2026-09")
    assert [(s.name, s.start, s.end) for s in got] == [
        ("IVE 2026 台北演唱會", D(7), D(13)),
        ("蕭煌奇2026年巡迴演唱會-台北小巨蛋", D(14), D(19)),
        ("漢斯季默 2026 世界巡迴音樂會", D(20), D(21)),
        ("跨月租用", dt.date(2026, 8, 28), D(2)),  # 跨月的保留原起訖
    ]
    assert all(s.venue == "taipei-arena" and s.url == S.DATASET_PAGE.format(pid=ARENA.pid) for s in got)
    assert got[0].candidate_days() == {D(d) for d in range(7, 14)}  # 租用期每一天都可能是演出日


def test_parse_expo_slash_dates():
    got = S.parse(EXPO_CSV.encode("utf-8"), EXPO, "2026-09")
    assert [(s.venue, s.name, s.start, s.end) for s in got] == [("expo-park", "寵物用品展", D(25), D(28))]


def test_parse_performances_groups_by_programme_and_keeps_show_dates():
    got = {s.name: s for s in S.parse(HALL_CSV.encode("utf-8"), HALL, "2026-09")}
    assert set(got) == {"2026中山堂廣場音樂節", "第八屆台北樂活合唱節", "特展"}
    choir = got["第八屆台北樂活合唱節"]
    assert (choir.start, choir.end, choir.candidate_days()) == (D(23), D(24), {D(23), D(24)})
    assert got["特展"].candidate_days() == {D(1), D(2)}  # 「A至B」展開後只留當月


def test_parse_errors():
    with pytest.raises(S.ScheduleError, match="缺欄位"):
        S.parse("活動名稱\nx\n".encode(), ARENA, "2026-09")
    with pytest.raises(S.ScheduleError, match="日期看不懂"):
        S.parse("廠商,租用起始日,租用結束日,活動名稱\nx,9月7日,20260913,IVE\n".encode(), ARENA, "2026-09")
    with pytest.raises(S.ScheduleError, match="早於"):
        S.parse("廠商,租用起始日,租用結束日,活動名稱\nx,20260913,20260907,IVE\n".encode(), ARENA, "2026-09")


# ── 選資源、抓取與快照 ────────────────────────────────────


def test_pick_resource_rules():
    monthly = [{"rid": "a", "name": "臺北小巨蛋場地租用資訊_202609"}, {"rid": "b", "name": "臺北小巨蛋場地租用資訊_202608"}]
    assert S.pick_resource(ARENA, monthly, "2026-09")["rid"] == "a"
    assert S.pick_resource(ARENA, monthly, "2026-07") is None
    yearly = [{"rid": "y", "name": "114年度臺北市花博公園展館場地檔期活動一覽表"}]
    assert S.pick_resource(EXPO, yearly, "2025-09")["rid"] == "y"
    assert S.pick_resource(EXPO, yearly, "2026-09") is None  # 115 年度尚未發布
    assert S.pick_resource(HALL, [{"rid": "h", "name": "節目快訊"}], "2026-09")["rid"] == "h"
    with pytest.raises(S.ScheduleError):
        S.pick_resource(ARENA, monthly + [{"rid": "c", "name": "重複_202609"}], "2026-09")


def _fake_get(files: dict[str, bytes], resources: dict[str, list[dict]]):
    def get(url, timeout=0):
        for pid, res in resources.items():
            if url == S.API_VIEW.format(pid=pid):
                return json.dumps({"payload": {"resources": res}}).encode()
        return files[url]
    return get


@pytest.fixture
def snapshot_dir(tmp_path):
    resources = {
        ARENA.pid: [{"rid": "r1", "name": "臺北小巨蛋場地租用資訊_202609"}],
        EXPO.pid: [{"rid": "r2", "name": "114年度臺北市花博公園展館場地檔期活動一覽表"}],
        HALL.pid: [{"rid": "r3", "name": "節目快訊格式_臺北市中山堂"}],
    }
    files = {S.DOWNLOAD.format(pid=ARENA.pid, rid="r1"): ARENA_CSV.encode("cp950"),
             S.DOWNLOAD.format(pid=HALL.pid, rid="r3"): HALL_CSV.encode("utf-8")}
    S.fetch("2026-09", tmp_path, today=dt.date(2026, 11, 4), get=_fake_get(files, resources))
    return tmp_path


def test_fetch_writes_raw_bytes_and_manifest(snapshot_dir):
    manifest = json.loads((snapshot_dir / S.MANIFEST).read_text("utf-8"))
    assert [(m["key"], m["status"]) for m in manifest] == [
        ("taipei-arena", "ok"), ("expo-park", "missing"), ("zhongshan-hall", "ok")]
    arena = manifest[0]
    raw = (snapshot_dir / "taipei-arena.csv").read_bytes()
    assert raw == ARENA_CSV.encode("cp950")  # 原始位元組，不轉碼
    assert arena["sha256"] == hashlib.sha256(raw).hexdigest() and arena["retrieved"] == "2026-11-04"
    assert arena["url"] == "https://data.taipei/dataset/detail?id=f0497727-b2cd-46fa-87c8-c6af6bb9eada"
    assert "尚未發布" in manifest[1]["note"] and "114年度" in manifest[1]["note"]


def test_load_snapshot(snapshot_dir):
    snap = S.load("2026-09", snapshot_dir)
    assert len(snap.schedules) == 4 + 3
    assert [s["name"] for s in snap.sources] == ["臺北小巨蛋場地租用資訊", "中山堂演出訊息"]
    assert set(snap.sources[0]) == {"name", "publisher", "url", "dataset", "license", "retrieved", "sha256"}
    assert [m["key"] for m in snap.missing] == ["expo-park"]


def test_load_fails_without_snapshot_or_on_changed_file(snapshot_dir, tmp_path):
    with pytest.raises(S.ScheduleError, match="fetch-events"):
        S.load("2026-09", tmp_path / "nothing")
    (snapshot_dir / "taipei-arena.csv").write_bytes(b"x")
    with pytest.raises(S.ScheduleError, match="sha256"):
        S.load("2026-09", snapshot_dir)


# ── 配對 ────────────────────────────────────────────────

VENUES = {34: ["taipei-arena"], 50: ["zhongshan-hall"], 7: ["nangang-exhibition"]}


def _a(day, station, measure="exits"):
    return Anomaly(D(day), station, measure, 2000, 1000.0)


def test_rental_period_links_only_anomalous_days_and_keeps_period():
    """IVE 9/7–13 含進場拆台：只有 9/13 小巨蛋站異常，所以只有那天連到；起訖仍是租用期。"""
    rentals = S.parse(ARENA_CSV.encode("cp950"), ARENA, "2026-09")
    anomalies = [_a(13, 34), _a(13, None, "entries"), _a(10, 7), _a(20, 34), _a(22, 34)]
    got = S.link(rentals, anomalies, VENUES)
    assert [(e["id"], e["startDate"], e["endDate"], e["stations"]) for e in got.events] == [
        ("auto-taipei-arena-20260907", "2026-09-07", "2026-09-13", [34]),
        ("auto-taipei-arena-20260920", "2026-09-20", "2026-09-21", [34]),
    ]
    assert got.event_ids == {(D(13), 34): ["auto-taipei-arena-20260907"], (D(20), 34): ["auto-taipei-arena-20260920"]}
    assert {s.name for s in got.unmatched} == {"蕭煌奇2026年巡迴演唱會-台北小巨蛋", "跨月租用"}  # 9/22 不在任何租用期
    e = got.events[0]
    assert (e["venue"], e["source"], e["verified"], e["name"]) == ("taipei-arena", "auto", False, "IVE 2026 台北演唱會")
    assert e["url"].startswith("https://data.taipei/dataset/detail?id=")


def test_performances_link_only_on_show_dates():
    shows = S.parse(HALL_CSV.encode("utf-8"), HALL, "2026-09")
    got = S.link(shows, [_a(21, 50), _a(23, 50)], VENUES)
    assert [e["name"] for e in got.events] == ["第八屆台北樂活合唱節"]  # 9/21 不是任何節目的演出日
    assert got.event_ids == {(D(23), 50): [got.events[0]["id"]]}


def test_same_venue_same_start_gets_distinct_ids():
    a = S.Schedule("taipei-arena", D(13), D(13), "A 場", "u")
    b = S.Schedule("taipei-arena", D(13), D(14), "B 場", "u")
    got = S.link([b, a], [_a(13, 34)], VENUES)
    assert [e["id"] for e in got.events] == ["auto-taipei-arena-20260913", "auto-taipei-arena-20260913-2"]
    assert got.event_ids[(D(13), 34)] == ["auto-taipei-arena-20260913", "auto-taipei-arena-20260913-2"]


# ── 已提交的 2026-09 ────────────────────────────────────


def test_committed_2026_09_venue_schedules():
    """7.2 驗收：IVE（9/7–13）、漢斯季默（9/20–21）配到小巨蛋站的異常日，來源 auto、附資料集網址。"""
    root = DATA / "2026-09"
    if not (root / "events.json").exists():
        pytest.skip("沒有 2026-09")
    body = json.loads((root / "events.json").read_text("utf-8"))
    names = [s["name"] for s in json.loads((root / "stations.json").read_text("utf-8"))["stations"]]
    events = {e["name"]: e for e in body["events"]}
    arena = S.DATASET_PAGE.format(pid=ARENA.pid)
    for name, start, end, day in [("IVE 2026 台北演唱會", "2026-09-07", "2026-09-13", "2026-09-13"),
                                  ("漢斯季默 2026 世界巡迴音樂會", "2026-09-20", "2026-09-21", "2026-09-20")]:
        e = events[name]
        assert (e["startDate"], e["endDate"], e["source"], e["url"]) == (start, end, "auto", arena)
        assert [names[i] for i in e["stations"]] == ["台北小巨蛋"]
        hit = [a for a in body["anomalies"] if a["date"] == day and a["station"] is not None
               and names[a["station"]] == "台北小巨蛋"]
        assert len(hit) == 1 and e["id"] in hit[0]["eventIds"]
    meta = json.loads((root / "meta.json").read_text("utf-8"))
    assert any(s["url"] == arena and len(s["sha256"]) == 64 for s in meta["sources"])
