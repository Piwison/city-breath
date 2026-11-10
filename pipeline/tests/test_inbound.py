"""每站的來源（1.13；AD-3、AD-5、AD-9、AD-10）：inbound 分片、前 10 目的地，以及已提交檔案的逐組檢查。"""

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from city_breath_pipeline import CONTRACT_VERSION, SUPPRESS_BELOW
from city_breath_pipeline import export as export_mod
from city_breath_pipeline.aggregate import aggregate_month
from city_breath_pipeline.cluster import ClusterResult
from city_breath_pipeline.district_flows import inbound_raw
from city_breath_pipeline.stations import Station
from city_breath_pipeline.suppress import inbound_groups

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
MONTHS = sorted(p.name for p in DATA.iterdir() if (p / "od").is_dir()) if DATA.is_dir() else []

# 區 X：A1、A2；區 Y：B1、R（環狀線，只有進站）、V（迄站）。9/1 平日、9/5 週六；只有 8、9 點有營運。
HEADER = "﻿日期,時段,進站,出站,人次\n"
# 平日每個起訖、每個小時都 ≥ 10（沒有「0 人」格）：平日沒有任何隱藏，數字可以直接對。
# 到 V 的人次另外指定；其餘起訖一律 20。
TO_V = {8: {"A1": 40, "A2": 25, "B1": 30, "R": 15, "V": 12}, 9: {"A1": 30, "A2": 20, "B1": 50, "R": 15, "V": 10}}
CLEAN = HEADER + "".join(
    f"2026-09-01,{h:02d},{o},{d},{TO_V[h][o] if d == 'V' else 20}\n"
    for h in (8, 9) for o in ("A1", "A2", "B1", "R", "V") for d in ("A1", "A2", "B1", "V")
) + """2026-09-05,08,A1,V,30
2026-09-05,09,A1,V,20
2026-09-05,08,A1,B1,4
"""
# 9 點 R→V 只有 5 人：欄組、站區塊、全日組一路連鎖
CASCADE = CLEAN.replace("2026-09-01,09,R,V,15", "2026-09-01,09,R,V,5")

CODES = {"A1": "X", "A2": "X", "B1": "Y", "V": "Y", "R": "Y"}


def _stations():
    mk = lambda name, rec=True: Station(id="s" + name, name=name, display=name, lon=0, lat=0, exits_recorded=rec)  # noqa: E731
    return [mk("A1"), mk("A2"), mk("B1"), mk("R", rec=False), mk("V")]


def _build(tmp_path, monkeypatch, csv: str, tweak=None):
    p = tmp_path / "od.csv"
    p.write_text(csv, encoding="utf-8")
    agg = aggregate_month(p, "2026-09", aliases={}, holidays={})
    if tweak:
        tweak(agg)
    # 分群需要上百站，這裡只測起訖輸出
    monkeypatch.setattr(export_mod, "cluster_stations", lambda *a, **k: ClusterResult(4, {}, {}, []))
    out = tmp_path / "data"
    result = export_mod.export_month(agg, _stations(), out, SimpleNamespace(station_codes=CODES, districts=[]), [])
    return result, _read(out / "2026-09")


def _read(root: Path):
    stations = json.loads((root / "stations.json").read_text("utf-8"))["stations"]
    idx = {s["id"]: i for i, s in enumerate(stations)}
    od = {idx[j["origin"]]: j for j in (json.loads(p.read_text("utf-8")) for p in (root / "od").glob("*.json"))}
    inbound = {idx[j["dest"]]: j for j in (json.loads(p.read_text("utf-8")) for p in (root / "inbound").glob("*.json"))}
    flows = json.loads((root / "district-flows.json").read_text("utf-8"))
    return SimpleNamespace(stations=stations, od=od, inbound=inbound, flows=flows)


# ── 攻擊者的視角：只用公開的 JSON 組出每一組（合成資料與已提交檔案共用）──


