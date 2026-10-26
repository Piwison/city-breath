"""車站個性：24 小時進出曲線分群。

PRD：類型名稱由資料分群結果後決定，不預設。所以這裡只輸出
「草稿標籤」（draft=True），供人看過後在 config/station_types.csv 定名。
"""

from __future__ import annotations

import csv
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


@dataclass
class ClusterResult:
    k: int
    silhouette: dict[int, float]
    assignment: dict[str, int]  # station name -> cluster
    types: list[dict]  # per cluster: id, label, description, draft, size, features


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


def _draft_label(f: dict) -> tuple[str, str]:
    if f["holidayRatio"] >= 1.0:
        return "假日站", "假日比平日更熱鬧，觀光與休閒的去處"
    if f["amNet"] <= -0.04:
        return "臥室站", "早上吐人、晚上吸人：住在這裡的人出門上班"
    if f["amNet"] >= 0.04 and f["holidayRatio"] >= 0.8:
        return "商圈站", "平日有人來上班，假日照樣人潮不減"
    if f["amNet"] >= 0.04:
        return "辦公站", "早上吸人、傍晚吐人：大家來這裡上班上學"
    if f["lateShare"] >= 0.12:
        return "夜生活站", "越晚越熱鬧，下班後的人往這裡去"
    return "混合站", "上班、居住、逛街都有，一整天進出平均"


def load_type_names(path: Path = CONFIG / "station_types.csv") -> dict[int, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return {int(r["cluster"]): r for r in csv.DictReader(f)}


def cluster_stations(
    profiles: dict[str, dict],
    exits_recorded: set[str],
    service_hours: list[int],
    k_range: range = range(4, 9),
    seed: int = 20261026,
) -> ClusterResult:
    names = sorted(n for n in profiles if n in exits_recorded)
    X = np.vstack([_features(profiles[n], service_hours) for n in names])

    scores: dict[int, float] = {}
    models: dict[int, KMeans] = {}
    for k in k_range:
        if k >= len(names):
            break
        m = KMeans(n_clusters=k, n_init=20, random_state=seed).fit(X)
        scores[k] = round(float(silhouette_score(X, m.labels_)), 4)
        models[k] = m
    best_k = max(scores, key=scores.get)
    labels = models[best_k].labels_

    # 依群大小排序，讓 cluster id 在重跑時較穩定
    order = sorted(range(best_k), key=lambda c: (-int((labels == c).sum()), c))
    remap = {old: new for new, old in enumerate(order)}
    assignment = {n: remap[int(c)] for n, c in zip(names, labels)}

    named = load_type_names()
    nh = len(service_hours)
    types = []
    used: dict[str, int] = {}
    for new in range(best_k):
        members = [n for n, c in assignment.items() if c == new]
        rows = np.vstack([_features(profiles[n], service_hours) for n in members]).mean(axis=0)
        feat = _describe(
            {"entries": rows[:nh], "exits": rows[nh : 2 * nh], "holidayRatio": rows[-1] / HOLIDAY_WEIGHT},
            service_hours,
        )
        if new in named:
            label, desc, draft = named[new]["label"], named[new]["description"], False
        else:
            label, desc = _draft_label(feat)
            used[label] = used.get(label, 0) + 1
            if used[label] > 1:
                label = f"{label} {used[label]}"
            draft = True
        types.append(
            {
                "id": new,
                "label": label,
                "description": desc,
                "draft": draft,
                "size": len(members),
                "features": feat,
                "examples": sorted(members, key=lambda n: -sum(v or 0 for v in profiles[n]["weekday"]["entries"]))[:5],
            }
        )
    return ClusterResult(k=best_k, silhouette=scores, assignment=assignment, types=types)
