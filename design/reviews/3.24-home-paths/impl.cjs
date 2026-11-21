// 3.24 首頁三條路（版本 C「一個底座」）建置版檢查：node impl.cjs（先在 web/ 跑 `npm run build && npx vite preview --port 4199`）。
// 手機 390×844、DPR 2。截圖存成 impl-*.png，與原型 C-*.png 對照；檢查結果寫進 impl-checks.json。
// 檢查（票面 verify）：沒動過的首頁只看得到三條路、播放、時間與月份日型、平日／假日、⋯更多，HUD ≤ 35%、點擊目標 ≥ 44px；
// ⋯更多翻面與各項功能；拖鏡頭、選區後回到全景出現、按了收起；搭乘到終點與下車的分享面板（只有複製連結）、
// 連結在新分頁回到那一站且暫停；找你的站；減少動態時沒有轉場時長；全程沒有 console 錯誤。
// swiftshader 一秒只有一兩格，等待都放得長。
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs");
const path = require("path");
const OUT = __dirname;
const BASE = "http://localhost:4199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = {};
const ok = (k, v) => {
  checks[k] = v;
  console.log(k, JSON.stringify(v));
};
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--proxy-bypass-list=<-loopback>"];
const VIEW = { viewport: { width: 390, height: 844 }, hasTouch: false, deviceScaleFactor: 2 };
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `impl-${name}.png`), timeout: 120000 });

/** 看得到的字（不含效能面板、隱藏的、給螢幕閱讀器的）。 */
const visibleText = (p) =>
  p.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest("[data-perf-panel], [hidden], script, style, #boot, .ride-sr, .scene-labels, .flabel, .slabel")) continue;
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

/** 看得到的按鈕：名字（aria-label 或字）與大小。 */
const visibleButtons = (p) =>
  p.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((b) => !b.closest("[data-perf-panel], [hidden]") && b.getBoundingClientRect().width > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { name: (b.getAttribute("aria-label") || b.textContent).trim(), w: Math.round(r.width), h: Math.round(r.height) };
      }),
  );

