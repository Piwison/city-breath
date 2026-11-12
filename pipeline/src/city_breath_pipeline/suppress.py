"""少於 10 人的隱藏規則，含次要隱藏（architecture AD-3）。

這是整條管線唯一套用門檻的地方，所有起訖數字（od 分片、全日前 10、行政區起訖 district-flows、
inbound 分片的來源行政區、活動日的場館來源行政區）都經過這裡。

- 主要隱藏：平均四捨五入後少於 ``SUPPRESS_BELOW`` 一律輸出 ``None``。
- 次要隱藏：若某個已公開的總量等於一組格子的和，而這組只有一格 ``None``，用總量減掉其他格
  就能反推出那格。此時再隱藏組內最小的已公開格，重複到每組都是零格或至少兩格 ``None``。

格子用任意可雜湊的鍵表示，「組」就是一串鍵；同一格可以同時屬於好幾組（例：某起站某小時的
各迄站是一組，同一迄站同一小時的各起站又是一組），一組的隱藏可能讓另一組只剩一格 ``None``，
所以用工作清單反覆檢查到穩定。結果只由輸入決定：同值時取組內順序較前的格。

優先藏新格（AD-3，1.13 起）：``prefer`` 標出「這一版才新增公開的格」（inbound 的來源區格與全日格）。
組內有可藏的新格時只在新格裡挑，並先挑「藏了不會逼別組改藏舊格」的那格，再比大小；組內沒有新格時
照原規則藏最小的格。已公開過的 od、district-flows 格因此不會為了保護新格而改成 ``None``——它們的
舊值留在 git 歷史，新藏的話舊值加上新總量反而能減出兩版都隱藏的格（跨版本反推）。
"""

from __future__ import annotations

from collections import deque
from collections.abc import Callable, Hashable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import TypeVar

from . import DAY_TYPES, SUPPRESS_BELOW

K = TypeVar("K", bound=Hashable)


def primary(avg: float | None) -> int | None:
    """起訖人次：四捨五入後少於 10 一律不給數字；``None``（無人搭）照樣是 ``None``。"""
    if avg is None:
        return None
    v = round(avg)
    return v if v >= SUPPRESS_BELOW else None


def unprotected(values: Mapping[K, int | None], groups: Iterable[Sequence[K]]) -> list[int]:
    """回傳剛好只有一格 ``None`` 的組（索引）。全部保護好時是空串列。"""
    return [i for i, g in enumerate(groups) if sum(values[k] is None for k in dict.fromkeys(g)) == 1]


def secondary(
    values: Mapping[K, int | None],
    groups: Sequence[Sequence[K]],
    prefer: Callable[[K], bool] | None = None,
) -> tuple[dict[K, int | None], list[K]]:
    """次要隱藏。回傳（新的值，依隱藏順序列出被次要隱藏的鍵）；不改動傳入的 ``values``。

    ``prefer(k)`` 為真的格（新格）優先藏，見模組說明；不給時每組都藏最小的已公開格。
    組內只有一格 ``None`` 卻沒有其他已公開格可藏（一格的組）時無法保護，丟 ``ValueError``，
    交給呼叫端改成不公開該總量。
    """
    out = dict(values)
    groups = [list(dict.fromkeys(g)) for g in groups]  # 去掉組內重複的鍵，保留順序
    member_of: dict[K, list[int]] = {}
    nulls: list[int] = []
    for gi, g in enumerate(groups):
        n = 0
        for k in g:
            member_of.setdefault(k, []).append(gi)
            if out[k] is None:
                n += 1
        nulls.append(n)

    hidden: list[K] = []
    todo = deque(gi for gi, n in enumerate(nulls) if n == 1)
    while todo:
        gi = todo.popleft()
        if nulls[gi] != 1:
            continue
        published = [(out[k], pos, k) for pos, k in enumerate(groups[gi]) if out[k] is not None]
        if not published:
            raise ValueError(f"第 {gi} 組只有一格且已隱藏，公開總量會直接洩漏它：{groups[gi]}")
        fresh = [x for x in published if prefer(x[2])] if prefer is not None else []
        if fresh:
            def forced(k: K) -> int:
                """藏 k 之後，有幾組會只剩一格 None 且組內沒有別的新格可藏（只能改藏舊格）。"""
                return sum(
                    1
                    for gj in member_of[k]
                    if gj != gi and nulls[gj] == 0
                    and not any(c != k and out[c] is not None and prefer(c) for c in groups[gj])
                )

            _, _, k = min(fresh, key=lambda x: (forced(x[2]), x[0], x[1]))
        else:
            _, _, k = min(published, key=lambda x: (x[0], x[1]))
        out[k] = None
        hidden.append(k)
        for gj in member_of[k]:
            nulls[gj] += 1
            if nulls[gj] == 1:
                todo.append(gj)
    return out, hidden


