import { Link, useLocation } from "@tanstack/react-router";

type Props = {
  characterId: string;
};

export function CharacterWorkspaceNav({ characterId }: Props) {
  const location = useLocation();
  const pathname = location.pathname;

  const isFactory = pathname.endsWith("/factory");
  const isRuntime = pathname.endsWith("/runtime");
  const isEditor = !isFactory && !isRuntime;

  const tabs = [
    { label: "行为管理", to: `/characters/${characterId}`, active: isEditor },
    { label: "运行台", to: `/characters/${characterId}/runtime`, active: isRuntime },
  ];

  return (
    <div className="flex gap-0.5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] p-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={
            tab.active
              ? "flex-1 rounded-[14px] bg-white px-4 py-2 text-center text-sm font-semibold text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] transition"
              : "flex-1 rounded-[14px] px-4 py-2 text-center text-sm text-[color:var(--text-secondary)] transition hover:bg-white/50 hover:text-[color:var(--text-primary)]"
          }
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