/** HUD 佔畫面高的比例：底座、膠囊、小卡（看得到的部分）的垂直聯集。 */
const hudPct = (p) =>
  p.evaluate(() => {
    const spans = [];
    for (const el of document.querySelectorAll(".scene-dock:not([hidden]), .home-recenter, .card, .ride-end, .ride-controls, .scene-notice")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      spans.push([Math.max(0, r.top), Math.min(innerHeight, r.bottom)]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let cur = null;
    for (const s of spans) {
      if (!cur || s[0] > cur[1]) {
        if (cur) total += cur[1] - cur[0];
        cur = [...s];
      } else cur[1] = Math.max(cur[1], s[1]);
    }
    if (cur) total += cur[1] - cur[0];
    return { pct: Math.round((total / innerHeight) * 1000) / 10, hScroll: document.scrollingElement.scrollWidth > innerWidth };
  });

const pill = (p) => p.locator(".home-recenter").count();
const cam = (p) => p.evaluate(() => document.querySelector(".scene-canvas canvas") !== null);

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

  // 1. 沒動過的首頁（開場自動播放）
  const page = watch(await ctx.newPage());
  await page.goto(`${BASE}/`);
  await page.waitForSelector(".deck-ride:not([disabled])", { timeout: 180000 });
  await sleep(4000);
  const homeButtons = await visibleButtons(page);
  const homeText = await visibleText(page);
  const forbidden = ["分享這一刻", "圖層", "1x", "2x", "靜態", "回到全景", "柱子越高人越多", "線寬", "光點", "少於 10 人"].filter((s) =>
    homeText.some((t) => t.includes(s)),
  );
  const tap = homeButtons.filter((b) => ["找你的站", "搭板南線", "更多"].includes(b.name.replace(/\s+/g, "")));
  ok("1-home", {
    buttons: homeButtons.map((b) => `${b.name} ${b.w}×${b.h}`),
    text: homeText,
    forbidden,
    pathsAtLeast44: tap.length === 3 && tap.every((b) => b.w >= 44 && b.h >= 44),
    hud: await hudPct(page),
    pill: await pill(page),
    canvas: await cam(page),
  });
  await shot(page, "1-home");

  // 2. ⋯更多：底座翻成清單；各項功能
  await page.click(".deck-more");
  await sleep(1500);
  const menuText = await visibleText(page);
  ok("2-more-open", {
    items: await page.$$eval(".deck-menu .mitem .label", (els) => els.map((e) => e.textContent)),
    timebarGone: (await page.locator(".timebar").count()) === 0,
    moreExpanded: await page.$eval(".deck-more", (b) => b.getAttribute("aria-expanded")),
    pathsStill: await page.$$eval(".deck-paths button", (bs) => bs.map((b) => b.textContent.trim())),
    about: menuText.some((t) => t.includes("關於")),
    ask: menuText.some((t) => t.includes("待你確認")),
    itemsAtLeast44: await page.$$eval(".deck-menu .mitem", (els) => els.every((e) => e.getBoundingClientRect().height >= 44)),
    hud: await hudPct(page),
  });
  await shot(page, "2-more");
  // 播放速度 1x → 2x → 1x
  const speed = page.locator(".mitem", { hasText: "播放速度" });
  await speed.click();
  await sleep(500);
  const s2 = await speed.textContent();
  await speed.click();
  await sleep(500);
  const s1 = await speed.textContent();
  // 靜態模式：開了停在 8 點、播放停下
  const still = page.locator(".mitem", { hasText: "靜態模式" });
  await still.click();
  await sleep(1500);
  const stillOn = { pressed: await still.getAttribute("aria-pressed"), val: (await still.textContent()).trim() };
  // 圖層：區名關掉 → 區名標籤消失；再打開
  await page.click('.mitem:has-text("圖層")');
  await sleep(800);
  const labelsBefore = await page.locator(".dlabel").count();
  const labelBox = page.locator(".layer-list label", { hasText: "區名" }).locator("input");
  await labelBox.uncheck();
  await sleep(1200);
  const labelsOff = await page.evaluate(() => [...document.querySelectorAll(".dlabel")].filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).opacity !== "0").length);
  await shot(page, "2b-more-layers");
  await labelBox.check();
  await page.click('.mitem:has-text("圖層")');
  // 怎麼看這張圖：文字圖例
  await page.click('.mitem:has-text("怎麼看這張圖")');
  await sleep(1200);
  const legendText = (await page.locator(".deck-menu .mbody").innerText()).replace(/\s+/g, " ");
  await shot(page, "2c-more-legend");
  await still.click();
  await sleep(800);
  ok("2-more-functions", { speed: [s2.trim(), s1.trim()], stillOn, stillOff: (await still.textContent()).trim(), labelsBefore, labelsOff, legendText });
  // 分享這一刻：分享面板只有複製連結
  await page.click('.mitem:has-text("分享這一刻")');
  await page.waitForSelector("dialog.share-panel[open]");
  await sleep(1000);
  ok("2-share-moment", {
    heading: await page.$eval("dialog.share-panel h2", (e) => e.textContent),
    actions: await page.$$eval("dialog.share-panel .share-actions button", (bs) => bs.map((b) => b.textContent.trim())),
    url: await page.$eval("dialog.share-panel input", (i) => i.value),
    menuClosed: (await page.locator(".deck-menu").count()) === 0,
  });
  await shot(page, "2d-share-moment");
  await page.click("dialog.share-panel .share-close");
  await sleep(800);
  // ⋯ 再按一次翻回
  await page.click(".deck-more");
  await sleep(800);
  await page.click(".deck-more");
  await sleep(800);
  ok("2-flip-back", { timebar: await page.locator(".timebar").count(), menu: await page.locator(".deck-menu").count() });
  await page.close();

  // 3. 回到全景：拖鏡頭後出現、按了飛回並收起；選一區後出現在小卡右上方
  const pr = watch(await ctx.newPage());
  await pr.goto(`${BASE}/?hour=8&day=weekday`);
  await pr.waitForSelector(".deck-ride:not([disabled])", { timeout: 180000 });
  await sleep(4000);
  const before = await pill(pr);
  await pr.mouse.move(195, 360);
  await pr.mouse.down();
  for (let k = 1; k <= 10; k++) await pr.mouse.move(195 + k * 8, 360 + k * 6);
  await pr.mouse.up();
  await sleep(3000);
  const afterDrag = await pill(pr);
  const pillBox = afterDrag ? await pr.$eval(".home-recenter", (b) => b.getBoundingClientRect().toJSON()) : null;
  const deckBox = await pr.$eval(".home-deck", (b) => b.getBoundingClientRect().toJSON());
  await shot(pr, "3-recenter-drag");
  await pr.click(".home-recenter");
  await sleep(4000);
  ok("3-recenter-drag", {
    before,
    afterDrag,
    pill: pillBox && { w: Math.round(pillBox.width), h: Math.round(pillBox.height), right: Math.round(390 - pillBox.right), gapToDeck: Math.round(deckBox.top - pillBox.bottom) },
    afterHome: await pill(pr),
  });
  // 選一區：點台地（盆地中間）
  let district = null;
  for (const [x, y] of [[200, 470], [180, 500], [230, 450], [160, 430]]) {
    await pr.mouse.click(x, y);
    await sleep(3000);
    district = await pr.$eval(".card[data-kind=district] h2", (e) => e.textContent).catch(() => null);
    if (district) break;
  }
  await sleep(3000);
  const pillCard = (await pill(pr)) ? await pr.$eval(".home-recenter", (b) => b.getBoundingClientRect().toJSON()) : null;
  const cardTop = await pr.$eval(".card", (c) => c.getBoundingClientRect().top).catch(() => null);
  await shot(pr, "4-recenter-district");
  if (pillCard) await pr.click(".home-recenter");
  await sleep(4000);
  ok("4-recenter-district", {
    district,
    pillAboveCard: pillCard && cardTop !== null ? Math.round(cardTop - pillCard.bottom) : null,
    afterHomePill: await pill(pr),
    cardStillOpen: (await pr.locator(".card[data-kind=district]").count()) === 1,
  });
  await pr.close();

  // 4. 找你的站：搜尋面板 → 西門 → 車站卡（一句答案、上滑看完整、可查通勤）
  const pf = watch(await ctx.newPage());
  await pf.goto(`${BASE}/?hour=8&day=weekday`);
  await pf.waitForSelector(".deck-find:not([disabled])", { timeout: 180000 });
  await sleep(3000);
  await pf.click(".deck-find");
  await pf.waitForSelector(".find-sheet");
  await sleep(1200);
  ok("5-find-sheet", { deckHidden: await pf.$eval(".home-deck", (d) => d.hidden), title: await pf.$eval(".find-sheet h2", (e) => e.textContent) });
  await shot(pf, "5-find-sheet");
  await pf.fill(".find-sheet .find-input input", "西門");
  await pf.click('.find-item:has(.find-name:text-is("西門"))');
  await pf.waitForSelector(".card[data-kind=station]");
  await sleep(5000);
  const answer = await pf.$eval(".card[data-kind=station] .card-answer", (e) => e.textContent).catch(() => null);
  await shot(pf, "6-station-card");
  await pf.click(".card-grip");
  await sleep(2000);
  ok("6-station-card", {
    answer,
    sheet: await pf.$eval(".card[data-kind=station]", (c) => c.dataset.sheet),
    commute: (await pf.locator(".card[data-kind=station] button", { hasText: "通勤" }).count()) > 0,
    pill: await pill(pf),
  });
  await shot(pf, "6b-station-card-full");
  await pf.close();
  await ctx.close();

  // 5. 減少動態：轉場時長歸零；搭板南線一站一站跳到終點 → 分享；下車 → 小卡 → 分享面板；連結新分頁回到那一站、暫停中
  const rctx = await browser.newContext({ ...VIEW, reducedMotion: "reduce" });
  const pm = watch(await rctx.newPage());
  await pm.goto(`${BASE}/`);
  await pm.waitForSelector(".deck-ride:not([disabled])", { timeout: 180000 });
  await sleep(3000);
  const durs = await pm.evaluate(() => {
    const d = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).transitionDuration : null;
    };
    return { face: d(".deck-face"), ride: d(".deck-ride"), playing: document.querySelector(".timebar .play")?.getAttribute("aria-label") };
  });
  await pm.click(".deck-more");
  await sleep(500);
  const menuDur = await pm.$eval(".deck-face", (e) => getComputedStyle(e).transitionDuration);
  await pm.click(".deck-more");
  ok("7-reduced-motion", { ...durs, menuFace: menuDur });
  await shot(pm, "7-reduced-motion-home");
  await pm.click(".deck-ride");
  await pm.waitForSelector(".ride-controls", { timeout: 60000 });
  await sleep(2000);
  let terminal = null;
  for (let k = 0; k < 40; k++) {
    const hasShare = await pm.locator(".ride-controls .ride-btn", { hasText: "分享" }).count();
    if (hasShare) {
      terminal = new URLSearchParams(await pm.evaluate(() => location.search)).get("station");
      break;
    }
    await pm.locator(".ride-controls .ride-btn", { hasText: "下一站" }).click();
    await sleep(900);
  }
  await sleep(1500);
  ok("8-terminal", {
    station: terminal,
    buttons: await pm.$$eval(".ride-controls .ride-btn", (bs) => bs.map((b) => `${b.textContent.trim()} ${Math.round(b.getBoundingClientRect().width)}×${Math.round(b.getBoundingClientRect().height)}`)),
    card: await pm.$eval(".card[data-kind=station] h2", (e) => e.textContent).catch(() => null),
  });
  await shot(pm, "8-ride-terminal-share");
  await pm.locator(".ride-controls .ride-btn", { hasText: "分享" }).click();
  await pm.waitForSelector("dialog.share-panel[open]");
  await sleep(800);
  ok("8-terminal-share", {
    heading: await pm.$eval("dialog.share-panel h2", (e) => e.textContent),
    actions: await pm.$$eval("dialog.share-panel .share-actions button", (bs) => bs.map((b) => b.textContent.trim())),
    url: await pm.$eval("dialog.share-panel input", (i) => i.value),
  });
  await pm.click("dialog.share-panel .share-close");
  await sleep(800);
  // 往回搭兩站再下車
  await pm.locator(".ride-controls .ride-btn", { hasText: "下一站" }).click();
  await sleep(900);
  await pm.locator(".ride-controls .ride-btn", { hasText: "下一站" }).click();
  await sleep(900);
  await pm.locator(".ride-controls .ride-btn", { hasText: "下車" }).click();
  await pm.waitForSelector(".ride-end");
  await sleep(1500);
  ok("9-ride-end", {
    text: await pm.$eval(".ride-end", (e) => e.innerText.replace(/\s+/g, " ")),
    buttons: await pm.$$eval(".ride-end button", (bs) => bs.map((b) => `${b.textContent.trim()} ${Math.round(b.getBoundingClientRect().height)}`)),
    controls: await pm.locator(".ride-controls").count(),
    hud: await hudPct(pm),
  });
  await shot(pm, "9-ride-end");
  await pm.click(".ride-end-share");
  await pm.waitForSelector("dialog.share-panel[open]");
  await sleep(800);
  const link = await pm.$eval("dialog.share-panel input", (i) => i.value);
  ok("9-ride-end-share", {
    heading: await pm.$eval("dialog.share-panel h2", (e) => e.textContent),
    actions: await pm.$$eval("dialog.share-panel .share-actions button", (bs) => bs.map((b) => b.textContent.trim())),
    link,
  });
  await shot(pm, "9b-ride-end-share");
  // 新分頁打開這個連結：回到同一站、暫停中、車站卡開著
  const pn = watch(await rctx.newPage());
  await pn.goto(link);
  await pn.waitForSelector(".ride-controls", { timeout: 180000 });
  await pn.waitForSelector(".card[data-kind=station]");
  await sleep(8000);
  ok("10-link-reopened", {
    station: new URLSearchParams(await pn.evaluate(() => location.search)).get("station"),
    linkStation: new URL(link).searchParams.get("station"),
    card: await pn.$eval(".card[data-kind=station] h2", (e) => e.textContent),
    pauseButton: await pn.$eval(".ride-controls .ride-btn", (b) => b.textContent.trim()),
  });
  await shot(pn, "10-link-reopened-paused");
  await pn.close();
  // 回到首頁
  await pm.click("dialog.share-panel .share-close");
  await sleep(500);
  await pm.click(".ride-end-home");
  await sleep(3000);
  ok("11-back-home", { deck: await pm.locator(".home-deck").count(), ride: await pm.locator(".ride-controls, .ride-end").count(), url: await pm.evaluate(() => location.search), pill: await pill(pm) });
  await shot(pm, "11-back-home");
  await pm.close();
  await rctx.close();

  ok("errors", errors);
  fs.writeFileSync(path.join(OUT, "impl-checks.json"), JSON.stringify(checks, null, 2) + "\n");
  await browser.close();
})().catch((e) => {
  console.error(e);
  fs.writeFileSync(path.join(OUT, "impl-checks.json"), JSON.stringify({ ...checks, crash: String(e) }, null, 2) + "\n");
  process.exit(1);
});
