"""車站類型（1.6，AD-27）：固定中心、每月歸到最近的中心，名稱各月一致。"""

import collections
import csv
import json
from pathlib import Path

import numpy as np
import pytest

from city_breath_pipeline import CONTRACT_VERSION
from city_breath_pipeline import cluster as ct
from city_breath_pipeline.cluster import FEATURE_HOURS, StationTypeError
from city_breath_pipeline.export import StationTypesError, station_types_json

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if (p / "stations.json").exists()) if DATA.is_dir() else []


def _profile(am_in: int, am_out: int, pm_in: int, pm_out: int, holiday: int = 0) -> dict:
    """平日：7–9 點進 am_in、出 am_out；17–19 點進 pm_in、出 pm_out；其他營運小時各 10。"""
    ent, ext = [None] * 24, [None] * 24
    for h in FEATURE_HOURS + [1, 5]:
        ent[h], ext[h] = 10, 10
    for h in (7, 8, 9):
        ent[h], ext[h] = am_in, am_out
    for h in (17, 18, 19):
        ent[h], ext[h] = pm_in, pm_out
    hol = [None if v is None else 0 for v in ent]
    hol[12] = holiday
    return {"weekday": {"entries": ent, "exits": ext}, "holiday": {"entries": hol, "exits": list(hol)}}


BED = _profile(300, 50, 50, 300, holiday=500)  # 早上出門、晚上回來
OFFICE = _profile(50, 300, 300, 50, holiday=100)  # 早上湧入、傍晚離開
EMPTY = {t: {"entries": [None] * 24, "exits": [None] * 24} for t in ("weekday", "holiday")}
NAMES = {0: {"label": "臥室站", "description": "早上出門"}, 1: {"label": "辦公站", "description": "早上湧入"}}


def _centroids(*profiles) -> dict:
    vecs = [ct._features(p, FEATURE_HOURS) for p in profiles]
    return {
        "namesConfirmed": True,
        "featureVersion": ct.FEATURE_VERSION,
        "hours": FEATURE_HOURS,
        "holidayWeight": ct.HOLIDAY_WEIGHT,
        "types": [{"id": i, "centroid": list(v), "features": ct._describe_vector(v)} for i, v in enumerate(vecs)],
    }


def test_assign_to_nearest_fixed_centroid():
    profiles = {
        "住宅A": _profile(280, 60, 60, 280, holiday=450),
        "住宅B": BED,
        "辦公A": _profile(60, 280, 280, 60, holiday=120),
        "環狀": BED,  # 出站未入檔
        "空站": EMPTY,  # 當月沒有平日進出
    }
    r = ct.assign_types(profiles, {"住宅A", "住宅B", "辦公A", "空站"}, _centroids(BED, OFFICE), NAMES)
    assert r.assignment == {"住宅A": 0, "住宅B": 0, "辦公A": 1}
    assert "環狀" not in r.assignment and "空站" not in r.assignment
    assert [t["id"] for t in r.types] == [0, 1]
    assert [t["label"] for t in r.types] == ["臥室站", "辦公站"]
    assert all(t["draft"] is False for t in r.types)
    assert [t["size"] for t in r.types] == [2, 1]
    assert r.types[0]["examples"] == ["住宅B", "住宅A"]  # 平日進站多的在前
    assert r.types[0]["features"]["amNet"] < 0 < r.types[1]["features"]["amNet"]
    assert r.k == 2 and set(r.silhouette) == {2}


def test_type_ids_do_not_depend_on_group_size():
    """每月群大小不同，id 仍是同一個中心（以前依群大小排，月月不同）。"""
    c = _centroids(BED, OFFICE)
    many_office = {f"o{i}": OFFICE for i in range(5)} | {"b": BED}
    r = ct.assign_types(many_office, set(many_office), c, NAMES)
    assert r.assignment["b"] == 0 and {r.assignment[f"o{i}"] for i in range(5)} == {1}


def test_fit_orders_types_by_morning_net_flow():
    samples = [(m, f"b{i}", _profile(300 + i, 50, 50, 300, 500)) for m in ("2026-08", "2026-09") for i in range(4)]
    samples += [(m, f"o{i}", _profile(50, 300 + i, 300, 50, 100)) for m in ("2026-08", "2026-09") for i in range(4)]
    samples.append(("2026-09", "空站", EMPTY))
    body = ct.fit_types(samples, k=2, n_init=5)
    assert body["months"] == ["2026-08", "2026-09"]
    assert body["samples"] == 16 and body["stations"] == 8 and body["stableStations"] == 8
    assert [t["id"] for t in body["types"]] == [0, 1]
    assert body["types"][0]["features"]["amNet"] < body["types"][1]["features"]["amNet"]
    assert [t["stations"] for t in body["types"]] == [4, 4]
    assert body["featureVersion"] == ct.FEATURE_VERSION and body["hours"] == FEATURE_HOURS
    r = ct.assign_types({"b0": samples[0][2], "o0": samples[8][2]}, {"b0", "o0"}, body, NAMES)
    assert r.assignment == {"b0": 0, "o0": 1}
    # 剛擬合、名稱還沒確認：draft=true
    assert body["namesConfirmed"] is False and all(t["draft"] for t in r.types)


