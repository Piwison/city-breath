// 3.15 建置版驗證：node e2e.cjs <outDir>
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const OUT = process.argv[2];
const BASE = "http://localhost:4199";
const DEV = "http://localhost:5199";
fs.mkdirSync(OUT, { recursive: true });
const checks = {};
const ok = (k, v) => { checks[k] = v; console.log(k, JSON.stringify(v)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--proxy-bypass-list=<-loopback>"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2, permissions: ["clipboard-read", "clipboard-write"] });
  const errors = [];
  const external = [];
  const watch = (pg) => {
    pg.setDefaultTimeout(120000);
    pg.on("pageerror", (e) => errors.push(String(e)));
    pg.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    pg.on("request", (r) => { const u = new URL(r.url()); if (u.hostname !== "localhost") external.push(r.url()); });
    return pg;
  };
  let page = watch(await ctx.newPage());
  const shot = (name) => page.screenshot({ path: path.join(OUT, name), timeout: 120000 });
  const ready = async () => { await page.waitForSelector(".scene-canvas", { timeout: 60000 }); await sleep(2500); };

  // 1. 大安區、假日、14 點 → 分享 → 面板 → 複製連結
  await page.goto(`${BASE}/?day=holiday&hour=14&district=63000030`);
  await ready();
  await page.waitForSelector(".card[data-kind=district]");
  ok("1-district-card", { title: await page.textContent(".card h2"), when: await page.textContent(".card-when") });
  await shot("1-district-card.png");
  await page.click(".card .card-share");
  await page.waitForSelector("dialog.share-panel[open]");
  await sleep(400);
  ok("1-panel", { heading: await page.textContent(".share-panel h2"), buttons: await page.$$eval(".share-panel .share-btn", (b) => b.map((x) => x.textContent)) });
  await shot("2-district-share-panel.png");
  await page.click(".share-panel .share-btn-main");
  await sleep(300);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  ok("1-copied", { link: copied, button: await page.textContent(".share-panel .share-btn-main"), status: await page.textContent(".share-status") });
  await shot("3-district-copied.png");
  // Esc 只關面板、卡片還在
  await page.keyboard.press("Escape");
  await sleep(200);
  ok("1-esc-closes-panel-only", { panel: await page.$("dialog.share-panel[open]") !== null, card: await page.$(".card[data-kind=district]") !== null });

  // 新分頁打開複製的連結：同一張卡、同一時段、暫停（先關掉原分頁，swiftshader 同時跑兩個 WebGL 太慢）
  await page.close();
  const p2 = watch(await ctx.newPage());
  await p2.goto(copied);
  await p2.waitForSelector(".card[data-kind=district]", { timeout: 60000 });
  await sleep(3000);
  const when1 = await p2.textContent(".card-when");
  await sleep(2000);
  ok("1-new-tab", { title: await p2.textContent(".card h2"), when: when1, whenLater: await p2.textContent(".card-when"), hm: await p2.textContent(".card-hm"), url: p2.url() });
  await p2.screenshot({ path: path.join(OUT, "4-district-new-tab.png") });
  await p2.close();
  page = watch(await ctx.newPage());

  // 2. 車站卡：從大安區進大安站 → 分享 → 只有複製連結
  await page.goto(`${BASE}/?day=holiday&hour=14&district=63000030&station=sb11da7c7`);
  await ready();
  await page.waitForSelector(".card[data-kind=station]");
  ok("2-station-card", { title: await page.textContent(".card h2"), back: await page.textContent(".card-back"), statsBeforeType: await page.evaluate(() => { const a = document.querySelector(".card-stats"); const b = document.querySelector(".card-type"); return !b || !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }) });
  await shot("5-station-card-peek.png");
  await page.click(".card .card-share");
  await page.waitForSelector("dialog.share-panel[open]");
  await sleep(400);
  const text = await page.textContent(".share-panel");
  ok("2-station-panel", { hasSaveImage: text.includes("存成圖片"), hasCopy: text.includes("複製連結"), url: await page.inputValue(".share-url input") });
  await shot("6-station-share-panel.png");
  await page.keyboard.press("Escape");

  // 3. 沒開卡：分享這一刻（播放中按 → 暫停、記目前時段與日型）
  await page.goto(`${BASE}/`);
  await ready();
  await sleep(2000);
  const playLabelBefore = await page.getAttribute(".scene-dock .play", "aria-label");
  await shot("7-home-share-moment-button.png");
  await page.click(".scene-share-btn");
  await page.waitForSelector("dialog.share-panel[open]");
  await sleep(400);
  const clock = await page.textContent(".scene-dock .clock");
  const momentUrl = await page.inputValue(".share-url input");
  ok("3-moment", {
    playLabelBefore,
    playLabelAfter: await page.getAttribute(".scene-dock .play", "aria-label"),
    clock,
    url: momentUrl,
    heading: await page.textContent(".share-panel h2"),
    hasSaveImage: (await page.textContent(".share-panel")).includes("存成圖片"),
  });
  await shot("8-share-moment-panel.png");
  await page.click(".share-panel .share-close");
  await sleep(1500);
  ok("3-still-paused", { clock: await page.textContent(".scene-dock .clock"), play: await page.getAttribute(".scene-dock .play", "aria-label"), addressBar: page.url() });

  // 4. 不合法網址 → 全景＋說明
  for (const [name, q] of [["9-invalid-station", "?day=holiday&hour=14&station=snope"], ["10-invalid-hour", "?hour=99&district=63000030"], ["11-invalid-month", "?month=2030-01&district=63000030"]]) {
    await page.goto(`${BASE}/${q}`);
    await ready();
    ok(name, {
      card: await page.$(".card") !== null,
      notice: await page.textContent(".scene-notice").catch(() => null),
      play: await page.getAttribute(".scene-dock .play", "aria-label"),
      addressBar: page.url(),
    });
    await shot(`${name}.png`);
  }
  // 5. 舊月份 → 照樣還原＋說明
  await page.goto(`${BASE}/?month=2026-08&day=weekday&hour=8&district=63000030`);
  await ready();
  ok("12-stale-month", { card: await page.textContent(".card h2").catch(() => null), notice: await page.textContent(".scene-notice").catch(() => null) });
  await shot("12-stale-month.png");

  // 6. 減少動態：面板直接出現
  const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  await rp.goto(`${BASE}/?day=holiday&hour=14&district=63000030`);
  await rp.waitForSelector(".card", { timeout: 60000 });
  await sleep(2000);
  await rp.click(".card .card-share");
  await sleep(30);
  ok("13-reduced-motion-panel", await rp.evaluate(() => { const d = document.querySelector("dialog.share-panel"); const cs = getComputedStyle(d); return { opacity: cs.opacity, translate: cs.translate, dur: cs.transitionDuration }; }));
  await rp.screenshot({ path: path.join(OUT, "13-reduced-motion-panel.png") });
  await rctx.close();

  // 7. 分享卡樣張（新版型：上方天空帶、自帶字型）：dev 的 share-preview.html
  try {
    const sp = await ctx.newPage();
    await sp.setViewportSize({ width: 1200, height: 900 });
    await sp.goto(`${DEV}/share-preview.html`);
    const cards = await sp.evaluate(() => window.__shareCards);
    for (const c of cards) fs.writeFileSync(path.join(OUT, `share-card-${c.name}.png`), Buffer.from(c.dataUrl.split(",")[1], "base64"));
    ok("14-share-font", await sp.evaluate(async () => ({ loaded: [...document.fonts].filter((f) => f.family.includes("Manrope")).map((f) => `${f.weight}:${f.status}`) })));
    await sp.close();
  } catch (e) { ok("14-share-cards-error", String(e)); }

  // 8. 預覽標籤與圖示
  const head = await (await fetch(`${BASE}/`)).text();
  ok("15-meta", { ogTitle: /og:title" content="([^"]*)"/.exec(head)?.[1], twitter: /twitter:card" content="([^"]*)"/.exec(head)?.[1], og: (await fetch(`${BASE}/og.png`)).status, icon: (await fetch(`${BASE}/favicon.svg`)).status, touch: (await fetch(`${BASE}/apple-touch-icon.png`)).status });
  ok("external-requests", [...new Set(external)]);
  ok("errors", errors);
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2) + "\n");
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
