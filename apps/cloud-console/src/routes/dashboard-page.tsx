import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { cloudAdminApi } from "../lib/cloud-admin-api";

function countByStatus(items: { status: string }[], target: string) {
  return items.filter((item) => item.status === target).length;
}

export function DashboardPage() {
  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "requests"],
    queryFn: () => cloudAdminApi.listRequests(),
  });
  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds"],
    queryFn: () => cloudAdminApi.listWorlds(),
  });

  const requests = requestsQuery.data ?? [];
  const worlds = worldsQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "待处理申请", value: countByStatus(requests, "pending") },
          { label: "处理中申请", value: countByStatus(requests, "provisioning") },
          { label: "已开通世界", value: countByStatus(worlds, "active") },
          { label: "停用世界", value: countByStatus(worlds, "disabled") },
        ].map((item) => (
          <div key={item.label} className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
            <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">{item.label}</div>
            <div className="mt-4 text-4xl font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">最新申请</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">用户在客户端提交云世界创建需求后会出现在这里。</div>
            </div>
            <Link to="/requests" className="text-sm text-[color:var(--brand)]">
              查看全部
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {requests.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to="/requests/$requestId"
                params={{ requestId: item.id }}
                className="block rounded-2xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{item.worldName}</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-secondary)]">{item.phone}</div>
              </Link>
            ))}
            {requests.length === 0 ? <div className="text-sm text-[color:var(--text-muted)]">暂无申请。</div> : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">最新世界</div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">这里维护手机号、世界状态和最终交付地址。</div>
            </div>
            <Link to="/worlds" className="text-sm text-[color:var(--brand)]">
              查看全部
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {worlds.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to="/worlds/$worldId"
                params={{ worldId: item.id }}
                className="block rounded-2xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 transition hover:border-[color:var(--border-strong)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-white">{item.name}</div>
                  <div className="text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{item.status}</div>
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-secondary)]">{item.phone}</div>
              </Link>
            ))}
            {worlds.length === 0 ? <div className="text-sm text-[color:var(--text-muted)]">暂无云世界。</div> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
