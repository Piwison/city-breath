// 4.1 找你的站：建置版在手機 390×844（DPR 2）上走一遍。node e2e.cjs <outDir>（先 `npx vite preview --port 4199`）
// 檢查：主按鈕位置與大小、左上沒有「找你的通勤」、打「忠孝」、中山在兩條線下、選站開車站卡、3 步內看到同路人、
// 環狀線當迄站的說明、最近用過的站重新整理後還在、第 6 站擠掉最舊的、網址不含最近用過的站、減少動態、替代頁。
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

(async () => {
  const browser = await chromium.launch({ args: GL });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const errors = [];
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name) => page.screenshot({ path: path.join(OUT, name), timeout: 120000 });
  const ready = async () => {
    await page.waitForSelector(".scene-canvas", { timeout: 90000 });
    await page.waitForSelector(".find-main:not([disabled])", { timeout: 90000 });
    await sleep(2500);
  };
  const names = (sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent));
  const sections = () =>
    page.$$eval(".find-list section", (ss) =>
      ss.map((s) => ({ name: s.getAttribute("aria-label"), stations: [...s.querySelectorAll(".find-name")].map((n) => n.textContent) })),
    );
  const type = async (q) => {
    await page.fill(".find-input input", q);
    await sleep(200);
  };
  const pickFirst = async (display) => {
    await type(display);
    await page.click(`.find-item:has(.find-name:text-is("${display}"))`);
    await sleep(300);
  };

  // 1. 首頁：主按鈕在畫面下半部、高 ≥ 44px、播放中；左上沒有「找你的通勤」
  await page.goto(`${BASE}/`);
  await ready();
  const box = await page.locator(".find-main").boundingBox();
  const dock = await page.locator(".scene-dock").boundingBox();
  ok("1-main-button", {
    text: (await page.textContent(".find-main")).trim(),
    box,
    lowerHalf: box.y > 844 / 2,
    tall: box.height >= 44,
    aboveTimeBar: box.y + box.height <= dock.y,
    playing: (await page.getAttribute(".scene-dock .play", "aria-label")) === "暫停",
    oldEntry: await page.locator("text=找你的通勤").count(),
  });
  await shot("1-home-main-button.png");

  // 2. 播放中直接按 → 搜尋面板（輸入框有焦點）；清單依路線分組
  await page.click(".find-main");
  await page.waitForSelector(".find-sheet .find-input input");
  await sleep(1500);
  const all = await sections();
  ok("2-search-open", {
    focused: await page.evaluate(() => document.activeElement?.matches(".find-input input")),
    groups: all.map((s) => s.name),
    stillPlaying: (await page.getAttribute(".scene-dock .play", "aria-label")) === "暫停",
    redFirst3: all.find((s) => s.name === "淡水信義線").stations.slice(0, 3),
  });
  await shot("2-search-open.png");

  // 3. 打「忠孝」
  await type("忠孝");
  ok("3-zhongxiao", { found: [...new Set(await names(".find-list .find-name"))].sort(), groups: (await sections()).map((s) => s.name) });
  await shot("3-search-zhongxiao.png");

  // 4. 打「中山」：中山站在淡水信義線與松山新店線下都有
  await type("中山");
  const zs = await sections();
  ok("4-zhongshan", { groupsWithZhongshan: zs.filter((s) => s.stations.includes("中山")).map((s) => s.name), all: zs });
  await shot("4-search-zhongshan.png");

  // 5. 選頂溪 → 面板關、鏡頭飛過去、車站卡打開
  await pickFirst("頂溪");
  await page.waitForSelector(".card[data-kind=station]");
  await sleep(2500);
  ok("5-station-card", {
    title: await page.textContent(".card h2"),
    sheetClosed: (await page.locator(".find-sheet").count()) === 0,
    mainHidden: (await page.locator(".find-main").count()) === 0,
    url: page.url(),
  });
  await shot("5-station-card.png");

  // 6. 3 步看到同路人：①從這站找通勤 ②點迄站 ③選台北車站
  let steps = 0;
  // 卡片在摘要高度時這顆鈕在卡內捲動區的下面；用 DOM click，避免 Playwright 為了點它去捲動 overflow:hidden 的頁面（真機捲不動）
  await page.evaluate(() => [...document.querySelectorAll(".card-action")].find((b) => b.textContent.includes("從這站找通勤")).click());
  steps++;
  await page.waitForSelector(".find-sheet .commute-form");
  await sleep(400);
  ok("6-commute-origin", {
    origin: await page.textContent(".commute-field:nth-child(1) .v"),
    dest: await page.textContent(".commute-field:nth-child(2) .v"),
    hourOptions: await page.$$eval(".commute-hour option", (os) => os.filter((o) => [2, 3, 4].includes(Number(o.value))).map((o) => ({ label: o.textContent, disabled: o.disabled }))),
  });
  await shot("6-commute-origin.png");
  await page.click(".commute-field:nth-child(2)");
  steps++;
  await page.waitForSelector(".find-pick .find-input input");
  await shot("7-dest-picker.png");
  await type("台北車站");
  await page.click('.find-item:has(.find-name:text-is("台北車站"))');
  steps++;
  await page.waitForSelector(".commute-result");
  await sleep(300);
  ok("7-commute-result", {
    steps,
    result: await page.textContent(".commute-result p"),
    sheetInView: await page.$eval(".find-sheet", (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
    pageScroll: await page.$eval(".scene-page", (e) => e.scrollTop),
  });
  await shot("8-commute-result.png");

  // 7. 環狀線當迄站：不選，顯示說明
  await page.click(".commute-field:nth-child(2)");
  await page.waitForSelector(".find-pick .find-input input");
  await type("板橋");
  await page.click('.find-item:has(.find-name:text-is("板橋（環狀線）"))');
  await sleep(200);
  ok("8-ring-dest", {
    alert: await page.textContent(".find-refused"),
    tag: await page.textContent('.find-item:has(.find-name:text-is("板橋（環狀線）")) small'),
    ringHeader: await page.textContent('.find-list section[aria-label="環狀線"] .find-head'),
  });
  await shot("9-ring-dest.png");
  await page.click(".find-back");
  await page.keyboard.press("Escape");
  await sleep(300);
  // Esc 只關通勤面板，底下的車站卡還在
  ok("8b-esc-keeps-card", { sheet: await page.locator(".find-sheet").count(), card: await page.locator(".card[data-kind=station]").count() });

  // 8. 重新整理後最近用過的站還在（頂溪、台北車站；環狀線那站沒選成，不算）
  const stored = await page.evaluate(() => localStorage.getItem("city-breath:progress:v1"));
  await page.goto(`${BASE}/`);
  await ready();
  await page.click(".find-main");
  await page.waitForSelector(".find-sheet .find-input input");
  await sleep(300);
  const recent1 = (await sections())[0];
  ok("9-recent-after-reload", { stored, recent: recent1 });
  await shot("10-recent-after-reload.png");

  // 9. 第 6 站擠掉最舊的：從通勤起站再選淡水、象山、南港（共 5 站），再選動物園（第 6 站）
  await page.click(".find-link");
  await page.waitForSelector(".find-sheet .commute-form");
  for (const s of ["淡水", "象山", "南港", "動物園"]) {
    await page.click(".commute-field:nth-child(1)");
    await page.waitForSelector(".find-pick .find-input input");
    await pickFirst(s);
  }
  await page.click(".commute-field:nth-child(1)");
  await page.waitForSelector(".find-pick .find-input input");
  await sleep(200);
  const recent2 = (await sections())[0];
  const stored2 = JSON.parse(await page.evaluate(() => localStorage.getItem("city-breath:progress:v1")));
  ok("10-sixth-pushes-oldest", { recent: recent2, stored: stored2, url: page.url(), urlHasRecent: stored2.recentStations.some((id) => page.url().includes(id)) });
  await shot("11-sixth-pushes-oldest.png");
  await page.keyboard.press("Escape");
  await sleep(200);
  ok("11-esc-closes", { sheet: await page.locator(".find-sheet").count(), main: await page.locator(".find-main").count() });
  await page.close();

  // 10. 減少動態：面板直接出現
  const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  rp.setDefaultTimeout(120000);
  await rp.goto(`${BASE}/`);
  await rp.waitForSelector(".find-main:not([disabled])", { timeout: 90000 });
  await sleep(2000);
  await rp.click(".find-main");
  await rp.waitForSelector(".find-sheet");
  ok("12-reduced-motion", {
    durations: await rp.$eval(".find-sheet", (e) => getComputedStyle(e).transitionDuration),
    mainDurations: await rp.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--dur-enter")),
  });
  await rp.screenshot({ path: path.join(OUT, "12-reduced-motion-search.png") });
  await rctx.close();
  await browser.close();

  // 11. 不支援 WebGL：替代頁用同一個搜尋
  const nogl = await chromium.launch({ args: ["--disable-webgl", "--disable-3d-apis", "--proxy-bypass-list=<-loopback>"] });
  const fctx = await nogl.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const fp = await fctx.newPage();
  fp.setDefaultTimeout(60000);
  await fp.goto(`${BASE}/`);
  await fp.waitForSelector(".scene-fallback .commute-form");
  await sleep(500);
  await fp.click(".commute-field:nth-child(1)");
  await fp.waitForSelector(".find-pick .find-input input");
  await fp.fill(".find-input input", "忠孝");
  await sleep(200);
  ok("13-fallback", {
    focused: await fp.evaluate(() => document.activeElement?.matches(".find-input input")),
    found: [...new Set(await fp.$$eval(".find-list .find-name", (els) => els.map((e) => e.textContent)))],
  });
  await fp.screenshot({ path: path.join(OUT, "13-fallback-search.png") });
  await nogl.close();

  ok("errors", errors);
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
