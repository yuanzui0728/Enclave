import { Link } from "@tanstack/react-router";
import { Button, StatusPill } from "@yinjie/ui";

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

type AdminSidebarProps = {
  secret: string;
  editingSecret: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSaveSecret: () => void;
  onEditSecret: () => void;
  coreApiHealthy: boolean;
  providerReady: boolean;
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
  ownerCount,
  navLinks,
  contextTitle,
  contextLinks,
}: AdminSidebarProps) {
  return (
    <aside className="flex h-full flex-col border-b border-[color:var(--border-faint)] bg-[color:var(--surface-shell)]/92 px-4 py-4 shadow-[var(--shadow-shell)] backdrop-blur xl:px-5 xl:py-5 lg:border-b-0 lg:border-r">
      <div className="rounded-[28px] border border-[color:var(--border-subtle)] bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(255,247,235,0.92))] p-5 shadow-[var(--shadow-card)]">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">隐界 Admin</div>
        <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">运营控制台</div>
        <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
          先看实例健康，再进入角色、回复逻辑和评测工作区。
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <StatusBlock
          label="核心接口"
          value={coreApiHealthy ? "在线" : "待恢复"}
          tone={coreApiHealthy ? "healthy" : "warning"}
        />
        <StatusBlock
          label="推理服务"
          value={providerReady ? "已配置" : "待配置"}
          tone={providerReady ? "healthy" : "warning"}
        />
        <StatusBlock
          label="世界主人"
          value={ownerCount == null ? "加载中" : `${ownerCount} 个`}
          tone={ownerCount === 1 ? "healthy" : "warning"}
        />
      </div>

      <nav className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <div className="px-3 text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">主导航</div>
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
            <div className="px-3 text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
              {contextTitle ?? "当前上下文"}
            </div>
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
        <div className="text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">管理密钥</div>
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

function StatusBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "healthy" | "warning";
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--border-faint)] bg-[color:var(--surface-primary)] px-4 py-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{label}</div>
        <StatusPill tone={tone}>{value}</StatusPill>
      </div>
    </div>
  );
}
