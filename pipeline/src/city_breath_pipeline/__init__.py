"""城市呼吸：北捷 OD 月檔本機彙總流程。

所有重運算都在這裡做完，網站只讀這裡輸出的小檔（見 docs/data-contract.md）。
"""

CONTRACT_VERSION = 2
SUPPRESS_BELOW = 10  # 起訖人次低於此值一律不輸出數字（PRD：少於 10 人）
TOP_ARCS_PER_HOUR = 200
HOURS = list(range(24))
DAY_TYPES = ("weekday", "holiday")
