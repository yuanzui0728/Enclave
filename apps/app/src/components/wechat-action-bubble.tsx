import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import { Heart, MessageCircle, Share2, Star } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

const t = translateRuntimeMessage;

type WeChatActionBubbleProps = {
  open: boolean;
  anchorRect: DOMRect | null;
  liked: boolean;
  onLike: () => void;
  onComment: () => void;
  /**
   * 可选 — 提供时气泡里多出一个「分享」入口（导出图卡）。
   * 大多数地方（自己的朋友圈/朋友的朋友圈）都希望有；某些受限场景
   * （比如不可分享的内容）不传即可隐藏。
   */
  onShare?: () => void;
  /**
   * 可选 — 提供时气泡里多出一个「收藏 / 取消收藏」入口。
   * 朋友圈本身没有收藏概念，广场（feed）专属能力。
   */
  onFavorite?: () => void;
  favorited?: boolean;
  onClose: () => void;
};

export function WeChatActionBubble({
  open,
  anchorRect,
  liked,
  onLike,
  onComment,
  onShare,
  onFavorite,
  favorited = false,
  onClose,
}: WeChatActionBubbleProps) {
  const [mounted, setMounted] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: -1000,
    left: -1000,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // 走查 R1：父组件传 inline `onClose={() => setActionBubble(null)}` 进来 —
  // discover-feed-page 任何 setState 都会换 onClose 身份，气泡 open 时
  // 下面两条 useEffect 把 pointerdown/scroll/resize/keydown 4 条 listener
  // + Android back interceptor 一齐 remove → re-add 一遍。父组件随便
  // 抖一下（like mutate optimistic 写 cache 触发重渲、commentDrafts 改）
  // 就让气泡的 effect 重跑，纯白烧。
  // 用 ref pattern 把 onClose 锁稳（不是 useEffectEvent —— 后者在
  // React 19.2 上行为有抖：portal 渲染的气泡里 effect-event 偶发把
  // 气泡刚 mount 就在 commit-pass 里 self-close，导致用户根本看不到
  // 气泡）。每次 render 把最新 onClose 写到 ref，effect 里读 ref.current。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Close on outside tap, scroll, resize, or Escape.
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (target && bubbleRef.current?.contains(target)) {
        return;
      }
      onCloseRef.current();
    };
    const handleScroll = () => onCloseRef.current();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  // Android 硬件 Back：气泡打开时按 Back 应该收气泡而不是退整页。pointerdown /
  // scroll / resize / ESC 四条都覆盖了，但 Android Back 自成一路（capacitor 桥
  // 不会派 keydown），用户在小气泡上想"退一步"时整个 feed 页被弹掉很意外。
  useEffect(() => {
    if (!open) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onCloseRef.current();
      return true;
    });
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRect || !bubbleRef.current) return;
    const bubble = bubbleRef.current.getBoundingClientRect();
    // 微信样式：气泡出现在 ⋯ 按钮左侧，垂直居中
    const desiredLeft = anchorRect.left - bubble.width - 6;
    const desiredTop =
      anchorRect.top + (anchorRect.height - bubble.height) / 2;

    const safeLeft = Math.max(8, desiredLeft);
    const safeTop = Math.max(8, desiredTop);
    setPosition({ left: safeLeft, top: safeTop });
  }, [open, anchorRect]);

  if (!mounted || !open || !anchorRect) {
    return null;
  }

  return createPortal(
    <div
      ref={bubbleRef}
      role="menu"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        zIndex: 1000,
      }}
      className="flex h-9 items-stretch overflow-hidden rounded-[6px] bg-[#4C4C4C] text-[14px] text-white shadow-[0_4px_18px_rgba(0,0,0,0.25)]"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onLike();
          onClose();
        }}
        className="flex items-center gap-1 px-3.5 transition-colors active:bg-black/30"
      >
        <Heart
          size={14}
          className={liked ? "fill-[#FA5151] text-[#FA5151]" : "text-white"}
        />
        <span>{liked ? t(msg`取消`) : t(msg`赞`)}</span>
      </button>
      <span className="my-1.5 w-px bg-white/25" aria-hidden="true" />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onComment();
          onClose();
        }}
        className="flex items-center gap-1 px-3.5 transition-colors active:bg-black/30"
      >
        <MessageCircle size={14} />
        <span>{t(msg`评论`)}</span>
      </button>
      {onFavorite ? (
        <>
          <span className="my-1.5 w-px bg-white/25" aria-hidden="true" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFavorite();
              onClose();
            }}
            className="flex items-center gap-1 px-3.5 transition-colors active:bg-black/30"
          >
            <Star
              size={14}
              className={
                favorited ? "fill-[#FAD961] text-[#FAD961]" : "text-white"
              }
            />
            <span>{favorited ? t(msg`取消收藏`) : t(msg`收藏`)}</span>
          </button>
        </>
      ) : null}
      {onShare ? (
        <>
          <span className="my-1.5 w-px bg-white/25" aria-hidden="true" />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShare();
              onClose();
            }}
            className="flex items-center gap-1 px-3.5 transition-colors active:bg-black/30"
          >
            <Share2 size={14} />
            <span>{t(msg`分享`)}</span>
          </button>
        </>
      ) : null}

      <span
        aria-hidden="true"
        className="absolute"
        style={{
          right: -5,
          top: "50%",
          transform: "translateY(-50%) rotate(45deg)",
          width: 8,
          height: 8,
          backgroundColor: "#4C4C4C",
        }}
      />
    </div>,
    document.body,
  );
}
