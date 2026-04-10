import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { DesktopRuntimeGuard } from "./desktop-runtime-guard";
import { getAdminSecret, setAdminSecret } from "../lib/admin-api";

const NAV_LINK = "rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]";
const NAV_LINK_ACTIVE = "rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-2 text-[color:var(--brand-primary)] font-medium";

export function RootLayout() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState(getAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getAdminSecret());
  const [draft, setDraft] = useState(getAdminSecret);

  function saveSecret() {
    setAdminSecret(draft);
    setSecret(draft);
    setEditingSecret(false);
    void queryClient.invalidateQueries();
  }

  return (
    <div className="min-h-screen bg-transparent px-6 py-6 text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.38), transparent 88%)",
        }}
      />
      <DesktopRuntimeGuard />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-6 rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-6 py-5 shadow-[var(--shadow-overlay)]">
          <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">隐界管理后台</div>
          <div className="mt-2 text-3xl font-semibold">管理控制台</div>

          {/* Admin Secret 配置 */}
          <div className="mt-3">
            {editingSecret ? (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="输入 ADMIN_SECRET"
                  className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--border-brand)]"
                  onKeyDown={(e) => e.key === "Enter" && saveSecret()}
                />
                <button
                  className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]"
                  onClick={saveSecret}
                >
                  保存
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                <span>管理密钥：{secret ? "••••••••" : <span className="text-amber-600">未配置</span>}</span>
                <button className="text-xs underline hover:text-[color:var(--text-primary)]" onClick={() => setEditingSecret(true)}>
                  修改
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              总览
            </Link>
            <Link to="/characters" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              角色
            </Link>
            <Link to="/setup" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              设置
            </Link>
            <Link to="/evals" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              评测
            </Link>
            <Link to="/reply-logic" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              回复逻辑
            </Link>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
