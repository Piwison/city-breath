// 網站圖示與連結預覽圖（brand-preview.html，只在開發時用，不進 build；3.15）：
// 用 mark.ts 的圖示與 render.ts 的連結預覽版型畫出三個檔，交給 scripts/brand-assets.mjs 寫進 public/。
import "../styles/app.css";
import { markSvg } from "./mark";
import { renderLinkPreview } from "./render";

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.readAsDataURL(blob);
  });

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖示載入失敗"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function png(img: HTMLImageElement, size: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

async function build() {
  const favicon = markSvg();
  // apple-touch-icon：系統會自己裁圓角，方塊不留圓角
  const touch = await loadSvg(markSvg(undefined, { rounded: false }));
  const og = await renderLinkPreview(await loadSvg(favicon));
  return { favicon, appleTouchIcon: await png(touch, 180), og: await blobToDataUrl(og) };
}

const done = build();
(window as unknown as { __brand: typeof done }).__brand = done;

done.then(
  (b) => {
    const root = document.getElementById("root")!;
    for (const [src, label, w] of [
      [b.og, "連結預覽圖 1200×630", 600],
      [b.appleTouchIcon, "apple-touch-icon 180×180", 180],
      [`data:image/svg+xml;charset=utf-8,${encodeURIComponent(b.favicon)}`, "favicon.svg", 64],
    ] as const) {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = src;
      img.alt = label;
      img.width = w;
      const cap = document.createElement("figcaption");
      cap.textContent = label;
      fig.append(img, cap);
      root.append(fig);
    }
  },
  (e: Error) => {
    document.getElementById("root")!.textContent = e.message;
  },
);
