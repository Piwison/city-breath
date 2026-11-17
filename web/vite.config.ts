import { readFileSync } from "node:fs";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * index.html 的連結預覽標籤（AD-18、決定 20）：Open Graph 要絕對網址，建置時把 %SITE_URL% 換成 VITE_SITE_URL
 * （去掉結尾斜線；沒設時是空字串＝相對路徑）。這是網址唯一不經 state/url.ts 的地方，只用在預覽標籤。
 * %THEME_COLOR% 換成 tokens.css 的白天頁面底色（--sky-horizon-day，與 --page-bg 白天相同），不在 HTML 寫色碼。
 */
function previewTags(siteUrl: string): Plugin {
  const tokens = readFileSync(new URL("./src/styles/tokens.css", import.meta.url), "utf8");
  const theme = /--sky-horizon-day:\s*([^;]+);/.exec(tokens)?.[1].trim();
  if (!theme) throw new Error("tokens.css 沒有 --sky-horizon-day");
  return {
    name: "city-breath-preview-tags",
    transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl.replace(/\/+$/, "")).replaceAll("%THEME_COLOR%", theme),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [react(), previewTags(env.VITE_SITE_URL ?? process.env.VITE_SITE_URL ?? "")],
    // css: true 讓測試能以 ?raw 讀到 CSS 原文（tokens.test.ts 檢查色票）
    test: { environment: "node", css: true },
  };
});
