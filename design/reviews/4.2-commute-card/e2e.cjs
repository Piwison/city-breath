// 4.2 通勤卡：建置版在手機 390×844（DPR 2）上走一遍。node e2e.cjs <outDir>（先 `npx vite preview --port 4199`）
// 檢查：找你的站 → 車站卡 → 從這站找通勤 → 迄站 → 通勤卡；卡片摘要約三分之一、往上滑到完整約七成；第一行一句答案；
// 點 7 點那格換時段、數字更新、網址跟著換；分享面板的預覽與存成的圖；複製的連結打開回到同一張通勤卡（關掉回到底下的車站卡）；
// 少於 10 人的卡與存成的圖；減少動態；替代頁打開同一個連結。
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const OUT = process.argv[2] || __dirname;
const BASE = "http://localhost:4199";
fs.mkdirSync(OUT, { recursive: true });
const checks = {};
const ok = (k, v) => {
  checks[k] = v;
  console.log(k, JSON.stringify(v));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--proxy-bypass-list=<-loopback>"];
const H = 844;

(async () => {
  const browser = await chromium.launch({ args: GL });
  const ctx = await browser.newContext({ viewport: { width: 390, height: H }, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const errors = [];
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shotOf = (p) => (name) => p.screenshot({ path: path.join(OUT, name), timeout: 120000 });
  const shot = shotOf(page);
  const ready = async (p) => {
    await p.waitForSelector(".scene-canvas", { timeout: 90000 });
    await p.waitForSelector(".find-main:not([disabled]), .card", { timeout: 90000 });
    await sleep(2500);
  };
  // 卡片露出的高度占畫面的比例（卡片下緣固定在畫面下緣上方，摘要時整張往下推）
  const cardInfo = (p) =>
    p.$eval(".card[data-kind=commute]", (e) => {
      const r = e.getBoundingClientRect();
      return {
        sheet: e.dataset.sheet,
        visibleRatio: Math.round(((innerHeight - r.top) / innerHeight) * 100) / 100,
        title: e.querySelector("h2").textContent,
        when: e.querySelector(".card-when")?.textContent,
        answer: e.querySelector(".card-answer")?.textContent,
        timeRow: e.querySelector(".card-hm")?.textContent,
        cells: [...e.querySelectorAll(".commute-near button")].map((b) => ({ label: b.getAttribute("aria-label"), current: b.getAttribute("aria-current") === "true", disabled: b.disabled })),
        stats: [...e.querySelectorAll(".card-stats div")].map((d) => d.textContent),
      };
    });
  const waitAnswer = (p) => p.waitForSelector(".card[data-kind=commute] .card-answer");
  // 等卡片停穩（swiftshader 下一格很慢，transition 要比真機久）：卡片上沒有進行中的動畫（getAnimations 含 CSS transition）
  let current = null;
  const settle = async () => {
    await sleep(400);
    for (let i = 0; i < 60; i++) {
      const busy = await current.$eval(".card", (e) => e.getAnimations().length).catch(() => 0);
      if (!busy) break;
      await sleep(250);
    }
    await sleep(200);
  };

  // 1. 停在平日 8 點進首頁，走 4.1 的三步：找你的站 → 頂溪 → 從這站找通勤 → 迄站 → 台北車站
  current = page;
  await page.goto(`${BASE}/?hour=8&day=weekday`);
  await ready(page);
  await page.click(".find-main");
  await page.fill(".find-sheet .find-input input", "頂溪");
  await page.click('.find-item:has(.find-name:text-is("頂溪"))');
  await page.waitForSelector(".card[data-kind=station]");
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll(".card-action")].find((b) => b.textContent.includes("從這站找通勤")).click());
  await page.waitForSelector(".find-sheet .commute-form");
  await page.click(".commute-field:nth-child(2)");
  await page.fill(".find-pick .find-input input", "台北車站");
  await page.click('.find-item:has(.find-name:text-is("台北車站"))');
  await waitAnswer(page);
  await settle();
  const peek = await cardInfo(page);
  ok("1-card-peek", {
    ...peek,
    sheetGone: (await page.locator(".find-sheet").count()) === 0,
    stationCardHidden: (await page.locator(".card[data-kind=station]").count()) === 0,
    peekAboutThird: peek.sheet === "peek" && peek.visibleRatio > 0.3 && peek.visibleRatio < 0.4,
    url: page.url(),
  });
  await shot("1-commute-card-peek.png");

  // 2. 往上看完整內容：點把手（拖曳手勢在 3.22 驗過；Playwright 的滑鼠拖曳在觸控情境下不穩）
  await page.click(".card[data-kind=commute] .card-grip");
  await settle();
  const full = await cardInfo(page);
  ok("2-card-full", { sheet: full.sheet, visibleRatio: full.visibleRatio, fullAboutSeventy: full.sheet === "full" && full.visibleRatio > 0.65 && full.visibleRatio < 0.75 });
  await shot("2-commute-card-full.png");

  // 3. 點 7 點那格：時段換成 7 點、數字更新、網址跟著換
  await page.click('.commute-near button[aria-label^="早一小時"]');
  await settle();
  const seven = await cardInfo(page);
  ok("3-seven-oclock", {
    when: seven.when,
    timeRow: seven.timeRow,
    answer: seven.answer,
    cells: seven.cells,
    numbersChanged: seven.answer !== full.answer,
    url: page.url(),
    urlAt7: /[?&]hour=7(&|$)/.test(page.url()) && /[?&]at=7(&|$)/.test(page.url()),
  });
  await shot("3-commute-card-7.png");

  // 4. 分享面板：預覽圖、存成圖片、複製連結
  await page.click(".card[data-kind=commute] .card-share");
  await page.waitForSelector(".share-panel .share-preview-img");
  await sleep(400);
  const link = await page.inputValue(".share-panel .share-url input");
  await shot("4-share-panel.png");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('.share-panel .share-btn:text-is("存成圖片")')]);
  const saved = path.join(OUT, "5-saved-commute-7.png");
  await download.saveAs(saved);
  await page.click(".share-panel .share-btn-main");
  await sleep(300);
  ok("4-share", {
    link,
    linkHasCommute: /from=sd3f4ec1f/.test(link) && /to=s560caae9/.test(link) && /at=7/.test(link),
    file: download.suggestedFilename(),
    bytes: fs.statSync(saved).size,
    copied: (await page.textContent(".share-panel .share-btn-main")).trim(),
    clipboard: await page.evaluate(() => navigator.clipboard.readText()),
  });
  await page.keyboard.press("Escape");
  await sleep(300);
  ok("4b-esc-closes-panel-only", { panel: await page.locator("dialog[open]").count(), card: await page.locator(".card[data-kind=commute]").count() });

  // 5. 複製的連結在新分頁打開：回到同一張通勤卡；關掉後是底下的車站卡（兩個 WebGL 分頁在 swiftshader 下太慢，先關第一個）
  await page.close();
  const p2 = await ctx.newPage();
  current = p2;
  p2.setDefaultTimeout(120000);
  p2.on("pageerror", (e) => errors.push(String(e)));
  await p2.goto(link);
  await ready(p2);
  await waitAnswer(p2);
  await settle();
  const reopened = await cardInfo(p2);
  ok("5-link-roundtrip", {
    title: reopened.title,
    when: reopened.when,
    answer: reopened.answer,
    sameCard: reopened.title === seven.title && reopened.when === seven.when && reopened.answer === seven.answer,
    notice: await p2.locator(".scene-notice").count(),
  });
  await shotOf(p2)("6-link-reopened.png");
  await p2.click(".card[data-kind=commute] .card-close");
  await settle();
  ok("5b-close-shows-station-card", {
    stationCard: await p2.locator(".card[data-kind=station] h2").textContent(),
    url: p2.url(),
    urlDroppedCommute: !/from=|to=|at=/.test(p2.url()),
  });
  await p2.close();

  // 6. 少於 10 人：台北101/世貿 → 南港軟體園區，平日 8 點（連結直接打開）
  const p4 = await ctx.newPage();
  p4.setDefaultTimeout(120000);
  p4.on("pageerror", (e) => errors.push(String(e)));
  current = p4;
  await p4.goto(`${BASE}/?month=2026-09&day=weekday&hour=8&from=s83a87ed0&to=s093305df&at=8`);
  await ready(p4);
  await waitAnswer(p4);
  await settle();
  const under = await cardInfo(p4);
  ok("6-under-10", { answer: under.answer, stats: under.stats, cells: under.cells, noSmallNumber: !/(?<![\d,.])\d(?![\d,.])\s*人/.test(JSON.stringify(under)) });
  await shotOf(p4)("7-under-10-peek.png");
  await p4.click(".card[data-kind=commute] .card-share");
  await p4.waitForSelector(".share-panel .share-preview-img");
  await sleep(400);
  await shotOf(p4)("8-under-10-share-panel.png");
  const [d2] = await Promise.all([p4.waitForEvent("download"), p4.click('.share-panel .share-btn:text-is("存成圖片")')]);
  const saved2 = path.join(OUT, "9-saved-under-10.png");
  await d2.saveAs(saved2);
  ok("6b-under-10-saved", { file: d2.suggestedFilename(), bytes: fs.statSync(saved2).size });
  await p4.close();

  // 7. 錯的通勤連結（迄站是環狀線）：退回全景並說明
  const p3 = await ctx.newPage();
  await p3.goto(`${BASE}/?from=sd3f4ec1f&to=${await (async () => {
    const st = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../web/public/data/2026-09/stations.json"), "utf8")).stations;
    return st.find((s) => s.display === "板橋（環狀線）").id;
  })()}&at=8`);
  await p3.waitForSelector(".scene-notice", { timeout: 90000 });
  ok("7-bad-link", { notice: await p3.textContent(".scene-notice p"), card: await p3.locator(".card").count(), url: p3.url() });
  await p3.close();

  // 8. 減少動態：卡片直接出現（--dur-sheet、--dur-enter 歸零）
  const rctx = await browser.newContext({ viewport: { width: 390, height: H }, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  rp.setDefaultTimeout(120000);
  await rp.goto(link);
  await rp.waitForSelector(".card[data-kind=commute] .card-answer", { timeout: 90000 });
  await sleep(1500);
  ok("8-reduced-motion", {
    transition: await rp.$eval(".card[data-kind=commute]", (e) => getComputedStyle(e).transitionDuration),
    cellTransition: await rp.$eval(".commute-near button", (e) => getComputedStyle(e).transitionDuration),
  });
  await rp.screenshot({ path: path.join(OUT, "10-reduced-motion.png") });
  await rctx.close();
  await browser.close();

  // 9. 不支援 WebGL：替代頁打開同一個連結也是那張通勤卡
  const nogl = await chromium.launch({ args: ["--disable-webgl", "--disable-3d-apis", "--proxy-bypass-list=<-loopback>"] });
  const fctx = await nogl.newContext({ viewport: { width: 390, height: H }, hasTouch: true, deviceScaleFactor: 2 });
  const fp = await fctx.newPage();
  fp.setDefaultTimeout(60000);
  current = fp;
  await fp.goto(link);
  await fp.waitForSelector(".fallback-card-layer .card[data-kind=commute] .card-answer");
  await settle();
  ok("9-fallback", await cardInfo(fp));
  await fp.screenshot({ path: path.join(OUT, "11-fallback-card.png") });
  await nogl.close();

  ok("errors", errors);
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