@dataclass
class Suppressed:
    """``apply`` 的結果：可公開的值，以及兩種隱藏各藏了幾格。"""

    values: dict = field(default_factory=dict)
    primary_hidden: int = 0  # 原始有人次但少於門檻而隱藏的格（不含原本就無人搭的格）
    secondary_hidden: list = field(default_factory=list)
    primary_keys: list = field(default_factory=list)  # primary_hidden 那些格的鍵


def apply(
    raw: Mapping[K, float | None], groups: Sequence[Sequence[K]], prefer: Callable[[K], bool] | None = None
) -> Suppressed:
    """先主要隱藏、再依 ``groups`` 次要隱藏。``raw`` 是未四捨五入的平均，``None`` 表示無人搭。"""
    first = {k: primary(v) for k, v in raw.items()}
    keys = [k for k, v in first.items() if v is None and raw[k] is not None]
    values, hidden = secondary(first, groups, prefer)
    return Suppressed(values=values, primary_hidden=len(keys), secondary_hidden=hidden, primary_keys=keys)


def new_in_v3(published_allday: Iterable) -> Callable[[tuple], bool]:
    """1.13（契約 v3）才新增公開的格，給 ``secondary`` 的 ``prefer``：inbound 的來源區格 ``("I", …)``，以及
    v2 沒公開過的全日格 ``("A", …)``。``published_allday`` 是 v2 已公開的全日格（各起站 topDestinations
    的前 5），它們的 avg 已在 git 歷史，算舊格。
    """
    old = frozenset(published_allday)
    return lambda k: k[0] == "I" or (k[0] == "A" and k not in old)


# ── 各輸出的組定義 ──


def od_groups(
    origins: list[int],
    recorded: list[int],
    allday: Iterable[tuple[int, int, str]],
    service_hours: list[int],
) -> list[list[tuple]]:
    """起訖格子 ``(起站索引, 迄站索引, 日型, 小時)`` 中，和等於某個已公開總量的組（AD-3）。

    1. 列：某起站某日型某小時的各迄站 ＝ stations.json 該站 entries[h]，也是分片的 *Departures[h]。
    2. 欄：某迄站某日型某小時的各起站 ＝ stations.json 該站 exits[h]（載入全部分片即可加總）。
    3. 全日：全日格 ``("A", 起站, 迄站, 日型)``（stations.json 的 topDestinations 與 inbound 分片的
       allDay 都取它）＝ 該起訖各營運小時之和。組成員是全日格加上各小時的 od 格：全日格公開而只剩一格
       小時 ``None`` 可用減法反推；全日格本身也是起訖數字（< 10 照樣隱藏），是唯一 ``None`` 時也能把
       各小時加總反推。``allday`` 列出有公開的全日格 ``(起站, 迄站, 日型)``。

    只含出站有紀錄的迄站：環狀線車站整欄已知為 0，不能拿來保護別格。
    """
    groups: list[list[tuple]] = []
    for t in DAY_TYPES:
        for h in service_hours:
            groups += [[(oi, di, t, h) for di in recorded] for oi in origins]
            groups += [[(oi, di, t, h) for oi in origins] for di in recorded]
    for oi, di, t in allday:
        groups.append([("A", oi, di, t), *((oi, di, t, h) for h in service_hours)])
    return groups


def venue_origin_groups(
    venue_stations: list[int],
    origin_districts: list[str],
    open_hours: list[int],
) -> list[list[tuple[int, str, int]]]:
    """逐日檔場館格子 ``(場館站索引, 來源行政區代碼, 小時)`` 中，和等於已公開總量的組（AD-3，1.10）。

    某場館站、某小時的各來源行政區（含場館站自己的區，即同站進出）之和 ＝ 同一個逐日檔的
    ``exits[站][h]``（站層級總量，照樣公開），所以每個（站, 小時）是一組。
    ``origin_districts`` 要列出所有可能的來源區（有車站的區），沒有人次的區是 ``None`` 格。
    全日加總（某站當日出站）是各小時組的聯集，各小時組保護好就一併保護好，不另列。
    """
    return [[(vi, dc, h) for dc in origin_districts] for vi in venue_stations for h in open_hours]


