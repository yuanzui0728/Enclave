import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CloudWorldStatus } from "@yinjie/contracts";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type RequestStatusFilter = Exclude<CloudWorldStatus, "none"> | "all";

export function RequestsPage() {
  const [filter, setFilter] = useState<RequestStatusFilter>("all");
  const requestsQuery = useQuery({
    queryKey: ["cloud-console", "requests", filter],
    queryFn: () => cloudAdminApi.listRequests(filter === "all" ? undefined : filter),
  });

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">云世界申请列表</div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">优先处理 `pending`，进入部署后切到 `provisioning`，交付地址后再切到 `active`。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "provisioning", "active", "rejected", "disabled"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as RequestStatusFilter)}
              className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                filter === status
                  ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-[color:var(--text-primary)]"
                  : "border-[color:var(--border-faint)] text-[color:var(--text-secondary)]"
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-[color:var(--border-faint)]">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-[color:var(--surface-soft)] text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">世界名称</th>
              <th className="px-4 py-3">手机号</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {(requestsQuery.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-[color:var(--border-faint)]">
                <td className="px-4 py-3">
                  <Link to="/requests/$requestId" params={{ requestId: item.id }} className="text-[color:var(--text-primary)] hover:underline">
                    {item.worldName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.phone}</td>
                <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.status}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{new Date(item.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {requestsQuery.data?.length ? null : <div className="p-4 text-sm text-[color:var(--text-muted)]">暂无匹配申请。</div>}
      </div>
    </section>
  );
}
