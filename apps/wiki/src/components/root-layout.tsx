import { Link, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { LoadingBlock } from "@yinjie/ui";
import { clearSession, hasRole, roleLabel } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";

export function RootLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            隐界角色百科
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="hover:underline">
              首页
            </Link>
            <Link to="/recent-changes" className="hover:underline">
              最近修改
            </Link>
            {hasRole(user, "patroller") && (
              <Link to="/pending-reviews" className="hover:underline">
                待审编辑
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-[var(--text-muted)]">
                  {user.username}（{roleLabel(user.role)}）
                </span>
                <button
                  type="button"
                  className="px-3 py-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-canvas)]"
                  onClick={() => {
                    clearSession();
                    window.location.href = "/login";
                  }}
                >
                  退出
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-3 py-1 rounded border border-[var(--border-subtle)] hover:bg-[var(--bg-canvas)]"
                >
                  登录
                </Link>
                <Link
                  to="/register"
                  className="px-3 py-1 rounded bg-[var(--accent)] text-white"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-6">
        <Suspense fallback={<LoadingBlock className="m-6" />}>
          <Outlet />
        </Suspense>
      </main>
      <footer className="border-t border-[var(--border-subtle)] py-4 text-center text-xs text-[var(--text-muted)]">
        隐界角色百科 · 任何登录用户都可以提交编辑，由巡查员审核生效
      </footer>
    </div>
  );
}
