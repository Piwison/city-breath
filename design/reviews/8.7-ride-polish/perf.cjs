// 8.7：?debug=perf 搭乘中的 fps，三個造型輪流各量一次（swiftshader 只能比相對值）。node perf.cjs [base]
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://localhost:4199";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--proxy-bypass-list=<-loopback>"];
(async () => {
  const browser = await chromium.launch({ args: GL });
  const out = {};
  for (const round of [1, 2])
    for (const style of ["base", "a", "b"]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
      const p = await ctx.newPage();
      p.setDefaultTimeout(180000);
      await p.goto(`${BASE}/?hour=8&day=weekday&debug=perf&ridestyle=${style}`);
      await p.waitForSelector(".deck-ride:not([disabled])", { timeout: 120000 });
      await sleep(3000);
      await p.click(".deck-ride");
      const samples = [];
      for (let k = 0; k < 6; k++) {
        await sleep(4000);
        const t = await p.$eval("[data-perf-panel]", (e) => e.textContent);
        const m = t.match(/(\d+(?:\.\d+)?)\s*fps/);
        if (m && k > 0) samples.push(Number(m[1]));
      }
      (out[style] ??= []).push(...samples);
      await ctx.close();
    }
  for (const [k, v] of Object.entries(out)) console.log(k, (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), "fps", JSON.stringify(v));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
