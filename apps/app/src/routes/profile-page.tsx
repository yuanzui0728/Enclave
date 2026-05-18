import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookText,
  Camera,
  ChevronRight,
  CreditCard,
  FileText,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Star,
  UserPlus,
} from "lucide-react";
import { AppPage, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopChatConfirmDialog } from "../features/desktop/chat/desktop-chat-confirm-dialog";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  clearCloudRuntimeSession,
  shouldShowCloudAccountControls,
} from "../lib/cloud-session";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // 退出登录 confirm dialog 打开时 Back 键只关 dialog，不让默认 chain
  // 走到根 tab 双击退出 toast（Me tab 是根 tab）。
  useEffect(() => {
    if (!logoutConfirmOpen) {
      return;
    }
    return registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      setLogoutConfirmOpen(false);
      return true;
    });
  }, [logoutConfirmOpen]);
  const username = useWorldOwnerStore((state) => state.username);
  const ownerId = useWorldOwnerStore((state) => state.id);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);
  const cloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const cloudPhone = useCloudSessionStore((state) => state.phone);
  const runtimeConfig = useAppRuntimeConfig();
  const settingsPath = isDesktopLayout
    ? "/desktop/settings"
    : "/profile/settings";
  const showCloudAccountEntries =
    !isDesktopLayout &&
    shouldShowCloudAccountControls({
      worldAccessMode: runtimeConfig.worldAccessMode,
      runtimeApiBaseUrl: runtimeConfig.apiBaseUrl,
      runtimeCloudPhone: runtimeConfig.cloudPhone,
      accessToken: cloudAccessToken,
      sessionPhone: cloudPhone,
      worldOwnerId: ownerId,
    });

  // 走查 R1：本组件挂在 path="/tabs/profile" 上，desktopProfilePath 跟当前路由
  // 是同一条。原本 useRouterState 订阅 pathname/search/hash 配合 desktopPathMismatch
  // 判 "isDesktopLayout && 路径不是 /tabs/profile" 然后跳回同样的 /tabs/profile —
  // 但 isDesktopLayout=true 时上面分支已经 navigate(/desktop/settings) + 早 return
  // null 了，第二支永远跑不到。三个 useRouterState 等于让组件订阅整个 router
  // location，路由每变都白 re-render 一次，删掉省一份订阅成本。
  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return null;
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`我`)}
        titleAlign="center"
        rightActions={
          <Link
            to={settingsPath as never}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`打开设置`)}
          >
            <Settings size={17} />
          </Link>
        }
      />

      <div className="pb-8">
        <Link
          to="/profile/info"
          // active:bg：mobile tap 按压反馈，跟 profile-settings 行同款（line 334 / 359）。
          // 之前只有 hover:bg，桌面鼠标悬停有反馈，但移动端 tap 一下整个头像区
          // 没有任何视觉响应——明显感受到「我按了，但 app 没回应」，才能看到目标
          // 页面打开。
          className="mt-1 flex items-center gap-2.5 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)] active:bg-[color:var(--surface-card-hover)]"
        >
          <AvatarChip
            name={username?.trim() || t(msg`世界主人`)}
            src={avatar}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
                {username?.trim() || t(msg`世界主人`)}
              </div>
              {username?.trim() ? (
                // 走查 R1：gate 用裸 username 时遇 legacy username = "   "（全空白），
                // 名字行 trim 后回落到 t("世界主人") fallback，chip 仍然显示 t("世界主人")
                // → 同一行出现两个相同字样，视觉上像 chip bug。改成 username?.trim() 跟
                // 名字行的 fallback 判定口径对齐：只有真的有名字才显示 chip。
                // shrink-0 + whitespace-nowrap：用户起了 20 字超长 username 时
                // 父 flex 会把 chip 一起压缩，原本是单行的「世界主人」chip 会被
                // 挤成「世界 / 主人」两行，视觉破。这里把 chip 钉成不可压缩 +
                // 文字不许换行，让 username 这一侧 truncate 让出空间。
                <div className="shrink-0 whitespace-nowrap rounded-full bg-[rgba(7,193,96,0.08)] px-1.5 py-0.5 text-[10px] font-medium tracking-[0.04em] text-[#15803d]">
                  {t(msg`世界主人`)}
                </div>
              ) : null}
            </div>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-[color:var(--text-secondary)]">
              {signature?.trim() || t(msg`查看与编辑个人资料`)}
            </div>
          </div>
          <ChevronRight
            size={15}
            className="shrink-0 text-[color:var(--text-dim)]"
          />
        </Link>

        <ProfileEntryGroup className="mt-1">
          <ProfileEntry
            icon={Settings}
            iconClassName="bg-[rgba(7,193,96,0.10)] text-[#15803d]"
            label={t(msg`设置`)}
            to={settingsPath}
          />
        </ProfileEntryGroup>

        <ProfileEntryGroup className="mt-3">
          <ProfileEntry
            icon={Star}
            iconClassName="bg-[rgba(250,173,20,0.12)] text-[#d48806]"
            label={t(msg`收藏`)}
            to="/profile/favorites"
          />
        </ProfileEntryGroup>

        <ProfileEntryGroup className="mt-3">
          <ProfileEntry
            icon={Camera}
            iconClassName="bg-[rgba(168,85,247,0.12)] text-[#7e22ce]"
            label={t(msg`朋友圈`)}
            to="/profile/moments"
          />
        </ProfileEntryGroup>

        {showCloudAccountEntries ? (
          <ProfileEntryGroup className="mt-3">
            <ProfileEntry
              icon={CreditCard}
              iconClassName="bg-[rgba(22,163,74,0.12)] text-[#15803d]"
              label={t(msg`会员中心`)}
              to="/profile/subscription"
            />
          </ProfileEntryGroup>
        ) : null}

        <ProfileEntryGroup className="mt-3">
          <ProfileEntry
            icon={UserPlus}
            iconClassName="bg-[rgba(139,92,246,0.12)] text-[#7c3aed]"
            label={t(msg`导入角色`)}
            to="/profile/character-import"
          />
          <ProfileEntry
            icon={MessageSquareText}
            iconClassName="bg-[rgba(56,189,248,0.12)] text-[#0891b2]"
            label={t(msg`反馈`)}
            to="/profile/feedback"
          />
        </ProfileEntryGroup>

        <ProfileEntryGroup className="mt-3">
          <ProfileEntry
            icon={ShieldCheck}
            iconClassName="bg-[rgba(64,169,255,0.12)] text-[#1677ff]"
            label={t(msg`隐私政策`)}
            to="/legal/privacy"
          />
          <ProfileEntry
            icon={FileText}
            iconClassName="bg-[rgba(250,173,20,0.12)] text-[#d48806]"
            label={t(msg`服务条款`)}
            to="/legal/terms"
          />
          <ProfileEntry
            icon={BookText}
            iconClassName="bg-[rgba(56,189,248,0.12)] text-[#0891b2]"
            label={t(msg`社区规范`)}
            to="/legal/community"
          />
        </ProfileEntryGroup>

        {showCloudAccountEntries ? (
          <ProfileEntryGroup className="mt-3">
            <ProfileActionEntry
              icon={LogOut}
              iconClassName="bg-[rgba(220,38,38,0.10)] text-[#b42318]"
              label={t(msg`退出登录`)}
              onClick={() => setLogoutConfirmOpen(true)}
            />
          </ProfileEntryGroup>
        ) : null}
      </div>

      <DesktopChatConfirmDialog
        open={logoutConfirmOpen}
        title={t(msg`确认退出登录？`)}
        description={t(
          msg`退出后会回到世界入口，下次需要重新登录云账号。`,
        )}
        confirmLabel={t(msg`退出登录`)}
        danger
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={() => {
          setLogoutConfirmOpen(false);
          clearCloudRuntimeSession();
          void navigate({ to: "/welcome", replace: true });
        }}
      />
    </AppPage>
  );
}

function ProfileEntryGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden border-y border-[color:var(--border-faint)] divide-y divide-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ProfileEntry({
  icon: Icon,
  iconClassName,
  label,
  to,
}: {
  icon: React.ElementType;
  iconClassName?: string;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to as never}
      // active:bg 同步加上，移动端 tap「设置/收藏/朋友圈/会员中心/...」时
      // 有按压反馈，跟 profile-settings 行同款。
      className="flex items-center gap-2.5 px-4 py-2.75 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)] active:bg-[color:var(--surface-card-hover)]"
    >
      <div
        className={cn(
          "flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[9px]",
          iconClassName,
        )}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
        {label}
      </div>
      <ChevronRight
        size={13}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </Link>
  );
}

function ProfileActionEntry({
  icon: Icon,
  iconClassName,
  label,
  onClick,
}: {
  icon: React.ElementType;
  iconClassName?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // 「退出登录」按钮也补 active:bg；mobile tap 这条 danger 行时有按压反馈。
      className="flex w-full items-center gap-2.5 px-4 py-2.75 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)] active:bg-[color:var(--surface-card-hover)]"
    >
      <div
        className={cn(
          "flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[9px]",
          iconClassName,
        )}
      >
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
        {label}
      </div>
      <ChevronRight
        size={13}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </button>
  );
}
