import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Card } from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";

const ADMIN_TABS: { to: string; label: MessageDescriptor }[] = [
  { to: "/admin/users", label: msg`用户与权限` },
  { to: "/admin/blocks", label: msg`封禁` },
  { to: "/admin/protection", label: msg`页面保护` },
  { to: "/admin/reports", label: msg`举报队列` },
  { to: "/admin/abuse-filters", label: msg`反破坏过滤器` },
  { to: "/admin/wiki-stats", label: msg`治理仪表盘` },
];

export function AdminLayout() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!hasRole(user, "admin")) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold">
          <Trans>需要管理员权限</Trans>
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          {user ? (
            <Trans>仅管理员可访问此区域。当前账号权限不足。</Trans>
          ) : (
            <Trans>
              仅管理员可访问此区域。请先{" "}
              <Link to="/login" className="font-medium underline">
                登录
              </Link>{" "}
              管理员账号。
            </Trans>
          )}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-1.5 shadow-[var(--shadow-soft)]">
        <ul className="flex min-w-max items-center gap-1">
          {ADMIN_TABS.map((tab) => {
            const active =
              pathname === tab.to || pathname.startsWith(`${tab.to}/`);
            return (
              <li key={tab.to}>
                <Link
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[image:var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[var(--shadow-soft)]"
                      : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card-hover)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  {t(tab.label)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <Outlet />
    </div>
  );
}
