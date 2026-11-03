---
review-of: architecture-city-breath-2026-10-26.md（updated 2026-11-03）
lens: 版本與技術是否經過實查（web / npm / PyPI / 既有專案），而非憑訓練資料斷言
reviewed: 2026-11-03
verdict: 通過，附小修正 — Stack 表每個版本都真實存在、彼此相容，且與既有專案一致；缺口在 @types/three 未列、渲染器／後製未寫進 spine
---

# Review — 版本與技術實查

## 結論

Stack 表裡的 10 個版本全部在 npm／PyPI 查得到，web 與 pipeline 的既有版本跟 spine 一致（package.json、node_modules、uv.lock 都對得上），新增的 three／R3F／drei 三者 peer 相容且接受 React 19.3.1。memlog 也記了 2026-10-26 與 2026-11-03 兩次查證，這個 lens 大致通過。

要補的有兩件事：**`@types/three` 沒列入 Stack**，**渲染器與 bloom 做法只寫在 memlog、沒寫進 spine**（而 three/addons 的 EffectComposer 只支援 WebGLRenderer）。另有幾項 low：行政區代碼的欄位要寫清楚、有幾個套件已有較新版、R3F 對 React 有上限。

## 查證紀錄

查證方式：`npm view <pkg> version time peerDependencies engines --json`（2026-11-03）、`npm pack three@0.186.1` 解開檢查檔案、PyPI JSON API、讀 `web/package.json`、`web/node_modules/*/package.json`、`pipeline/pyproject.toml`、`pipeline/uv.lock`、`.github/workflows/ci.yml`。

| Spine 版本 | 是否存在（發布日） | 目前 latest | 既有專案 | 判定 |
| --- | --- | --- | --- | --- |
| three 0.186.1 | ✔ 2026-09-24 | 0.187.0（2026-10-30） | 尚未安裝（3.5 才加） | OK；刻意不用 0.187 的理由只寫在 memlog |
| @react-three/fiber 9.8.2 | ✔ 2026-10-14 | 9.8.2 | 尚未安裝 | OK |
| @react-three/drei 10.7.9 | ✔ 2026-09-25 | 10.7.9 | 尚未安裝 | OK |
| React 19.3.1 | ✔ 2026-10-14 | 19.3.1 | package.json `^19.3.1`，已裝 19.3.1 | OK |
| Vite 8.3.5 | ✔ 2026-10-21 | 8.3.5 | `^8.3.5`，已裝 8.3.5 | OK |
| TypeScript 7.0.2 | ✔ 2026-07-08 | 7.0.2 | `^7.0.2`，已裝 7.0.2（`tsc` bin 存在） | OK |
| Vitest 5.0.5 | ✔ 2026-10-15 | 5.1.0（2026-11-02） | `^5.0.5`，已裝 5.0.5 | OK，有新 minor |
| DuckDB 2.0.0 | ✔ 2026-10-21 | 2.0.0 | pyproject `>=2.0,<3`，uv.lock 2.0.0 | OK |
| scikit-learn 1.9.1 | ✔ 2026-09-10 | 1.9.1 | pyproject `>=1.9`，uv.lock 1.9.1 | OK |
| Python ≥ 3.12 | — | — | pyproject `>=3.12`；duckdb/sklearn 需 ≥3.11 | OK |

### Peer 相容

- `@react-three/fiber@9.8.2` peer：`react >=19 <19.4`、`react-dom >=19 <19.4`、`three >=0.156` → React 19.3.1 ✔、three 0.186.1 ✔。
- `@react-three/drei@10.7.9` peer：`react ^19`、`three >=0.159`、`@react-three/fiber ^9.0.0` → ✔。
- drei 的相依（three-stdlib 2.36.1 `>=0.128`、three-mesh-bvh 0.9.18 `>=0.159`、camera-controls 3.1.2、troika-three-text 0.53.1、@monogrid/gainmap-js 3.7.2 `>=0.159`）對 three 0.186 都沒有上限 ✔。
- fiber 相依 `scheduler ^0.28.0`，與 react-dom 19.3.1 的 `scheduler ^0.28.0` 一致 ✔。
- `vitest@5.0.5` peer `vite ^6.4 || ^7 || ^8` ✔；`@vitejs/plugin-react@6.1.2`（已裝）peer `vite ^8` ✔。
- Engines：vite 8.3.5 需 Node `^20.19 || >=22.12`、vitest 5.0.5 需 `^22.12 || ^24 || >=26`；CI 用 `node-version: 22`（解析為最新 22.x）✔。