def _unprotected_groups(m) -> list[tuple]:
    """inbound 分片、topDestinations 與 od、district-flows 之間的每一組，回傳只有一格 null 的組。"""
    st, od, inbound, flows = m.stations, m.od, m.inbound, m.flows
    pos = {code: i for i, code in enumerate(flows["districts"])}
    of = [pos[s["district"]] for s in st]
    n = len(pos)
    recorded = [i for i, s in enumerate(st) if s["exitsRecorded"]]
    dest = sorted({of[i] for i in recorded})
    origins_in: dict[int, list[int]] = {}
    for o in sorted(od):
        origins_in.setdefault(of[o], []).append(o)
    bad = []

    def check(kind, cells, *where):
        if [c is None for c in cells].count(True) == 1:
            bad.append((kind, *where))

    for t in ("weekday", "holiday"):
        service = [h for h in range(24) if flows[t][h] is not None]
        for h in service:
            m_ = flows[t][h]
            cell = {(f, d): inbound[d][t]["districts"][h][f] for d in recorded for f in range(n)}
            for d in recorded:
                check("col", [cell[(f, d)] for f in range(n)], d, t, h)  # 各來源區 ＝ exits[h]
                for f in range(n):  # 來源區格 ＋ 區內各起站的 od 格
                    block = [od[o][t][h][d] for o in origins_in.get(f, [])]
                    if block:
                        check("block", [cell[(f, d)], *block], f, d, t, h)
            for f in range(n):
                check("row", [cell[(f, d)] for d in recorded], f, t, h)  # 各迄站 ＝ 區內 entries 之和
                for b in dest:  # district-flows 格 ＋ 迄區內各迄站的來源區格
                    check("district", [m_[f][b], *(cell[(f, d)] for d in recorded if of[d] == b)], f, b, t, h)
        # 全日格：topDestinations 與 allDay 的每一筆 ＋ 該起訖各小時
        pairs = {(o, x["station"]): x["avg"] for o, s in enumerate(st) for x in s["topDestinations"][t]}
        pairs.update({(x["station"], d): x["avg"] for d, j in inbound.items() for x in j[t]["allDay"]})
        for (o, d), avg in pairs.items():
            check("allday", [avg, *(od[o][t][h][d] for h in service)], o, d, t)
        # 整天總量（Σ 各小時 exits 或 entries）＝ 前 10 的全日格 ＋ 其餘起訖的各小時 od 格：
        # 換上全日格後，整條式子不能只剩一個未知數
        for d, j in inbound.items():
            top = {x["station"]: x["avg"] for x in j[t]["allDay"]}
            unknown = [v for v in top.values()] + [od[o][t][h][d] for o in od if o not in top for h in service]
            check("allDayTotal", unknown, d, t)
        for o, j in od.items():
            top = {x["station"]: x["avg"] for x in st[o]["topDestinations"][t]}
            unknown = [v for v in top.values()] + [j[t][h][d] for d in recorded if d not in top for h in service]
            check("topDestinationsTotal", unknown, o, t)
    return bad


# ── 合成資料 ────────────────────────────────────────────


def test_inbound_shard_shape_and_values(tmp_path, monkeypatch):
    _, m = _build(tmp_path, monkeypatch, CLEAN)
    sh = m.inbound[4]
    assert (sh["v"], sh["month"], sh["dest"], sh["districts"]) == (CONTRACT_VERSION, "2026-09", "sV", ["X", "Y"])
    wk = sh["weekday"]
    assert len(wk["top"]) == 24 and len(wk["districts"]) == 24
    # 停止營運（AD-5）：沒有營運的小時整格 null
    assert all(wk["top"][h] is None and wk["districts"][h] is None for h in range(24) if h not in (8, 9))
    # 8 點：X ＝ A1 40 ＋ A2 25；Y ＝ B1 30 ＋ 環狀線起站 R 15 ＋ 同站進出 12，和 ＝ 公開的 exits[8]
    assert wk["districts"][8] == [65, 57]
    assert sum(wk["districts"][8]) == m.stations[4]["weekday"]["exits"][8]
    # 前 5 起站：不含同站進出，依人數；值就是 od 分片的格
    assert [(t["station"], t["avg"]) for t in wk["top"][8]] == [(0, 40), (2, 30), (1, 25), (3, 15)]
    assert all(m.od[t["station"]]["weekday"][8][4] == t["avg"] for t in wk["top"][8])
    assert _unprotected_groups(m) == []


