import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "@tanstack/react-router";
import { getCloudAdminSecret, setCloudAdminSecret } from "../lib/cloud-admin-api";

const NAV_LINK = "rounded-full border border-[color:var(--border-subtle)] px-4 py-2 text-[color:var(--text-secondary)] transition hover:border-[color:var(--border-strong)] hover:text-[color:var(--text-primary)]";
const NAV_LINK_ACTIVE = "rounded-full border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-2 text-[color:var(--brand-primary)] font-medium";

export function RootLayout() {
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState(getCloudAdminSecret);
  const [editingSecret, setEditingSecret] = useState(!getCloudAdminSecret());
  const [draft, setDraft] = useState(getCloudAdminSecret);

  function saveSecret() {
    setCloudAdminSecret(draft);
    setSecret(draft);
    setEditingSecret(false);
    void queryClient.invalidateQueries();
  }

  return (
    <div className="min-h-screen px-6 py-6 text-[color:var(--text-primary)]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-45"
        style={{
          backgroundImage: "var(--bg-grid)",
          backgroundSize: "24px 24px",
          maskImage: "linear-gradient(180deg, rgba(0,0,0,0.42), transparent 88%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <div className="mb-6 rounded-[30px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] px-6 py-5 shadow-[var(--shadow-overlay)]">
          <div className="text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">Yinjie Cloud Ops</div>
          <div className="mt-2 text-3xl font-semibold">官方云世界管理平台</div>
          <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            管理手机号绑定的云世界、接收创建申请、人工开通并回填世界地址，不负责自动实例编排。
          </div>

          <div className="mt-4">
            {editingSecret ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="输入 CLOUD_ADMIN_SECRET"
                  className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none focus:border-[color:var(--border-brand)]"
                  onKeyDown={(event) => event.key === "Enter" && saveSecret()}
                />
                <button className="rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] hover:border-[color:var(--border-strong)]" onClick={saveSecret}>
                  保存
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                <span>平台密钥：{secret ? "••••••••" : "未配置"}</span>
                <button className="text-xs underline hover:text-[color:var(--text-primary)]" onClick={() => setEditingSecret(true)}>
                  修改
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link to="/" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              概览
            </Link>
            <Link to="/requests" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              申请列表
            </Link>
            <Link to="/worlds" className={NAV_LINK} activeProps={{ className: NAV_LINK_ACTIVE }}>
              世界列表
            </Link>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
