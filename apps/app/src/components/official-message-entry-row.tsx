import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { BellOff } from "lucide-react";
import { cn } from "@yinjie/ui";

const t = translateRuntimeMessage;

export function OfficialMessageEntryRow({
  title,
  preview,
  timestampLabel,
  unreadCount = 0,
  muted = false,
  variant = "mobile",
  active = false,
  contextMenuOpen = false,
  leading,
  onClick,
  onContextMenu,
  className,
}: {
  title: string;
  preview: string;
  timestampLabel?: string;
  unreadCount?: number;
  muted?: boolean;
  variant?: "mobile" | "desktop";
  active?: boolean;
  contextMenuOpen?: boolean;
  leading: ReactNode;
  onClick?: () => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      // R24：和姊妹 R22 ConversationCardLink (desktop-chat-workspace 3122) 同款
      // 缺漏 —— OfficialAccountsEntryCard / SubscriptionInboxCard /
      // OfficialServiceConversationCard 三张入口卡全都走本 row 渲染，桌面端
      // workspace 用 active 表达"当前正在右侧显示"，但只有视觉绿边框 +
      // 白底，盲人屏幕阅读器 Tab 走到「公众号 / 订阅号消息 / 某服务号」按钮
      // 上只能听到 title + preview + 未读数，听不出哪一行是当前页。补
      // aria-current="page"，和会话卡片对齐。本组件 mobile 走默认 active=false
      // 渲染 undefined 无副作用。
      aria-current={active ? "page" : undefined}
      className={cn(
        isDesktop
          ? active
            ? "flex w-full items-center gap-3 rounded-[12px] border border-[rgba(245, 158, 11,0.14)] bg-[color:var(--surface-card)] px-3 py-2.5 text-left shadow-[0_8px_22px_rgba(180, 130, 20, 0.04)]"
            : contextMenuOpen
              ? "flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--border-faint)] bg-white/88 px-3 py-2.5 text-left"
              : "flex w-full items-center gap-3 rounded-[12px] border border-transparent bg-transparent px-3 py-2.5 text-left transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-faint)] hover:bg-white/80"
          : active
            ? "flex w-full items-center gap-2.5 bg-[rgba(245, 158, 11,0.07)] px-4 py-2.5 text-left"
            : "flex w-full items-center gap-2.5 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left",
        className,
      )}
    >
      {leading}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="truncate text-[color:var(--text-primary)]">
            <span
              className={cn(
                "truncate",
                isDesktop
                  ? "text-[14px] font-medium"
                  : "text-[14px] font-normal leading-[1.25]",
              )}
            >
              {title}
            </span>
          </div>
          <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
            {timestampLabel}
          </div>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div
            className={cn(
              "min-w-0 truncate text-[color:var(--text-secondary)]",
              isDesktop ? "text-[12px]" : "text-[11px] leading-[1.35]",
            )}
          >
            {preview}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {muted ? (
              // 走查 R2（新一轮）：和姊妹 chat-list-page row 同款 — 裸
              // <BellOff aria-label> 在 SVG / generic 元素上 implementation-
              // defined。下方 R145 unread badge 已经统一用 role="img" 兜
              // 住 SR 不可靠暴露的边界，本图标必须跟同一规约（订阅号/服
              // 务号入口行 muted 时这一个 icon 是用户感知"通知静音"的唯一
              // 视觉证据）。
              <BellOff
                size={isDesktop ? 13 : 11}
                className="text-[color:var(--text-dim)]"
                role="img"
                aria-label={t(msg`消息免打扰`)}
              />
            ) : null}
            {unreadCount > 0 ? (
              muted ? (
                // 走查电脑端单聊 R145：和姊妹 desktop-chat-workspace R106 同
                // 款 — 裸 <div> 挂 aria-label 没 role 时，按 ARIA 1.2 spec
                // 在 generic 元素上 aria-label 行为 implementation-defined，
                // Chromium AX tree 早期版本 / VoiceOver 严格模式可能不暴露
                // aria-label。muted 变体只是一个红色 2×2 视觉小点，没有
                // inner text，盲人 SR 走「订阅号 / 服务号」入口行时根本
                // 听不到"N 条未读消息"——muted 入口尤其需要这层 fallback
                // (既然通知静音了，红点几乎是用户唯一的未读信号)。补
                // role="img" 把它当作"一张被命名的视觉指示"，AT 一致暴露
                // aria-label。
                <div
                  role="img"
                  className={cn(
                    "rounded-full",
                    isDesktop ? "h-2 w-2 bg-[#fa5151]" : "h-2 w-2 bg-[#b8b8b8]",
                  )}
                  aria-label={
                    unreadCount > 99
                      ? t(msg`超过 99 条未读消息`)
                      : t(msg`${unreadCount} 条未读消息`)
                  }
                />
              ) : (
                // 走查桌面端单聊 新一轮 R3：和姊妹 desktop-chat-workspace 同
                // 款 — muted 变体已挂 aria-label，非 muted 变体的 unreadCount
                // 是裸 text。SR 走到「订阅号 / 服务号」入口行只听到一句「99+」
                // 没有上下文。补 aria-label，inner span aria-hidden 隔离视觉
                // 数字。本组件同时被桌面端和移动端 chat-list 复用，两边一起修。
                //
                // 走查电脑端单聊 R145：同上 — 补 role="img" 让 aria-label 在
                // 不带 role 的 generic <div> 上仍被 AT 暴露。inner <span
                // aria-hidden="true"> 防"99+"裸文本被某些 SR 在 role="img"
                // 名称之外又复读一遍。
                <div
                  role="img"
                  className={cn(
                    "flex items-center justify-center rounded-full bg-[#fa5151] text-center text-white",
                    isDesktop
                      ? "min-w-5 px-1.5 py-0.5 text-[10px]"
                      : "min-h-[18px] min-w-[18px] px-1 text-[11px] leading-none shadow-[0_4px_12px_rgba(250,81,81,0.18)]",
                    unreadCount > 9 ? "min-w-[22px]" : undefined,
                  )}
                  aria-label={
                    unreadCount > 99
                      ? t(msg`超过 99 条未读消息`)
                      : t(msg`${unreadCount} 条未读消息`)
                  }
                >
                  <span aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