def test_allday_top_lists_use_suppressed_cells(tmp_path, monkeypatch):
    _, m = _build(tmp_path, monkeypatch, CLEAN)
    # 假日 A1→B1 只有 4 人：前 10 照樣列出名次，但 avg 為 null（AD-3）
    assert m.stations[0]["topDestinations"]["holiday"] == [{"station": 4, "avg": 50}, {"station": 2, "avg": None}]
    allday = m.inbound[4]["weekday"]["allDay"]
    # 全日：B1 80、A1 70、A2 45、R 30（不含同站進出）
    assert [(a["station"], a["avg"]) for a in allday] == [(2, 80), (0, 70), (1, 45), (3, 30)]
    # 同一格兩邊一致：A1 的 topDestinations 裡的 V 與 V 的 allDay 裡的 A1
    a1_to_v = next(d for d in m.stations[0]["topDestinations"]["weekday"] if d["station"] == 4)
    assert a1_to_v["avg"] == 70


def test_small_cell_cascades_and_every_group_stays_protected(tmp_path, monkeypatch):
    result, m = _build(tmp_path, monkeypatch, CASCADE)
    wk = m.inbound[4]["weekday"]
    assert m.od[3]["weekday"][9][4] is None  # R→V 5 人
    assert result["suppression"]["od"]["secondary"] > 0
    # 前 5 只從仍公開的格挑，值與 od 分片相同
    assert all(x["avg"] is not None and m.od[x["station"]]["weekday"][9][4] == x["avg"] for x in wk["top"][9])
    assert 3 not in [x["station"] for x in wk["top"][9]]
    assert _unprotected_groups(m) == []


def test_ring_line_station_has_no_inbound_shard(tmp_path, monkeypatch):
    _, m = _build(tmp_path, monkeypatch, CLEAN)
    assert sorted(m.inbound) == [0, 1, 2, 4]  # R（索引 3）沒有出站紀錄


def test_build_fails_when_districts_do_not_add_up_to_exits(tmp_path, monkeypatch):
    def tweak(agg):
        agg.station_hourly = [
            (n, t, h, e, x + 1 if (n, t, h) == ("V", "weekday", 8) else x) for n, t, h, e, x in agg.station_hourly
        ]

    with pytest.raises(RuntimeError, match="來源區合計"):
        _build(tmp_path, monkeypatch, CLEAN, tweak)


def test_inbound_raw_includes_ring_and_self_but_not_ring_dest():
    stations = _stations()
    od_hourly = [("R", "V", "weekday", 8, 1.5), ("V", "V", "weekday", 8, 2.0), ("A1", "R", "weekday", 8, 9.0)]
    raw, sums = inbound_raw(od_hourly, stations, CODES, {"weekday": 2, "holiday": 1}, [8])
    assert raw[("I", 1, 4, "weekday", 8)] == 3.5  # Y 區：R 3 人 ＋ V 4 人，共 7 人 ÷ 2 天
    assert raw[("I", 0, 4, "weekday", 8)] is None
    assert not any(k[2] == 3 for k in raw)  # 環狀線站不當迄站
    assert sums[(4, "weekday", 8)] == 7


