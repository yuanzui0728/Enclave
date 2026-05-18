import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { formatDateTime } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { useCloudConsoleText } from "../lib/cloud-console-i18n";

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

export function UserDetailPage() {
  const t = useCloudConsoleText();
  const { userId } = useParams({ strict: false }) as { userId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [grantDays, setGrantDays] = useState("30");
  const [banReason, setBanReason] = useState("manual-ban");

  const userQuery = useQuery({
    queryKey: ["cloud-console", "saas-user", userId],
    queryFn: () => cloudAdminApi.getCloudUser(userId),
    enabled: Boolean(userId),
  });

  // 详情页改动后既要刷新当前用户卡片（saas-user），也要刷新返回列表/顶部统计
  // （saas-users 前缀同时覆盖列表与 stats）。原来只 invalidate detail 一项，
  // 「Back to users」回去 Expires 列 / 顶部 memberUsers 卡片都是改前的旧值。
  const invalidateUserViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "saas-user", userId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["cloud-console", "saas-users"],
      }),
    ]);
  };

  const grantMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.grantSubscription(userId, {
        durationDays: Number(grantDays),
        source: "admin_grant",
        note: "Cloud console manual grant",
      }),
    onSuccess: invalidateUserViews,
  });

  const banMutation = useMutation({
    // banReason 是受控输入，admin 不小心敲了一串空格也算"填了"，`banReason ||`
    // 兜不住会把 "   " 当 reason 发到后端入库。先 trim 再判，纯空白回落到
    // "manual-ban"。
    mutationFn: () =>
      cloudAdminApi.banUser(userId, {
        reason: banReason.trim() || "manual-ban",
      }),
    onSuccess: invalidateUserViews,
  });

  const unbanMutation = useMutation({
    mutationFn: () => cloudAdminApi.unbanUser(userId),
    onSuccess: invalidateUserViews,
  });

  if (userQuery.isLoading) {
    return <LoadingBlock label={t("Loading cloud user...")} />;
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <ErrorBlock
        message={
          userQuery.error instanceof Error
            ? userQuery.error.message
            : t("Failed to load cloud user.")
        }
      />
    );
  }

  const user = userQuery.data;
  // Google / email-only 注册的账号 phone 字段为空字符串，直接 {user.phone} 渲染
  // 出空标题。按 phone → email → displayName 优先级兜底，永远展示一个可读身份。
  const headingIdentity =
    user.phone || user.email || user.displayName || t("(no identity)");

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              {t("SaaS user")}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
              {headingIdentity}
            </h2>
            <div className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {t("Account:")} {t(user.status)}
              <br />
              {t("Subscription:")} {t(user.subscriptionStatus)}
              <br />
              {t("Current plan:")} {user.currentPlanCode ? t(user.currentPlanCode) : "-"}
              <br />
              {t("Expires at:")} {formatTimestamp(user.subscriptionExpiresAt)}
              <br />
              {t("Invite code:")} {user.inviteCode || "-"}
              <br />
              {t("Inviter:")}{" "}
              {user.inviterPhone
                ? user.redemptionAsInvitee
                  ? `${user.inviterPhone} (${t(user.redemptionAsInvitee.status)}, ${formatTimestamp(user.redemptionAsInvitee.createdAt)})`
                  : user.inviterPhone
                : "-"}
              <br />
              {t("World status:")} {user.worldStatus ? t(user.worldStatus) : "-"}
              <br />
              {t("World:")} {user.worldId || "-"}{" "}
              {user.worldApiBaseUrl ? `(${user.worldApiBaseUrl})` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {user.worldId ? (
              <Button
                variant="secondary"
                className="rounded-2xl border-[color:var(--border-subtle)] bg-white"
                onClick={() =>
                  void navigate({
                    to: "/worlds/$worldId",
                    params: { worldId: user.worldId as string },
                  })
                }
              >
                {t("Open world")}
              </Button>
            ) : null}
            <Link
              to="/users"
              className="rounded-2xl border border-[color:var(--border-subtle)] bg-white px-4 py-2 text-sm"
            >
              {t("Back to users")}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Manual grant")}
          </div>
          <div className="mt-3 flex gap-3">
            <input
              type="number"
              min={1}
              step={1}
              value={grantDays}
              onChange={(event) => setGrantDays(event.target.value)}
              className="w-28 rounded-2xl border border-[color:var(--border-subtle)] px-3 py-2 text-sm"
            />
            <Button
              variant="primary"
              className="rounded-2xl bg-[color:var(--brand-primary)] text-white"
              // 没校验 grantDays 时按下 → NaN/0 透传到后端，命中 BadRequest
              // "durationDays 必须为正数"。前端先卡掉非正整数，按钮直接不可点。
              disabled={
                grantMutation.isPending ||
                !Number.isInteger(Number(grantDays)) ||
                Number(grantDays) <= 0
              }
              onClick={() => grantMutation.mutate()}
            >
              {t("Grant days")}
            </Button>
          </div>
          {grantMutation.isError ? (
            <InlineNotice tone="danger" className="mt-3">
              {grantMutation.error instanceof Error
                ? grantMutation.error.message
                : t("Manual grant failed.")}
            </InlineNotice>
          ) : null}
          {grantMutation.isSuccess ? (
            <InlineNotice tone="muted" className="mt-3">
              {t("Subscription granted.")}
            </InlineNotice>
          ) : null}
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Account state")}
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[color:var(--text-secondary)]">
                {t("Ban reason")}
              </span>
              <input
                value={banReason}
                onChange={(event) => setBanReason(event.target.value)}
                className="w-full rounded-2xl border border-[color:var(--border-subtle)] px-3 py-2 text-sm"
                placeholder={t("Ban reason")}
              />
            </label>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                className="rounded-2xl border-[rgba(220,38,38,0.16)] text-[#b42318]"
                // 只允许在 active 上 Ban；archived/banned 都禁用。原来对 archived
                // 也开放，会让一个"归档"账号被偷偷标成 banned。
                disabled={banMutation.isPending || user.status !== "active"}
                onClick={() => banMutation.mutate()}
              >
                {t("Ban")}
              </Button>
              <Button
                variant="secondary"
                className="rounded-2xl"
                // 只允许在 banned 上 Unban；archived 不能通过这里复活，否则会被
                // 静默改成 active。
                disabled={unbanMutation.isPending || user.status !== "banned"}
                onClick={() => unbanMutation.mutate()}
              >
                {t("Unban")}
              </Button>
            </div>
            {banMutation.isError ? (
              <InlineNotice tone="danger">
                {banMutation.error instanceof Error
                  ? banMutation.error.message
                  : t("Failed to ban user.")}
              </InlineNotice>
            ) : null}
            {unbanMutation.isError ? (
              <InlineNotice tone="danger">
                {unbanMutation.error instanceof Error
                  ? unbanMutation.error.message
                  : t("Failed to unban user.")}
              </InlineNotice>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Subscription history")}
          </div>
          <div className="mt-3 space-y-3">
            {user.subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="rounded-[20px] border border-[color:var(--border-faint)] bg-[#fafafa] px-4 py-3 text-sm"
              >
                <div className="font-medium text-[color:var(--text-primary)]">
                  {subscription.planName}
                </div>
                <div className="mt-1 text-[color:var(--text-secondary)]">
                  {t(subscription.status)} | {t(subscription.source)}
                  <br />
                  {formatTimestamp(subscription.startsAt)} {"->"} {formatTimestamp(subscription.expiresAt)}
                  <br />
                  {subscription.note || "-"}
                </div>
              </div>
            ))}
            {!user.subscriptions.length ? (
              <InlineNotice tone="muted">
                {t("No subscription records found.")}
              </InlineNotice>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t("Invite history")}
          </div>
          <div className="mt-3 space-y-3">
            {user.redemptionsAsInviter.map((record) => (
              <div
                key={record.id}
                className="rounded-[20px] border border-[color:var(--border-faint)] bg-[#fafafa] px-4 py-3 text-sm"
              >
                <div className="font-medium text-[color:var(--text-primary)]">
                  {record.inviteePhoneMasked}
                </div>
                <div className="mt-1 text-[color:var(--text-secondary)]">
                  {t(record.status)} | {formatTimestamp(record.createdAt)}
                  {record.rejectReason ? ` | ${record.rejectReason}` : ""}
                </div>
              </div>
            ))}
            {!user.redemptionsAsInviter.length ? (
              <InlineNotice tone="muted">
                {t("No invite rewards recorded.")}
              </InlineNotice>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
