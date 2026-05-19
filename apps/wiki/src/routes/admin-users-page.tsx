import { useReducer } from "react";
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
import { ROLE_RANK, roleLabel } from "../lib/auth-store";
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
  // confirm 取消后必须强制 re-render，否则 React 受控 <select> 不会把 DOM
  // 上用户已经选中的"错"值回滚到 state value（React 只在 commit 时调
  // updateWrapper 同步 DOM；onChange 里 return 不改 state → 不 commit →
  // 不同步 → 视觉停留在新值但 mutation 没发，用户以为已生效但其实没改，
  // 跟"鼠标滚轮误触"二次防御本意正好相反）。bump 一个 dummy reducer
  // counter，触发整页 re-render 即可。
  const [rerenderTick, forceRerender] = useReducer((n: number) => n + 1, 0);
  void rerenderTick;

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
        <ErrorBlock role="alert" message={(usersQ.error as Error).message} />
      )}
      {/* 改用户角色失败（权限不足 / 服务超时 / 用户不存在）SR 必须播报；
          原写法只视觉提示导致管理员误以为已生效。 */}
      {setRoleMut.isError && (
        <InlineNotice tone="danger" role="alert">
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
                      {/* select 在 <td> 内只能靠列 <th>"设置角色" 当 accessible
                          name —— NVDA / VoiceOver 行为不一致：有的把行内用户名
                          一并念出，有的只念列头。表里 20+ 行 select 全名相同时
                          盲用用户不知道当前 select 改的是哪个账号。aria-label
                          显式拼"{username} 的角色"，每行唯一区分。 */}
                      <select
                        aria-label={t(msg`${u.username} 的角色`)}
                        className="rounded-full border border-[color:var(--border-subtle)] bg-white px-3 py-1.5 text-sm shadow-[var(--shadow-soft)] focus:border-[color:var(--brand-primary)] focus:outline-none disabled:opacity-50"
                        value={u.role}
                        // 原写法整表 N 个 select 在任一改角色时一起灰，admin 想
                        // 连改 5 个用户每次都要等 invalidate。只灰当前行（variables
                        // .userId 命中该 u.id）。
                        disabled={
                          u.id === user?.id ||
                          (setRoleMut.isPending &&
                            setRoleMut.variables?.userId === u.id)
                        }
                        onChange={(e) => {
                          const next = e.target.value as WikiRole;
                          // 降级巡查员 / 管理员是高风险且不可"轻松撤销"的操作
                          // （被降级用户立刻失去队列 / 后台权限，需要再上一级
                          // 管理员才能恢复）。原写法 select 一改就直接 mutate，
                          // 鼠标滚轮在 select 上滚一下就会选到错的 option 然后
                          // 提交，回归不友好。改成对降级一律弹 confirm；升级或
                          // 等值（onChange 偶发同值触发）不拦。
                          const fromRank = ROLE_RANK[u.role] ?? -1;
                          const toRank = ROLE_RANK[next] ?? -1;
                          if (toRank < fromRank) {
                            const ok = window.confirm(
                              t(
                                msg`将「${u.username}」的角色从 ${roleLabel(u.role)} 改为 ${roleLabel(next)}？该用户立刻失去对应权限。`,
                              ),
                            );
                            if (!ok) {
                              // 必须显式 forceRerender —— 受控 <select> 的
                              // value 同步只在 React commit 时发生。onChange
                              // 不改 state 直接 return 等于不 commit，DOM 上
                              // 用户已经选好的"错"值会一直挂着直到下次外部
                              // 状态变化，给人"取消但选项已经改了"的错觉。
                              forceRerender();
                              return;
                            }
                          }
                          setRoleMut.mutate({ userId: u.id, role: next });
                        }}
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
