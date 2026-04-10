import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Globe, HelpCircle, Settings } from "lucide-react";
import { AppPage, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const isDesktopLayout = useDesktopLayout();
  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);

  return (
    <AppPage className="space-y-4">
      <TabPageTopBar title="我" titleAlign="center" />

      <Link
        to="/profile/settings"
        className="flex items-center gap-4 rounded-[26px] border border-white/80 bg-white/88 px-5 py-5 shadow-[var(--shadow-section)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]"
      >
        <AvatarChip name={username ?? "世界主人"} src={avatar} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-semibold leading-tight text-[color:var(--text-primary)]">{username ?? "世界主人"}</div>
          <div className="mt-1.5 line-clamp-1 text-sm text-[color:var(--text-secondary)]">
            {signature?.trim() || "点击编辑个人资料"}
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-[color:var(--text-dim)]" />
      </Link>

      {isDesktopLayout ? null : (
        <div className="flex items-center gap-2">
          <ProfileStat label="世界" value="探索中" />
          <ProfileStat label="好友" value="通讯录" />
          <ProfileStat label="动态" value="朋友圈" />
        </div>
      )}

      <ProfileEntryGroup>
        <ProfileEntry icon={Settings} label="设置" to="/profile/settings" />
        <ProfileEntry icon={Bell} label="通知" to="/profile/settings" isFirst={false} badge="即将上线" />
      </ProfileEntryGroup>

      <ProfileEntryGroup>
        <ProfileEntry icon={Globe} label="世界设置" to="/profile/settings" />
        {isDesktopLayout ? null : (
          <ProfileEntry
            icon={HelpCircle}
            label="帮助与反馈"
            to="/profile/settings"
            isFirst={false}
          />
        )}
      </ProfileEntryGroup>
    </AppPage>
  );
}

function ProfileEntryGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white/88 shadow-[var(--shadow-section)]">
      {children}
    </div>
  );
}

function ProfileEntry({
  icon: Icon,
  label,
  to,
  isFirst = true,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  to: string;
  isFirst?: boolean;
  badge?: string;
}) {
  return (
    <Link
      to={to as never}
      className={cn(
        "flex items-center gap-3 px-4 py-4 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]",
        !isFirst ? "border-t border-[color:var(--border-faint)]" : undefined,
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(255,138,61,0.1)] text-[color:var(--brand-primary)]">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1 text-[15px] font-medium text-[color:var(--text-primary)]">{label}</div>
      {badge ? (
        <span className="rounded-full bg-[rgba(249,115,22,0.10)] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[color:var(--brand-primary)]">
          {badge}
        </span>
      ) : null}
      <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
    </Link>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[20px] border border-white/80 bg-white/88 px-3 py-3 text-center shadow-[var(--shadow-soft)]">
      <div className="text-[11px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-1.5 text-sm font-medium text-[color:var(--text-primary)]">{value}</div>
    </div>
  );
}