def district_groups(
    n_districts: int,
    dest: list[int],
    origins: list[int],
    recorded: list[int],
    station_district: Sequence[int],
    service_hours: list[int],
) -> list[list[tuple]]:
    """行政區起訖格 ``("D", 起區索引, 迄區索引, 日型, 小時)`` 中，和等於某個已公開總量的組（AD-3）。

    ``dest`` 是可當迄區的區（區內有出站有紀錄的站），``station_district[i]`` 是第 i 站所屬區的索引；
    ``origins``、``recorded`` 與 ``od_groups`` 相同（有分片的起站、出站有紀錄的迄站）。

    1. 列：起區 A 某日型某小時的各迄區 ＝ Σ A 內各站 stations.json ``entries[h]``
       （＝ Σ A 內各站分片的 ``*Departures[h]``；迄站只算出站有紀錄的站，與 od 列組相同）。
    2. 欄：迄區 B 某日型某小時的各起區 ＝ Σ B 內各站 stations.json ``exits[h]``。
    3. 站區塊：行政區格 (A, B, t, h) ＝ Σ od 格 (o∈A, d∈B, t, h)。組成員是這格行政區格加上整塊 od 格：
       行政區格公開而區塊只剩一格 od ``None`` 時，可用減法反推那格 od；行政區格是唯一的 ``None`` 時，
       也能把 od 加總反推它。所以 od 與行政區格要在同一次 ``apply`` 一起處理（兩種鍵形狀不同，不會撞）。

    沒有「全日」組：district-flows.json 之外沒有公開任何行政區的全日總量。

    契約 v4（3.20）在 districts.json 公開每區每小時的 ``entries``／``exits``：恰是 1. 列、2. 欄的總量
    （區內各站 ``entries[h]``、出站有紀錄各站 ``exits[h]`` 之和），本來就當作已公開，所以不新增組、不新藏格。
    """
    origins_in: dict[int, list[int]] = {}
    for oi in origins:
        origins_in.setdefault(station_district[oi], []).append(oi)
    dests_in: dict[int, list[int]] = {}
    for di in recorded:
        dests_in.setdefault(station_district[di], []).append(di)
    rows = range(n_districts)
    groups: list[list[tuple]] = []
    for t in DAY_TYPES:
        for h in service_hours:
            groups += [[("D", fi, ti, t, h) for ti in dest] for fi in rows]
            groups += [[("D", fi, ti, t, h) for fi in rows] for ti in dest]
            for fi in rows:
                for ti in dest:
                    block = [(oi, di, t, h) for oi in origins_in.get(fi, []) for di in dests_in.get(ti, [])]
                    if block:  # 空區塊（區內沒有任何起站分片）：行政區格必為無人搭，沒有可反推的 od 格
                        groups.append([("D", fi, ti, t, h), *block])
    return groups


def inbound_groups(
    n_districts: int,
    dest: list[int],
    origins: list[int],
    recorded: list[int],
    station_district: Sequence[int],
    service_hours: list[int],
) -> list[list[tuple]]:
    """inbound 分片的來源區格 ``("I", 來源區索引, 迄站索引, 日型, 小時)`` 中，和等於已公開總量的組（AD-3，1.13）。

    參數與 ``district_groups`` 相同。來源區格＝區內各起站（含迄站自己，即同站進出）到該迄站的 od 格之和。

    1. 欄：某迄站某日型某小時的各來源區 ＝ stations.json 該站 ``exits[h]``。
    2. 列：某來源區某日型某小時的各迄站 ＝ 區內各站 ``entries[h]`` 之和（與 od 列組同樣只算出站有紀錄的迄站）。
    3. 站區塊：來源區格 ＋ 區內各起站到這個迄站的 od 格（和 district_groups 的站區塊同理：
       公開的來源區格可減出區塊內唯一的 od ``None``，唯一 ``None`` 的來源區格也能由 od 加總反推）。
    4. 行政區區塊：district-flows 格 ``("D", 起區, 迄區, t, h)`` ＋ 起區到迄區內各迄站的來源區格。

    所以 od、全日、行政區與來源區格要在同一次 ``apply`` 一起處理。
    """
    origins_in: dict[int, list[int]] = {}
    for oi in origins:
        origins_in.setdefault(station_district[oi], []).append(oi)
    dests_in: dict[int, list[int]] = {}
    for di in recorded:
        dests_in.setdefault(station_district[di], []).append(di)
    rows = range(n_districts)
    groups: list[list[tuple]] = []
    for t in DAY_TYPES:
        for h in service_hours:
            groups += [[("I", fi, di, t, h) for fi in rows] for di in recorded]
            groups += [[("I", fi, di, t, h) for di in recorded] for fi in rows]
            for fi in rows:
                block_origins = origins_in.get(fi, [])
                if block_origins:  # 區內沒有起站：來源區格必為無人搭，沒有可反推的 od 格
                    groups += [[("I", fi, di, t, h), *((oi, di, t, h) for oi in block_origins)] for di in recorded]
                for ti in dest:
                    groups.append([("D", fi, ti, t, h), *(("I", fi, di, t, h) for di in dests_in.get(ti, []))])
    return groups
