// 8.6 搭乘模式第 0 期（板南線試乘）：建置版在手機 390×844（DPR 2）上走一遍。node e2e.cjs <outDir>（先 `npx vite preview --port 4199`）
// 檢查（票面 verify）：首頁暫時的「搭板南線」與板南線車站卡的「搭這條線」兩個入口；行進中畫面上沒有卡片、數字與說明，
// 只有暫停、下一站、下車三顆且點擊目標 ≥ 44px；到站停住並開那站的車站卡（摘要高度）；網址帶線與位置，新分頁打開回到同一站且暫停；
// 減少動態時一站一站跳（停靠之間畫面完全不動）；帶 ?debug=perf 搭乘時效能面板照樣顯示 fps；下車回到全景、播放維持暫停。
// swiftshader 一秒只有一兩格（搭乘時鐘每格最多走 0.1 秒），所以等待都很長。
const { chromium } = require("playwright");
const crypto = require("crypto");
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
const VIEW = { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 };
const NAMES = { s1114b524: "頂埔", se10ba269: "永寧", s94843a9a: "西門", s560caae9: "台北車站" };

/** 畫面上看得到的字（不含搭乘控制、效能面板、給螢幕閱讀器的字）。 */
const visibleText = (p) =>
  p.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest("[data-perf-panel], .ride-controls, [hidden], script, style, #boot")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
      let o = 1;
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || cs.display === "none") o = 0;
        o *= Number(cs.opacity);
      }
      if (o > 0.05) out.push(t);
    }
    return out;
  });

/** 看得到的按鈕（不含效能面板）與大小。 */
const visibleButtons = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => !b.closest("[data-perf-panel], [hidden]") && b.getBoundingClientRect().width > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
      }),
  );

const state = (p) =>
  p.evaluate(() => {
    const card = document.querySelector(".card[data-kind=station]");
    const r = card?.getBoundingClientRect();
    return {
      url: location.search,
      card: card ? card.querySelector("h2")?.textContent : null,
      sheet: card?.dataset.sheet ?? null,
      cardVisible: r ? Math.round(((innerHeight - r.top) / innerHeight) * 100) / 100 : null,
      ride: !!document.querySelector(".ride-controls"),
      pause: document.querySelector(".ride-controls .ride-btn")?.textContent.trim() ?? null,
    };
  });

/** 場景畫面（搭乘控制上方那塊）的雜湊：畫面有沒有在動。 */
const sceneHash = async (p) =>
  crypto.createHash("md5").update(await p.screenshot({ clip: { x: 0, y: 120, width: 390, height: 300 }, timeout: 120000 })).digest("hex").slice(0, 10);

const stationOf = (url) => new URLSearchParams(url).get("station");