def test_missing_centroids_file_fails(tmp_path):
    with pytest.raises(StationTypeError, match="fit-types"):
        ct.load_centroids(tmp_path / "none.json")


@pytest.mark.parametrize(
    "patch",
    [{"featureVersion": 0}, {"hours": list(range(5, 24))}, {"holidayWeight": 0.2}],
)
def test_feature_definition_mismatch_fails(tmp_path, patch):
    path = tmp_path / "c.json"
    path.write_text(json.dumps(_centroids(BED, OFFICE) | patch), "utf-8")
    with pytest.raises(StationTypeError, match="fit-types"):
        ct.load_centroids(path)


@pytest.mark.parametrize("names", [{0: NAMES[0]}, NAMES | {2: {"label": "多", "description": "多"}},
                                   {0: NAMES[0], 1: {"label": "", "description": "x"}}])
def test_names_must_match_types(names):
    with pytest.raises(StationTypeError, match="station_types.csv"):
        ct.assign_types({"b": BED}, {"b"}, _centroids(BED, OFFICE), names)


# ── 已提交的設定與輸出 ─────────────────────────────────────────────


def test_committed_centroids_and_names():
    body = ct.load_centroids()
    names = ct.load_type_names()
    assert body["method"] == {"algorithm": "kmeans", "k": 4, "nInit": 20, "randomState": 20261026}
    assert body["namesConfirmed"] is True, "Piwi 2026-11-11 已對照名稱"
    assert len(body["months"]) == 12 and body["months"] == sorted(body["months"])
    assert sorted(names) == [0, 1, 2, 3]
    am = [t["features"]["amNet"] for t in body["types"]]
    assert am == sorted(am), "類型 id 依早上淨流向由小到大"
    assert [names[i]["label"] for i in range(4)] == ["臥室站", "住商站", "人氣站", "辦公站"]


@pytest.mark.parametrize("month", MONTHS)
def test_published_types_are_fixed_and_named(month):
    body = json.loads((DATA / month / "stations.json").read_text("utf-8"))
    centroids = ct.load_centroids()
    with ct.TYPE_NAMES.open(encoding="utf-8") as f:
        names = {int(r["id"]): r for r in csv.DictReader(f)}
    assert [t["id"] for t in body["types"]] == [0, 1, 2, 3]
    for t in body["types"]:
        assert t["draft"] is False
        assert (t["label"], t["description"]) == (names[t["id"]]["label"], names[t["id"]]["description"])
        assert t["features"] == centroids["types"][t["id"]]["features"]
    C = np.array([t["centroid"] for t in centroids["types"]])
    sizes = [0] * 4
    for s in body["stations"]:
        if not s["exitsRecorded"] or not ct.has_weekday_traffic(s):
            assert s["type"] is None, f"{s['name']}：出站未入檔或當月平日沒有進出的站不歸類"
            continue
        nearest = int(((C - ct._features(s, FEATURE_HOURS)) ** 2).sum(axis=1).argmin())
        assert s["type"] == nearest, f"{month} {s['name']} 應歸到最近的中心 {nearest}"
        sizes[s["type"]] += 1
    assert sizes == [t["size"] for t in body["types"]]


