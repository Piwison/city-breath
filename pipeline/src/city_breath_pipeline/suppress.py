"""少於 10 人的隱藏規則，含次要隱藏（architecture AD-3）。

這是整條管線唯一套用門檻的地方，所有起訖數字（od 分片、flows，以及之後的行政區起訖、
活動日來源行政區）都經過這裡。

- 主要隱藏：平均四捨五入後少於 ``SUPPRESS_BELOW`` 一律輸出 ``None``。
- 次要隱藏：若某個已公開的總量等於一組格子的和，而這組只有一格 ``None``，用總量減掉其他格
  就能反推出那格。此時再隱藏組內最小的已公開格，重複到每組都是零格或至少兩格 ``None``。

格子用任意可雜湊的鍵表示，「組」就是一串鍵；同一格可以同時屬於好幾組（例：某起站某小時的
各迄站是一組，同一迄站同一小時的各起站又是一組），一組的隱藏可能讓另一組只剩一格 ``None``，
所以用工作清單反覆檢查到穩定。結果只由輸入決定：同值時取組內順序較前的格。
"""

from __future__ import annotations

from collections import deque
from collections.abc import Hashable, Iterable, Mapping, Sequence
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
    values: Mapping[K, int | None], groups: Sequence[Sequence[K]]
) -> tuple[dict[K, int | None], list[K]]:
    """次要隱藏。回傳（新的值，依隱藏順序列出被次要隱藏的鍵）；不改動傳入的 ``values``。

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


def apply(raw: Mapping[K, float | None], groups: Sequence[Sequence[K]]) -> Suppressed:
    """先主要隱藏、再依 ``groups`` 次要隱藏。``raw`` 是未四捨五入的平均，``None`` 表示無人搭。"""
    first = {k: primary(v) for k, v in raw.items()}
    n_primary = sum(1 for k, v in first.items() if v is None and raw[k] is not None)
    values, hidden = secondary(first, groups)
    return Suppressed(values=values, primary_hidden=n_primary, secondary_hidden=hidden)


# ── 各輸出的組定義（1.9 行政區起訖、1.10 活動日來源行政區之後加在這裡）──


def od_groups(
    origins: list[int],
    recorded: list[int],
    top_dests: dict[tuple[int, str], list[int]],
    service_hours: list[int],
) -> list[list[tuple[int, int, str, int]]]:
    """起訖格子 ``(起站索引, 迄站索引, 日型, 小時)`` 中，和等於某個已公開總量的組（AD-3）。

    1. 列：某起站某日型某小時的各迄站 ＝ stations.json 該站 entries[h]，也是分片的 *Departures[h]。
    2. 欄：某迄站某日型某小時的各起站 ＝ stations.json 該站 exits[h]（載入全部分片即可加總）。
    3. 全日：某起站 topDestinations 的某迄站、某日型的各營運小時 ＝ 該筆 avg。

    只含出站有紀錄的迄站：環狀線車站整欄已知為 0，不能拿來保護別格。
    """
    groups: list[list[tuple[int, int, str, int]]] = []
    for t in DAY_TYPES:
        for h in service_hours:
            groups += [[(oi, di, t, h) for di in recorded] for oi in origins]
            groups += [[(oi, di, t, h) for oi in origins] for di in recorded]
        for oi in origins:
            groups += [[(oi, di, t, h) for h in service_hours] for di in top_dests.get((oi, t), [])]
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
