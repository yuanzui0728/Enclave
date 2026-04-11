import { Link } from "@tanstack/react-router";
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
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar title="我" titleAlign="center" />

      <div className="pb-8">
        <Link
          to="/profile/settings"
          className="mt-2 flex items-center gap-4 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-4 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
        >
          <AvatarChip name={username ?? "世界主人"} src={avatar} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="truncate text-[19px] font-medium text-[color:var(--text-primary)]">
                {username ?? "世界主人"}
              </div>
              <div className="rounded-full bg-[rgba(7,193,96,0.08)] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
                世界主人
              </div>
            </div>
            <div className="mt-1 line-clamp-1 text-sm text-[color:var(--text-secondary)]">
              {signature?.trim() || "管理个人资料、专属 API Key 和世界设置"}
            </div>
          </div>
          <ChevronRight
            size={18}
            className="shrink-0 text-[color:var(--text-dim)]"
          />
        </Link>

        <div className="px-4 py-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
          在这里管理你的资料、设置和协议说明。
        </div>

        <ProfileEntryGroup className="mt-2">
          <ProfileEntry
            icon={Settings}
            iconClassName="bg-[rgba(7,193,96,0.10)] text-[color:var(--brand-primary)]"
            label="设置"
            subtitle="个人资料、AI 设置和账号相关配置"
            to="/profile/settings"
          />
        </ProfileEntryGroup>

        <ProfileEntryGroup className="mt-2">
          <ProfileEntry
            icon={ShieldCheck}
            iconClassName="bg-[rgba(64,169,255,0.12)] text-[#1677ff]"
            label="隐私政策"
            subtitle="查看数据与隐私相关说明"
            to="/legal/privacy"
          />
          <ProfileEntry
            icon={FileText}
            iconClassName="bg-[rgba(250,173,20,0.12)] text-[#d48806]"
            label="服务条款"
            subtitle="查看使用条款与服务约定"
            to="/legal/terms"
          />
          <ProfileEntry
            icon={BookText}
            iconClassName="bg-[rgba(56,189,248,0.12)] text-[#0891b2]"
            label="社区规范"
            subtitle="查看世界互动和社区行为规范"
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
        "overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
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
  subtitle,
  to,
}: {
  icon: React.ElementType;
  iconClassName?: string;
  label: string;
  subtitle?: string;
  to: string;
}) {
  return (
    <Link
      to={to as never}
      className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]",
          iconClassName,
        )}
      >
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] text-[color:var(--text-primary)]">
          {label}
        </div>
        {subtitle ? (
          <div className="mt-1 truncate text-[13px] text-[color:var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      <ChevronRight
        size={16}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </Link>
  );
}
