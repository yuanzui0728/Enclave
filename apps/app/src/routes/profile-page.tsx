import { Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { AppPage, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
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

      <ProfileEntryGroup>
        <ProfileEntry icon={Settings} label="设置" to="/profile/settings" />
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
}: {
  icon: React.ElementType;
  label: string;
  to: string;
}) {
  return (
    <Link
      to={to as never}
      className={cn(
        "flex items-center gap-3 px-4 py-4 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] bg-[rgba(255,138,61,0.1)] text-[color:var(--brand-primary)]">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1 text-[15px] font-medium text-[color:var(--text-primary)]">{label}</div>
      <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
    </Link>
  );
}
