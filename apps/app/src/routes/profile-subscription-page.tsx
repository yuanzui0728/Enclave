import { useCallback, useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
// qrcode 是 ~70KB 重依赖。静态 import 会被打进首屏 vendor-misc chunk；
// 改为动态 import 让它独立成 chunk，只在用户实际访问订阅/邀请二维码时才拉。
import {
  createCheckout,
  getMyCloudInviteSummary,
  getMyCloudProfile,
  getMyCloudSubscription,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { CheckoutContactDialog } from "../features/subscription/checkout-contact-dialog";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { buildPublicShareUrl } from "../lib/share-url";
import { isNativeMobileBridgeAvailable } from "../runtime/mobile-bridge";
import { writeClipboardText } from "../runtime/native-clipboard";
import { shareTextOrUrl } from "../runtime/native-share";
import { useCloudSessionStore } from "../store/cloud-session-store";

// 主流货币给个符号前缀（CNY 套餐展示 "CNY 49.9" 比 "¥49.9" 累赘）。
// 不识别的币种保持 "ABC 12.3" 兜底格式，避免新币种悄悄塞个错符号。
const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  HKD: "HK$",
  TWD: "NT$",
};

function formatPrice(priceCents: number, currency: string) {
  // toFixed(1) 之前给出 "¥499.0" / "¥49.9" 这种半截小数，年付 49900 cents 应该是
  // "¥499" 整数，月付 4990 cents 是 "¥49.90" 两位小数。整数就不带小数，否则保留两位。
  const upper = currency.toUpperCase();
  const yuan = priceCents / 100;
  const amount =
    Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
  const symbol = CURRENCY_SYMBOLS[upper];
  return symbol ? `${symbol}${amount}` : `${upper} ${amount}`;
}

// email 用户走 synthesizePhoneFromEmail（apps/cloud-api/.../email-auth.service.ts）
// 落到一个固定形如 "9" + 13 位数字的合成号码，把它当真实手机号展示给用户毫无意义且
// 会让人以为绑过一个奇怪的国际号。这里靠这个特征拦住，UI 端不展示给"手机号"行。
function isSynthesizedEmailPhone(phone?: string | null) {
  return Boolean(phone && /^9\d{13}$/.test(phone));
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }

  return new Date(timestamp).toLocaleString();
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  if (await writeClipboardText(text)) {
    return true;
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
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
  return buildPublicShareUrl(`/?invite=${encodeURIComponent(code)}`);
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
    const result = await shareTextOrUrl({
      title: invite.shareTitle,
      text: invite.shareBody,
      url: shareUrl,
    });

    if (result.ok) {
      if (result.via === "clipboard") {
        setFeedback({ tone: "success", message: t(msg`已复制邀请链接。`) });
      } else {
        setFeedback({ tone: "success", message: t(msg`已唤起分享面板。`) });
      }
      return;
    }

    if (result.reason === "cancelled") {
      return;
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

export function ProfileSubscriptionPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const phone = useCloudSessionStore((state) => state.phone);
  const setProfile = useCloudSessionStore((state) => state.setProfile);
  const [contactDialog, setContactDialog] = useState<{
    open: boolean;
    hint: string;
    contact: string;
    planName: string;
  }>({ open: false, hint: "", contact: "", planName: "" }); // i18n-ignore-line

  const handleGoLogin = useCallback(() => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  const profileQuery = useQuery({
    queryKey: ["cloud-profile", accessToken],
    queryFn: () => getMyCloudProfile(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });

  // 订阅/邀请数据会被后端"被邀请人注册"等异步事件影响，
  // 必须每次进页面强制刷新，否则 mobile 上 60s 缓存让用户看不到刚到账的奖励。
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
    },
    onError: (error) => {
      setContactDialog((prev) => ({ ...prev, open: false }));
      setCheckoutError(
        describeRequestError(error, t(msg`提交开通申请失败，请稍后重试。`)),
      );
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

  const goBackToSettings = () =>
    void navigate({ to: "/desktop/settings" });

  const goBack = () =>
    navigateBackOrFallback(
      () => {
        void navigate({ to: "/tabs/profile" });
      },
      "/tabs/profile",
    );

  // local-world / 还没登过云账号的世界主人会落到这里：原本直接 navigate(/welcome)
  // 把整个壳替换成登录页，用户看到的是「我明明已经登录世界主人，为什么被踢出来？」。
  // 改成留在 /profile/subscription 内显示一条提示卡 + 跳转按钮，让用户主动选择是否
  // 去做云端登录，不破坏当前导航上下文。
  if (!accessToken) {
    return (
      <AppPage
        className="bg-[color:var(--bg-canvas)] px-4 pt-6"
        style={{
          paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
        }}
      >
        {!isDesktopLayout ? (
          <TabPageTopBar
            title={t(msg`会员中心`)}
            titleAlign="center"
            leftActions={
              <Button
                onClick={goBack}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
                aria-label={t(msg`返回`)}
              >
                <ArrowLeft size={17} />
              </Button>
            }
          />
        ) : null}
        <AppSection className="mx-auto max-w-3xl space-y-3 px-5 py-6">
          <InlineNotice tone="info">
            {t(msg`会员中心需要登录隐界云账号。当前只登录了本地世界，无法查看订阅与邀请信息。`)}
          </InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  // 移动端 loading/error 不再裸渲染——之前没有 TopBar，公网隧道下任意一个
  // query 卡几秒就让用户停在「正在加载会员信息…」无路可走，只能软件层
  // 退出 app。给个返回按钮，至少能滚回上一级。
  const mobileTopBar = !isDesktopLayout ? (
    <TabPageTopBar
      title={t(msg`会员中心`)}
      titleAlign="center"
      leftActions={
        <Button
          onClick={goBack}
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
          aria-label={t(msg`返回`)}
        >
          <ArrowLeft size={17} />
        </Button>
      }
    />
  ) : null;

  if (loading) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {/* TabPageTopBar 内部用 -mx-4 -mt-6 把自己撑到屏幕边——AppPage 必须给
            `px-4 pt-6`，否则 TopBar 把 inset 溢出页面外。和数据态保持一致。 */}
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <LoadingBlock label={t(msg`正在加载会员信息…`)} />
        </AppSection>
      </AppPage>
    );
  }

  if (error) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <ErrorBlock message={describeRequestError(error)} />
        </AppSection>
      </AppPage>
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
  const expiresLabel = formatDateTime(subscription.expiresAt) ?? fallbackNotSet;

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {!isDesktopLayout ? (
        <TabPageTopBar
          title={t(msg`会员中心`)}
          titleAlign="center"
          leftActions={
            <Button
              onClick={goBack}
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
              aria-label={t(msg`返回`)}
            >
              <ArrowLeft size={17} />
            </Button>
          }
        />
      ) : null}
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <AppSection className="overflow-hidden rounded-[28px] border-black/5 bg-[linear-gradient(135deg,#f7fff8,#ffffff)] px-6 py-6 shadow-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {isDesktopLayout ? (
                // 移动端 TopBar 已经渲染过 "会员中心" 标题，hero 卡里再放 h1 是重复的；
                // 桌面端没有 TopBar，hero 卡的 h1 + "订阅" eyebrow 是页面唯一标题。
                <>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    {t(msg`订阅`)}
                  </div>
                  <h1 className="mt-2 text-3xl font-semibold text-[color:var(--text-primary)]">
                    {t(msg`会员中心`)}
                  </h1>
                </>
              ) : null}
              <p className={`${isDesktopLayout ? "mt-2 " : ""}text-sm leading-7 text-[color:var(--text-secondary)]`}>
                {isSynthesizedEmailPhone(profile.phone || phone) ? (
                  // 邮箱注册的用户没真手机号，挂上一个 "9xxxxxxxxxxxxx" 合成号
                  // 不如直接展示昵称（cloud_users.displayName，比如 yuanzui0728
                  // 的 "吴港钧"），实在没有再 fallback 到通用 label。
                  <>
                    {t(msg`账号`)}:{" "}
                    {profile.displayName?.trim() || t(msg`邮箱账号`)}
                    <br />
                  </>
                ) : (
                  <>
                    {t(msg`手机号`)}: {profile.phone || phone || "-"}
                    <br />
                  </>
                )}
                {t(msg`状态`)}: {subscriptionStatusLabel}
                <br />
                {t(msg`当前套餐`)}:{" "}
                {subscription.currentPlanName || t(msg`无`)}
                <br />
                {t(msg`到期时间`)}: {expiresLabel}
              </p>
            </div>
            {isDesktopLayout ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="rounded-2xl border-[color:var(--border-faint)] bg-white shadow-none"
                  onClick={goBackToSettings}
                >
                  {t(msg`返回设置`)}
                </Button>
              </div>
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
                        {formatDateTime(item.createdAt) ?? fallbackNotSet}
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
    </AppPage>
  );
}
