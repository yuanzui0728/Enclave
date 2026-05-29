import { useState } from "react";
import { msg } from "@lingui/macro";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import { resolveAppMediaUrl } from "../../lib/media-url";
import { CyberAvatarFigure } from "./cyber-avatar-figure";

type Gender = "male" | "female" | "other" | "" | null | undefined;

/**
 * 赛博分身人像：性能优先的「立绘 + 占位」叠层。
 * - 无 portraitImageUrl（未生成）：直接渲现成 SVG 剪影 CyberAvatarFigure。
 * - 有 portraitImageUrl：SVG 仍作为**即时占位**铺底（零白屏/零布局抖动），上面叠一张
 *   懒加载的 AI 立绘 <img>，加载完成淡入、SVG 淡出。img 走 loading=lazy + decoding=async，
 *   且经 resolveAppMediaUrl 把相对 /api/moments/media/... 补成带 token 的绝对地址。
 * - 立绘加载失败：onError 回退到只显 SVG，绝不留破图。
 * 对 JS bundle 零增量（图按需拉取，不打进包）。
 */
export function CyberAvatarPortrait({
  portraitImageUrl,
  gender,
  className,
}: {
  portraitImageUrl?: string | null;
  gender?: Gender;
  className?: string;
}) {
  const t = useRuntimeTranslator();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const src = portraitImageUrl ? resolveAppMediaUrl(portraitImageUrl) : "";
  const showImg = !!src && !failed;

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      <CyberAvatarFigure
        gender={gender}
        className={cn(
          "h-full w-auto transition-opacity duration-[var(--motion-slow,500ms)]",
          showImg && loaded ? "opacity-0" : "opacity-100",
        )}
      />
      {showImg ? (
        <img
          src={src}
          alt={t(msg`赛博分身立绘`)}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "absolute inset-0 h-full w-full object-contain transition-opacity duration-[var(--motion-slow,500ms)]",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      ) : null}
    </div>
  );
}
