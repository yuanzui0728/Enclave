import { useEffect, useState, type CSSProperties, type MouseEventHandler } from "react";
import { Camera } from "lucide-react";
import { cn } from "@yinjie/ui";
import { resolveAppMediaUrl } from "../lib/media-url";

const DEFAULT_COVER_GRADIENT =
  "linear-gradient(135deg,#5d7fa6 0%,#6f8caa 38%,#9aaec4 100%)";

type WeChatMomentsCoverProps = {
  nickname: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  className?: string;
  /**
   * 当为 true 时显示一个空的右下方相机图标（仅装饰，不绑功能），
   * 微信封面右下角是更换封面的入口。
   */
  showCoverEditHint?: boolean;
  onAvatarTap?: MouseEventHandler<HTMLButtonElement>;
};

export function WeChatMomentsCover({
  nickname,
  avatarUrl,
  coverUrl,
  className,
  showCoverEditHint = false,
  onAvatarTap,
}: WeChatMomentsCoverProps) {
  const safeNickname = nickname?.trim() || " ";
  const initial = safeNickname.slice(0, 1).toUpperCase();

  const coverStyle: CSSProperties = coverUrl
    ? {
        backgroundImage: `url(${JSON.stringify(coverUrl)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { backgroundImage: DEFAULT_COVER_GRADIENT };

  // 微信样式：头像下沉 28px (translate-y-7) 让一部分悬挂到封面下方。
  // 封面背景 260px，section 总高 276px：底部 16px 留给头像悬挂区，
  // 这块区域不画封面背景，让头像在白底（下方内容区背景）上正确显示。
  return (
    <section
      className={cn("relative w-full bg-white", className)}
      style={{ height: 276 }}
    >
      {/* i18n-ignore-line: dev comment - 封面背景层 */}
      <div
        className="absolute inset-x-0 top-0 overflow-hidden bg-[#9aaec4]"
        style={{ height: 260, ...coverStyle }}
      >
        {!coverUrl ? (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_28%,rgba(255,255,255,0.35),transparent_55%),radial-gradient(circle_at_82%_82%,rgba(15,23,42,0.22),transparent_50%)]" />
        ) : null}

        {showCoverEditHint ? (
          <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-white/85 backdrop-blur-sm">
            <Camera size={13} />
          </div>
        ) : null}
      </div>

      {/* i18n-ignore-start: dev comment - 头像昵称布局说明 */}
      {/* 头像 + 昵称：群组的 bottom 位于离 section.bottom 28px 处，
          与原始 (cover 260px + bottom-3 12px) 视觉位置一致；头像组件
          沿用 translate-y-7 (28px) 让其底部贴在 section.bottom，
          完整露出 64px 头像。 */}
      {/* i18n-ignore-end */}
      <div className="absolute bottom-7 right-4 flex items-end gap-3">
        <div
          className="max-w-[60vw] truncate text-right text-[17px] font-semibold leading-[22px] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.32)]"
          aria-label={safeNickname}
        >
          {safeNickname}
        </div>
        {onAvatarTap ? (
          <button
            type="button"
            onClick={onAvatarTap}
            aria-label={safeNickname}
            className="translate-y-7 rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            <CoverAvatar src={avatarUrl} alt={safeNickname} initial={initial} />
          </button>
        ) : (
          <div className="translate-y-7">
            <CoverAvatar src={avatarUrl} alt={safeNickname} initial={initial} />
          </div>
        )}
      </div>
    </section>
  );
}

function CoverAvatar({
  src,
  alt,
  initial,
}: {
  src?: string | null;
  alt: string;
  initial: string;
}) {
  const trimmed = (src ?? "").trim();
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [trimmed]);

  // 角色头像在数据库里有三种形态：1) `/api/character-assets/...` 资源路径，
  // 2) `http(s)://...` 远端 URL，3) 单个 emoji（库里 142 个角色里 80 个是
  // 这种形态）。前两种当 <img> 渲染，emoji 当文字 glyph 渲染——
  // 不能让 <img src="🧰"> 走 404 兜底破图。最终都失败再回退首字母方块。
  if (trimmed && !loadFailed) {
    if (isLikelyImageSource(trimmed)) {
      return (
        <img
          src={resolveCoverAvatarSrc(trimmed)}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setLoadFailed(true)}
          className="h-16 w-16 rounded-[6px] border border-white/85 bg-[linear-gradient(135deg,#cbd6e2,#9aaec4)] object-cover shadow-[0_2px_10px_rgba(0,0,0,0.18)]"
        />
      );
    }

    if (isEmojiAvatar(trimmed)) {
      return (
        <div
          className="flex h-16 w-16 items-center justify-center rounded-[6px] border border-white/85 bg-[linear-gradient(135deg,#cbd6e2,#9aaec4)] text-[34px] leading-none shadow-[0_2px_10px_rgba(0,0,0,0.18)]"
          aria-label={alt}
        >
          <span aria-hidden="true">{trimmed}</span>
        </div>
      );
    }
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-[6px] border border-white/85 bg-[linear-gradient(135deg,#cbd6e2,#9aaec4)] text-[20px] font-semibold text-white shadow-[0_2px_10px_rgba(0,0,0,0.18)]">
      {initial}
    </div>
  );
}

const EMOJI_PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

function isEmojiAvatar(value: string) {
  if (!value || value.length > 12) return false;
  return EMOJI_PICTOGRAPHIC.test(value);
}

function isLikelyImageSource(value: string) {
  if (!value) return false;
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
  );
}

function resolveCoverAvatarSrc(value: string) {
  // 与 AvatarChip 一致：`/api/...` 资源走 resolveAppMediaUrl，公网隧道下追加
  // cloud-api token；其他形态原样返回。
  if (!value.startsWith("/api/")) return value;
  return resolveAppMediaUrl(value);
}