(async () => {
  const browser = await chromium.launch({ args: GL });
  const errors = [];
  const watch = (p) => {
    p.setDefaultTimeout(180000);
    p.on("pageerror", (e) => errors.push(String(e)));
    p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    return p;
  };
  const ctx = await browser.newContext(VIEW);
  const page = watch(await ctx.newPage());

  // 1. 首頁暫時的「搭板南線」（在「找你的站」上方，其他按鈕不動）
  await page.goto(`${BASE}/?hour=10&day=weekday`);
  await page.waitForSelector(".ride-start:not([disabled])", { timeout: 120000 });
  await sleep(3000);
  const homeButtons = await visibleButtons(page);
  const rs = await page.$eval(".ride-start", (b) => b.getBoundingClientRect().toJSON());
  const fm = await page.$eval(".find-main", (b) => b.getBoundingClientRect().toJSON());
  ok("1-home", { rideStart: { h: Math.round(rs.height), above: rs.bottom <= fm.top }, buttons: homeButtons.map((b) => b.text) });
  await page.screenshot({ path: path.join(OUT, "01-home-ride-button.png") });

  // 2. 按「搭板南線」：從頂埔上車，行進中只有三顆按鈕、沒有卡片與文字；到永寧停住開卡（摘要高度）
  await page.click(".ride-start");
  const samples = [];
  let moving = 0;
  for (let k = 0; k < 120; k++) {
    await sleep(1500);
    const s = await state(page);
    if (s.card) break;
    const hash = await sceneHash(page);
    const texts = await visibleText(page);
    const buttons = await visibleButtons(page);
    samples.push({ hash, texts, buttons: buttons.map((b) => `${b.text} ${b.w}×${b.h}`) });
    if (k === 1) await page.screenshot({ path: path.join(OUT, "02-ride-moving-from-dingpu.png") });
    moving++;
  }
  const arrival = await state(page);
  ok("2-home-ride-moving", {
    samples: samples.length,
    distinctFrames: new Set(samples.map((s) => s.hash)).size,
    anyText: samples.some((s) => s.texts.length),
    texts: [...new Set(samples.flatMap((s) => s.texts))],
    buttons: [...new Set(samples.flatMap((s) => s.buttons))],
    allButtonsAtLeast44: samples.every((s) => s.buttons.every((b) => b.split(" ").at(-1).split("×").every((v) => Number(v) >= 44))),
  });
  await sleep(1500);
  ok("3-home-ride-arrival", { ...arrival, station: NAMES[stationOf(arrival.url)] ?? stationOf(arrival.url) });
  await page.screenshot({ path: path.join(OUT, "03-docked-yongning-card-peek.png") });

  // 3. 暫停：網址帶線與這一站；新分頁打開回到同一站且暫停
  await page.click(".ride-btn >> nth=0");
  await sleep(2000);
  const paused = await state(page);
  ok("4-paused", paused);
  const p2 = watch(await ctx.newPage());
  await p2.goto(`${BASE}/${paused.url}`);
  await p2.waitForSelector(".ride-controls", { timeout: 120000 });
  await p2.waitForSelector(".card[data-kind=station]");
  await sleep(4000);
  const reopened = await state(p2);
  await sleep(8000);
  const later = await state(p2);
  ok("5-link-reopened", { reopened, stillSameStationAfter8s: stationOf(later.url) === stationOf(paused.url) && later.card === reopened.card, pausedLabel: later.pause });
  await p2.screenshot({ path: path.join(OUT, "04-link-reopened-paused.png") });
  await p2.close();

  // 4. 下車：回到全景，播放維持暫停（網址照樣記著時刻），搭乘的鍵拿掉
  await page.click(".ride-btn >> nth=2");
  await sleep(5000);
  const left = await state(page);
  ok("6-leave", { ...left, findMain: await page.locator(".find-main").count(), rideStart: await page.locator(".ride-start").count(), hourInUrl: /hour=\d+/.test(left.url) });
  await page.screenshot({ path: path.join(OUT, "05-after-leave-home.png") });
  await page.close();

  // 5. 板南線車站卡的「搭這條線」：找你的站 → 西門 → 搭這條線 → 往台北車站
  const pc = watch(await ctx.newPage());
  await pc.goto(`${BASE}/?hour=17&day=weekday`);
  await pc.waitForSelector(".find-main:not([disabled])", { timeout: 120000 });
  await sleep(2000);
  await pc.click(".find-main");
  await pc.fill(".find-sheet .find-input input", "西門");
  await pc.click('.find-item:has(.find-name:text-is("西門"))');
  await pc.waitForSelector(".card[data-kind=station] .card-ride");
  await sleep(4000);
  const rideBtn = await pc.$eval(".card-ride", (b) => ({ text: b.textContent.trim(), label: b.getAttribute("aria-label"), h: Math.round(b.getBoundingClientRect().height) }));
  ok("7-station-card-button", rideBtn);
  await pc.screenshot({ path: path.join(OUT, "06-station-card-ride-button.png") });
  await pc.click(".card-ride");
  const s2 = [];
  for (let k = 0; k < 120; k++) {
    await sleep(1500);
    const s = await state(pc);
    if (s.card) break;
    s2.push({ hash: await sceneHash(pc), texts: await visibleText(pc), buttons: (await visibleButtons(pc)).map((b) => `${b.text} ${b.w}×${b.h}`) });
    if (k === 1) await pc.screenshot({ path: path.join(OUT, "07-ride-moving-ximen-to-taipei-main.png") });
  }
  const arr2 = await state(pc);
  ok("8-card-ride", {
    samples: s2.length,
    distinctFrames: new Set(s2.map((s) => s.hash)).size,
    texts: [...new Set(s2.flatMap((s) => s.texts))],
    buttons: [...new Set(s2.flatMap((s) => s.buttons))],
    arrival: { ...arr2, station: NAMES[stationOf(arr2.url)] ?? stationOf(arr2.url) },
  });
  await sleep(1500);
  await pc.screenshot({ path: path.join(OUT, "08-docked-taipei-main-card-peek.png") });
  // 停靠時間到了自動出發：卡片收起，往善導寺
  for (let k = 0; k < 120; k++) {
    await sleep(1500);
    if (!(await state(pc)).card) break;
  }
  await sleep(9000);
  ok("9-auto-depart", { ...(await state(pc)), texts: await visibleText(pc) });
  await pc.screenshot({ path: path.join(OUT, "09-ride-moving-taipei-main-onward.png") });
  await pc.close();

  // 6. 淡水河：從江子翠的連結出發（暫停中），按繼續往龍山寺
  const pr = watch(await ctx.newPage());
  await pr.goto(`${BASE}/?hour=7&day=weekday&station=s71e92afe&ride=BL`);
  await pr.waitForSelector(".ride-controls", { timeout: 120000 });
  await sleep(4000);
  await pr.click(".ride-btn >> nth=0");
  await sleep(16000);
  ok("10-river", await state(pr));
  await pr.screenshot({ path: path.join(OUT, "10-ride-moving-river-crossing.png") });
  await pr.close();
  await ctx.close();

  // 7. 減少動態：不連續移動。停靠之間畫面完全不動，按下一站直接切到下一站
  const rctx = await browser.newContext({ ...VIEW, reducedMotion: "reduce" });
  const rp = watch(await rctx.newPage());
  await rp.goto(`${BASE}/?hour=10&day=weekday`);
  await rp.waitForSelector(".ride-start:not([disabled])", { timeout: 120000 });
  await sleep(2000);
  await rp.click(".ride-start");
  await rp.waitForSelector(".card[data-kind=station]");
  await sleep(2000);
  const runs = [];
  for (let jump = 0; jump < 3; jump++) {
    const hashes = [];
    for (let k = 0; k < 3; k++) {
      hashes.push(await sceneHash(rp));
      await sleep(1200);
    }
    const s = await state(rp);
    runs.push({ station: NAMES[stationOf(s.url)] ?? stationOf(s.url), card: s.card, still: new Set(hashes).size === 1, hash: hashes[0] });
    if (jump === 0) await rp.screenshot({ path: path.join(OUT, "11-reduced-motion-docked.png") });
    await rp.click(".ride-btn >> nth=1");
    await sleep(1500);
  }
  ok("11-reduced-motion", { runs, allStill: runs.every((r) => r.still), allDockedWithCard: runs.every((r) => r.card), jumps: new Set(runs.map((r) => r.hash)).size });
  await rctx.close();

  // 8. ?debug=perf：搭乘中效能面板照樣顯示 fps
  const pctx = await browser.newContext(VIEW);
  const pp = watch(await pctx.newPage());
  await pp.goto(`${BASE}/?hour=8&day=weekday&debug=perf`);
  await pp.waitForSelector(".ride-start:not([disabled])", { timeout: 120000 });
  await sleep(2000);
  await pp.click(".ride-start");
  await sleep(12000);
  const perf = await pp.$eval("[data-perf-panel]", (e) => ({ text: e.textContent.trim().slice(0, 30), h: Math.round(e.getBoundingClientRect().height) }));
  ok("12-perf-panel", { ...perf, riding: (await state(pp)).ride, hasFps: /\d+\s*fps/.test(perf.text) });
  await pp.screenshot({ path: path.join(OUT, "12-perf-panel-during-ride.png") });
  await pctx.close();
  await browser.close();

  ok("errors", errors);
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
