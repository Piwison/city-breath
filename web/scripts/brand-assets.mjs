// 產生網站圖示與連結預覽圖（3.15，決定 20）：先在 web/ 跑 `npm run dev`，再跑 `node scripts/brand-assets.mjs [網址]`。
// 用 Playwright 開 brand-preview.html，取回 mark.ts 與 render.ts 實際畫出的檔案（不是截圖、不截場景），寫進 web/public/：
//   favicon.svg、apple-touch-icon.png（180×180）、og.png（1200×630）。
// 顏色都從 tokens.css 讀；換了 token 或版型就重跑一次並 commit 產出的檔。
// 需要環境裡已有 playwright 與 Chromium（不列在 package.json，同 share-samples.mjs）。
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:5173";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../public");
const data = (url) => Buffer.from(url.split(",")[1], "base64");

const browser = await chromium.launch({ args: ["--proxy-bypass-list=<-loopback>"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => console.error(e));
await page.goto(`${base}/brand-preview.html`);
const b = await page.evaluate(() => window.__brand);
await writeFile(resolve(out, "favicon.svg"), `${b.favicon}\n`);
await writeFile(resolve(out, "apple-touch-icon.png"), data(b.appleTouchIcon));
await writeFile(resolve(out, "og.png"), data(b.og));
for (const f of ["favicon.svg", "apple-touch-icon.png", "og.png"]) console.log(resolve(out, f));
await browser.close();
