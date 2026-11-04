"""場館檔期自動匯入（7.2，architecture AD-13）。

臺北市資料大平臺的三個資料集，每月抓一次快照到 ``data/raw/events/{YYYYMM}/``：

- 臺北小巨蛋場地租用資訊：每月一個資源（名稱結尾 ``_YYYYMM``），BIG-5；一列一個租用期（含進場與拆台）。
- 臺北花博公園展館資訊：每年一個資源（名稱含民國「NNN年」），UTF-8；一列一個租借期。年度檔常晚發布。
- 中山堂演出訊息：單一滾動資源，UTF-8；一列一場演出。

``fetch()`` 下載並寫 ``sources.json``（網址、sha256、取得日期，或「尚未發布」）；``load()`` 讀快照、解析成
``Schedule``；``link()`` 把站級異常配上檔期。租用期整段當 ``startDate``／``endDate``，演出日不另外輸出：
期間內場館站有站級異常的那幾天，就是 ``eventIds`` 會指向這個檔期的日子（AD-14：前端只查表）。
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import re
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .anomaly import Anomaly

API_VIEW = "https://data.taipei/api/frontstage/tpeod/dataset.view?id={pid}"
DOWNLOAD = "https://data.taipei/api/dataset/{pid}/resource/{rid}/download"
DATASET_PAGE = "https://data.taipei/dataset/detail?id={pid}"
LICENSE = "政府資料開放授權條款－第1版"
MANIFEST = "sources.json"


class ScheduleError(ValueError):
    """快照缺漏、解不開或欄位不對。"""


@dataclass(frozen=True)
class Dataset:
    key: str  # 快照檔名的前綴
    venue: str  # pipeline/config/venues.csv 的 venue_id
    pid: str
    name: str
    publisher: str
    resource: str  # "monthly"｜"yearly"｜"single"


DATASETS = [
    Dataset("taipei-arena", "taipei-arena", "f0497727-b2cd-46fa-87c8-c6af6bb9eada",
            "臺北小巨蛋場地租用資訊", "臺北大眾捷運股份有限公司", "monthly"),
    Dataset("expo-park", "expo-park", "19c3ec8b-7743-460e-83db-6ddc51d10a3c",
            "臺北花博公園展館資訊", "臺北市政府產業發展局", "yearly"),
    Dataset("zhongshan-hall", "zhongshan-hall", "bf51fdc3-6823-427a-8713-5e2471dec597",
            "中山堂演出訊息", "臺北市中山堂管理所", "single"),
]


@dataclass(frozen=True)
class Schedule:
    """一個檔期：租用期（小巨蛋、花博）或同名節目的當月演出（中山堂）。"""

    venue: str
    start: dt.date
    end: dt.date
    name: str
    url: str  # 資料集頁
    days: frozenset[dt.date] = field(default=frozenset())  # 可能的演出日；空＝起訖間每一天

    def candidate_days(self) -> frozenset[dt.date]:
        if self.days:
            return self.days
        n = (self.end - self.start).days
        return frozenset(self.start + dt.timedelta(k) for k in range(n + 1))


# ── 選資源與下載 ──────────────────────────────────────────


def pick_resource(ds: Dataset, resources: list[dict], month: str) -> dict | None:
    """依資料集的規則挑出當月要用的資源；沒有（例如年度檔尚未發布）回傳 ``None``。"""
    year, mon = (int(x) for x in month.split("-"))
    if ds.resource == "monthly":
        want = f"_{year}{mon:02d}"
        hits = [r for r in resources if r.get("name", "").strip().endswith(want)]
    elif ds.resource == "yearly":
        roc = year - 1911
        hits = [r for r in resources if re.search(rf"(?<!\d){roc}\s*年", r.get("name", ""))]
    else:
        hits = resources[:1]
    if len(hits) > 1:
        raise ScheduleError(f"{ds.name} 有 {len(hits)} 個資源符合 {month}：{[r.get('name') for r in hits]}")
    return hits[0] if hits else None


def _get(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


def fetch(month: str, dest: Path, today: dt.date | None = None, get=_get) -> list[dict]:
    """下載當月快照到 ``dest``（``data/raw/events/YYYYMM/``），寫 ``sources.json`` 並回傳其內容。"""
    today = today or dt.date.today()
    dest.mkdir(parents=True, exist_ok=True)
    manifest = []
    for ds in DATASETS:
        meta = json.loads(get(API_VIEW.format(pid=ds.pid)).decode("utf-8"))
        resources = meta["payload"]["resources"]
        res = pick_resource(ds, resources, month)
        entry = {"key": ds.key, "venue": ds.venue, "name": ds.name, "publisher": ds.publisher,
                 "url": DATASET_PAGE.format(pid=ds.pid), "license": LICENSE}
        if res is None:
            latest = resources[0].get("name", "") if resources else "（無資源）"
            entry.update(status="missing", note=f"{month} 的資源尚未發布；最新資源為「{latest}」")
        else:
            body = get(DOWNLOAD.format(pid=ds.pid, rid=res["rid"]))
            file = f"{ds.key}.csv"
            (dest / file).write_bytes(body)
            entry.update(status="ok", file=file, resource=res.get("name", ""),
                         dataset=DOWNLOAD.format(pid=ds.pid, rid=res["rid"]),
                         retrieved=today.isoformat(), sha256=hashlib.sha256(body).hexdigest())
        manifest.append(entry)
    (dest / MANIFEST).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


# ── 解碼與解析 ────────────────────────────────────────────


def decode(raw: bytes) -> str:
    """UTF-8（可帶 BOM）優先，否則 BIG-5（cp950 是 Windows 的 BIG-5，多收了常見的擴充字）。"""
    for enc in ("utf-8-sig", "cp950", "big5hkscs"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ScheduleError("檔案既不是 UTF-8 也不是 BIG-5")


def _rows(text: str, required: list[str], where: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text))
    fields = [f.strip() for f in (reader.fieldnames or [])]
    missing = [c for c in required if c not in fields]
    if missing:
        raise ScheduleError(f"{where} 缺欄位 {missing}（實際：{fields}）")
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def _date(text: str, where: str) -> dt.date:
    t = text.strip()
    m = re.fullmatch(r"(\d{4})(\d{2})(\d{2})", t) or re.fullmatch(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:\s.*)?", t)
    if not m:
        raise ScheduleError(f"{where} 的日期看不懂：{text!r}")
    return dt.date(int(m[1]), int(m[2]), int(m[3]))


def _month_bounds(month: str) -> tuple[dt.date, dt.date]:
    year, mon = (int(x) for x in month.split("-"))
    first = dt.date(year, mon, 1)
    nxt = dt.date(year + mon // 12, mon % 12 + 1, 1)
    return first, nxt - dt.timedelta(1)


def parse_rentals(text: str, ds: Dataset, month: str) -> list[Schedule]:
    """小巨蛋：``廠商,租用起始日,租用結束日,活動名稱,活動類型``；花博：``租[借]用開始時間`` 等。只留與當月重疊的列。"""
    first, last = _month_bounds(month)
    if ds.key == "taipei-arena":
        cols = ("租用起始日", "租用結束日", "活動名稱")
    else:
        cols = ("租[借]用開始時間", "租[借]用結束時間", "活動名稱")
    out = []
    for row in _rows(text, list(cols), ds.name):
        if not row[cols[2]]:
            continue
        start, end = _date(row[cols[0]], ds.name), _date(row[cols[1]], ds.name)
        if end < start:
            raise ScheduleError(f"{ds.name}「{row[cols[2]]}」結束日早於起始日")
        if start <= last and end >= first:
            out.append(Schedule(ds.venue, start, end, row[cols[2]], DATASET_PAGE.format(pid=ds.pid)))
    return out


def parse_performances(text: str, ds: Dataset, month: str) -> list[Schedule]:
    """中山堂：一列一場；同名節目在當月合成一筆，候選日＝實際演出日。"""
    first, last = _month_bounds(month)
    shows: dict[str, set[dt.date]] = defaultdict(set)
    for row in _rows(text, ["演出日期", "節目名稱"], ds.name):
        if not row["節目名稱"] or not row["演出日期"]:
            continue
        # 偶有一列寫成區間，例如「20270106至20270109」（展覽或連演），展開成每一天
        parts = re.split(r"\s*(?:至|～|~)\s*", row["演出日期"])
        if len(parts) > 2:
            raise ScheduleError(f"{ds.name} 的日期看不懂：{row['演出日期']!r}")
        start, end = _date(parts[0], ds.name), _date(parts[-1], ds.name)
        if end < start:
            raise ScheduleError(f"{ds.name}「{row['節目名稱']}」結束日早於起始日")
        for k in range((end - start).days + 1):
            d = start + dt.timedelta(k)
            if first <= d <= last:
                shows[row["節目名稱"]].add(d)
    return [Schedule(ds.venue, min(days), max(days), name, DATASET_PAGE.format(pid=ds.pid), frozenset(days))
            for name, days in shows.items()]


def parse(raw: bytes, ds: Dataset, month: str) -> list[Schedule]:
    text = decode(raw)
    return parse_performances(text, ds, month) if ds.resource == "single" else parse_rentals(text, ds, month)


@dataclass(frozen=True)
class Snapshot:
    schedules: list[Schedule]
    sources: list[dict]  # meta.json 的 sources[]（只列真的用到的快照）
    missing: list[dict]  # 尚未發布的資料集


def load(month: str, src: Path) -> Snapshot:
    """讀 ``fetch()`` 留下的快照；沒有快照、或檔案 sha256 與 ``sources.json`` 不符都報錯。"""
    manifest_path = src / MANIFEST
    if not manifest_path.exists():
        raise ScheduleError(f"找不到 {manifest_path}：先跑 `uv run city-breath fetch-events --month {month}`")
    manifest = json.loads(manifest_path.read_text("utf-8"))
    by_key = {ds.key: ds for ds in DATASETS}
    schedules, sources, missing = [], [], []
    for entry in manifest:
        ds = by_key[entry["key"]]
        if entry["status"] != "ok":
            missing.append(entry)
            continue
        raw = (src / entry["file"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
            raise ScheduleError(f"{src / entry['file']} 與 {MANIFEST} 的 sha256 不同，請重跑 fetch-events")
        schedules += parse(raw, ds, month)
        sources.append({k: entry[k] for k in ("name", "publisher", "url", "dataset", "license", "retrieved", "sha256")})
    return Snapshot(schedules, sources, missing)


# ── 配對 ─────────────────────────────────────────────────


@dataclass(frozen=True)
class Linked:
    events: list[dict]  # events.json 的 events[]（只放配到異常的檔期）
    event_ids: dict[tuple[dt.date, int], list[str]]  # (日期, 站索引) → events[].id
    unmatched: list[Schedule]


def link(schedules: list[Schedule], anomalies: list[Anomaly], venue_stations: dict[int, list[str]],
         source: str = "auto", verified: bool = False) -> Linked:
    """站級異常落在某檔期的候選日、且站是該場館的車站，就連起來。

    ``venue_stations`` 是 ``venues.resolve_venues()`` 的結果（站索引 → venue_id）。
    """
    stations_of: dict[str, list[int]] = defaultdict(list)
    for idx, vids in venue_stations.items():
        for v in vids:
            stations_of[v].append(idx)
    station_hits = [a for a in anomalies if a.station is not None]
    ordered = sorted(schedules, key=lambda s: (s.venue, s.start, s.end, s.name))
    events, event_ids, unmatched, used = [], defaultdict(list), [], defaultdict(int)
    for s in ordered:
        stations = sorted(stations_of.get(s.venue, []))
        days = s.candidate_days()
        hits = [a for a in station_hits if a.station in stations and a.date in days]
        if not hits:
            unmatched.append(s)
            continue
        base = f"{source}-{s.venue}-{s.start:%Y%m%d}"
        used[base] += 1
        eid = base if used[base] == 1 else f"{base}-{used[base]}"
        events.append({"id": eid, "startDate": s.start.isoformat(), "endDate": s.end.isoformat(), "venue": s.venue,
                       "stations": stations, "name": s.name, "source": source, "url": s.url, "verified": verified})
        for a in hits:
            event_ids[(a.date, a.station)].append(eid)
    return Linked(events, {k: sorted(v) for k, v in event_ids.items()}, unmatched)
