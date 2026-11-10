"""車站類型：固定的四個類型，每個月把各站歸到最近的類型（1.6，architecture AD-27）。

類型由 `city-breath fit-types` 用多個月份的 24 小時進出曲線一起 k-means 擬合一次，中心存在
config/station_type_centroids.json；名稱與一句話由 Piwi 定在 config/station_types.csv（依類型 id）。
平常的 build 不重算中心，只把當月每站歸到最近的中心，所以類型 id 與名稱在各月之間一致。
"""

from __future__ import annotations

import collections
import csv
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from .stations import CONFIG

AM = [7, 8, 9]
PM = [17, 18, 19]
LATE = [21, 22, 23, 0]
HOLIDAY_WEIGHT = 0.1
# 特徵定義：平日 6–23 點與 0 點的進、出站占比（各 19 格），加上假日／平日總量比 × HOLIDAY_WEIGHT。
# 改任何一項都要把 FEATURE_VERSION 加一並重跑 fit-types（build 會檢查中心檔的版本與小時）。
FEATURE_HOURS = list(range(6, 24)) + [0]
FEATURE_VERSION = 1
FIT_K = 4
FIT_N_INIT = 20
FIT_SEED = 20261026

CENTROIDS = CONFIG / "station_type_centroids.json"
TYPE_NAMES = CONFIG / "station_types.csv"


class StationTypeError(Exception):
    """中心檔或名稱表有問題；build 會停下來。"""


@dataclass
class ClusterResult:
    k: int
    silhouette: dict[int, float]  # {k: 當月各站對固定類型的輪廓係數}
    assignment: dict[str, int]  # station name -> type id
    types: list[dict]  # per type: id, label, description, draft, size, features, examples


def _features(profile: dict, service_hours: list[int]) -> np.ndarray:
    ent = np.array([profile["weekday"]["entries"][h] or 0 for h in service_hours], float)
    ext = np.array([profile["weekday"]["exits"][h] or 0 for h in service_hours], float)
    total = ent.sum() + ext.sum()
    shares = np.concatenate([ent, ext]) / total if total else np.zeros(2 * len(service_hours))
    hol = sum(v or 0 for v in profile["holiday"]["entries"]) + sum(v or 0 for v in profile["holiday"]["exits"])
    ratio = hol / total if total else 0.0
    return np.append(shares, HOLIDAY_WEIGHT * ratio)


def _describe(profile_mean: dict, service_hours: list[int]) -> dict:
    idx = {h: i for i, h in enumerate(service_hours)}
    n = len(service_hours)
    ent, ext = profile_mean["entries"], profile_mean["exits"]

    def share(hours, arr):
        return float(sum(arr[idx[h]] for h in hours if h in idx))

    am_net = share(AM, ext) - share(AM, ent)  # >0 早上吸人
    pm_net = share(PM, ext) - share(PM, ent)
    late = share(LATE, ent) + share(LATE, ext)
    return {
        "amNet": round(am_net, 4),
        "pmNet": round(pm_net, 4),
        "lateShare": round(late, 4),
        "holidayRatio": round(float(profile_mean["holidayRatio"]), 3),
        "n": n,
    }


def _describe_vector(vec: np.ndarray) -> dict:
    nh = len(FEATURE_HOURS)
    return _describe(
        {"entries": vec[:nh], "exits": vec[nh : 2 * nh], "holidayRatio": vec[-1] / HOLIDAY_WEIGHT}, FEATURE_HOURS
    )


def has_weekday_traffic(profile: dict) -> bool:
    """當月平日在特徵小時內有進出；沒有的站特徵全是 0，不歸類（type 為 null）。"""
    return any((profile["weekday"][k][h] or 0) > 0 for k in ("entries", "exits") for h in FEATURE_HOURS)


# ── 擬合（fit-types）────────────────────────────────────────────────


