"""suppress.py 的單元測試，以及對已提交輸出的逐組檢查（AD-3）。"""

import json
from pathlib import Path

import pytest

from city_breath_pipeline.suppress import (
    apply,
    district_groups,
    od_groups,
    primary,
    secondary,
    unprotected,
)

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


def test_prefer_hides_new_cell_even_if_larger():
    """AD-3（1.13）：組內有新格（來源區格）時只藏新格，已公開過的 od 格不動。"""
    fresh = lambda k: k.startswith("I")  # noqa: E731
    out, hidden = secondary({"I": 50, "od1": None, "od2": 12}, [["I", "od1", "od2"]], prefer=fresh)
    assert hidden == ["I"] and out["od2"] == 12
    # 沒給 prefer：照原規則藏最小的
    assert secondary({"I": 50, "od1": None, "od2": 12}, [["I", "od1", "od2"]])[1] == ["od2"]


def test_prefer_skips_new_cell_that_would_force_an_old_one():
    """欄組要藏一格新格：I1 的站區塊全公開，藏它會逼區塊改藏 od；I2 的區塊已有 null，藏它不會。"""
    fresh = lambda k: k.startswith("I")  # noqa: E731
    groups = [["I0", "I1", "I2"], ["I1", "a", "b"], ["I2", "c", "d"]]
    values = {"I0": None, "I1": 20, "I2": 90, "a": 11, "b": 12, "c": None, "d": 50}
    out, hidden = secondary(values, groups, prefer=fresh)
    assert hidden == ["I2"]
    assert unprotected(out, groups) == []


def test_prefer_falls_back_to_old_cells_when_forced():
    """新格都藏了仍有組只剩一格 null（站區塊 od 全公開）：只能藏舊格，照原規則取最小，仍保證每組受保護。"""
    fresh = lambda k: k.startswith("I")  # noqa: E731
    groups = [["I0", "I1"], ["I1", "a", "b"]]
    out, hidden = secondary({"I0": None, "I1": 20, "a": 11, "b": 9 + 3}, groups, prefer=fresh)
    assert hidden == ["I1", "a"]
    assert unprotected(out, groups) == []


def test_district_groups_shapes():
    # 站 0、1 在區 0，站 2 在區 1；站 1 出站未入檔
    groups = district_groups(
        n_districts=2, dest=[0, 1], origins=[0, 1, 2], recorded=[0, 2],
        station_district=[0, 0, 1], service_hours=[8],
    )
    # 每日型每小時：2 列組 + 2 欄組 + 4 站區塊組
    assert len(groups) == 2 * (2 + 2 + 4)
    assert [("D", 0, 0, "weekday", 8), ("D", 0, 1, "weekday", 8)] in groups  # 列
    assert [("D", 0, 1, "weekday", 8), ("D", 1, 1, "weekday", 8)] in groups  # 欄
    # 站區塊：區 0→區 1 ＝ od(0→2) + od(1→2)；迄站只含出站有紀錄的站
    assert [("D", 0, 1, "weekday", 8), (0, 2, "weekday", 8), (1, 2, "weekday", 8)] in groups
    assert [("D", 0, 0, "weekday", 8), (0, 0, "weekday", 8), (1, 0, "weekday", 8)] in groups


def test_district_block_protects_od_cell():
    """行政區格公開、區塊只剩一格 od null → 再藏一格 od；行政區格是唯一 null → 也要藏 od。"""
    groups = [[("D", 0, 1, "weekday", 8), (0, 2, "weekday", 8), (1, 2, "weekday", 8)]]
    res = apply({("D", 0, 1, "weekday", 8): 45.0, (0, 2, "weekday", 8): 40.0, (1, 2, "weekday", 8): 5.0}, groups)
    assert res.values[(0, 2, "weekday", 8)] is None and res.values[("D", 0, 1, "weekday", 8)] == 45
    _, hidden = secondary({("D", 0, 1, "weekday", 8): None, (0, 2, "weekday", 8): 30, (1, 2, "weekday", 8): 20}, groups)
    assert hidden == [(1, 2, "weekday", 8)]


def test_od_groups_shapes():
    groups = od_groups(origins=[0, 1], recorded=[0, 2], allday=[(0, 2, "weekday")], service_hours=[7, 8])
    # 每日型每小時：2 列組 + 2 欄組；weekday 另有 1 個全日組（全日格本身也是成員）
    assert len(groups) == 2 * 2 * (2 + 2) + 1
    assert [("A", 0, 2, "weekday"), (0, 2, "weekday", 7), (0, 2, "weekday", 8)] in groups
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
    flows = json.loads((root / "district-flows.json").read_text("utf-8"))
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
                # 全日：各小時之和 ＝ topDestinations 的 avg（avg 本身也可能是 null）
                d = top["station"]
                n = (top["avg"] is None) + sum(j[t][h][d] is None for h in service)
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


def test_flows_json_removed():
    """AD-10：v2 不再輸出前 200 組站弧線。"""
    assert not any(DATA.glob("*/flows.json"))


@pytest.mark.parametrize("month", MONTHS)
def test_district_flows_every_group_has_zero_or_two_nulls(month):
    """攻擊者的視角：行政區列、欄，以及「行政區格＋整塊 od 格」都要是零格或至少兩格 null。"""
    stations, shards, flows = _load(month)
    pos = {code: i for i, code in enumerate(flows["districts"])}
    of = [pos[s["district"]] for s in stations]
    n = len(pos)
    recorded = [i for i, s in enumerate(stations) if s["exitsRecorded"]]
    dest = sorted({of[i] for i in recorded})
    bad = []
    checked = 0
    for t in ("weekday", "holiday"):
        for h, m in enumerate(flows[t]):
            if m is None:
                continue
            for a in range(n):
                checked += 1
                if sum(m[a][b] is None for b in dest) == 1:
                    bad.append(("row", a, t, h))
                for b in dest:
                    block = [shards[o][t][h][d] for o in shards if of[o] == a for d in recorded if of[d] == b]
                    checked += 1
                    if [m[a][b], *block].count(None) == 1:
                        bad.append(("block", a, b, t, h))
            for b in dest:
                checked += 1
                if sum(m[a][b] is None for a in range(n)) == 1:
                    bad.append(("col", b, t, h))
    assert checked > 0
    assert bad == []


@pytest.mark.parametrize("month", MONTHS)
def test_district_flows_rows_add_up_to_station_entries(month):
    """AD-7：完全公開的一列，和等於區內各站 entries 之和（只差每格四捨五入）。"""
    stations, _, flows = _load(month)
    pos = {code: i for i, code in enumerate(flows["districts"])}
    full = 0
    for t in ("weekday", "holiday"):
        for h, m in enumerate(flows[t]):
            if m is None:
                continue
            for code, a in pos.items():
                if any(v is None for v in m[a]):
                    continue
                members = [s for s in stations if s["district"] == code]
                entries = sum(s[t]["entries"][h] for s in members)
                assert abs(sum(m[a]) - entries) <= (len(m[a]) + len(members)) / 2, (code, t, h)
                full += 1
    assert full > 0
