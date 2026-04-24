import type { ReactNode } from "react";
import { msg } from "@lingui/macro";
import { Link } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { AdminContextBadge, AdminEyebrow } from "./admin-workbench";
import type { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

type SidebarLink = {
  label: ReactNode;
  roleBadge?: ReactNode;
  to:
    | "/"
    | "/setup"
    | "/characters"
    | "/inference"
    | "/games"
    | "/chat-records"
    | "/need-discovery"
    | "/followup-runtime"
    | "/self-agent"
    | "/reminder-runtime"
    | "/token-usage"
    | "/action-runtime"
    | "/cyber-avatar"
    | "/real-world-sync"
    | "/evals";
  hint: ReactNode;
};

type SidebarIssue = {
  label: ReactNode;
  detail: ReactNode;
  to:
    | "/"
    | "/characters"
    | "/inference"
    | "/chat-records"
    | "/token-usage"
    | "/evals";
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
}: AdminSidebarProps) {
  const t = translateRuntimeMessage;
  const issues: SidebarIssue[] = [];
  if (!coreApiHealthy) {
    issues.push({
      label: t(msg`远程 API 离线`),
      detail: t(msg`先恢复世界实例连接，再继续后台操作。`),
      to: "/",
    });
  }
  if (!providerReady) {
    issues.push({
      label: t(msg`推理服务未配置`),
      detail: t(msg`补齐模型、接口和 API Key，否则无法跑真实生成。`),
      to: "/",
    });
  }
  if (!digitalHumanSummary.ready) {
    issues.push({
      label: t(msg`数字人 ${digitalHumanSummary.statusLabel}`),
      detail: digitalHumanSummary.nextStep,
      to: "/",
    });
  }
  if (ownerCount !== null && ownerCount !== 1) {
    issues.push({
      label: t(msg`世界主人数量异常`),
      detail: t(msg`单世界实例必须且只能有一个世界主人。`),
      to: "/",
    });
  }
  const issueCount = issues.length;

  const statusItems = [
    {
      label: t(msg`接口`),
      tone: coreApiHealthy ? "healthy" : "warning",
    } as const,
    {
      label: t(msg`推理`),
      tone: providerReady ? "healthy" : "warning",
    } as const,
    {
      label: t(msg`主人`),
      tone: ownerCount === 1 ? "healthy" : "warning",
    } as const,
    {
      label: t(msg`数字人`),
      tone: digitalHumanSummary.ready ? "healthy" : "warning",
    } as const,
  ];

  return (
    <aside className="flex h-full flex-col border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]/92 px-4 py-4 shadow-[var(--shadow-shell)] backdrop-blur xl:px-5 xl:py-5 lg:border-b-0 lg:border-r">
      {/* Brand header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">
            {t(msg`隐界`)}
          </div>
          <div className="break-words text-base font-semibold leading-tight text-[color:var(--text-primary)]">
            {t(msg`运营控制台`)}
          </div>
        </div>
        {issueCount > 0 ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            {t(msg`${issueCount} 项待处理`)}
          </span>
        ) : (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {t(msg`已就绪`)}
          </span>
        )}
      </div>

      {/* Compact status row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-3 py-2">
        {statusItems.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center gap-1.5">
            <StatusDot tone={item.tone} />
            <span className="min-w-0 break-words text-xs leading-4 text-[color:var(--text-muted)]">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Issues panel — only shown when there are problems */}
      {issueCount > 0 ? (
        <section className="mt-3 rounded-[20px] border border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))] p-3 shadow-[var(--shadow-soft)]">
          <div className="space-y-2">
            {issues.map((issue, index) => (
              <Link
                key={`${issue.to}-${index}`}
                to={issue.to}
                className="block rounded-[14px] border border-amber-200/70 bg-white/70 px-3 py-2.5 transition hover:border-amber-300 hover:bg-white"
              >
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {issue.label}
                </div>
                <div className="mt-0.5 text-xs leading-5 text-[color:var(--text-secondary)]">
                  {issue.detail}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Main nav */}
      <nav className="mt-4 flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <AdminEyebrow className="px-1">{t(msg`导航`)}</AdminEyebrow>
          <div className="mt-2 space-y-1">
            {navLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={NAV_LINK}
                activeProps={{ className: NAV_LINK_ACTIVE }}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words leading-5">
                    {item.label}
                  </span>
                  {item.roleBadge ? (
                    <AdminContextBadge
                      label={item.roleBadge}
                      className="max-w-[8.5rem] shrink-0 bg-[color:var(--surface-primary)]/92"
                    />
                  ) : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      </nav>

      {/* Secret — compact when configured */}
      <div className="mt-4 border-t border-[color:var(--border-faint)] pt-4">
        {editingSecret ? (
          <div className="space-y-2">
            <AdminEyebrow className="px-1">{t(msg`管理密钥`)}</AdminEyebrow>
            <input
              type="password"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder={t(msg`输入后台密钥`)}
              className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none transition focus:border-[color:var(--border-brand)]"
              onKeyDown={(event) => event.key === "Enter" && onSaveSecret()}
            />
            <Button
              variant="primary"
              size="sm"
              className="w-full justify-center"
              onClick={onSaveSecret}
            >
              {t(msg`保存密钥`)}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-[color:var(--text-muted)]">
              {secret ? t(msg`密钥已配置`) : t(msg`密钥未配置`)}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-[color:var(--brand-primary)] transition hover:text-[color:var(--brand-secondary)]"
              onClick={onEditSecret}
            >
              {secret ? t(msg`修改`) : t(msg`立即配置`)}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
