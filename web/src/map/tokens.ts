// deck.gl 需要 RGB 陣列；顏色一律從 CSS token 讀，不在程式裡寫死（hallmark Floor 1）。
const canvas = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null;

export function tokenRgb(name: string): [number, number, number] {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!canvas || !raw) return [128, 128, 128];
  canvas.fillStyle = "#000";
  canvas.fillStyle = raw; // 讓瀏覽器把 oklch()、hex 等格式轉成 rgb
  canvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}
