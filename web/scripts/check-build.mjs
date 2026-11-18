// 建置後檢查（3.15，`npm run build` 的最後一步，CI 也跑）：
// - dist/index.html 有連結預覽標籤（og:title「城市呼吸｜上個月的台北捷運」、og:description、og:image、twitter:card）與網站圖示，
//   而且 %SITE_URL% 這類佔位字都換掉了（AD-18）；
// - 預覽圖、網站圖示、自帶字型與授權檔都在 dist/；
// - 建置產物沒有向外部網址載入字型（AD-1）：CSS 的 @font-face 與 url() 只指向站內路徑，也沒有常見字型 CDN 的網址；
// - 6.2：品牌載入畫面的網站名、一句話與進度在 index.html 裡、首包不含 three、首頁資料 ≤ 300 KB、robots.txt 在；
// - 6.4：效能面板（?debug=perf）在自己的分包，不在首包與場景分包。
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const problems = [];
const html = await readFile(join(dist, "index.html"), "utf8");

const meta = (attr, key) => new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];
const expect = (ok, msg) => ok || problems.push(msg);

expect(meta("property", "og:title") === "城市呼吸｜上個月的台北捷運", "og:title 不是「城市呼吸｜上個月的台北捷運」");
expect(!!meta("property", "og:description"), "沒有 og:description");
expect(/\/og\.png$/.test(meta("property", "og:image") ?? ""), "og:image 沒有指向 og.png");
expect(meta("name", "twitter:card") === "summary_large_image", "twitter:card 不是 summary_large_image");
expect(/<link rel="icon" href="\/favicon\.svg"/.test(html), "沒有 favicon");
expect(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(html), "沒有 apple-touch-icon");
expect(!/%[A-Z_]+%/.test(html), "index.html 還有沒換掉的 %佔位字%");

// 品牌載入畫面（6.2）：網站名與一句話逐字寫在 index.html 本身，不等任何 JS；進度條也在
expect(/<h1 class="boot-name">城市呼吸<\/h1>/.test(html), "index.html 的載入畫面沒有網站名「城市呼吸」");
expect(/<p class="boot-line">台北捷運的一天：每小時誰去了哪<\/p>/.test(html), "index.html 的載入畫面沒有一句話「台北捷運的一天：每小時誰去了哪」");
expect(/role="progressbar"/.test(html), "index.html 的載入畫面沒有進度");
// 首包不含 three：index.html 直接載入的 JS 不能有 three 的程式（AD-6，場景另外分包）
for (const m of html.matchAll(/<script[^>]+src="\/(assets\/[^"]+\.js)"/g)) {
  const js = await readFile(join(dist, m[1]), "utf8");
  expect(!/WebGLRenderer|THREE\.WebGLRenderer|REVISION\s*=\s*["']\d+/.test(js), `首包 ${m[1]} 含有 three`);
}

// 6.4 效能面板（?debug=perf）：面板程式（標記 data-perf-panel）在自己的分包，首包與場景分包（ScenePage-*.js）都沒有，
// 不帶參數時不會下載也不會執行
{
  const entries = [...html.matchAll(/<script[^>]+src="\/assets\/([^"]+\.js)"/g)].map((m) => m[1]);
  const assets = (await readdir(join(dist, "assets"))).filter((f) => f.endsWith(".js"));
  const withPanel = [];
  for (const f of assets) if ((await readFile(join(dist, "assets", f), "utf8")).includes("data-perf-panel")) withPanel.push(f);
  expect(withPanel.length > 0, "建置產物裡找不到效能面板的分包（data-perf-panel）");
  for (const f of withPanel) {
    expect(!entries.includes(f), `首包 ${f} 含有效能面板的程式`);
    expect(!/^ScenePage-/.test(f), `場景分包 ${f} 含有效能面板的程式（要動態載入）`);
  }
  expect(assets.some((f) => /^ScenePage-/.test(f)), "找不到場景分包 ScenePage-*.js（分包命名變了，請更新這個檢查）");
  if (withPanel.length) console.log(`效能面板分包：${withPanel.join("、")}`);
}

// 首頁資料量上限 300 KB（決定 29、AD-6）：最新月份的 stations、districts、district-flows 合計
{
  const { latest } = JSON.parse(await readFile(join(dist, "data/months.json"), "utf8"));
  let bytes = 0;
  for (const f of ["stations.json", "districts.json", "district-flows.json"]) bytes += (await stat(join(dist, "data", latest, f))).size;
  expect(bytes <= 300_000, `首頁資料 ${latest} 合計 ${bytes} bytes，超過 300 KB`);
  console.log(`首頁資料 ${latest}：${bytes.toLocaleString("en-US")} bytes（上限 300,000）`);
}

for (const f of ["robots.txt", "og.png", "favicon.svg", "apple-touch-icon.png", "fonts/manrope-num-400.woff2", "fonts/manrope-num-700.woff2", "fonts/OFL.txt"]) {
  try {
    const s = await stat(join(dist, f));
    expect(s.size > 0, `${f} 是空的`);
  } catch {
    problems.push(`dist/ 沒有 ${f}`);
  }
}

const FONT_CDN = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net|cdn\.jsdelivr\.net\/npm\/@fontsource/;
async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}
for await (const file of walk(dist)) {
  const ext = extname(file);
  if (![".css", ".js", ".html"].includes(ext)) continue;
  const text = await readFile(file, "utf8");
  if (FONT_CDN.test(text)) problems.push(`${file} 有外部字型網址`);
  if (ext === ".css") {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (/^(https?:)?\/\//.test(m[1])) problems.push(`${file} 從外部網址載入：${m[1]}`);
    }
  }
}

if (problems.length) {
  console.error(`建置檢查失敗：\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("建置檢查通過：連結預覽標籤、預覽圖、網站圖示、自帶字型、品牌載入畫面、robots.txt 都在，首包不含 three，沒有外部字型網址");
