import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

const t = translateRuntimeMessage;

export function getSparkTier(days: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!days || days < 3) return 0;
  if (days < 7) return 1;
  if (days < 30) return 2;
  if (days < 100) return 3;
  if (days < 365) return 4;
  return 5;
}

const TIER_TEXT_COLOR: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "text-[#ff7a30]",
  2: "text-[#e8423d]",
  3: "text-[#3578e5]",
  4: "text-[#c81d39]",
  5: "text-[color:var(--brand-primary)]",
};

const SIZE_PRESETS = {
  sm: { gap: "gap-0.5", icon: "h-3 w-3", text: "text-[10px]" },
  md: { gap: "gap-1", icon: "h-4 w-4", text: "text-[12px]" },
  lg: { gap: "gap-1.5", icon: "h-5 w-5", text: "text-[14px]" },
} as const;

export function SparkBadge({
  streak,
  size = "sm",
  className,
}: {
  streak?: number | null;
  size?: keyof typeof SIZE_PRESETS;
  className?: string;
}) {
  const days = streak ?? 0;
  const tier = getSparkTier(days);
  if (tier === 0) return null;
  const preset = SIZE_PRESETS[size];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-semibold leading-none tabular-nums",
        preset.gap,
        preset.text,
        TIER_TEXT_COLOR[tier],
        className,
      )}
      aria-label={t(msg`已连续 ${days} 天`)}
    >
      {/* 走查电脑端单聊 R132：和 R131 note-send preview / R130 NoteViewerOverlay
          / R94/R97/R98/R99/R104/R119 一票同款 —— SparkBadge 渲在桌面单聊
          ConversationCardLink (desktop-chat-workspace.tsx:3096)，每条 sparkStreak
          ≥ 3 天的会话行都挂一颗。会话行外层是 <Link>（anchor 默认 draggable
          =true），用户从会话卡片任意位置 mousedown 轻微 drag 时浏览器要选
          离 cursor 最近的 draggable 子元素作 ghost；这颗 spark <img> 默认
          draggable=true → 拖到桌面会释放成 .svg 图标 + 触发"下载该图"，
          / 拖到隔壁 textarea 还可能把 svg url 当 text 插入。AvatarChip /
          GroupAvatarChip 早已挂 draggable={false}，本 badge 漏挂。 */}
      <img
        src={`/spark/tier-${tier}.svg`}
        alt=""
        draggable={false}
        className={cn("shrink-0", preset.icon)}
      />
      <span>{days}</span>
    </span>
  );
}
