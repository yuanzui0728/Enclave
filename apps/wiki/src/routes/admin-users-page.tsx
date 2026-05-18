import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  StatusPill,
} from "@yinjie/ui";
import { roleLabel } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import { wikiApi } from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { formatDate } from "../lib/format";

type WikiRole = "newcomer" | "autoconfirmed" | "patroller" | "admin";

const ROLE_OPTIONS: WikiRole[] = [
  "newcomer",
  "autoconfirmed",
  "patroller",
  "admin",
];

export function AdminUsersPage() {
  const t = translateRuntimeMessage;
  const { user } = useAuth();
  const qc = useQueryClient();
  const usersQ = useQuery({
    queryKey: ["wiki", "users"],
    queryFn: () => wikiApi.listUsers(),
  });
  const setRoleMut = useMutation({
    mutationFn: (input: {
      userId: string;
      role: WikiRole;
      reason?: string;
    }) => wikiApi.setUserRole(input.userId, input.role, input.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wiki", "users"] }),
  });

  return (
    <PageShell
      eyebrow={t(msg`管理`)}
      title={
        usersQ.data
          ? t(msg`用户与权限（${usersQ.data.length}）`)
          : t(msg`用户与权限`)
      }
      description={t(
        msg`设置用户的 wiki 角色：新人 / 自动确认 / 巡查员 / 管理员。无法修改自己的角色。`,
      )}
    >
      {usersQ.isLoading && <LoadingBlock />}
      {usersQ.isError && (
        <ErrorBlock message={(usersQ.error as Error).message} />
      )}
      {setRoleMut.isError && (
        <InlineNotice tone="danger">
          {(setRoleMut.error as Error).message}
        </InlineNotice>
      )}
      {usersQ.data && (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)]">
          <div className="wiki-touch-scroll overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-[color:var(--surface-card-hover)] text-left text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    <Trans>用户</Trans>
                  </th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">
                    <Trans>类型</Trans>
                  </th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">
                    <Trans>注册</Trans>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans>角色</Trans>
                  </th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">
                    <Trans>编辑/通过/被回滚/巡查</Trans>
                  </th>
                  <th className="px-4 py-3 font-medium">
                    <Trans>设置角色</Trans>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border-faint)]">
                {usersQ.data.map((u) => (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-[color:var(--surface-card-hover)]"
                  >
                    <td className="px-4 py-3 font-medium text-[color:var(--text-primary)]">
                      {u.username}
                    </td>
                    <td className="hidden px-4 py-3 text-xs sm:table-cell">
                      {u.userType === "world_owner" ? (
                        <StatusPill>
                          <Trans>世界主</Trans>
                        </StatusPill>
                      ) : (
                        <span className="text-[color:var(--text-muted)]">
                          <Trans>wiki 成员</Trans>
                        </span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-[color:var(--text-muted)] md:table-cell">
                      {formatDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill>{roleLabel(u.role)}</StatusPill>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-[color:var(--text-muted)] lg:table-cell">
                      {u.profile
                        ? `${u.profile.editCount} / ${u.profile.approvedEditCount} / ${u.profile.revertedCount} / ${u.profile.patrolledCount}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="rounded-full border border-[color:var(--border-subtle)] bg-white px-3 py-1.5 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
                        value={u.role}
                        disabled={u.id === user?.id || setRoleMut.isPending}
                        onChange={(e) =>
                          setRoleMut.mutate({
                            userId: u.id,
                            role: e.target.value as WikiRole,
                          })
                        }
                      >
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageShell>
  );
}
