import { Link } from "@tanstack/react-router";
import { Button, StatusPill } from "@yinjie/ui";
import { AdminCompactStatusCard, AdminEyebrow } from "./admin-workbench";
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
  "group block rounded-[24px] border border-transparent px-4 py-3 transition-[background-color,border-color,transform,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:shadow-[var(--shadow-soft)]";
const NAV_LINK_ACTIVE =
  "rounded-[24px] border border-[color:var(--border-brand)] bg-[color:var(--surface-card)] px-4 py-3 shadow-[var(--shadow-soft)]";

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

  return (
    <aside className="flex h-full flex-col border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]/92 px-4 py-4 shadow-[var(--shadow-shell)] backdrop-blur xl:px-5 xl:py-5 lg:border-b-0 lg:border-r">
      <div className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,247,235,0.92))] p-5 shadow-[var(--shadow-card)]">
        <AdminEyebrow className="tracking-[0.3em]">隐界 Admin</AdminEyebrow>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">运营控制台</div>
        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          先看实例健康，再进入角色、回复逻辑和评测工作区。
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-1">
        <AdminCompactStatusCard
          label="核心接口"
          value={coreApiHealthy ? "在线" : "待恢复"}
          tone={coreApiHealthy ? "healthy" : "warning"}
        />
        <AdminCompactStatusCard
          label="推理服务"
          value={providerReady ? "已配置" : "待配置"}
          tone={providerReady ? "healthy" : "warning"}
        />
        <AdminCompactStatusCard
          label="世界主人"
          value={ownerCount == null ? "加载中" : `${ownerCount} 个`}
          tone={ownerCount === 1 ? "healthy" : "warning"}
        />
        <AdminCompactStatusCard
          label="数字人"
          value={digitalHumanSummary.statusLabel}
          tone={digitalHumanSummary.ready ? "healthy" : "warning"}
        />
      </div>

      <section
        className={
          issueCount > 0
            ? "mt-4 rounded-[26px] border border-amber-200 bg-[linear-gradient(160deg,rgba(255,251,235,0.98),rgba(255,243,219,0.92))] p-4 shadow-[var(--shadow-soft)]"
            : "mt-4 rounded-[26px] border border-emerald-200 bg-[linear-gradient(160deg,rgba(236,253,245,0.96),rgba(220,252,231,0.92))] p-4 shadow-[var(--shadow-soft)]"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <AdminEyebrow>优先处理</AdminEyebrow>
            <div className="mt-2 text-sm font-semibold text-[color:var(--text-primary)]">
              {issueCount > 0 ? `当前有 ${issueCount} 项待处理` : "实例已达到可操作状态"}
            </div>
          </div>
          <StatusPill tone={issueCount > 0 ? "warning" : "healthy"}>
            {issueCount > 0 ? "待处理" : "已就绪"}
          </StatusPill>
        </div>

        {issueCount > 0 ? (
          <div className="mt-3 space-y-2">
            {issues.map((issue) => (
              <Link
                key={issue.label}
                to={issue.to}
                className="block rounded-[18px] border border-amber-200/70 bg-white/70 px-3 py-3 transition hover:border-amber-300 hover:bg-white"
              >
                <div className="text-sm font-medium text-[color:var(--text-primary)]">{issue.label}</div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">{issue.detail}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
            可以直接进入角色、回复逻辑和评测工作区处理日常运营动作。
          </div>
        )}
      </section>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <AdminEyebrow className="px-3">主导航</AdminEyebrow>
          <div className="mt-3 space-y-2">
            {navLinks.map((item) => (
              <Link key={item.to} to={item.to} className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
                <div className="text-sm font-semibold text-[color:var(--text-primary)]">{item.label}</div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)] transition group-hover:text-[color:var(--text-secondary)]">
                  {item.hint}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {contextLinks?.length ? (
          <section>
            <AdminEyebrow className="px-3">
              {contextTitle ?? "当前上下文"}
            </AdminEyebrow>
            <div className="mt-3 space-y-2 rounded-[26px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] p-3 shadow-[var(--shadow-soft)]">
              {contextLinks.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={
                    item.active
                      ? "block rounded-[18px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-3 py-2.5 text-sm font-medium text-[color:var(--brand-primary)]"
                      : "block rounded-[18px] border border-transparent px-3 py-2.5 text-sm text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card)] hover:text-[color:var(--text-primary)]"
                  }
                >
                  {item.label}
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </nav>

      <section className="mt-5 rounded-[26px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] p-4 shadow-[var(--shadow-soft)]">
        <AdminEyebrow>管理密钥</AdminEyebrow>
        {editingSecret ? (
          <div className="mt-3 space-y-3">
            <input
              type="password"
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="输入后台密钥"
              className="w-full rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2.5 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none transition focus:border-[color:var(--border-brand)]"
              onKeyDown={(event) => event.key === "Enter" && onSaveSecret()}
            />
            <Button variant="primary" size="sm" className="w-full justify-center" onClick={onSaveSecret}>
              保存密钥
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-sm text-[color:var(--text-secondary)]">
              {secret ? "已配置，可直接访问后台接口。" : "未配置，当前无法访问后台管理接口。"}
            </div>
            <button
              type="button"
              className="mt-3 text-sm font-medium text-[color:var(--brand-primary)] transition hover:text-[color:var(--brand-secondary)]"
              onClick={onEditSecret}
            >
              {secret ? "修改密钥" : "立即配置"}
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}
