// 輸出 4.3 分享卡樣張：先在 web/ 跑 `npm run dev`，再跑 `node scripts/share-samples.mjs [網址]`。
// 需要環境裡已有 playwright 與 Chromium（不列在 package.json，避免 CI 與一般安裝多下載瀏覽器）。
// 用 Playwright 開 share-preview.html，取回 render.ts 實際產生的 PNG（不是截圖），寫進 design/reviews/4.3-share-card/。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:5173";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../design/reviews/4.3-share-card");

const browser = await chromium.launch({ args: ["--proxy-bypass-list=<-loopback>"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", (e) => console.error(e));
await page.goto(`${base}/share-preview.html`);
const cards = await page.evaluate(() => window.__shareCards);
await mkdir(out, { recursive: true });
for (const c of cards) {
  const file = resolve(out, `${c.name}.png`);
  await writeFile(file, Buffer.from(c.dataUrl.split(",")[1], "base64"));
  console.log(file);
}
await page.screenshot({ path: resolve(out, "0-overview.png"), fullPage: true });
await browser.close();
