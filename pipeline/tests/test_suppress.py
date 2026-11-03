"""suppress.py 的單元測試，以及對已提交輸出的逐組檢查（AD-3）。"""

import json
from pathlib import Path

import pytest

from city_breath_pipeline.suppress import apply, od_groups, primary, secondary, unprotected

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if p.is_dir() and (p / "od").is_dir()) if DATA.is_dir() else []


# ── 單元測試 ──────────────────────────────────────────────


def test_primary_threshold():
    assert primary(9.49) is None
    assert primary(9.5) == 10
    assert primary(None) is None
    assert primary(0) is None


def test_single_null_hides_smallest_published():
    values = {"a": 50, "b": 30, "c": None, "d": 12}
    out, hidden = secondary(values, [["a", "b", "c", "d"]])
    assert out == {"a": 50, "b": 30, "c": None, "d": None}
    assert hidden == ["d"]
    assert values["d"] == 12  # 不改動傳入的值


def test_zero_or_two_nulls_untouched():
    values = {"a": 50, "b": None, "c": None, "x": 20, "y": 30}
    out, hidden = secondary(values, [["a", "b", "c"], ["x", "y"]])
    assert out == values
    assert hidden == []


def test_cascade_across_overlapping_groups():
    # 列 r1 = (a, b, c)，欄 c1 = (b, d, e)。r1 隱藏 b 之後，c1 只剩 b 一格 null → 再藏 c1 最小的 d。
    values = {"a": None, "b": 11, "c": 40, "d": 15, "e": 90}
    out, hidden = secondary(values, [["a", "b", "c"], ["b", "d", "e"]])
    assert hidden == ["b", "d"]
    assert unprotected(out, [["a", "b", "c"], ["b", "d", "e"]]) == []


def test_cascade_stops_when_groups_settle():
    # 鏈狀：每次隱藏都讓下一組剛好一格 null，直到最後一組。
    groups = [["n", "a1", "b1"], ["a1", "a2", "big"], ["a2", "a3", "big2"]]
    values = {"n": None, "a1": 10, "b1": 99, "a2": 11, "big": 500, "a3": 12, "big2": 600}
    out, hidden = secondary(values, groups)
    assert hidden == ["a1", "a2", "a3"]
    assert unprotected(out, groups) == []


def test_tie_breaks_by_group_order_and_is_reproducible():
    values = {"p": None, "q": 20, "r": 12, "s": 12}
    first = secondary(values, [["p", "q", "r", "s"]])
    assert first[1] == ["r"]
    assert secondary(values, [["p", "q", "r", "s"]]) == first
    assert secondary(values, [["p", "q", "s", "r"]])[1] == ["s"]


def test_unprotectable_group_raises():
    with pytest.raises(ValueError):
        secondary({"only": None}, [["only"]])


def test_duplicate_keys_in_group_count_once():
    out, hidden = secondary({"a": None, "b": 30}, [["a", "a", "b"]])
    assert hidden == ["b"]


def test_apply_counts_raw_none_as_null_but_not_primary():
    raw = {"a": None, "b": 4.2, "c": 120.0, "d": 55.4}
    res = apply(raw, [["a", "c", "d"], ["b", "c"]])
    # a 原本無人搭（None），算 null 但不算主要隱藏；b 少於 10 → 主要隱藏
    assert res.primary_hidden == 1
    # 第 1 組 a 為唯一 null → 藏 d(55)；第 2 組 b 為唯一 null → 藏 c(120)
    assert res.values == {"a": None, "b": None, "c": None, "d": None}
    assert sorted(res.secondary_hidden) == ["c", "d"]


def test_od_groups_shapes():
    groups = od_groups(origins=[0, 1], recorded=[0, 2], top_dests={(0, "weekday"): [2]}, service_hours=[7, 8])
    # 每日型每小時：2 列組 + 2 欄組；weekday 另有 1 個全日組
    assert len(groups) == 2 * 2 * (2 + 2) + 1
    assert [(0, 2, "weekday", 7), (0, 2, "weekday", 8)] in groups
    assert [(0, 0, "holiday", 8), (0, 2, "holiday", 8)] in groups  # 列：只含出站有紀錄的迄站
    assert [(0, 2, "weekday", 7), (1, 2, "weekday", 7)] in groups  # 欄


# ── 已提交輸出逐組檢查 ───────────────────────────────────


def _load(month: str):
    root = DATA / month
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    idx = {s["id"]: i for i, s in enumerate(stations)}
    shards = {}
    for p in sorted((root / "od").glob("*.json")):
        j = json.loads(p.read_text("utf-8"))
        shards[idx[j["origin"]]] = j
    flows = json.loads((root / "flows.json").read_text("utf-8"))
    return stations, shards, flows


def test_committed_data_present():
    assert MONTHS, "web/public/data/ 沒有任何月份，逐組檢查不會執行"


@pytest.mark.parametrize("month", MONTHS)
def test_od_shards_every_group_has_zero_or_two_nulls(month):
    """攻擊者的視角：只用公開的 JSON 組出每一組，每組都要是零格或至少兩格 null。"""
    stations, shards, _ = _load(month)
    recorded = [i for i, s in enumerate(stations) if s["exitsRecorded"]]
    bad = []
    checked = 0
    for t in ("weekday", "holiday"):
        service = [h for h in range(24) if any(j[t][h] is not None for j in shards.values())]
        for o, j in shards.items():
            for h in service:
                # 列：各迄站之和 ＝ 該站 entries[h]（＝ 分片的 Departures[h]）
                n = sum(j[t][h][d] is None for d in recorded)
                checked += 1
                if n == 1:
                    bad.append(("row", stations[o]["id"], t, h))
            for top in stations[o]["topDestinations"][t]:
                # 全日：各小時之和 ＝ topDestinations 的 avg
                d = top["station"]
                n = sum(j[t][h][d] is None for h in service)
                checked += 1
                if n == 1:
                    bad.append(("allday", stations[o]["id"], stations[d]["id"], t))
        for d in recorded:
            for h in service:
                # 欄：各起站之和 ＝ 該站 exits[h]
                n = sum(j[t][h][d] is None for j in shards.values())
                checked += 1
                if n == 1:
                    bad.append(("col", stations[d]["id"], t, h))
    assert checked > 0
    assert bad == []


@pytest.mark.parametrize("month", MONTHS)
def test_unrecorded_destinations_stay_null(month):
    stations, shards, _ = _load(month)
    unrecorded = [i for i, s in enumerate(stations) if not s["exitsRecorded"]]
    for j in shards.values():
        for t in ("weekday", "holiday"):
            for row in j[t]:
                if row is not None:
                    assert all(row[d] is None for d in unrecorded)


@pytest.mark.parametrize("month", MONTHS)
def test_flows_only_show_published_cells(month):
    _, shards, flows = _load(month)
    for t in ("weekday", "holiday"):
        for h, arcs in enumerate(flows[t]):
            for o, d, v in arcs:
                assert shards[o][t][h][d] == v
