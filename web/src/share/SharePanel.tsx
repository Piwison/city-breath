// 分享面板（3.15；產品計畫 v2 決定 17、體驗原則 6）：按分享先開面板，不直接叫系統分享。
// 面板有卡片預覽、「存成圖片」（只有給了 image 的卡：行政區卡 3.16、通勤卡 4.2、活動卡 7.7）與「複製連結」（複製後「已複製」）。
// 車站卡與「分享這一刻」只有複製連結（Piwi 2026-11-11：不做車站卡分享圖）。
// 連結一律由 state/url.ts 的 shareLink() 依畫面狀態產生（AD-16）；圖由 render.ts 依資料重畫（AD-17）。
//
// 接口（3.16、4.2、7.7 只要給 image）：
//   <ShareAction target={() => ({ kicker, title, when, summary, image?: (url) => ShareCard })} />   卡框標題列的分享鈕
//   <SharePanel open target onClose />                                                          面板本體
//
// 用原生 <dialog>.showModal()：焦點圈在面板裡、Esc 關、背景不可點，都是瀏覽器給的。Esc 只關面板、不關卡片
// （CardFrame 看 defaultPrevented）。進場往上 16px＋淡入（--dur-enter，減少動態時歸零＝直接出現）。
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { shareLink, siteLabel } from "../state/url";
import { commuteReady, getView, setPlaying, type ViewState } from "../state/view";
import { track } from "../track";
import type { ShareCard } from "./card";
import { renderShareCard, saveShareCard } from "./render";
import "./share.css";

export interface ShareTarget {
  /** 小字：分享的是哪一種（「行政區」「車站」「全城」） */
  kicker: string;
  title: string;
  /** 正在看的時段與日型（「假日 14 點」） */
  when: string;
  /** 預覽的一句話（卡片第一行的答案；分享這一刻是「平日 14 點的台北捷運」） */
  summary: string;
  /** 有圖可存的卡：依分享連結產生分享卡資料。沒有＝只有複製連結 */
  image?: (url: string) => ShareCard;
}

