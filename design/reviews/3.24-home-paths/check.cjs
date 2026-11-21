// 3.24 原型檢查：node check.cjs（用預裝的 Playwright 開 design/prototypes/3.24-home-paths/index.html）
// 390×844、DPR 2；每個版本截首頁、⋯更多打開、回到全景出現、搭乘結束的分享；檢查 console 錯誤、橫向捲動、HUD 高度 ≤ 35%、點擊目標。
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs");
const path = require("path");
const OUT = __dirname;
const FILE = "file://" + path.resolve(__dirname, "../../prototypes/3.24-home-paths/index.html");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = {};
const ok = (k, v) => { checks[k] = v; console.log(k, JSON.stringify(v)); };

/** HUD 佔框高的比例：框內看得到的 HUD 元素（不含場景點擊層）在垂直方向的聯集。 */
const measure = (p) =>
  p.evaluate(() => {
    const frame = document.getElementById("frame").getBoundingClientRect();
    const spans = [];
    for (const el of document.querySelectorAll("#hud > * *, #hud > *")) {
      if (el.classList.contains("scene-hit") || el.closest("[hidden]")) continue;
      if (!el.matches(".hud, .ride-main, .find-sub, .more-btn")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      spans.push([Math.max(r.top, frame.top), Math.min(r.bottom, frame.bottom)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0, cur = null;
    for (const s of spans) {
      if (!cur || s[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [...s]; } else cur[1] = Math.max(cur[1], s[1]);
    }
    if (cur) total += cur[1] - cur[0];
    const buttons = [...document.querySelectorAll("#hud button")]
      .filter((b) => !b.classList.contains("scene-hit") && !b.closest("[hidden]") && b.getBoundingClientRect().width > 0)
      .map((b) => { const r = b.getBoundingClientRect(); return { t: (b.getAttribute("aria-label") || b.textContent).trim().slice(0, 12), w: Math.round(r.width), h: Math.round(r.height) }; });
    const text = [...document.querySelectorAll("#hud button, #hud .sub, #hud .clock")]
      .filter((e) => !e.closest("[hidden]") && e.getBoundingClientRect().width > 0)
      .map((e) => (e.getAttribute("aria-label") || e.textContent).trim());
    return {
      hudPct: Math.round((total / frame.height) * 1000) / 10,
      frameH: Math.round(frame.height),
      hScroll: document.scrollingElement.scrollWidth > innerWidth,
      buttons,
      text,
    };
  });

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  p.on("pageerror", (e) => errors.push(String(e)));
  const shot = (name) => p.screenshot({ path: path.join(OUT, name) });
  const tapOk = (b, names) => b.filter((x) => names.some((n) => x.t.includes(n))).every((x) => x.w >= 44 && x.h >= 44);

  for (const v of ["A", "B", "C"]) {
    await p.goto(FILE);
    await p.click(`.vseg button[data-v="${v}"]`);
    await sleep(1300);
    const home = await measure(p);
    ok(`${v}-home`, { hudPct: home.hudPct, frameH: home.frameH, hScroll: home.hScroll, text: home.text });
    ok(`${v}-tap44`, tapOk(home.buttons, ["搭板南線", "找你的站", "更多", "暫停", "播放"]));
    ok(`${v}-hidden-on-home`, !home.text.some((t) => /分享這一刻|圖層|1x|靜態|回到全景|線寬|柱子/.test(t)));
    await shot(`${v}-1-home.png`);

    await p.click('#hud [data-act="more"]');
    await sleep(600);
    await p.click('#hud [data-k="legend"]');
    await sleep(400);
    const more = await measure(p);
    ok(`${v}-more-items`, more.text.filter((t) => /分享這一刻|圖層|播放速度|靜態模式|怎麼看這張圖|關於/.test(t)));
    await shot(`${v}-2-more.png`);
    await p.click('#hud [data-act="more"], #hud [data-act="close"]').catch(() => {});
    await p.evaluate(() => { window.__proto.S.panel = null; window.__proto.render(); });

    await p.click("#demo");
    await sleep(600);
    const moved = await measure(p);
    ok(`${v}-moved`, { hudPct: moved.hudPct, home: moved.text.includes("回到全景") });
    await shot(`${v}-3-recenter.png`);
    await p.click('#hud [data-act="home"]');
    await sleep(300);
    ok(`${v}-recenter-hides`, !(await measure(p)).text.includes("回到全景"));

    await p.click('#hud [data-act="ride"]');
    await sleep(1200);
    const ride = await measure(p);
    ok(`${v}-ride`, ride.text);
    if (v === "A") await shot(`ride-1-moving.png`);
    await p.click('#hud [data-act="leave"]');
    await sleep(500);
    if (v === "A") await shot(`ride-2-end.png`);
    await p.click('#hud [data-act="rideshare"]');
    await sleep(500);
    await p.click('#hud [data-act="copy"]');
    await sleep(300);
    const share = await measure(p);
    ok(`${v}-ride-share`, share.text);
    await shot(`${v}-4-ride-share.png`);
  }

  // B：展開時間軸；搜尋面板
  await p.goto(FILE);
  await p.click('.vseg button[data-v="B"]');
  await sleep(1300);
  await p.click('#hud [data-act="expand"]');
  await sleep(400);
  ok("B-expanded", (await measure(p)).hudPct);
  await shot("B-5-timeline-expanded.png");
  await p.click('.vseg button[data-v="A"]');
  await p.click('#hud [data-act="search"]');
  await sleep(600);
  await shot("search-sheet.png");

  // 減少動態：不自動播放、停在 8 點
  const rctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const rp = await rctx.newPage();
  rp.on("pageerror", (e) => errors.push(String(e)));
  await rp.goto(FILE);
  await sleep(500);
  ok("reduced-motion", await rp.evaluate(() => ({ playing: window.__proto.S.playing, clock: document.querySelector('[data-b="clock"]').textContent, anim: getComputedStyle(document.documentElement).getPropertyValue("--dur-sheet").trim() })));

  // 寬螢幕：框置中
  const wctx = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const wp = await wctx.newPage();
  await wp.goto(FILE);
  await sleep(1300);
  ok("wide-frame", await wp.evaluate(() => { const r = document.getElementById("frame").getBoundingClientRect(); return { w: r.width, h: r.height, hScroll: document.scrollingElement.scrollWidth > innerWidth }; }));
  await wp.screenshot({ path: path.join(OUT, "wide.png") });

  ok("console-errors", errors);
  fs.writeFileSync(path.join(OUT, "checks.json"), JSON.stringify(checks, null, 2));
  await browser.close();
})();
