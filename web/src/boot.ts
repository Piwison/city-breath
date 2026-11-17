// 品牌載入畫面（6.2）的進度與收場。標記在 index.html 的 #boot，樣式在 styles/app.css（首包）。
// 進度＝首頁要等的幾件事（月份、底圖、三個首頁資料檔、場景分包）完成了幾件；只寫 DOM，不經 React。
// 收場：場景畫出第一格（或不支援 WebGL、載入失敗）時 bootDone()；淡出只動 opacity（--dur-boot），
// 減少動態時直接移除（AD-8）。

let done = 0;
let total = 0;
let finished = false;

function render() {
  const root = document.getElementById("boot");
  if (!root || total === 0) return;
  const p = done / total;
  const pct = Math.round(p * 100);
  const bar = root.querySelector<HTMLElement>(".boot-bar");
  // 至少留一點亮，表示已經開始
  if (bar) bar.style.transform = `scaleX(${Math.max(0.04, p)})`;
  root.querySelector(".boot-progress")?.setAttribute("aria-valuenow", String(pct));
  const label = root.querySelector(".boot-label");
  if (label) label.textContent = `載入中 ${pct}%`;
}

/** 把一件要等的事算進進度（成功或失敗都算完成；失敗的訊息由畫面自己處理）。回傳同一個 promise。 */
export function bootStep<T>(p: Promise<T>): Promise<T> {
  total += 1;
  const tick = () => {
    done += 1;
    render();
  };
  p.then(tick, tick);
  render();
  return p;
}

/** 收起載入畫面、接場景。可重複呼叫，只有第一次有作用。 */
export function bootDone(): void {
  if (finished || typeof document === "undefined") return;
  finished = true;
  const root = document.getElementById("boot");
  if (!root) return;
  const remove = () => root.remove();
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    remove();
    return;
  }
  // 只認自己的 opacity（進度條的 transform 轉場也會冒泡上來）
  root.addEventListener("transitionend", (e) => {
    if (e.target === root && e.propertyName === "opacity") remove();
  });
  // 分頁在背景時不會有 transitionend：時間到就直接移除
  setTimeout(remove, 1500);
  root.dataset.state = "out";
}