/** 分享的圖示：方框加往上的箭頭（iOS 與 Android 都認得的分享符號）。 */
export function ShareIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.8v8.4M4.9 4.7 8 1.6l3.1 3.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.3 7H4a1.2 1.2 0 0 0-1.2 1.2v5A1.2 1.2 0 0 0 4 14.4h8a1.2 1.2 0 0 0 1.2-1.2v-5A1.2 1.2 0 0 0 12 7h-1.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** 複製文字：先用 Clipboard API，不行就選取輸入框用 execCommand（舊 Safari、非安全來源）。 */
export async function copyText(text: string, field?: HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 權限被拒：改用選取
  }
  try {
    if (!field) return false;
    field.focus();
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/**
 * 複製連結時開著的是哪一種卡（AD-20 share_link_copied 的 kind）；沒開卡＝home。
 * 通勤卡（4.2）蓋在車站卡上面，所以先看通勤。大日子等之後的票加進 ViewState 後在這裡接。
 */
export function copiedKind(
  v: Pick<ViewState, "station" | "district"> & Partial<Pick<ViewState, "commute">>,
): "commute" | "station" | "district" | "home" {
  if (commuteReady(v.commute ?? null)) return "commute";
  if (v.station !== null) return "station";
  if (v.district !== null) return "district";
  return "home";
}

/**
 * 存成圖片並計數（AD-20，北極星的一半）：存檔或系統分享成功才送 share_card_downloaded（kind＝卡的種類），
 * 使用者在系統分享面板取消、或產生失敗（丟錯）不送。save 可替換（測試用）。
 */
export async function saveAndCount(
  card: ShareCard,
  blob: Blob,
  save: (card: ShareCard, blob: Blob) => Promise<"shared" | "downloaded" | "cancelled"> = saveShareCard,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const result = await save(card, blob);
  if (result !== "cancelled") track("share_card_downloaded", { kind: card.kind });
  return result;
}

/** 「已複製」維持多久再回到「複製連結」（按鈕狀態，不是提示）。 */
export const COPIED_MS = 2400;

type ImageState = { status: "idle" } | { status: "busy" } | { status: "ready"; card: ShareCard; blob: Blob; src: string } | { status: "error" };

export function SharePanel({ open, target, onClose }: { open: boolean; target: ShareTarget; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [url, setUrl] = useState("");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const [image, setImage] = useState<ImageState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const make = target.image;

  // 打開：停在這一刻（分享這一刻在播放中按也一樣）、取連結、開 dialog；有圖的卡依資料畫預覽
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    setPlaying(false);
    const link = shareLink(getView());
    setUrl(link);
    setCopy("idle");
    if (!el.open) el.showModal?.();
    if (!make) return;
    let alive = true;
    let src = "";
    setImage({ status: "busy" });
    const card = make(link);
    renderShareCard(card).then(
      (blob) => {
        if (!alive) return;
        src = URL.createObjectURL(blob);
        setImage({ status: "ready", card, blob, src });
      },
      () => alive && setImage({ status: "error" }),
    );
    return () => {
      alive = false;
      if (src) URL.revokeObjectURL(src);
    };
  }, [open, make]);

  useEffect(() => {
    const el = ref.current;
    if (!open && el?.open) el.close();
  }, [open]);

  useEffect(() => {
    if (copy !== "copied") return;
    const t = setTimeout(() => setCopy("idle"), COPIED_MS);
    return () => clearTimeout(t);
  }, [copy]);

  const onCopy = async () => {
    const ok = await copyText(url, field.current);
    setCopy(ok ? "copied" : "failed");
    // 計數（AD-20，北極星的一半）：複製成功才算；kind 是開著的卡，不帶站或區
    if (ok) track("share_link_copied", { kind: copiedKind(getView()) });
  };
  const onSave = async () => {
    if (image.status !== "ready") return;
    setSaving(true);
    try {
      await saveAndCount(image.card, image.blob);
    } catch {
      // 存檔失敗：按鈕回到可按，預覽還在，可以再試或改複製連結
    } finally {
      setSaving(false);
    }
  };

  let preview: ReactNode;
  if (!make) {
    preview = (
      <div className="share-preview-text">
        <span className="share-kicker">{target.kicker}</span>
        <strong className="share-title">{target.title}</strong>
        <span className="share-when">{target.when}</span>
        <p>{target.summary}</p>
        <span className="share-site">{url ? siteLabel(url) : ""}</span>
      </div>
    );
  } else if (image.status === "ready") {
    preview = <img className="share-preview-img" src={image.src} alt={`${target.title}的分享圖：${target.summary}`} />;
  } else {
    preview = (
      <p className="share-preview-wait" role={image.status === "error" ? "alert" : undefined}>
        {image.status === "error" ? "圖片產生失敗，仍可複製連結" : "產生圖片中…"}
      </p>
    );
  }

  // 掛在 body：不在卡片裡（卡片的拖曳手勢與點擊攔截不會吃到面板的事件）
  return createPortal(
    <dialog
      ref={ref}
      className="hud share-panel"
      aria-labelledby={titleId}
      onClose={onClose}
      // portal 的 React 事件仍會冒泡回卡框：擋下指標事件，免得在面板裡捲動或拖動時拉動後面的卡片
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        // Esc 只關面板：不讓卡框（CardFrame 聽 window 的 keydown）跟著關卡
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      // 點面板外（::backdrop）關閉
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
          if (!inside) onClose();
        }
      }}
    >
      {open && (
        <>
          <header className="share-head">
            <h2 id={titleId}>{target.kicker === "全城" ? "分享這一刻" : "分享這張卡"}</h2>
            <button type="button" className="share-close" aria-label="關閉分享" onClick={onClose}>
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className="share-preview">{preview}</div>
          <label className="share-url">
            <span>連結（打開回到同一個畫面、同一時段）</span>
            <input ref={field} type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <div className="share-actions">
            {make && (
              <button type="button" className="share-btn" onClick={onSave} disabled={image.status !== "ready" || saving} aria-busy={saving}>
                {saving ? "產生圖片中…" : "存成圖片"}
              </button>
            )}
            <button type="button" className="share-btn share-btn-main" data-state={copy} onClick={onCopy}>
              {copy === "copied" ? (
                <>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  已複製
                </>
              ) : (
                "複製連結"
              )}
            </button>
          </div>
          <p className="share-status" role="status" aria-live="polite">
            {copy === "copied" ? "已複製連結" : copy === "failed" ? "沒辦法自動複製，請長按上面的網址複製" : ""}
          </p>
        </>
      )}
    </dialog>,
    document.body,
  );
}

/** 卡框標題列（CardFrame actions 槽）的分享鈕：按了開分享面板。target 在按下時才組（取當下的時段與答案）。 */
export function ShareAction({ target }: { target: () => ShareTarget }) {
  const [current, setCurrent] = useState<ShareTarget | null>(null);
  return (
    <>
      <button type="button" className="card-share" aria-label="分享" title="分享" aria-haspopup="dialog" onClick={() => setCurrent(target())}>
        <ShareIcon />
      </button>
      {current && <SharePanel open target={current} onClose={() => setCurrent(null)} />}
    </>
  );
}
