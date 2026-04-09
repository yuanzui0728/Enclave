import { Link } from "@tanstack/react-router";
import { ChevronRight, Settings } from "lucide-react";
import { AppPage, cn } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useWorldOwnerStore } from "../store/world-owner-store";

type ProfileEntry = {
  label: string;
  to: "/profile/settings" | "/friend-requests" | "/legal/privacy" | "/legal/terms" | "/legal/community";
};

const primaryEntries: ProfileEntry[] = [
  { label: "设置", to: "/profile/settings" },
  { label: "好友请求", to: "/friend-requests" },
];

const legalEntries: ProfileEntry[] = [
  { label: "隐私政策", to: "/legal/privacy" },
  { label: "用户协议", to: "/legal/terms" },
  { label: "社区规范", to: "/legal/community" },
];

export function ProfilePage() {
  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);

  return (
    <AppPage className="space-y-4">
      <TabPageTopBar title="我" titleAlign="center" />

      <Link
        to="/profile/settings"
        className="flex items-center gap-4 rounded-[28px] border border-[color:var(--border-faint)] bg-white px-5 py-5 shadow-[var(--shadow-soft)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]"
      >
        <AvatarChip name={username ?? "世界主人"} src={avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">{username ?? "世界主人"}</div>
          <div className="mt-1 line-clamp-2 text-sm text-[color:var(--text-secondary)]">
            {signature?.trim() || "这个服务端实例只属于你。"}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--surface-soft)] text-[color:var(--text-secondary)]">
          <Settings size={18} />
        </div>
      </Link>

      <ProfileEntryGroup entries={primaryEntries} />
      <ProfileEntryGroup entries={legalEntries} />
    </AppPage>
  );
}

function ProfileEntryGroup({ entries }: { entries: ProfileEntry[] }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-soft)]">
      {entries.map((entry, index) => (
        <Link
          key={entry.to}
          to={entry.to}
          className={cn(
            "flex items-center gap-3 px-4 py-4 transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-soft)]",
            index > 0 ? "border-t border-[color:var(--border-faint)]" : undefined,
          )}
        >
          <div className="min-w-0 flex-1 text-[15px] font-medium text-[color:var(--text-primary)]">{entry.label}</div>
          <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
        </Link>
      ))}
    </div>
  );
}
