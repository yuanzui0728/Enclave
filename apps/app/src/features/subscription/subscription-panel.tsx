import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
// qrcode 是 ~70KB 重依赖。改用动态 import 让它独立成 chunk，
// 只在用户实际访问订阅/邀请二维码时才拉，不再吃首屏 vendor-misc。
import {
  createCheckout,
  getMyCloudInviteSummary,
  getMyCloudProfile,
  getMyCloudSubscription,
} from "@yinjie/contracts";
import { useLingui } from "@lingui/react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { track } from "@yinjie/analytics";
import {
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { describeRequestError } from "../../lib/request-error";
import {
  isNativeMobileBridgeAvailable,
  shareWithNativeShell,
} from "../../runtime/mobile-bridge";
import { useCloudSessionStore } from "../../store/cloud-session-store";
import { CheckoutContactDialog } from "./checkout-contact-dialog";

function formatPrice(priceCents: number, currency: string) {
  const amount = (priceCents / 100).toFixed(1);
  return `${currency.toUpperCase()} ${amount}`;
}

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString(locale);
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function buildFallbackShareUrl(code: string | null) {
  if (!code) return null;
  if (typeof window === "undefined") return null;
  const origin = window.location.origin;
  if (!origin) return null;
  return `${origin.replace(/\/+$/, "")}/?invite=${encodeURIComponent(code)}`;
}

interface InviteShareCardProps {
  invite: {
    enabled: boolean;
    code: string | null;
    shareTitle: string;
    shareBody: string;
    shareUrl: string | null;
    rewardDays: number;
    redeemCount: number;
    rewardDaysGranted: number;
  };
}

function InviteShareCard({ invite }: InviteShareCardProps) {
  const t = useRuntimeTranslator();
  const shareUrl = useMemo(
    () => invite.shareUrl ?? buildFallbackShareUrl(invite.code),
    [invite.shareUrl, invite.code],
  );
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!shareUrl) {
      setQrDataUrl(null);
      setQrError(false);
      return;
    }
    let cancelled = false;
    setQrError(false);
    (async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        if (cancelled) return;
        const dataUrl = await QRCode.toDataURL(shareUrl, {
          margin: 1,
          width: 220,
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch {
        if (!cancelled) {
          setQrDataUrl(null);
          setQrError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const showSystemShare =
    isNativeMobileBridgeAvailable() ||
    (typeof navigator !== "undefined" &&
      typeof navigator.share === "function");

  const handleCopy = useCallback(
    async (text: string, successMsg: string) => {
      const ok = await copyTextToClipboard(text);
      setFeedback({
        tone: ok ? "success" : "danger",
        message: ok ? successMsg : t(msg`复制失败，请手动选中复制。`),
      });
    },
    [t],
  );

  const handleShare = useCallback(async () => {
    if (!shareUrl) return;
    const payload = {
      title: invite.shareTitle,
      text: invite.shareBody,
      url: shareUrl,
    };
    if (isNativeMobileBridgeAvailable()) {
      const ok = await shareWithNativeShell(payload);
      if (ok) {
        setFeedback({ tone: "success", message: t(msg`已唤起分享面板。`) });
        return;
      }
    }
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if ((error as DOMException)?.name === "AbortError") {
          return;
        }
      }
    }
    void handleCopy(shareUrl, t(msg`已复制邀请链接。`));
  }, [shareUrl, invite.shareTitle, invite.shareBody, handleCopy, t]);

  return (
    <AppSection className="rounded-[28px] border-black/5 bg-white px-6 py-6 shadow-none">
      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
        {t(msg`邀请奖励`)}
      </div>

      {!invite.enabled ? (
        <InlineNotice className="mt-4" tone="muted">
          {t(msg`邀请功能暂未开放。`)}
        </InlineNotice>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-[16px] bg-[#fafafa] px-3 py-3">
              <div className="text-xs text-[color:var(--text-muted)]">
                {t(msg`邀请码`)}
              </div>
              <div className="mt-1 font-mono text-base font-semibold tracking-widest text-[color:var(--text-primary)]">
                {invite.code || t(msg`暂无`)}
              </div>
            </div>
            <div className="rounded-[16px] bg-[#fafafa] px-3 py-3">
              <div className="text-xs text-[color:var(--text-muted)]">
                {t(msg`单次奖励`)}
              </div>
              <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                {invite.rewardDays} {t(msg`天`)}
              </div>
            </div>
            <div className="rounded-[16px] bg-[#fafafa] px-3 py-3">
              <div className="text-xs text-[color:var(--text-muted)]">
                {t(msg`成功邀请`)}
              </div>
              <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                {invite.redeemCount}
              </div>
            </div>
            <div className="rounded-[16px] bg-[#fafafa] px-3 py-3">
              <div className="text-xs text-[color:var(--text-muted)]">
                {t(msg`累计奖励`)}
              </div>
              <div className="mt-1 text-base font-semibold text-[color:var(--text-primary)]">
                {invite.rewardDaysGranted} {t(msg`天`)}
              </div>
            </div>
          </div>

          {shareUrl && invite.code ? (
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-3">
                <div className="rounded-[18px] bg-[linear-gradient(135deg,#f0fdf4,#ffffff)] px-4 py-3">
                  <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                    {invite.shareTitle}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-[color:var(--text-secondary)]">
                    {invite.shareBody}
                  </div>
                </div>

                <div className="rounded-[18px] bg-[#f7f7f7] px-4 py-3 text-xs leading-6 break-all text-[color:var(--text-secondary)]">
                  {shareUrl}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    className="rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
                    onClick={() =>
                      void handleCopy(shareUrl, t(msg`已复制邀请链接。`))
                    }
                  >
                    {t(msg`复制链接`)}
                  </Button>
                  <Button
                    variant="secondary"
                    className="rounded-2xl border-[color:var(--border-faint)] bg-white shadow-none"
                    onClick={() =>
                      void handleCopy(
                        invite.code ?? "",
                        t(msg`已复制邀请码。`),
                      )
                    }
                  >
                    {t(msg`复制邀请码`)}
                  </Button>
                  {showSystemShare ? (
                    <Button
                      variant="secondary"
                      className="rounded-2xl border-[color:var(--border-faint)] bg-white shadow-none"
                      onClick={() => void handleShare()}
                    >
                      {t(msg`系统分享`)}
                    </Button>
                  ) : null}
                </div>

                {feedback ? (
                  <InlineNotice tone={feedback.tone}>
                    {feedback.message}
                  </InlineNotice>
                ) : null}
              </div>

              <div className="flex flex-col items-center gap-2 self-center sm:self-start">
                <div className="rounded-[18px] border border-black/5 bg-white p-3">
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt={t(msg`邀请二维码`)}
                      className="h-[160px] w-[160px]"
                    />
                  ) : qrError ? (
                    <div className="flex h-[160px] w-[160px] items-center justify-center text-xs text-[color:var(--text-muted)]">
                      {t(msg`二维码生成失败`)}
                    </div>
                  ) : (
                    <div className="flex h-[160px] w-[160px] items-center justify-center text-xs text-[color:var(--text-muted)]">
                      {t(msg`正在生成…`)}
                    </div>
                  )}
                </div>
                <div className="text-xs text-[color:var(--text-muted)]">
                  {t(msg`扫码加入`)}
                </div>
              </div>
            </div>
          ) : (
            <InlineNotice className="mt-4" tone="muted">
              {t(msg`邀请码生成中，请稍后刷新页面。`)}
            </InlineNotice>
          )}
        </>
      )}
    </AppSection>
  );
}

type SubscriptionPanelProps = {
  /** Action buttons rendered alongside the status card header (back / logout / etc.). */
  headerActions?: ReactNode;
  /** When true, panel hides its own outer padding; outer container handles spacing. */
  embedded?: boolean;
};

export function SubscriptionPanel({
  headerActions,
  embedded = false,
}: SubscriptionPanelProps) {
  const t = useRuntimeTranslator();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const phone = useCloudSessionStore((state) => state.phone);
  const setProfile = useCloudSessionStore((state) => state.setProfile);
  const [contactDialog, setContactDialog] = useState<{
    open: boolean;
    hint: string;
    contact: string;
    planName: string;
  }>({ open: false, hint: "", contact: "", planName: "" }); // i18n-ignore-line

  const profileQuery = useQuery({
    queryKey: ["cloud-profile", accessToken],
    queryFn: () => getMyCloudProfile(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });

  const subscriptionQuery = useQuery({
    queryKey: ["cloud-subscription", accessToken],
    queryFn: () => getMyCloudSubscription(accessToken ?? ""),
    enabled: Boolean(accessToken),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const inviteQuery = useQuery({
    queryKey: ["cloud-invite-summary", accessToken],
    queryFn: () => getMyCloudInviteSummary(accessToken ?? ""),
    enabled: Boolean(accessToken),
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (profileQuery.data) {
      setProfile(profileQuery.data);
    }
  }, [profileQuery.data, setProfile]);

  const [checkoutError, setCheckoutError] = useState("");
  const checkoutMutation = useMutation({
    mutationFn: ({ planCode }: { planCode: string; planName: string }) =>
      createCheckout({ planCode }, accessToken ?? ""),
    onMutate: (variables) => {
      track("pay_checkout_initiated", {
        planCode: variables.planCode,
        planName: variables.planName,
      });
    },
    onSuccess: (result, variables) => {
      setCheckoutError("");
      const hint =
        result.hint || t(msg`已提交开通申请，请联系运营完成支付。`);
      setContactDialog({
        open: true,
        hint,
        contact: result.contact ?? "",
        planName: variables.planName,
      });
      track("pay_checkout_success", {
        planCode: variables.planCode,
        planName: variables.planName,
      });
    },
    onError: (error, variables) => {
      setContactDialog((prev) => ({ ...prev, open: false }));
      setCheckoutError(
        describeRequestError(error, t(msg`提交开通申请失败，请稍后重试。`)),
      );
      track("pay_checkout_fail", {
        planCode: variables.planCode,
        message: error instanceof Error ? error.message.slice(0, 200) : null,
      });
    },
  });

  const purchasePlans = useMemo(
    () =>
      (subscriptionQuery.data?.plans ?? []).filter(
        (plan) => plan.isPubliclyPurchasable && plan.isActive,
      ),
    [subscriptionQuery.data?.plans],
  );

  const loading =
    profileQuery.isLoading ||
    subscriptionQuery.isLoading ||
    inviteQuery.isLoading;
  const error =
    profileQuery.error ?? subscriptionQuery.error ?? inviteQuery.error ?? null;

  if (!accessToken) {
    return null;
  }

  if (loading) {
    return (
      <AppSection className={embedded ? "" : "mx-auto max-w-3xl"}>
        <LoadingBlock label={t(msg`正在加载会员信息…`)} />
      </AppSection>
    );
  }

  if (error) {
    return (
      <AppSection className={embedded ? "" : "mx-auto max-w-3xl"}>
        <ErrorBlock message={describeRequestError(error)} />
      </AppSection>
    );
  }

  const profile = profileQuery.data;
  const subscription = subscriptionQuery.data;
  const invite = inviteQuery.data;

  if (!profile || !subscription || !invite) {
    return null;
  }

  const subscriptionStatusLabel =
    subscription.status === "active"
      ? t(msg`生效中`)
      : subscription.status === "expired"
        ? t(msg`已过期`)
        : t(msg`未开通`);
  const fallbackNotSet = t(msg`未设置`);
  const expiresLabel =
    formatDateTime(subscription.expiresAt, locale) ?? fallbackNotSet;

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-4"
          : "mx-auto flex max-w-4xl flex-col gap-4"
      }
    >
      <AppSection className="overflow-hidden rounded-[28px] border-black/5 bg-[linear-gradient(135deg,#f7fff8,#ffffff)] px-6 py-6 shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              {t(msg`订阅`)}
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
              {t(msg`会员中心`)}
            </h2>
            <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
              {t(msg`手机号`)}: {profile.phone || phone || "-"}
              <br />
              {t(msg`状态`)}: {subscriptionStatusLabel}
              <br />
              {t(msg`当前套餐`)}:{" "}
              {subscription.currentPlanName || t(msg`无`)}
              <br />
              {t(msg`到期时间`)}: {expiresLabel}
            </p>
          </div>
          {headerActions ? (
            <div className="flex flex-wrap gap-2">{headerActions}</div>
          ) : null}
        </div>
        {subscription.copy.welcomePromoBanner ? (
          <InlineNotice className="mt-4" tone="success">
            {subscription.copy.welcomePromoBanner}
          </InlineNotice>
        ) : null}
      </AppSection>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
        <AppSection className="rounded-[28px] border-black/5 bg-white px-6 py-6 shadow-none">
          <div className="text-sm font-semibold text-[color:var(--text-primary)]">
            {t(msg`可购套餐`)}
          </div>
          {checkoutError ? (
            <InlineNotice className="mt-4" tone="danger">
              {checkoutError}
            </InlineNotice>
          ) : null}
          <div className="mt-4 space-y-3">
            {purchasePlans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-[22px] border border-black/5 bg-[#fafafa] px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-base font-semibold text-[color:var(--text-primary)]">
                      {plan.name}
                    </div>
                    <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                      {plan.description ||
                        t(msg`时长 ${plan.durationDays} 天`)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                      {formatPrice(plan.priceCents, plan.currency)}
                    </div>
                    <Button
                      variant="primary"
                      className="mt-3 rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
                      disabled={checkoutMutation.isPending}
                      onClick={() =>
                        checkoutMutation.mutate({
                          planCode: plan.code,
                          planName: plan.name,
                        })
                      }
                    >
                      {checkoutMutation.isPending
                        ? t(msg`提交中…`)
                        : t(msg`联系开通`)}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!purchasePlans.length ? (
              <InlineNotice tone="muted">
                {t(msg`云端管理后台暂未开放可购套餐。`)}
              </InlineNotice>
            ) : null}
          </div>
        </AppSection>

        <div className="space-y-4">
          <InviteShareCard invite={invite} />

          <AppSection className="rounded-[28px] border-black/5 bg-white px-6 py-6 shadow-none">
            <div className="text-sm font-semibold text-[color:var(--text-primary)]">
              {t(msg`最近邀请记录`)}
            </div>
            <div className="mt-4 space-y-3">
              {invite.recentRedemptions.map((item) => {
                const statusLabel =
                  item.status === "rewarded"
                    ? t(msg`已发放`)
                    : t(msg`已拒绝`);
                return (
                  <div
                    key={item.id}
                    className="rounded-[18px] border border-black/5 bg-[#fafafa] px-4 py-3 text-sm text-[color:var(--text-secondary)]"
                  >
                    <div className="font-medium text-[color:var(--text-primary)]">
                      {item.inviteePhoneMasked}
                    </div>
                    <div className="mt-1">
                      {t(msg`状态`)}: {statusLabel}
                    </div>
                    <div>
                      {t(msg`创建时间`)}:{" "}
                      {formatDateTime(item.createdAt, locale) ?? fallbackNotSet}
                    </div>
                    {item.rejectReason ? (
                      <div>
                        {t(msg`拒绝原因`)}: {item.rejectReason}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!invite.recentRedemptions.length ? (
                <InlineNotice tone="muted">
                  {t(msg`暂无邀请记录。`)}
                </InlineNotice>
              ) : null}
            </div>
          </AppSection>
        </div>
      </div>

      <CheckoutContactDialog
        open={contactDialog.open}
        hint={contactDialog.hint}
        contact={contactDialog.contact}
        planName={contactDialog.planName}
        onClose={() =>
          setContactDialog((prev) => ({ ...prev, open: false }))
        }
      />
    </div>
  );
}