def fit_types(
    samples: list[tuple[str, str, dict]],
    k: int = FIT_K,
    n_init: int = FIT_N_INIT,
    seed: int = FIT_SEED,
) -> dict:
    """``samples``：(月份, 正規站名, profile)，只放出站有紀錄的站。回傳要寫進中心檔的內容。

    各月各站的特徵放在一起 k-means；類型 id 依中心的早上淨流向（amNet）由小到大排，
    讓「早上出門的站」永遠是 0、「早上湧入的站」永遠是 k-1。
    """
    rows = [(m, n, p) for m, n, p in samples if has_weekday_traffic(p)]
    X = np.vstack([_features(p, FEATURE_HOURS) for _, _, p in rows])
    km = KMeans(n_clusters=k, n_init=n_init, random_state=seed).fit(X)
    order = sorted(range(k), key=lambda c: (_describe_vector(km.cluster_centers_[c])["amNet"], c))
    remap = {old: new for new, old in enumerate(order)}
    labels = np.array([remap[int(c)] for c in km.labels_])
    by_station: dict[str, list[int]] = collections.defaultdict(list)
    for (_, n, _), lab in zip(rows, labels):
        by_station[n].append(int(lab))
    modal = {n: collections.Counter(v).most_common(1)[0][0] for n, v in by_station.items()}
    return {
        "featureVersion": FEATURE_VERSION,
        "hours": FEATURE_HOURS,
        "holidayWeight": HOLIDAY_WEIGHT,
        "months": sorted({m for m, _, _ in rows}),
        "method": {"algorithm": "kmeans", "k": k, "nInit": n_init, "randomState": seed},
        "samples": len(rows),
        "stations": len(by_station),
        "silhouette": round(float(silhouette_score(X, labels)), 4),
        "stableStations": sum(len(set(v)) == 1 for v in by_station.values()),
        "command": "uv run city-breath fit-types --months " + ",".join(sorted({m for m, _, _ in rows})),
        # 新擬合的中心還沒有人對照過名稱表：build 輸出 draft=true，直到 Piwi 確認後改成 true
        "namesConfirmed": False,
        "types": [
            {
                "id": new,
                "centroid": [float(x) for x in km.cluster_centers_[old]],
                "features": _describe_vector(km.cluster_centers_[old]),
                "stations": sum(1 for c in modal.values() if c == new),  # 整年最常歸到這型的站數
            }
            for new, old in enumerate(order)
        ],
    }


def write_centroids(body: dict, path: Path = CENTROIDS) -> None:
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ── 每月歸類（build）────────────────────────────────────────────────


def load_centroids(path: Path = CENTROIDS) -> dict:
    if not path.exists():
        raise StationTypeError(f"找不到 {path}；先跑 `uv run city-breath fit-types --months …` 產生固定類型的中心")
    body = json.loads(path.read_text("utf-8"))
    if (
        body.get("featureVersion") != FEATURE_VERSION
        or body.get("hours") != FEATURE_HOURS
        or body.get("holidayWeight") != HOLIDAY_WEIGHT
    ):
        raise StationTypeError(
            f"{path.name} 的特徵定義（版本 {body.get('featureVersion')}）與程式（版本 {FEATURE_VERSION}）不同；"
            "重跑 `city-breath fit-types` 並請 Piwi 對照 station_types.csv"
        )
    width = 2 * len(FEATURE_HOURS) + 1
    if [t["id"] for t in body["types"]] != list(range(len(body["types"]))) or any(
        len(t["centroid"]) != width for t in body["types"]
    ):
        raise StationTypeError(f"{path.name} 的類型 id 要從 0 連號、每個中心 {width} 維")
    return body


def load_type_names(path: Path = TYPE_NAMES) -> dict[int, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return {int(r["id"]): r for r in csv.DictReader(f)}


def assign_types(
    profiles: dict[str, dict],
    exits_recorded: set[str],
    centroids: dict | None = None,
    names: dict[int, dict] | None = None,
) -> ClusterResult:
    """把當月每個出站有紀錄、平日有進出的站歸到最近的固定中心（歐氏距離）。"""
    centroids = centroids if centroids is not None else load_centroids()
    names = names if names is not None else load_type_names()
    ids = [t["id"] for t in centroids["types"]]
    if sorted(names) != ids or any(not names[i].get("label") or not names[i].get("description") for i in ids):
        raise StationTypeError(f"station_types.csv 要剛好為類型 {ids} 各定一列名稱與一句話（目前 {sorted(names)}）")
    C = np.array([t["centroid"] for t in centroids["types"]], float)

    members = sorted(n for n in profiles if n in exits_recorded and has_weekday_traffic(profiles[n]))
    X = np.vstack([_features(profiles[n], FEATURE_HOURS) for n in members]) if members else np.zeros((0, C.shape[1]))
    dist = ((X[:, None, :] - C[None, :, :]) ** 2).sum(axis=2)
    labels = dist.argmin(axis=1) if members else np.array([], int)
    assignment = {n: int(c) for n, c in zip(members, labels)}

    k = len(ids)
    silhouette = {}
    if len(set(labels.tolist())) > 1 and len(members) > len(set(labels.tolist())):
        silhouette[k] = round(float(silhouette_score(X, labels)), 4)

    def volume(n: str) -> int:
        return sum(v or 0 for v in profiles[n]["weekday"]["entries"])

    types = []
    for t in centroids["types"]:
        group = [n for n in members if assignment[n] == t["id"]]
        types.append(
            {
                "id": t["id"],
                "label": names[t["id"]]["label"],
                "description": names[t["id"]]["description"],
                "draft": not centroids.get("namesConfirmed", False),
                "size": len(group),
                "features": t["features"],
                "examples": sorted(group, key=lambda n: (-volume(n), n))[:5],
            }
        )
    return ClusterResult(k=k, silhouette=silhouette, assignment=assignment, types=types)
