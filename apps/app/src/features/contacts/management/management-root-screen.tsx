import { msg } from "@lingui/macro";
import {
  CheckSquare,
  ChevronRight,
  ShieldX,
  Tag as TagIcon,
  UserCog,
} from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

type RootScreenProps = {
  onOpenBlacklist: () => void;
  onOpenPermissions: () => void;
  onOpenTags: () => void;
  onEnterBulkMode: () => void;
};

export function ManagementRootScreen({
  onOpenBlacklist,
  onOpenPermissions,
  onOpenTags,
  onEnterBulkMode,
}: RootScreenProps) {
  const t = useRuntimeTranslator();

  const items = [
    {
      key: "permissions",
      label: t(msg`朋友权限`),
      icon: UserCog,
      onClick: onOpenPermissions,
    },
    {
      key: "blacklist",
      label: t(msg`黑名单`),
      icon: ShieldX,
      onClick: onOpenBlacklist,
    },
    {
      key: "tags",
      label: t(msg`标签`),
      icon: TagIcon,
      onClick: onOpenTags,
    },
    {
      key: "bulk",
      label: t(msg`批量管理`),
      icon: CheckSquare,
      onClick: onEnterBulkMode,
    },
  ];

  return (
    <div className="px-3 py-3">
      <ul className="overflow-hidden rounded-[12px] bg-[color:var(--surface-card)] shadow-[0_1px_0_rgba(180, 130, 20, 0.04)]">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)] active:bg-black/5",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-[#f0f0f0] text-[color:var(--text-secondary)]">
                  <Icon aria-hidden="true" size={15} />
                </div>
                <span className="min-w-0 flex-1 text-[15px] text-[color:var(--text-primary)]">
                  {item.label}
                </span>
                <ChevronRight
                  aria-hidden="true"
                  size={16}
                  className="shrink-0 text-[color:var(--text-muted)]"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
