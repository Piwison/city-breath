// 8.7 搭乘畫面打磨（第一階段）：同一段路、同一個時刻，base（8.6 原樣）、a 細軌、b 月台各拍三個位置＋全景。
// node compare.cjs <style> [outDir] [base]；先 `npx vite preview --port 4199`（main 的建置可另開一個 port 當 base 對照）。
// style＝base|a|b（網址 ?ridestyle=）；檔名前綴用 --prefix=xxx 改（例：main 的建置拍成 main-*）。
// 位置與 8.6 design/reviews/8.6-ride-bannan/ 的 02、09、03 相同：
//   02＝首頁按「搭板南線」從頂埔出發（鏡頭飛下來 1.2 秒後走約 1.8 秒）；
//   09＝台北車站停靠中（連結打開、暫停）按繼續，往善導寺走約 1.7 秒，17 點；
//   03＝從頂埔出發一路到永寧停靠、車站卡摘要高度。
// swiftshader 一秒只有一兩格，所以用 Playwright 的假時鐘：每次快轉 100 毫秒、畫一格（搭乘時鐘每格最多走 0.1 秒），三個版本的位置完全相同。
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const STYLE = process.argv[2] || "a";
const OUT = process.argv[3] || __dirname;
const BASE = process.argv[4] || "http://localhost:4199";
const PREFIX = (process.argv.find((a) => a.startsWith("--prefix=")) || "").slice(9) || STYLE;
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--proxy-bypass-list=<-loopback>"];
const VIEW = { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 };
const q = (s) => `${s}&ridestyle=${STYLE}`;

/** 假時鐘往前 n 格（每格 100 毫秒，各觸發一次 requestAnimationFrame），每格之間讓瀏覽器真的畫出來。 */
async function frames(page, n) {
  for (let k = 0; k < n; k++) {
    await page.clock.fastForward(100);
    await sleep(40);
  }
}

/** 假時鐘停著時 page.screenshot 會等頁面的 requestAnimationFrame（也被假了），所以直接用 CDP 拍。 */
async function shot(page, file) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
  await cdp.detach();
}

async function open(browser, url, opts = {}) {
  const ctx = await browser.newContext({ ...VIEW, ...opts });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180000);
  page.on("pageerror", (e) => console.error("pageerror", String(e)));
  await page.clock.install();
  await page.goto(url);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch({ args: GL });
  const log = {};

  // 全景（沒搭乘）：減少動態＝不自動播放、雲不動，畫面靜止，拿來比對和 main 相同
  {
    const { ctx, page } = await open(browser, `${BASE}/?${q("hour=10&day=weekday")}`, { reducedMotion: "reduce" });
    await page.waitForSelector(".deck-ride:not([disabled])", { timeout: 120000 });
    await sleep(6000);
    await shot(page, path.join(OUT, `${PREFIX}-overview.png`));
    await ctx.close();
  }

  // 02：從頂埔出發
  {
    const { ctx, page } = await open(browser, `${BASE}/?${q("hour=10&day=weekday")}`);
    await page.waitForSelector(".deck-ride:not([disabled])", { timeout: 120000 });
    await sleep(3000);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await page.click(".deck-ride");
    // 鏡頭飛下來 1.2 秒（holdRide）＋走約 1.8 秒
    await frames(page, 30);
    await sleep(500);
    await shot(page, path.join(OUT, `${PREFIX}-02.png`));
    log["02"] = await page.evaluate(() => location.search);
    // 03：繼續走到永寧停靠、開卡
    for (let k = 0; k < 400; k++) {
      await frames(page, 1);
      if (await page.$(".card[data-kind=station]")) break;
    }
    await frames(page, 3);
    await sleep(1500);
    await shot(page, path.join(OUT, `${PREFIX}-03.png`));
    log["03"] = await page.evaluate(() => location.search);
    await ctx.close();
  }

  // 09：台北車站往東
  {
    const { ctx, page } = await open(browser, `${BASE}/?${q("hour=17&day=weekday&station=s560caae9&ride=BL")}`);
    await page.waitForSelector(".ride-controls", { timeout: 120000 });
    await page.waitForSelector(".card[data-kind=station]");
    await sleep(3000);
    const now = await page.evaluate(() => Date.now());
    await page.clock.pauseAt(now + 1000);
    await frames(page, 2);
    await page.click(".ride-btn >> nth=0");
    await frames(page, 17);
    await sleep(1500);
    await shot(page, path.join(OUT, `${PREFIX}-09.png`));
    log["09"] = await page.evaluate(() => location.search);
    await ctx.close();
  }
  await browser.close();
  console.log(STYLE, JSON.stringify(log));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
