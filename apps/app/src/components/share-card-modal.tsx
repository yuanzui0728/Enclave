import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { PUBLIC_SHARE_ORIGIN } from "../lib/share-url";
import {
  isNativeMobileBridgeAvailable,
  shareFileWithNativeShell,
} from "../runtime/mobile-bridge";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

// qrcode (~70KB) + html-to-image (~30KB) 是分享卡片专用的重依赖。
// 静态 import 会让它们被 vendor-misc chunk 吃掉，模块预加载链路一并拉，公网
// 隧道下首屏多 ~100KB / ~1 个 RTT，但实际上大多数会话不会触发分享卡片。
// 改用动态 import，模块第一次需要时才拉，且浏览器后续命中 HTTP/SW 缓存。

const t = translateRuntimeMessage;

// 水印里的 QR 与文案都指向 site 主域名。
const SITE_URL = PUBLIC_SHARE_ORIGIN;
const SITE_HOST = SITE_URL.replace(/^https?:\/\//i, "").replace(/\/$/, "");

// QR 是 site URL 编码出来的 data URL，整个 app 生命周期都不变。
// 第一次生成后挂在模块作用域，后续 modal 打开直接读 — 不再每次重新生成。
let qrPromise: Promise<string | null> | null = null;
function getQrDataUrl(): Promise<string | null> {
  if (!qrPromise) {
    qrPromise = (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        return await QRCode.toDataURL(SITE_URL, {
          margin: 1,
          width: 128,
          errorCorrectionLevel: "M",
        });
      } catch {
        return null;
      }
    })();
  }
  return qrPromise;
}

/**
 * 等一张 <img> 加载完成（或失败 / 超时），永远 resolve 不 reject。
 * 不带超时 promise 在 data URL 异常时可能永远 hang。
 */
function waitImgSettled(img: HTMLImageElement, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      img.removeEventListener("load", finish);
      img.removeEventListener("error", finish);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", finish, { once: true });
  });
}

async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type Props = {
  /**
   * 当前要导出的卡片 id；null 时整个 modal 隐藏。
   * 用 id 而不是对象 — 父组件每次 render 都重新 find()，对象 ref 会变。
   */
  cardKey: string | null;
  /** 离屏容器里渲染的卡片内容；常见做法是传一个微信卡片或自定义动态卡 */
  children: ReactNode;
  /** 水印中间的两行文字，例如 "{name} 的 AI 朋友圈" */
  watermarkSubtitle: string;
  /** 模态标题（顶栏），如 "分享我的朋友圈" */
  modalTitle: string;
  /** 底部小贴士文案 */
  bottomHint: string;
  /** 下载文件名前缀（拼上 cardKey） */
  filenamePrefix: string;
  onClose: () => void;
};

/**
 * 通用「分享图卡」模态：
 * 1. 离屏渲染 children → html-to-image 截图为 PNG
 * 2. 顶部：标题 + 关闭
 * 3. 中部：预览图（生成中显示 loading）
 * 4. 底部：保存 / 分享按钮（移动端走 Web Share API，桌面 download）
 *
 * children 应该是一段 self-contained 的卡片 JSX，会被放进白底 480px 容器里。
 */
