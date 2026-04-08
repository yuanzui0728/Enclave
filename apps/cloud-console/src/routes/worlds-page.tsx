import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { CloudWorldStatus } from "@yinjie/contracts";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type WorldStatusFilter = Exclude<CloudWorldStatus, "none"> | "all";

export function WorldsPage() {
  const [filter, setFilter] = useState<WorldStatusFilter>("all");
  const worldsQuery = useQuery({
    queryKey: ["cloud-console", "worlds", filter],
    queryFn: () => cloudAdminApi.listWorlds(filter === "all" ? undefined : filter),
  });

  return (
    <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-white">云世界列表</div>
          <div className="mt-1 text-sm text-[color:var(--text-secondary)]">手机号、世界名称、状态和对外地址都在这里维护。</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {["all", "pending", "provisioning", "active", "rejected", "disabled"].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status as WorldStatusFilter)}
              className={`rounded-full border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                filter === status
                  ? "border-[color:var(--border-strong)] bg-[color:var(--surface-tertiary)] text-white"
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
          <thead className="bg-black/20 text-[color:var(--text-muted)]">
            <tr>
              <th className="px-4 py-3">世界名称</th>
              <th className="px-4 py-3">手机号</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">世界地址</th>
            </tr>
          </thead>
          <tbody>
            {(worldsQuery.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-[color:var(--border-faint)]">
                <td className="px-4 py-3">
                  <Link to="/worlds/$worldId" params={{ worldId: item.id }} className="text-white hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.phone}</td>
                <td className="px-4 py-3 uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.status}</td>
                <td className="px-4 py-3 text-[color:var(--text-secondary)]">{item.apiBaseUrl ?? "未录入"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {worldsQuery.data?.length ? null : <div className="p-4 text-sm text-[color:var(--text-muted)]">暂无匹配世界。</div>}
      </div>
    </section>
  );
}
