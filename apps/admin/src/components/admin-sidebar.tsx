import { Link } from "@tanstack/react-router";
import { Button } from "@yinjie/ui";
import { AdminEyebrow } from "./admin-workbench";
import type { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

type SidebarLink = {
  label: string;
  to: "/" | "/characters" | "/setup" | "/evals" | "/reply-logic";
  hint: string;
};

type ContextLink = {
  label: string;
  href: string;
  active: boolean;
};

type SidebarIssue = {
  label: string;
  detail: string;
  to: "/" | "/characters" | "/setup" | "/evals" | "/reply-logic";
};

type AdminSidebarProps = {
  secret: string;
  editingSecret: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveSecret: () => void;
  onEditSecret: () => void;
  coreApiHealthy: boolean;
  providerReady: boolean;
  digitalHumanSummary: ReturnType<typeof buildDigitalHumanAdminSummary>;
  ownerCount: number | null;
  navLinks: readonly SidebarLink[];
  contextTitle?: string;
  contextLinks?: ContextLink[];
};

const NAV_LINK =
  "block rounded-[20px] border border-transparent px-3.5 py-2.5 text-sm text-[color:var(--text-secondary)] transition-[background-color,border-color] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]";
const NAV_LINK_ACTIVE =
  "block rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--surface-card)] px-3.5 py-2.5 text-sm font-semibold text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]";

function StatusDot({ tone }: { tone: "healthy" | "warning" | "muted" }) {
  return (
    <span
      className={
        tone === "healthy"
          ? "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
          : tone === "warning"
            ? "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
            : "inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--border-strong)]"
      }
    />
  );
}

export function AdminSidebar({
  secret,
  editingSecret,
  draft,
  onDraftChange,
  onSaveSecret,
  onEditSecret,
  coreApiHealthy,
  providerReady,
  digitalHumanSummary,
  ownerCount,
  navLinks,
  contextTitle,
  contextLinks,
}: AdminSidebarProps) {
  const issues: SidebarIssue[] = [];
  if (!coreApiHealthy) {
    issues.push({
      label: "远程 API 离线",
      detail: "先恢复世界实例连接，再继续后台操作。",
      to: "/setup",
    });
  }
  if (!providerReady) {
    issues.push({
      label: "推理服务未配置",
      detail: "补齐模型、接口和 API Key，否则无法跑真实生成。",
      to: "/setup",
    });
  }
  if (!digitalHumanSummary.ready) {
    issues.push({
      label: `数字人 ${digitalHumanSummary.statusLabel}`,
      detail: digitalHumanSummary.nextStep,
      to: "/setup",
    });
  }
  if (ownerCount !== null && ownerCount !== 1) {
    issues.push({
      label: "世界主人数量异常",
      detail: "单世界实例必须且只能有一个世界主人。",
      to: "/",
    });
  }
  const issueCount = issues.length;

  const statusItems = [
    { label: "接口", tone: coreApiHealthy ? "healthy" : "warning" } as const,
    { label: "推理", tone: providerReady ? "healthy" : "warning" } as const,
    {
      label: "主人",
      tone: ownerCount === 1 ? "healthy" : "warning",
    } as const,
    {
      label: "数字人",
      tone: digitalHumanSummary.ready ? "healthy" : "warning",
    } as const,
  ];

  return (
    <aside className="flex h-full flex-col border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]/92 px-4 py-4 shadow-[var(--shadow-shell)] backdrop-blur xl:px-5 xl:py-5 lg:border-b-0 lg:border-r">
      {/* Brand header */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">隐界</div>
          <div className="text-base font-semibold leading-tight text-[color:var(--text-primary)]">运营控制台</div>
        </div>
        {issueCount > 0 ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {issueCount} 项待处理
          </span>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            已就绪
          </span>
        )}
      </div>

      {/* Compact status row */}
      <div className="mt-3 flex items-center gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-3 py-2">
        {statusItems.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <StatusDot tone={item.tone} />
            <span className="text-xs text-[color:var(--text-muted)]">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Issues panel — only shown when there are problems */}
      {issueCount > 0 ? (
        <section className="mt-3 rounded-[20px] border border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))] p-3 shadow-[var(--shadow-soft)]">
          <div className="space-y-2">
            {issues.map((issue) => (
              <Link
                key={issue.label}
                to={issue.to}
                className="block rounded-[14px] border border-amber-200/70 bg-white/70 px-3 py-2.5 transition hover:border-amber-300 hover:bg-white"
              >
                <div className="text-sm font-medium text-[color:var(--text-primary)]">{issue.label}</div>
                <div className="mt-0.5 text-xs leading-5 text-[color:var(--text-secondary)]">{issue.detail}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Main nav */}
      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <AdminEyebrow className="px-1">导航</AdminEyebrow>
          <div className="mt-2 space-y-1">
            {navLinks.map((item) => (
              <Link key={item.to} to={item.to} className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        {contextLinks?.length ? (
          <section>
            <AdminEyebrow className="px-1">{contextTitle ?? "当前上下文"}</AdminEyebrow>
            <div className="mt-2 space-y-1 rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] p-2">
              {contextLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    item.active
                      ? "block rounded-[14px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-2 text-sm font-medium text-[color:var(--brand-primary)]"
                      : "block rounded-[14px] border border-transparent px-3 py-2 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
                  }
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </nav>

      {/* Secret — compact when configured */}
      <div className="mt-4 border-t border-[color:var(--border-faint)] pt-4">
        {editingSecret ? (
          <div className="space-y-2">
            <AdminEyebrow className="px-1">管理密钥</AdminEyebrow>
            <input
              type="password"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="输入后台密钥"
              className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none transition focus:border-[color:var(--border-brand)]"
              onKeyDown={(event) => event.key === "Enter" && onSaveSecret()}
            />
            <Button variant="primary" size="sm" className="w-full justify-center" onClick={onSaveSecret}>
              保存密钥
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-[color:var(--text-muted)]">
              {secret ? "密钥已配置" : "密钥未配置"}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-[color:var(--brand-primary)] transition hover:text-[color:var(--brand-secondary)]"
              onClick={onEditSecret}
            >
              {secret ? "修改" : "立即配置"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