def test_fit_types_cli_needs_raw_months(tmp_path):
    from city_breath_pipeline import cli

    assert cli._month_list("2025-11..2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]
    assert cli._month_list("2026-08, 2026-09") == ["2026-08", "2026-09"]
    with pytest.raises(SystemExit, match="fetch"):
        cli.main(["fit-types", "--months", "1999-01..1999-02", "--out", str(tmp_path / "c.json")])
    assert not (tmp_path / "c.json").exists()


# ── 整年最常見的型（station-types.json；3.12，產品計畫 v2 決定 13）──────────────


def test_modal_type_ties_go_to_the_more_recent_month():
    by = {
        "穩定": {"2026-07": 1, "2026-08": 1, "2026-09": 1},
        "多數": {"2026-07": 2, "2026-08": 1, "2026-09": 1},
        "同票": {"2026-06": 0, "2026-07": 1, "2026-08": 1, "2026-09": 0},
        "同票反過來": {"2026-06": 1, "2026-07": 0, "2026-08": 0, "2026-09": 1},
        "新站": {"2026-07": None, "2026-08": 2, "2026-09": 1},
        "環狀": {"2026-08": None, "2026-09": None},
    }
    assert ct.modal_types(by) == {
        "穩定": (1, 3, 3),
        "多數": (1, 2, 3),
        "同票": (0, 2, 4),
        "同票反過來": (1, 2, 4),
        "新站": (1, 1, 2),
    }


def _monthly(month: str, rows: list[tuple[str, bool, int | None]]) -> dict:
    types = [
        {"id": i, "label": NAMES[i]["label"], "description": NAMES[i]["description"], "draft": False} for i in (0, 1)
    ]
    return {
        "v": CONTRACT_VERSION,
        "month": month,
        "types": types,
        "stations": [{"id": sid, "exitsRecorded": rec, "type": t} for sid, rec, t in rows],
    }


def test_station_types_json_shape_and_guards():
    months = ["2026-08", "2026-09"]
    centroids = _centroids(BED, OFFICE) | {"months": months}
    monthly = {
        "2026-08": _monthly("2026-08", [("sA", True, 0), ("sB", True, 1), ("sY", False, None)]),
        "2026-09": _monthly("2026-09", [("sA", True, 0), ("sB", True, 0), ("sY", False, 1), ("sN", True, 1)]),
    }
    body = station_types_json(months, monthly, centroids)
    assert body == {
        "v": CONTRACT_VERSION,
        "fitMonths": months,
        "featureVersion": ct.FEATURE_VERSION,
        "stations": {
            "sA": {"type": 0, "votes": 2, "months": 2},
            "sB": {"type": 0, "votes": 1, "months": 2},  # 1:1 同票取 2026-09
            "sN": {"type": 1, "votes": 1, "months": 1},  # 新站只算有的月份
        },
    }  # 環狀線（出站未入檔）不列，即使 type 有值也不算
    with pytest.raises(StationTypesError, match="擬合月份"):
        station_types_json(["2026-09"], monthly, centroids)
    with pytest.raises(StationTypesError, match="缺 2026-08"):
        station_types_json(months, {"2026-09": monthly["2026-09"]}, centroids)
    draft = _monthly("2026-08", [("sA", True, 0)])
    draft["types"][0]["draft"] = True
    with pytest.raises(StationTypesError, match="草稿"):
        station_types_json(months, monthly | {"2026-08": draft}, centroids)
    renamed = _monthly("2026-08", [("sA", True, 0)])
    renamed["types"][1]["label"] = "別的名字"
    with pytest.raises(StationTypesError, match="名稱"):
        station_types_json(months, monthly | {"2026-08": renamed}, centroids)
    old = _monthly("2026-08", [("sA", True, 0)]) | {"v": CONTRACT_VERSION - 1}
    with pytest.raises(StationTypesError, match="v="):
        station_types_json(months, monthly | {"2026-08": old}, centroids)


@pytest.mark.skipif(not (DATA / "station-types.json").exists(), reason="沒有 station-types.json")
def test_published_station_types_are_the_modal_type_of_the_fit_months():
    """已提交的 station-types.json：每站等於擬合月份 stations.json 裡最常歸到的型（同票取較近月份），環狀線站沒有。"""
    body = json.loads((DATA / "station-types.json").read_text("utf-8"))
    centroids = ct.load_centroids()
    assert body["v"] == CONTRACT_VERSION
    assert body["fitMonths"] == centroids["months"] and body["featureVersion"] == centroids["featureVersion"]
    votes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    last: dict[str, dict[int, str]] = collections.defaultdict(dict)
    ring = set()
    for m in body["fitMonths"]:
        for s in json.loads((DATA / m / "stations.json").read_text("utf-8"))["stations"]:
            if not s["exitsRecorded"]:
                ring.add(s["id"])
            elif s["type"] is not None:
                votes[s["id"]][s["type"]] += 1
                last[s["id"]][s["type"]] = m
    assert ring and not ring & set(body["stations"]), "環狀線站沒有類型"
    assert set(body["stations"]) == set(votes)
    for sid, c in votes.items():
        top = max(c.values())
        want = max((t for t, n in c.items() if n == top), key=lambda t: last[sid][t])
        assert body["stations"][sid] == {"type": want, "votes": top, "months": sum(c.values())}, sid
    # 擬合時 109 站中 94 站 12 個月都歸同一型（中心檔 stableStations）
    changed = sum(r["votes"] < r["months"] for r in body["stations"].values())
    assert changed == centroids["stations"] - centroids["stableStations"]
