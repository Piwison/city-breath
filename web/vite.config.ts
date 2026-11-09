import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // css: true 讓測試能以 ?raw 讀到 CSS 原文（tokens.test.ts 檢查色票）
  test: { environment: "node", css: true },
});
