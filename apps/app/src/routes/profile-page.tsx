import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
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
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  clearCloudRuntimeSession,
  shouldShowCloudAccountControls,
} from "../lib/cloud-session";
import { normalizePathname } from "../lib/normalize-pathname";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const search = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const username = useWorldOwnerStore((state) => state.username);
  const ownerId = useWorldOwnerStore((state) => state.id);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);
  const cloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const cloudPhone = useCloudSessionStore((state) => state.phone);
  const runtimeConfig = useAppRuntimeConfig();
  const desktopProfilePath = "/tabs/profile";
  const normalizedPathname = normalizePathname(pathname);
  const desktopPathMismatch =
    isDesktopLayout && normalizedPathname !== desktopProfilePath;
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

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
      return;
    }

    if (!desktopPathMismatch) {
      return;
    }

    void navigate({
      to: desktopProfilePath,
      search: search || undefined,
      hash: hash || undefined,
      replace: true,
    });
  }, [
    desktopPathMismatch,
    desktopProfilePath,
    hash,
    isDesktopLayout,
    navigate,
    search,
  ]);

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
            onClick={() => {
              void navigate({ to: settingsPath });
            }}
          >
            <Settings size={17} />
          </Link>
        }
      />

      <div className="pb-8">
        <Link
          to="/profile/info"
          className="mt-1 flex items-center gap-2.5 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
        >
          <AvatarChip
            name={username ?? t(msg`世界主人`)}
            src={avatar}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
                {username ?? t(msg`世界主人`)}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.08)] px-1.25 py-0.5 text-[8px] font-medium tracking-[0.04em] text-[#15803d]">
                {t(msg`世界主人`)}
              </div>
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
          <ProfileActionEntry
            icon={Camera}
            iconClassName="bg-[rgba(168,85,247,0.12)] text-[#7e22ce]"
            label={t(msg`朋友圈`)}
            onClick={() => {
              void navigate({ to: "/profile/moments" });
            }}
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
              onClick={() => {
                clearCloudRuntimeSession();
                void navigate({ to: "/welcome", replace: true });
              }}
            />
          </ProfileEntryGroup>
        ) : null}
      </div>
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
      className="flex items-center gap-2.5 px-4 py-2.75 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
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
      className="flex w-full items-center gap-2.5 px-4 py-2.75 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
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
