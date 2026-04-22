import { Link, useNavigate } from "@tanstack/react-router";
import {
  BookText,
  ChevronRight,
  FileText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { AppPage, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);
  const settingsPath = isDesktopLayout ? "/desktop/settings" : "/profile/settings";

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="我"
        titleAlign="center"
        rightActions={
          <button
            type="button"
            onClick={() => {
              void navigate({ to: settingsPath });
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label="打开设置"
          >
            <Settings size={17} />
          </button>
        }
      />

      <div className="pb-8">
        <Link
          to={settingsPath as never}
          className="mt-1 flex items-center gap-2.5 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
        >
          <AvatarChip name={username ?? "世界主人"} src={avatar} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-[17px] font-medium text-[color:var(--text-primary)]">
                {username ?? "世界主人"}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.08)] px-1.25 py-0.5 text-[8px] font-medium tracking-[0.04em] text-[#15803d]">
                世界主人
              </div>
            </div>
            <div className="mt-0.5 line-clamp-1 text-[11px] text-[color:var(--text-secondary)]">
              {signature?.trim() || "查看与编辑个人资料"}
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
            label="设置"
            to={settingsPath}
          />
        </ProfileEntryGroup>

        <ProfileEntryGroup className="mt-1">
          <ProfileEntry
            icon={ShieldCheck}
            iconClassName="bg-[rgba(64,169,255,0.12)] text-[#1677ff]"
            label="隐私政策"
            to="/legal/privacy"
          />
          <ProfileEntry
            icon={FileText}
            iconClassName="bg-[rgba(250,173,20,0.12)] text-[#d48806]"
            label="服务条款"
            to="/legal/terms"
          />
          <ProfileEntry
            icon={BookText}
            iconClassName="bg-[rgba(56,189,248,0.12)] text-[#0891b2]"
            label="社区规范"
            to="/legal/community"
          />
        </ProfileEntryGroup>
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
