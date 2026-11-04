# 2.1 微縮城市方向原型

三個方向（晨昏、夜光、紙藝）共用同一套遊戲機關，只差材質、光影與流向表現。規則見 `.claude/skills/diorama-game-juice/SKILL.md`，指令見 `design/briefs/2.1-prototype-prompt.md`。

在 repo 根目錄起本機伺服器後開：

```bash
python3 -m http.server 8765
# http://localhost:8765/design/prototypes/2.1-diorama/index.html?v=1
```

數字鍵 1–3 或左右方向鍵切換方向，R 重播進場。資料直接讀 `web/public/data/2026-09/`。Piwi 選定後依 prototype skill 的規則，把選中的方向移進 `web/src/scene/`（2.2、2.3），這個資料夾刪除。
