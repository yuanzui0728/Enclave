// i18n-ignore-start: cloud-console surface 字典里没有这组中文，直接走字面量。
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDateTime, useAppLocale } from "@yinjie/i18n";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { formatCloudConsolePageOfTotal } from "../lib/cloud-console-i18n";
import { Pager } from "../components/pager";
import { SurfaceCard } from "../components/ui";

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

const FILTER_CONTROL_CLASS =
  "rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3 py-2 text-sm";

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-[#fdecec] text-[#a13a3a]",
  patroller: "bg-[#eaf2ff] text-[#2c5bb8]",
  autoconfirmed: "bg-[#eaf6ec] text-[#2e7d5b]",
  newcomer: "bg-[#f3f3f3] text-[#5b5b5b]",
};

export function WikiUsersPage() {
  const { locale } = useAppLocale();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const normalizedQ = q.trim();
  const usersQuery = useQuery({
    queryKey: ["cloud-console", "wiki-users", normalizedQ, page],
    queryFn: () =>
      cloudAdminApi.listWikiUsers({
        q: normalizedQ || undefined,
        page,
        pageSize: 20,
      }),
  });

  return (
    <SurfaceCard className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="搜索用户名 / 邮箱"
          className={FILTER_CONTROL_CLASS}
        />
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white px-3 py-2 text-sm text-[color:var(--text-secondary)]">
          {formatCloudConsolePageOfTotal(
            usersQuery.data?.page ?? page,
            usersQuery.data?.totalPages ?? 1,
            locale,
          )}
        </div>
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white px-3 py-2 text-sm text-[color:var(--text-secondary)]">
          {usersQuery.data
            ? `共 ${usersQuery.data.total} 位 wiki 用户`
            : "—"}
        </div>
      </div>

      {usersQuery.isLoading ? <LoadingBlock label="加载 wiki 用户中..." /> : null}
      {usersQuery.isError ? (
        <ErrorBlock
          message={
            usersQuery.error instanceof Error
              ? usersQuery.error.message
              : "加载用户列表失败"
          }
        />
      ) : null}

      {usersQuery.data ? (
        <div className="overflow-x-auto rounded-[24px] border border-[color:var(--border-faint)] bg-white">
          <table className="w-full table-fixed divide-y divide-[color:var(--border-faint)] text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[22%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-[#f8faf8] text-left text-[color:var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">用户名</th>
                <th className="px-4 py-3 font-medium">邮箱</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">用户类型</th>
                <th className="px-4 py-3 font-medium">注册时间</th>
                <th className="px-4 py-3 font-medium text-right">私有角色</th>
                <th className="px-4 py-3 font-medium">最近编辑</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border-faint)]">
              {usersQuery.data.items.map((user) => (
                <tr key={user.id} className="align-top">
                  <td className="truncate px-4 py-3">
                    <Link
                      to="/wiki-users/$userId"
                      params={{ userId: user.id }}
                      className="font-medium text-[color:var(--brand-primary)]"
                      title={user.username}
                    >
                      {user.username}
                    </Link>
                  </td>
                  <td className="truncate px-4 py-3" title={user.email ?? ""}>
                    {user.email || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs ${
                        ROLE_COLOR[user.role] ?? "bg-[#f3f3f3] text-[#5b5b5b]"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="truncate px-4 py-3">{user.userType}</td>
                  <td className="px-4 py-3">
                    {formatTimestamp(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        user.privateCharacterCount > 0
                          ? "font-semibold text-[color:var(--brand-primary)]"
                          : "text-[color:var(--text-muted)]"
                      }
                    >
                      {user.privateCharacterCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--text-secondary)]">
                    {formatTimestamp(user.lastEditAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {usersQuery.data && !usersQuery.data.items.length ? (
        <InlineNotice tone="muted">没有匹配的 wiki 用户。</InlineNotice>
      ) : null}

      <div className="flex items-center justify-end">
        <Pager
          page={page}
          totalPages={usersQuery.data?.totalPages ?? 1}
          onPageChange={setPage}
        />
      </div>
    </SurfaceCard>
  );
}
// i18n-ignore-end
