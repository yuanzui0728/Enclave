import { memo, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { msg } from "@lingui/macro";
import {
  type MomentAudioAsset,
  type MomentContentType,
  type MomentImageAsset,
  type MomentMediaAsset,
  type MomentVideoAsset,
} from "@yinjie/contracts";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { formatMomentDurationLabel } from "../features/moments/moment-compose-media";
import { AudioCard } from "./audio-card";
import { resolveAppMediaUrl } from "../lib/media-url";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";

const t = translateRuntimeMessage;

type MomentMediaGalleryProps = {
  contentType: MomentContentType;
  media: MomentMediaAsset[];
  variant?: "desktop" | "detail" | "mobile";
  stopPropagation?: boolean;
};

type ViewerState =
  | {
      kind: "image";
      index: number;
    }
  | {
      kind: "video";
    };

// 新一轮走查 Round 1 (perf)：广场 / 朋友圈一屏 60 条 post 各挂一张
// MomentMediaGallery，父页（discover-feed-page / moments-page）任何高频
// state 切换（评论 bar 敲键 → setCommentDrafts、点赞 optimistic 写 cache、
// pull-refresh 状态、inflightSet 进出）都触发整页重渲，60 张 gallery 跟
// 着重跑 imageCount reduce + images filter + cellPx 一套常量 + map 出
// WeChatGridCell。`contentType` 来源是 `resolveFeedMomentContentType(post.media)`
// 每次现算，但返回的字符串字面量 React.memo 浅比时按值相等；`media`
// 是 post.media 引用，cache 没变时 useInfiniteQuery 不会换；`variant`
// 是字面量。三个 prop 都有引用稳定性，memo 命中率高。
// 注意内部 viewerState 是组件内 useState；memo 不改 stateful 行为，
// 用户当前打开的 image/video viewer 不会因为 memo 而丢失。
function MomentMediaGalleryInner({
  contentType,
  media,
  variant = "desktop",
  stopPropagation = false,
}: MomentMediaGalleryProps) {
  const [viewerState, setViewerState] = useState<ViewerState | null>(null);

  const imageCount = media.reduce(
    (count, asset) => (asset.kind === "image" ? count + 1 : count),
    0,
  );

  useEffect(() => {
    if (!viewerState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewerState(null);
        return;
      }

      if (viewerState.kind !== "image") {
        return;
      }

      if (event.key === "ArrowLeft") {
        setViewerState((current) => {
          if (!current || current.kind !== "image") {
            return current;
          }

          return {
            kind: "image",
            index: current.index > 0 ? current.index - 1 : current.index,
          };
        });
      }

      if (event.key === "ArrowRight") {
        setViewerState((current) => {
          if (!current || current.kind !== "image") {
            return current;
          }

          // image viewer 的 index 走 images（filter 后的图片数组），不能用
          // media.length —— 如果一条 moment 同时混着 audio/video（理论上历史
          // 数据可能存在），按 ArrowRight 会把 index 推到 images 之外，
          // activeImage = images[index] = undefined，viewer 渲染崩塌。
          return {
            kind: "image",
            index:
              current.index < imageCount - 1 ? current.index + 1 : current.index,
          };
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageCount, viewerState]);

  // Android 硬件 Back：在朋友圈点开大图全屏 viewer 后按 Back，先收 viewer 而不是
  // 退掉整个朋友圈页。和 chat 系列 (38a65fa5 "图片/位置/笔记 viewer 接 Android
  // Back，关 viewer 不退聊天页") 的修法保持一致。
  useEffect(() => {
    if (!viewerState) return;
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setViewerState(null);
      return true;
    });
  }, [viewerState]);

  if (!media.length) {
    return null;
  }

  const images = media.filter(
    (asset): asset is MomentImageAsset => asset.kind === "image",
  );
  const handleRootClick = stopPropagation
    ? (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
      }
    : undefined;

  if (contentType === "audio_card" && media[0]?.kind === "audio") {
    const audio = media[0] as MomentAudioAsset;
    return (
      <div onClick={handleRootClick}>
        <AudioCard
          url={audio.url}
          posterUrl={audio.posterUrl}
          title={audio.title || audio.fileName}
          durationMs={audio.durationMs}
          variant={variant === "mobile" ? "moment" : "feed"}
        />
      </div>
    );
  }

  if (contentType === "video" && media[0]?.kind === "video") {
    const video = media[0] as MomentVideoAsset;
    return (
      <>
        <div
          className={cn(
            "relative overflow-hidden rounded-[20px] border border-[color:var(--border-faint)] bg-black",
            variant === "detail"
              ? "max-w-full"
              : variant === "mobile"
                ? "max-w-[320px]"
                : "max-w-[360px]",
          )}
          onClick={handleRootClick}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerState({ kind: "video" });
            }}
            className="group relative block w-full text-left"
            aria-label={t(msg`打开视频预览`)}
          >
            {video.posterUrl ? (
              <img
                src={resolveAppMediaUrl(video.posterUrl)}
                alt={video.fileName || t(msg`朋友圈视频`)}
                loading="lazy"
                decoding="async"
                className="w-full bg-black object-cover"
                style={{
                  aspectRatio:
                    video.width && video.height
                      ? `${video.width} / ${video.height}`
                      : "16 / 9",
                }}
              />
            ) : (
              <video
                src={resolveAppMediaUrl(video.url)}
                className="w-full bg-black object-cover"
                style={{
                  aspectRatio:
                    video.width && video.height
                      ? `${video.width} / ${video.height}`
                      : "16 / 9",
                }}
                muted
                playsInline
                preload="metadata"
                onError={() => {
                  // codec/src 不支持时静默；外层已经有 Play 按钮和封面，UI 不会破
                }}
              />
            )}

            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.42))]" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-black/56 text-white transition group-hover:scale-[1.04] group-active:scale-[0.98]">
                <Play size={22} className="translate-x-[1px] fill-current" />
              </span>
            </div>
            <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
              <Play size={12} className="fill-current" />
              {t(msg`视频`)}
            </div>
            {video.durationMs ? (
              <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/58 px-3 py-1 text-[11px] font-medium text-white">
                {formatMomentDurationLabel(video.durationMs)}
              </div>
            ) : null}
          </button>
        </div>

        {viewerState?.kind === "video" ? (
          <MomentVideoViewerOverlay
            video={video}
            onClose={() => setViewerState(null)}
          />
        ) : null}
      </>
    );
  }

  const activeImage =
    viewerState?.kind === "image" ? images[viewerState.index] ?? null : null;
  const isMobileVariant = variant === "mobile";

  // WeChat 九宫格规则（1:1 视觉克隆）：
  // 1 张：单图按原比例自适应（最大 ~210px 宽）
  // 4 张：2×2，宽度 = 2 × 单格 + 1 × gap
  // 其他：3 列方格
  const cellSize = 105; // i18n-ignore-line: dev comment - px，单方格边长（mobile）
  const cellSizeNonMobile = 110;
  const gridGapPx = 4;
  const cellPx = isMobileVariant ? cellSize : cellSizeNonMobile;

  if (isMobileVariant && images.length === 1) {
    const single = images[0]!;
    return (
      <>
        <div onClick={handleRootClick}>
          <button
            key={single.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerState({ kind: "image", index: 0 });
            }}
            className="relative block overflow-hidden rounded-[3px] bg-[#EAEAEA] text-left"
            style={computeWeChatSingleImageStyle(single)}
          >
            <img
              src={resolveAppMediaUrl(single.thumbnailUrl || single.url)}
              alt={single.fileName || t(msg`朋友圈图片`)}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            {single.livePhoto?.enabled ? (
              <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-[2px] bg-black/58 px-1.5 py-0.5 text-[10px] font-medium text-white">
                {t(msg`实况`)}
              </div>
            ) : null}
          </button>
        </div>

        {activeImage ? (
          <MomentImageViewerOverlay
            image={activeImage}
            activeIndex={viewerState?.kind === "image" ? viewerState.index : 0}
            total={images.length}
            onClose={() => setViewerState(null)}
            onPrevious={undefined}
            onNext={undefined}
            variant={variant}
          />
        ) : null}
      </>
    );
  }

  if (isMobileVariant && images.length === 4) {
    const totalWidth = cellPx * 2 + gridGapPx;
    return (
      <>
        <div onClick={handleRootClick}>
          <div
            className="grid grid-cols-2"
            style={{
              gap: `${gridGapPx}px`,
              width: `${totalWidth}px`,
            }}
          >
            {images.map((asset, index) => (
              <WeChatGridCell
                key={asset.id}
                asset={asset}
                size={cellPx}
                onOpen={() =>
                  setViewerState({ kind: "image", index })
                }
              />
            ))}
          </div>
        </div>

        {activeImage ? (
          <MomentImageViewerOverlay
            image={activeImage}
            activeIndex={viewerState?.kind === "image" ? viewerState.index : 0}
            total={images.length}
            onClose={() => setViewerState(null)}
            onPrevious={
              viewerState?.kind === "image" && viewerState.index > 0
                ? () =>
                    setViewerState((current) =>
                      current?.kind === "image"
                        ? {
                            kind: "image",
                            index: Math.max(current.index - 1, 0),
                          }
                        : current,
                    )
                : undefined
            }
            onNext={
              viewerState?.kind === "image" &&
              viewerState.index < images.length - 1
                ? () =>
                    setViewerState((current) =>
                      current?.kind === "image"
                        ? {
                            kind: "image",
                            index: Math.min(
                              current.index + 1,
                              images.length - 1,
                            ),
                          }
                        : current,
                    )
                : undefined
            }
            variant={variant}
          />
        ) : null}
      </>
    );
  }

  if (isMobileVariant) {
    // 2-3 张：单行；5-9 张：3 列方格
    const columns = Math.min(images.length === 2 ? 2 : 3, images.length);
    const totalWidth = cellPx * columns + gridGapPx * (columns - 1);
    return (
      <>
        <div onClick={handleRootClick}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, ${cellPx}px)`,
              gap: `${gridGapPx}px`,
              width: `${totalWidth}px`,
            }}
          >
            {images.map((asset, index) => (
              <WeChatGridCell
                key={asset.id}
                asset={asset}
                size={cellPx}
                onOpen={() =>
                  setViewerState({ kind: "image", index })
                }
              />
            ))}
          </div>
        </div>

        {activeImage ? (
          <MomentImageViewerOverlay
            image={activeImage}
            activeIndex={viewerState?.kind === "image" ? viewerState.index : 0}
            total={images.length}
            onClose={() => setViewerState(null)}
            onPrevious={
              viewerState?.kind === "image" && viewerState.index > 0
                ? () =>
                    setViewerState((current) =>
                      current?.kind === "image"
                        ? {
                            kind: "image",
                            index: Math.max(current.index - 1, 0),
                          }
                        : current,
                    )
                : undefined
            }
            onNext={
              viewerState?.kind === "image" &&
              viewerState.index < images.length - 1
                ? () =>
                    setViewerState((current) =>
                      current?.kind === "image"
                        ? {
                            kind: "image",
                            index: Math.min(
                              current.index + 1,
                              images.length - 1,
                            ),
                          }
                        : current,
                    )
                : undefined
            }
            variant={variant}
          />
        ) : null}
      </>
    );
  }

  // Desktop / detail variants 保持原有 grid 布局
  const columnClassName =
    images.length === 1
      ? "grid-cols-1"
      : images.length === 2 || images.length === 4
        ? "grid-cols-2"
        : "grid-cols-3";

  return (
    <>
      <div
        className={cn(
          "grid gap-2.5",
          columnClassName,
          variant === "detail" ? "max-w-full" : "max-w-[360px]",
        )}
        onClick={handleRootClick}
      >
        {images.map((asset, index) => (
          <button
            key={asset.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setViewerState({
                kind: "image",
                index,
              });
            }}
            className="relative overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-left"
            style={{
              aspectRatio:
                images.length === 1 && asset.width && asset.height
                  ? `${asset.width} / ${asset.height}`
                  : "1 / 1",
            }}
          >
            <img
              src={resolveAppMediaUrl(asset.thumbnailUrl || asset.url)}
              alt={asset.fileName || t(msg`朋友圈图片`)}
              className="h-full w-full object-cover transition duration-200 hover:scale-[1.015]"
              loading="lazy"
              decoding="async"
            />
            {asset.livePhoto?.enabled ? (
              <div className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/58 px-2.5 py-1 text-[10px] font-medium text-white">
                {t(msg`实况`)}
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {activeImage ? (
        <MomentImageViewerOverlay
          image={activeImage}
          activeIndex={viewerState?.kind === "image" ? viewerState.index : 0}
          total={images.length}
          onClose={() => setViewerState(null)}
          onPrevious={
            viewerState?.kind === "image" && viewerState.index > 0
              ? () =>
                  setViewerState((current) => {
                    if (!current || current.kind !== "image") {
                      return current;
                    }

                    return {
                      kind: "image",
                      index: Math.max(current.index - 1, 0),
                    };
                  })
              : undefined
          }
          onNext={
            viewerState?.kind === "image" && viewerState.index < images.length - 1
              ? () =>
                  setViewerState((current) => {
                    if (!current || current.kind !== "image") {
                      return current;
                    }

                    return {
                      kind: "image",
                      index: Math.min(current.index + 1, images.length - 1),
                    };
                  })
              : undefined
          }
          variant={variant}
        />
      ) : null}
    </>
  );
}

export const MomentMediaGallery = memo(MomentMediaGalleryInner);

function MomentImageViewerOverlay({
  image,
  activeIndex,
  total,
  onClose,
  onPrevious,
  onNext,
  variant,
}: {
  image: MomentImageAsset;
  activeIndex: number;
  total: number;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  variant: "desktop" | "detail" | "mobile";
}) {
  const isMobile = variant === "mobile";

  // 朋友圈页用 transform: translateY(...) 包裹整个内容做下拉刷新（moments-page.tsx
  // ~1572 行）。一旦祖先有 transform / filter / perspective，CSS 规范里 fixed
  // 定位的 containing block 就从 viewport 收缩到那个祖先 → 全屏 viewer 会落在帖子
  // 卡片大小的盒子里而不是全屏。portal 到 document.body 跳出 transform 笼子。
  const overlay = (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.92)] backdrop-blur-sm">
      {/* i18n-ignore-start: dev comment - 关闭层叠说明 */}
      {/* 原本想用一个 `absolute inset-0 button` 当"点击任意空白关闭"层，但下面的
          图片容器也是 `absolute inset-0`（没 z-index），按 CSS 默认 stack 后兄弟
          靠 DOM 顺序：图片容器 DOM 在后 → 落在 close button 之上，把整层吃掉。
          除了顶栏 X 按钮和左右翻页（z-10）以外，背景空白点击全部沉默。
          直接把 onClick 挂到图片容器上：tap 图 / tap 背景空白都会冒泡到这层
          触发 onClose，跟 WeChat 行为一致（长按图仍走原生 contextmenu，不受影响）。
          底下 inset-0 那颗 button 保留只是给屏幕阅读器留一个可聚焦的"关闭"语义入口。 */}
      {/* i18n-ignore-end */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭图片预览`)}
        tabIndex={-1}
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
          aria-label={t(msg`关闭图片预览`)}
        >
          <X size={18} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-medium">
            {image.fileName || t(msg`朋友圈图片`)}
          </div>
          <div className="mt-1 text-xs text-white/70">
            {activeIndex + 1} / {total}
          </div>
        </div>
        <div className="w-10 shrink-0" aria-hidden="true" />
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]"
        onClick={onClose}
        role="presentation"
      >
        <img
          src={resolveAppMediaUrl(image.url)}
          alt={image.fileName || t(msg`朋友圈图片`)}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {onPrevious ? (
        <ViewerNavButton
          position={isMobile ? "bottom-left" : "left"}
          label={t(msg`上一张`)}
          onClick={onPrevious}
        >
          <ChevronLeft size={20} />
        </ViewerNavButton>
      ) : null}
      {onNext ? (
        <ViewerNavButton
          position={isMobile ? "bottom-right" : "right"}
          label={t(msg`下一张`)}
          onClick={onNext}
        >
          <ChevronRight size={20} />
        </ViewerNavButton>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

function MomentVideoViewerOverlay({
  video,
  onClose,
}: {
  video: MomentVideoAsset;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [needsManualPlay, setNeedsManualPlay] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const promise = el.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        // iOS / 静音策略 / codec 不支持 → 回退到手动播放按钮
        setNeedsManualPlay(true);
      });
    }
    // 走查新一轮：viewer 关闭 / 朋友圈页 unmount 时 React 把 <video> 从 DOM
    // 摘掉后 Chromium / Firefox 不会自动 pause —— 视频的音轨会在后台继续跑直
    // 到刷新整页（实测桌面 Chrome 起音 → 关 viewer，音乐还在响）。和
    // 51b8980a (视频号 ChannelVideoSurface) 同模式：unmount 走 cleanup 主动
    // pause，避免「关掉看了还能听到」。
    return () => {
      el.pause();
    };
  }, []);

  const handleManualPlay = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    const promise = el.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(() => {
        // 仍失败时保持按钮可见，不再上报
      });
    }
  };

  // 同图片 viewer，朋友圈页 transform 祖先会把 fixed 困在 post 卡片里。portal 出去。
  const overlay = (
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.94)] backdrop-blur-sm">
      {/* 跟图片 viewer 同样的层叠陷阱：absolute inset-0 close button 被下方的
          视频容器（也是 absolute inset-0）盖住，背景空白点击全部沉默。差别在
          于视频元素自带 controls，整层 onClick={onClose} 会导致点 controls 也
          关掉 viewer。这里改成只接 currentTarget 直接命中：背景空白触发关闭，
          点在 <video> 上的事件冒泡上来时 target!==currentTarget，不关。
          底下 inset-0 button 保留作为屏幕阅读器入口。 */}
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0"
        aria-label={t(msg`关闭视频预览`)}
        tabIndex={-1}
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-10 flex items-center justify-between gap-3 px-4 text-white">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {video.fileName || t(msg`朋友圈视频`)}
          </div>
          {video.durationMs ? (
            <div className="mt-1 text-xs text-white/70">
              {t(msg`时长 ${formatMomentDurationLabel(video.durationMs)}`)}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white"
          aria-label={t(msg`关闭视频预览`)}
        >
          <X size={18} />
        </button>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] pt-[calc(env(safe-area-inset-top,0px)+4.5rem)]"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        role="presentation"
      >
        <video
          ref={videoRef}
          src={resolveAppMediaUrl(video.url)}
          poster={video.posterUrl ? resolveAppMediaUrl(video.posterUrl) : undefined}
          className="max-h-full max-w-full rounded-[20px] bg-black"
          controls
          playsInline
          onError={() => setNeedsManualPlay(true)}
          onPlay={() => setNeedsManualPlay(false)}
        />
        {needsManualPlay ? (
          <button
            type="button"
            onClick={handleManualPlay}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/30"
            aria-label={t(msg`播放视频`)}
          >
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-black/68 text-white">
              <Play size={28} className="translate-x-[2px] fill-current" />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}

function WeChatGridCell({
  asset,
  size,
  onOpen,
}: {
  asset: MomentImageAsset;
  size: number;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="relative overflow-hidden rounded-[3px] bg-[#EAEAEA] text-left"
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <img
        src={resolveAppMediaUrl(asset.thumbnailUrl || asset.url)}
        alt={asset.fileName || t(msg`朋友圈图片`)}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      {asset.livePhoto?.enabled ? (
        <div className="pointer-events-none absolute left-1.5 top-1.5 rounded-[2px] bg-black/58 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {t(msg`实况`)}
        </div>
      ) : null}
    </button>
  );
}

function computeWeChatSingleImageStyle(
  asset: MomentImageAsset,
): { width: string; height: string } {
  const SQUARE = 165; // i18n-ignore-line: dev comment
  const LONG = 220; // i18n-ignore-line: dev comment
  const SHORT = 145; // i18n-ignore-line: dev comment
  const w = asset.width ?? 0;
  const h = asset.height ?? 0;

  if (!w || !h) {
    return { width: `${SQUARE}px`, height: `${SQUARE}px` };
  }

  const ratio = w / h;
  if (ratio >= 1.18) {
    // 横图
    return { width: `${LONG}px`, height: `${SHORT}px` };
  }
  if (ratio <= 0.84) {
    // 竖图
    return { width: `${SHORT}px`, height: `${LONG}px` };
  }
  // 接近方形
  return { width: `${SQUARE}px`, height: `${SQUARE}px` };
}

function ViewerNavButton({
  position,
  label,
  onClick,
  children,
}: {
  position: "left" | "right" | "bottom-left" | "bottom-right";
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "absolute z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/18",
        position === "left" ? "left-5 top-1/2 -translate-y-1/2" : "",
        position === "right" ? "right-5 top-1/2 -translate-y-1/2" : "",
        position === "bottom-left"
          ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-5"
          : "",
        position === "bottom-right"
          ? "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] right-5"
          : "",
      )}
    >
      {children}
    </button>
  );
}