def test_inbound_groups_shapes():
    # 站 0、1 在區 0，站 2、3 在區 1；站 3 出站未入檔
    groups = inbound_groups(n_districts=2, dest=[0, 1], origins=[0, 1, 2, 3], recorded=[0, 1, 2],
                            station_district=[0, 0, 1, 1], service_hours=[8])
    t = "weekday"
    assert [("I", 0, 2, t, 8), ("I", 1, 2, t, 8)] in groups  # 欄：各來源區 ＝ exits
    assert [("I", 0, 0, t, 8), ("I", 0, 1, t, 8), ("I", 0, 2, t, 8)] in groups  # 列
    assert [("I", 1, 2, t, 8), (2, 2, t, 8), (3, 2, t, 8)] in groups  # 站區塊（含環狀線起站與同站）
    assert [("D", 0, 1, t, 8), ("I", 0, 2, t, 8)] in groups  # 行政區區塊：迄區只算出站有紀錄的站
    # 每日型：3 欄＋2 列＋2×3 站區塊＋2×2 行政區區塊
    assert len(groups) == 2 * (3 + 2 + 6 + 4)


# ── 已提交輸出 ───────────────────────────────────────────


@pytest.mark.parametrize("month", MONTHS)
def test_committed_inbound_shape(month):
    m = _read(DATA / month)
    stations, od, inbound, flows = m.stations, m.od, m.inbound, m.flows
    recorded = [i for i, s in enumerate(stations) if s["exitsRecorded"]]
    assert sorted(inbound) == recorded  # 每個出站有紀錄的站一片，環狀線站沒有
    for d, j in inbound.items():
        assert (j["v"], j["month"], j["districts"]) == (CONTRACT_VERSION, month, flows["districts"])
        for t in ("weekday", "holiday"):
            b = j[t]
            assert len(b["top"]) == 24 and len(b["districts"]) == 24 and len(b["allDay"]) <= 10
            for h in range(24):
                closed = od[d][t][h] is None
                assert (b["top"][h] is None) == closed and (b["districts"][h] is None) == closed, (d, t, h)
                if closed:
                    continue
                assert len(b["top"][h]) <= 5 and len(b["districts"][h]) == len(flows["districts"])
                avgs = [x["avg"] for x in b["top"][h]]
                assert avgs == sorted(avgs, reverse=True) and all(x["station"] != d for x in b["top"][h])
                # 起站格與 od 分片是同一批格子（AD-10）
                assert all(od[x["station"]][t][h][d] == x["avg"] for x in b["top"][h])
                assert all(v is None or v >= SUPPRESS_BELOW for v in b["districts"][h])
            assert all(a["avg"] is None or a["avg"] >= SUPPRESS_BELOW for a in b["allDay"])
            assert all(a["station"] != d for a in b["allDay"])
    for s in stations:
        for t in ("weekday", "holiday"):
            tops = s["topDestinations"][t]
            assert len(tops) <= 10 and all(x["avg"] is None or x["avg"] >= SUPPRESS_BELOW for x in tops)


@pytest.mark.parametrize("month", MONTHS)
def test_committed_inbound_every_group_has_zero_or_two_nulls(month):
    assert _unprotected_groups(_read(DATA / month)) == []


@pytest.mark.parametrize("month", MONTHS)
def test_committed_inbound_districts_match_od_hand_sum(month):
    """手算對照：來源區格 ≈ 區內各起站 od 格之和（只比對區塊內 od 格全部公開的格；差值只來自每格四捨五入）。"""
    m = _read(DATA / month)
    pos = {code: i for i, code in enumerate(m.flows["districts"])}
    of = [pos[s["district"]] for s in m.stations]
    compared = 0
    for d, j in m.inbound.items():
        for t in ("weekday", "holiday"):
            for h, row in enumerate(j[t]["districts"]):
                if row is None:
                    continue
                for f, v in enumerate(row):
                    block = [m.od[o][t][h][d] for o in m.od if of[o] == f]
                    if v is None or not block or any(x is None for x in block):
                        continue
                    assert abs(sum(block) - v) <= (len(block) + 1) / 2, (m.stations[d]["name"], t, h, f)
                    compared += 1
    assert compared > 0