### three/addons 後製（r186）

解開 `three-0.186.1.tgz`（`REVISION = '186'`）：

- `examples/jsm/postprocessing/EffectComposer.js`、`RenderPass.js`、`UnrealBloomPass.js`、`OutputPass.js` 都在 ✔；兩檔都沒有 deprecation 警告。
- `package.json` exports 有 `"./addons/*": "./examples/jsm/*"`，所以 `three/addons/postprocessing/EffectComposer.js` 可用 ✔。
- **EffectComposer 檔頭註明：「This module can only be used with {@link WebGLRenderer}.」** WebGPU 路線要改用 `three/webgpu` ＋ TSL 的 `examples/jsm/tsl/display/BloomNode.js`（也在套件內）。

### 內政部鄉鎮市區代碼

- 格式查證：8 碼，縣市碼＋區碼。臺北市松山區 `63000010`、北投區 `63000120`，新北市板橋區 `65000010`（來源：Wikipedia「List of townships/cities and districts in Taiwan」鏡像，Code 欄）。spine 用「內政部鄉鎮市區代碼」當行政區 ID 方向正確。
- 國土測繪中心「鄉鎮市區界線」資料集存在（data.gov.tw 32157，政府資料開放授權條款第 1 版）；data.gov.tw 本站擋爬蟲，欄位名稱（TOWNCODE / TOWNID）無法從這裡直接確認，以下 F4 的欄位說法以一般認知為準，1.8 開工時要對實際 shapefile 欄位。

### 場館檔期來源

`user-stories-city-breath-2026-11-03.md` 第 140 行已實際查過臺北小巨蛋場地租用資訊（2015-06 起逐月、2026-09 有 IVE、蕭煌奇等檔期），tickets.toml 也有 2026-09-13 小巨蛋站人流核對紀錄。AD-13 的來源有實查依據 ✔。花博、中山堂這次未另行查證（搜尋未命中具體資料集頁），屬 epic 層級的 touch point，不影響 spine。

## Findings

### F1 — [medium] 渲染器與 bloom 做法沒寫進 spine，而 EffectComposer 只支援 WebGL
- **位置：** AD-11；memlog 第 28 行（assumption）。
- **問題：** memlog 記「Bloom 用 three/addons 的 EffectComposer（原型做法）」，spine 沒有。AD-11 也沒指定 `WebGLRenderer`。r186 的 EffectComposer 明寫只能配 WebGLRenderer；R3F 9 可以換 `WebGPURenderer`（`gl` 給 async factory），three 新的後製也往 TSL／`BloomNode` 走。兩張票分別選了 WebGPU 與 EffectComposer，就會接不起來。「發光路線」是已定案的視覺方向，bloom 一定會用到。
- **建議：** AD-11 加一句：「渲染器用 `WebGLRenderer`（R3F 預設）；後製用 `three/addons` 的 EffectComposer＋RenderPass＋UnrealBloomPass＋OutputPass，由單一 `useFrame(..., 1)` 接手渲染」。如果想要宣告式寫法，另一個選擇是 `@react-three/postprocessing@3.2.2`（peer `postprocessing ^6.36`、`@react-three/fiber >=9.7`；`postprocessing@6.39.6` peer `three >=0.168 <0.188`，與 0.186.1 相容），但它會多一個 three 上限要追。兩者選一寫進 spine，並把它放進 Stack。

### F2 — [medium] `@types/three` 沒列入 Stack
- **位置：** Stack 表。
- **問題：** `three` 套件本身不帶型別（`exports` 裡沒有 `types`）；fiber 只相依 `@types/webxr`。`npm run build` 先跑 `tsc --noEmit`（strict），`import * as THREE from 'three'` 少了型別會出 TS7016，drei 的型別也是從 `three` import。
- **建議：** Stack 加 `@types/three 0.186.0`（devDependency）。npm 上沒有 0.186.1，0.186.0（2026-09-11）是對應 r186 的最後一版；`0.187.0` 對應 three 0.187，不要混用。之後升 three 要和 @types/three 一起升。

