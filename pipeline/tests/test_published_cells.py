"""已公開過的 od 格不再新藏（AD-3，1.13 起）。

契約 v2 的 od 分片（main 5432f92 的 12 個月）已經在 git 歷史裡。v3 若把其中某格改成 null，舊值加上
v3 新公開的總量（inbound 的來源區格）就可能減出兩版都隱藏的格。所以 v3 的 od 分片相對 v2 不得新增
null，例外只能是 ``fixtures/od_v2_exceptions.json`` 列出的格：

- 原因只有一種：某迄站某小時各來源區之和＝公開的 exits[h]（欄組），組裡某區少於 10 人；其餘來源區的
  站區塊 od 全部公開（等於可以直接加出來），藏哪個來源區格都沒用，只能再藏一格 od。這種格的來源區格
  一定是 null，測試也檢查這一點。

``fixtures/od_v2_public.json.gz`` 是 v2 每個 od 分片、每個日型、每個營運小時「公開格」的位元遮罩
（第 i 位＝同月 stations.json 第 i 站）。重產：``uv run python tests/test_published_cells.py <v2 的 commit>``。
"""

from __future__ import annotations

import gzip
import json
import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "web" / "public" / "data"
MASK = HERE / "fixtures" / "od_v2_public.json.gz"
EXCEPTIONS = HERE / "fixtures" / "od_v2_exceptions.json"
DAYS = ("weekday", "holiday")


def _mask(row: list) -> str:
    return format(sum(1 << i for i, v in enumerate(row) if v is not None), "x")


def _load_baseline() -> dict:
    return json.loads(gzip.decompress(MASK.read_bytes()))


BASELINE = _load_baseline() if MASK.exists() else {}
MONTHS = sorted(m for m in BASELINE if (DATA / m / "od").is_dir())


def _new_nulls(month: str) -> tuple[set[tuple], int, list[dict]]:
    """回傳（v2 公開、現在是 null 的格 (起站 ID, 迄站索引, 日型, 小時)，v2 公開格數，現在的 stations）。"""
    stations = json.loads((DATA / month / "stations.json").read_text("utf-8"))["stations"]
    base = BASELINE[month]
    new, public = set(), 0
    for p in sorted((DATA / month / "od").glob("*.json")):
        shard = json.loads(p.read_text("utf-8"))
        old = base.get(shard["origin"])
        assert old is not None, f"{month} 多了 v2 沒有的起站分片 {shard['origin']}"
        for t in DAYS:
            for h, row in enumerate(shard[t]):
                if old[t][h] is None:
                    assert row is None, (month, shard["origin"], t, h)
                    continue
                was = int(old[t][h], 16)
                public += bin(was).count("1")
                now = int(_mask(row), 16)
                for i in range(len(row)):
                    if was >> i & 1 and not now >> i & 1:
                        new.add((shard["origin"], i, t, h))
    return new, public, stations


def test_baseline_present():
    assert MONTHS, "沒有 v2 基準或沒有對得上的月份，這個檢查不會執行"


@pytest.mark.parametrize("month", MONTHS)
def test_od_cells_published_in_v2_stay_published(month):
    new, _, stations = _new_nulls(month)
    allowed = {tuple(x) for x in json.loads(EXCEPTIONS.read_text("utf-8")).get(month, [])}
    assert new == allowed, f"{month}：多出 {sorted(new - allowed)[:5]}，例外表裡卻沒藏 {sorted(allowed - new)[:5]}"
    # 例外的原因：該起站所屬區到這個迄站、這個小時的來源區格是 null（見模組說明）
    pos = None
    for origin, di, t, h in new:
        shard = json.loads((DATA / month / "inbound" / f"{stations[di]['id']}.json").read_text("utf-8"))
        pos = pos or {code: i for i, code in enumerate(shard["districts"])}
        district = next(s["district"] for s in stations if s["id"] == origin)
        assert shard[t]["districts"][h][pos[district]] is None, (month, origin, di, t, h)


def build_baseline(ref: str) -> dict:
    """從 git 的 ``ref``（v2 的 commit）讀每個月份的 od 分片，做成公開格遮罩。"""
    def show(path: str) -> bytes:
        return subprocess.run(["git", "-C", str(ROOT), "show", f"{ref}:{path}"], capture_output=True, check=True).stdout

    names = subprocess.run(["git", "-C", str(ROOT), "ls-tree", "-r", "--name-only", ref, "web/public/data/"],
                           capture_output=True, text=True, check=True).stdout.split()
    out: dict = {}
    for name in names:
        parts = name.split("/")
        if len(parts) != 6 or parts[4] != "od":
            continue
        shard = json.loads(show(name))
        out.setdefault(parts[3], {})[shard["origin"]] = {
            t: [None if row is None else _mask(row) for row in shard[t]] for t in DAYS
        }
    return out


if __name__ == "__main__" and sys.argv[1:] == ["--exceptions"]:
    # 把目前資料中「v2 公開、現在 null」的格寫成例外表；寫之前先確認每格都是上面說的那種原因（跑 pytest）
    body = {m: sorted(list(x) for x in _new_nulls(m)[0]) for m in MONTHS}
    EXCEPTIONS.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print({m: len(v) for m, v in body.items()})
elif __name__ == "__main__":
    MASK.parent.mkdir(exist_ok=True)
    body = json.dumps(build_baseline(sys.argv[1]), separators=(",", ":"), sort_keys=True).encode()
    MASK.write_bytes(gzip.compress(body, mtime=0))
    print(f"寫出 {MASK}（{MASK.stat().st_size:,} bytes）")
