---
type: migration
title: BMAD v6.12.4 → v7 預覽版（6.13.0-next）遷移紀錄
status: done
created: 2026-10-29
---

# BMAD v6 → v7 遷移紀錄

## 範圍與決定

| 問題 | 回答 | 理由 |
| --- | --- | --- |
| 規劃內容在 `_bmad-output/planning-artifacts/`（PRD、架構、epics.md），實作內容資料夾不存在；其他位置還有嗎？ | 是，沒有其他位置 | Inventory 只找到 5 個檔案 |
| 規劃檔要不要獨立 repo 或 workspace？ | 不要 | 單一 repo 的個人專案 |
| 尚未開始的 story 要不要折進 entry？ | 是（v6 沒有 story 檔可折） | 預設值 |
| 核准 | Piwi 2026-10-29「請升級」，採預設值執行 | 在 `bmad-v7` 分支進行，`v6-baseline` tag 可退回 |

- 備份：`.v6-v7-migration-backup-20261029-1616/`（含 `_bmad/` 與 `_bmad-output/`，已 gitignore，不進版控）

## 檔案去向

| v6 | v7 |
| --- | --- |
| `planning-artifacts/` | `initiative-city-breath/` |
| `prds/prd-city-breath-2026-10-26/prd.md` | `initiative-city-breath/prd-city-breath-2026-10-26/prd-city-breath-2026-10-26.md`（補 `type: prd`） |
| `architecture/architecture-city-breath-2026-10-26/ARCHITECTURE-SPINE.md` | `initiative-city-breath/architecture-city-breath-2026-10-26/architecture-city-breath-2026-10-26.md` |
| 兩個 `.memlog.md` | 隨資料夾移動 |
| `epics.md` | `initiative-city-breath/archive-v6/epics.md`（原樣） |
| （新） | `initiative-city-breath/initiative-city-breath.md`、`tickets/`、`backlog/`、`archive/` |

## Ticket tree

v6 的 epics.md 是自訂表格（Epic 0–5，非 `## Epic N:` 格式），PRD 用 US-1…US-9 而非 FR 編號，所以：

- Initiative Requirements：R1–R9 對應 US-1–US-9，R10–R12 來自 PRD 的 MVP 範圍；R5–R9（P1、P2）記為 Parked。
- Epic 編號由 0–5 改為 1–6（v7 id 從 1 起），各 epic 檔與 tickets.toml 註記 v6 編號；story 保留 `v6_key`。

| v7 epic | v6 | stories | 狀態 |
| --- | --- | --- | --- |
| 1 epic-data-pipeline | Epic 0 | 7 | in-progress（1.1–1.5 done） |
| 2 epic-visual-system | Epic 1 | 3 | 未開始 |
| 3 epic-city-breath-home | Epic 2 | 4 | 未開始（骨架已存在） |
| 4 epic-commute-card | Epic 3 | 4 | 未開始（3.2 邏輯與測試已存在） |
| 5 epic-station-personality | Epic 4 | 3 | 未開始（骨架已存在） |
| 6 epic-source-and-launch | Epic 5 | 2 | 未開始 |

v6 標 🟡「骨架完成，待設計」的 story 不標 in-progress，避免看板誤報；骨架說明寫在 entry 的 description。

完成的 5 張 story 沒有 v6 build record，各寫一份最小 plan（`type: feature`、`status: done`），未設 `baseline_revision`。

## 留在原地

- `CLAUDE.md`（專案根目錄，store 之外）：引用了舊路徑，已一併改成新路徑。

## 設定

- `_bmad/custom/config.user.toml`：`[core] active_initiative = "initiative-city-breath"`（個人設定，gitignored）。
- v7 不讀 `communication_language`／`user_name`；繁體中文溝通改由 CLAUDE.md 規定。

## Checklist

1. ✅ 5 個 v6 檔案都在 initiative 內（含 archive-v6）。
2. ✅ 文件資料夾保留 v6 名稱，主檔與資料夾同名；`initiative-city-breath/`、`backlog/`、`archive/` 存在，空資料夾有 `.gitkeep`。
3. ✅ 沒有同一文件的多個版本。
4. ✅ `tickets.py status` exit 0；23 張 story，與 archive-v6/epics.md 的 23 列相符（5 done、18 planned）。
5. ✅ 每張 story 一個 entry，未寫任何 epic story 檔；`find` 可找到 5 份 plan。
6. ✅ 每份 plan 有 build type 與 status；done 維持 done；baseline 缺漏已揭露（5 份皆無）。
7. ✅ 每個 epic 的 `covers` 都在 initiative Requirements；每個 entry 的 `covers` 都在其 epic Requirements；MVP 需求 R1–R4、R10–R12 皆有 entry，R5–R9 為 Parked。
8. ✅ 沒有 pre-release spec 資料夾。
9. ✅ `sources:`／`companions:`／References 路徑皆可解析。
10. ✅ active initiative 已設定，`output_folder` 指向 `_bmad-output`。
11. ✅ store 在專案 repo 內，沒有重複追蹤。
12. ✅ 備份含遷移前所有檔案，未進任何 commit。
13. ✅ 本紀錄含所有問題、回答、備份路徑與檢查結果。

## 之後

- Sofia（`bmad-agent-po`）取代 `bmad-sprint-planning`、`bmad-create-epics-and-stories`、`bmad-ticket`、`bmad-spec`、`bmad-correct-course`。
- migration-2（7 preview → 7）不適用：本 tree 已是 `tickets/` 子資料夾格式。
- 備份資料夾可在確認無誤後刪除（git 的 `v6-baseline` tag 已保存舊狀態）。