### F3 — [low] R3F 對 React 有硬上限 `<19.4`，package.json 用 caret
- **位置：** Stack（React 19.3.1）；`web/package.json` `"react": "^19.3.1"`。
- **問題：** fiber 9.8.2 peer `react >=19 <19.4`。現在有 lockfile、npm 會挑 19.3.x，沒事；但 React 19.4 出來後，有人跑 `npm update` 或刪 lockfile 重裝，就可能遇到 ERESOLVE 或 peer 警告。
- **建議：** spine 的 React 那列註明「受 R3F peer `<19.4` 限制，升 React minor 前先確認 fiber 已放寬」；或把 react／react-dom 改成 `~19.3.1`。

### F4 — [low] 行政區代碼要指定欄位與型別，最好兩市用同一份圖資
- **位置：** AD-9、Consistency Conventions「行政區的參照」。
- **問題：** 代碼格式本身沒問題（8 碼，63000xxx／65000xxx 已查證）。但 AD-9 用兩份來源：「臺北市區界」（市府）和「內政部新北市區界」。國土測繪中心的鄉鎮市區界同時有 8 碼代碼和英數字代碼（常見為 TOWNCODE／TOWNID 兩欄），市府的區界檔不一定帶內政部代碼。不寫清楚，1.8 可能用錯欄或要自己對照。
- **建議：** AD-9 寫明「行政區 ID＝國土測繪中心鄉鎮市區界的 8 碼鄉鎮市區代碼（字串，例如 `"63000010"`）」，並考慮臺北、新北都用國土測繪中心同一份界線，臺北市府的圖資只當比對用。欄位名在 1.8 開工時對實際 shapefile 確認。這跟 Deferred 裡「新北行政區界的確切來源與版本」可以合併成同一個待決事項。

### F5 — [low] 已有較新版本，不採用的理由只寫在 memlog
- **位置：** Stack 表。
- **事實：** three 0.187.0（2026-10-30）、@types/three 0.187.0、vitest 5.1.0（2026-11-02）、@vitejs/plugin-react 6.2.1（2026-11-02，Stack 沒列、已裝 6.1.2）。
- **評估：** 刻意停在 three 0.186.1 是合理的（新版才發布 4 天，drei 10.7.9 也是在 r186 時期發布的），但這個理由只在 memlog 第 27 行。spine 的 Stack 表最好加一欄「查證日」或一句註記（「npm 2026-11-03 查證；three 0.187 剛發布，先不升」），讓之後的人知道這是刻意的選擇。Vitest、plugin-react 的新版不影響架構，不必追。

## 已確認、不需動作

- maplibre-gl 6.16.0 與 deck.gl 9.4.0 目前還在 `web/package.json`，跟 spine「3.5 才移除」一致。
- `tsconfig.json` 的 `types: ["vite/client"]` 只限制全域型別自動載入，不會擋 `import 'three'` 去找 `@types/three`（F2 補上後即可）。
- CI 的 Node 22 符合 vite 8／vitest 5 的 engines。
- 沒有依賴 starter 範本（不是 greenfield 起手），這部分不適用。

## 來源

- npm registry（`npm view`，2026-11-03）：three、@types/three、@react-three/fiber、@react-three/drei、@react-three/postprocessing、postprocessing、react、react-dom、vite、vitest、typescript、@vitejs/plugin-react、three-stdlib、three-mesh-bvh、camera-controls、troika-three-text、@monogrid/gainmap-js
- `three-0.186.1.tgz` 內容（`npm pack`）
- PyPI JSON API：duckdb、scikit-learn
- [List of townships/cities and districts in Taiwan（Wikipedia 鏡像）](https://bafybeiaysi4s6lnjev27ln5icwm6tueaw2vdykrtjkwiphwekaywqhcjze.ipfs.dweb.link/wiki/List_of_townships/cities_and_districts_in_Taiwan)
- [鄉鎮市區界線資料集（NCHC SciDM 鏡像）](https://scidm.nchc.org.tw/en/rating/dataset/best_wish32157/4)
- 專案內：`web/package.json`、`web/node_modules`、`web/tsconfig.json`、`pipeline/pyproject.toml`、`pipeline/uv.lock`、`.github/workflows/ci.yml`、`user-stories-city-breath-2026-11-03.md`、architecture `.memlog.md`
