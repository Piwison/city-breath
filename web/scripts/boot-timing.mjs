// 6.2 品牌載入畫面與平行載入的量測：先 `npm run build && npx vite preview --port 4173`，再跑
// `node scripts/boot-timing.mjs [網址]`。需要環境裡已有 playwright 與 Chromium（不列在 package.json）。
// 手機尺寸（390×844）、冷快取、用 Chrome 的網路節流模擬 4G（下載 9 Mbps、延遲 60 ms）；
// 量第一次繪製、每個請求的開始時間（相對於開始導航）、載入畫面收起的時間，截圖寫進 design/reviews/6.2-preview/。
// 另跑一次 reduced-motion（載入畫面直接移除，不淡出）。
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const base = process.argv[2] ?? "http://localhost:4173";
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../design/reviews/6.2-preview");
await mkdir(out, { recursive: true });

const browser = await chromium.launch({
  args: [
    "--proxy-bypass-list=<-loopback>",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

async function run(name, { reducedMotion }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${name}]`, e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });
  // 載入畫面何時被移除（MutationObserver，從頁面一開始就掛）
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      if (document.readyState !== "loading" && !document.getElementById("boot")) {
        window.__bootGone = performance.now();
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto(base, { waitUntil: "commit" });
  await page.waitForSelector("#boot .boot-name", { state: "visible" });
  await page.screenshot({ path: resolve(out, `${name}-1-brand.png`) });
  // 進度走到一半以上再截一張（失敗就略過）
  await page
    .waitForFunction(() => Number(document.querySelector("#boot [role=progressbar]")?.getAttribute("aria-valuenow")) >= 50, null, { timeout: 60_000 })
    .then(() => page.screenshot({ path: resolve(out, `${name}-2-progress.png`) }))
    .catch(() => {});
  // 淡出中（接場景）；reduced-motion 時直接移除，沒有這一張
  if (!reducedMotion) {
    await page.waitForSelector("#boot[data-state=out]", { state: "attached", timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(out, `${name}-3-handoff.png`) }).catch(() => {});
  }
  await page.waitForFunction(() => window.__bootGone !== undefined, null, { timeout: 120_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(out, `${name}-4-scene.png`) });

  const t = await page.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, Math.round(p.startTime)]));
    const res = performance
      .getEntriesByType("resource")
      .filter((r) => /\/data\/|\/assets\/.*\.js|\/src\//.test(r.name))
      .map((r) => ({
        file: new URL(r.name).pathname,
        start: Math.round(r.startTime),
        end: Math.round(r.responseEnd),
        kb: Math.round(r.encodedBodySize / 1024),
      }));
    return { paint, bootGone: Math.round(window.__bootGone), res };
  });
  await context.close();
  return { name, reducedMotion, ...t };
}

const results = [await run("motion", { reducedMotion: false }), await run("reduced", { reducedMotion: true })];
for (const r of results) {
  console.log(`\n== ${r.name}（reduced-motion: ${r.reducedMotion}）==`);
  console.log(`first-paint ${r.paint["first-paint"]} ms、first-contentful-paint ${r.paint["first-contentful-paint"]} ms、載入畫面移除 ${r.bootGone} ms`);
  for (const x of r.res) console.log(`  ${String(x.start).padStart(5)} → ${String(x.end).padStart(5)} ms  ${String(x.kb).padStart(5)} KB  ${x.file}`);
}
await writeFile(resolve(out, "timing.json"), JSON.stringify({ base, network: "9 Mbps / 60 ms, cache disabled, 390×844", results }, null, 2) + "\n");
await browser.close();