export function ShareCardModal({
  cardKey,
  children,
  watermarkSubtitle,
  modalTitle,
  bottomHint,
  filenamePrefix,
  onClose,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qr, setQr] = useState<string | null>(null);
  // qrReady 与 qr 分开 — 失败时 qr 仍是 null 但 qrReady=true 表示"已经定下来了"。
  // 截图等 qrReady 后再开始，避免先无 QR 截一次、QR 到了再重截一次。
  const [qrReady, setQrReady] = useState(false);
  const [pngDataUrl, setPngDataUrl] = useState<string | null>(null);
  // 区分两类失败：
  //   - generationError：截图阶段失败，没有图可看，需要用大块红字占据预览区
  //   - saveError：导出已成功、保存/分享时挂了，必须保留图片可见，用户才能
  //     按文案「长按图片手动保存」走兜底路径。之前共用一个 error state →
  //     保存失败时把图片替换成红字，文案让用户去长按图片但图片已经没了。
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // QR 是模块级缓存的 promise，第一次生成、之后所有 modal 共享。失败时取 null。
  // 新一轮走查 R2 (perf)：原本 deps=[] —— 父组件（FeedPostShareCardModal /
  // MomentShareCardModal）无脑 mount ShareCardModal、传 cardKey={post?.id ??
  // null}，cardKey 为 null 时整个 modal 走 L260 早返 null 不渲，但本 effect
  // mount 时就 fire 一遍 → 触发 getQrDataUrl() → 第一次拉 lazy import 把
  // qrcode (~70KB) 整个 chunk 拽下来。即使用户从来不点「生成分享图卡」按钮，
  // 进 /discover/feed / /moments / /friend-moments / /profile 这些挂分享 modal
  // 的页面首屏就吃掉这次网络。改成 gate 在 cardKey 上：用户真打开 modal 才
  // 触发 QR 生成，qrPromise 模块级缓存仍保证同 session 内只拉一次。
  useEffect(() => {
    if (!cardKey) return;
    let cancelled = false;
    getQrDataUrl().then((url) => {
      if (cancelled) return;
      setQr(url);
      setQrReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [cardKey]);

  // 截图触发：每次换 cardKey 重做。等 QR 准备好（避免水印缺图）后再画。
  useEffect(() => {
    if (!cardKey || !qrReady) return;
    setPngDataUrl(null);
    setGenerationError(null);
    setSaveError(null);
    let cancelled = false;

    const run = async () => {
      // 等两帧让 React 完成首次绘制
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const node = cardRef.current;
      if (!node || cancelled) return;

      // 视频节点 html-to-image 画不出来（canvas drawImage 需要 video 加载完才行，
      // 实际上这里 video 通常没加载到 metadata）。把它替换成 poster 图，
      // 没 poster 就直接隐藏 — 这样导出图里不会出现一个空白方块。
      node.querySelectorAll("video").forEach((video) => {
        const poster = video.getAttribute("poster");
        if (poster) {
          const placeholder = document.createElement("img");
          placeholder.src = poster;
          placeholder.style.cssText = video.getAttribute("style") ?? "";
          placeholder.className = video.className;
          placeholder.width = video.clientWidth;
          placeholder.height = video.clientHeight;
          video.replaceWith(placeholder);
        } else {
          video.style.display = "none";
        }
      });

      // 处理所有 <img>：
      // - 跨源 http(s) 图：fetch + 转 data URL 替换 src — 避开 canvas tainted。
      // - 已经是 data URL 的（如 QR、avatar fallback）：跳过转换，但仍然 wait
      //   它加载完，否则 toPng 时图可能还在 decode 中导致截图缺图。
      // 单图失败不拦截整张截图。
      const imgs = Array.from(node.querySelectorAll("img"));
      await Promise.all(
        imgs.map(async (img) => {
          if (img.src && !img.src.startsWith("data:")) {
            try {
              const resp = await fetch(img.src, { cache: "force-cache" });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`); // i18n-ignore-line: error code
              const dataUrl = await blobToDataURL(await resp.blob());
              img.src = dataUrl;
            } catch {
              // 失败的图不再 wait — 它的 load/error 已触发或永不触发
              return;
            }
          }
          await waitImgSettled(img);
        }),
      );
      if (cancelled) return;

      try {
        const htmlToImage = await import("html-to-image");
        if (cancelled) return;
        const dataUrl = await htmlToImage.toPng(node, {
          pixelRatio: 2,
          cacheBust: false,
          backgroundColor: "#ffffff",
        });
        if (!cancelled) setPngDataUrl(dataUrl);
      } catch (err) {
        console.error("[share-card] export failed", err);
        if (!cancelled) {
          setGenerationError(t(msg`图片生成失败，请稍后重试`));
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [cardKey, qrReady]);

  // 第二次走查 R3 (perf)：caller (MomentShareCardModal / FeedPostShareCardModal)
  // 都把 onClose={() => setX(null)} inline 箭头透下来。父组件 (MobileMomentsView
  // 等) 在 share modal 打开期间凡 notice 2.4s 定时器收尾 / commentMutation
  // pending 翻动 / pullState 抖 → 整页 re-render → onClose 身份换 → 下面两条
  // useEffect 把 keydown listener + Android back interceptor unregister + register
  // 一遍。和 WeChatCommentBar / WeChatActionBubble / MobileMomentsView 的
  // cleanup-storm 同模式：ref 钉最新 onClose，effect 只在 cardKey 翻转时跑。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // ESC 关闭 — 必须放在任何条件 return 之前以遵守 hooks 规则
  useEffect(() => {
    if (!cardKey) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cardKey]);

  // Android 硬件 Back：分享卡 modal 打开时按 Back 应该收 modal 而不是退掉
  // 整个广场/朋友圈页 —— modal 已经 body.overflow=hidden 屏蔽了底层交互，
  // 用户视觉上"在 modal 里"，Back 自然语义就是收 modal。
  useEffect(() => {
    if (!cardKey) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
  }, [cardKey]);

  // body 滚动锁 — modal 打开时背景不能滚动（手机上特别重要，否则手指滑动
  // 会同时滚动底层页面）。
  useEffect(() => {
    if (!cardKey) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [cardKey]);

  if (!cardKey) return null;

  const handleSaveOrShare = async () => {
    if (!pngDataUrl) return;
    setSaveError(null);
    const fileName = `${filenamePrefix}-${cardKey}.png`;

    try {
      // iOS / Android 原生壳：走 UIActivityViewController / Android 系统分享，
      // 拿到的 PNG 可以直达微信、相册、邮件等任意目标。
      if (isNativeMobileBridgeAvailable()) {
        const blob = await fetch(pngDataUrl).then((r) => r.blob());
        const result = await shareFileWithNativeShell({
          blob,
          fileName,
          mimeType: "image/png",
          title: modalTitle,
        });
        if (result.shared) {
          return;
        }
      }

      if (
        typeof navigator !== "undefined" &&
        "canShare" in navigator &&
        "share" in navigator
      ) {
        try {
          const blob = await fetch(pngDataUrl).then((r) => r.blob());
          const file = new File([blob], fileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: modalTitle,
              text: SITE_URL,
            });
            return;
          }
        } catch (shareErr) {
          if (
            shareErr instanceof Error &&
            shareErr.name === "AbortError"
          ) {
            return;
          }
        }
      }

      const a = document.createElement("a");
      a.href = pngDataUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("[share-card] save failed", err);
      setSaveError(t(msg`保存失败，请长按图片手动保存`));
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* i18n-ignore-line: dev comment - 离屏渲染目标 */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: 480,
          pointerEvents: "none",
        }}
      >
        <div
          ref={cardRef}
          style={{
            width: 480,
            background: "#FFFFFF",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Segoe UI', sans-serif",
          }}
        >
          {children}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 16px 18px",
              borderTop: "1px solid #EDEDED",
              background: "#F7F7F7",
            }}
          >
            {qr ? (
              <img
                src={qr}
                alt=""
                width={72}
                height={72}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 6,
                  background: "#FFFFFF",
                  padding: 4,
                  border: "1px solid #E5E5E5",
                }}
              />
            ) : null}
            <div style={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#1A1A1A",
                  marginBottom: 2,
                }}
              >
                {t(msg`隐界 Enclave`)}
              </div>
              <div style={{ fontSize: 13, color: "#4C4C4C" }}>
                {watermarkSubtitle}
              </div>
              <div style={{ fontSize: 12, color: "#9A9A9A", marginTop: 2 }}>
                {SITE_HOST} · {t(msg`浏览器即开即用`)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* i18n-ignore-line: dev comment - 用户可见的预览 + 操作 */}
      <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="text-[15px] font-medium text-gray-900">
            {modalTitle}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(msg`关闭`)}
            className="rounded-md px-2 py-1 text-sm text-gray-500 active:bg-gray-100"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-auto bg-[#F2F2F2] p-3">
          {pngDataUrl ? (
            <>
              {saveError ? (
                // 保存/分享失败时，让红条挂在图片**上方**而不是替换掉图片——
                // 文案是「请长按图片手动保存」，前提是图片还在视口里可被长按。
                <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-center text-[12px] text-red-600">
                  {saveError}
                </div>
              ) : null}
              <img
                src={pngDataUrl}
                alt={t(msg`分享图卡预览`)}
                className="w-full rounded-md shadow-sm"
              />
            </>
          ) : generationError ? (
            <div className="py-12 text-center text-sm text-red-500">
              {generationError}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-500">
              {t(msg`生成图片中…`)}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-4 py-3">
          <div className="mb-3 text-center text-[12px] text-gray-500">
            {bottomHint}
          </div>
          <button
            type="button"
            onClick={handleSaveOrShare}
            disabled={!pngDataUrl}
            className="w-full rounded-full bg-[#07C160] py-3 text-[15px] font-medium text-white active:bg-[#06A050] disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {t(msg`保存 / 分享图片`)}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
