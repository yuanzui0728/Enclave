import { useCallback, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight, Clock3 } from "lucide-react";
import {
  createCloudWalletRechargeRequest,
  getMyCloudWallet,
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
import { CheckoutContactDialog } from "../features/subscription/checkout-contact-dialog";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  describeTransactionType,
  formatCents,
  formatSignedCents,
} from "../features/wallet/wallet-format";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { RechargeAmountDialog } from "../features/wallet/recharge-amount-dialog";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

export function WalletPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const accessToken = useCloudSessionStore((state) => state.accessToken);
  const queryClient = useQueryClient();

  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [contactDialog, setContactDialog] = useState<{
    open: boolean;
    hint: string;
    contact: string;
  }>({ open: false, hint: "", contact: "" }); // i18n-ignore-line
  const [rechargeError, setRechargeError] = useState("");

  const handleGoLogin = useCallback(() => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  // 钱包可从「世界」tab 和「我」tab 两处进入，不硬编码 expectedPreviousPath，
  // 否则从世界进来返回会被甩到「我」tab。history.back() 回真实来处，冷启动兜底。
  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/profile", replace: true });
    });

  const walletQuery = useQuery({
    queryKey: ["cloud-wallet", accessToken],
    queryFn: () => getMyCloudWallet(accessToken ?? ""),
    enabled: Boolean(accessToken),
    staleTime: 0,
    refetchOnMount: "always",
  });

  // 同款 sync ref 防双触发：充值申请非幂等（每次落一条待运营记录），
  // 同帧两次点提交会写两条。
  const rechargeInFlightRef = useRef(false);
  const rechargeMutation = useMutation({
    mutationFn: (requestedAmountCents: number) =>
      createCloudWalletRechargeRequest(
        { requestedAmountCents },
        accessToken ?? "",
      ),
    onSuccess: (result) => {
      setRechargeError("");
      setRechargeOpen(false);
      setContactDialog({
        open: true,
        hint: result.hint,
        contact: result.contact ?? "",
      });
      void queryClient.invalidateQueries({ queryKey: ["cloud-wallet"] });
    },
    onError: (error) => {
      setRechargeError(
        describeRequestError(error, t(msg`提交充值申请失败，请稍后重试。`)),
      );
    },
  });

  const mobileTopBar = !isDesktopLayout ? (
    <TabPageTopBar
      title={t(msg`钱包`)}
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

  if (!accessToken) {
    return (
      <AppPage
        className="bg-[color:var(--bg-canvas)] px-4 pt-6"
        style={{
          paddingBottom:
            "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
        }}
      >
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl space-y-3 px-5 py-6">
          <InlineNotice tone="info">
            {t(msg`钱包需要登录隐界云账号。当前只登录了本地世界，无法查看余额。`)}
          </InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  if (walletQuery.isLoading) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <LoadingBlock label={t(msg`正在加载钱包信息…`)} />
        </AppSection>
      </AppPage>
    );
  }

  if (walletQuery.error) {
    return (
      <AppPage className="bg-[color:var(--bg-canvas)] px-4 pt-6">
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl">
          <ErrorBlock role="alert" message={describeRequestError(walletQuery.error)} />
        </AppSection>
      </AppPage>
    );
  }

  const data = walletQuery.data;
  if (!data) return null;

  const { wallet, recentTransactions } = data;

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom:
          "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {mobileTopBar}
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* 我的零钱 hero 卡 —— 微信钱包顶部余额卡同构，citrus 渐变。 */}
        <AppSection className="overflow-hidden rounded-[24px] border-[color:var(--border-faint)] bg-[image:var(--surface-card-gradient)] px-6 py-7 shadow-none">
          <div className="text-[13px] text-[color:var(--text-muted)]">{t(msg`我的零钱`)}</div>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-[40px] font-semibold leading-none tracking-tight text-[color:var(--text-primary)]">
              {formatCents(wallet.balanceCents, wallet.currency)}
            </span>
          </div>
          {wallet.status === "frozen" ? (
            <InlineNotice className="mt-3" tone="danger" role="alert">
              {t(msg`钱包已被冻结，暂时无法变动余额，请联系运营。`)}
            </InlineNotice>
          ) : null}
          <div className="mt-5 flex gap-3">
            <Button
              variant="primary"
              className="flex-1 rounded-full bg-[color:var(--brand-primary)] py-2.5 text-[15px] text-[color:var(--text-on-brand)] shadow-none hover:bg-[color:var(--brand-primary)] active:opacity-90"
              disabled={wallet.status === "frozen"}
              onClick={() => {
                setRechargeError("");
                setRechargeOpen(true);
              }}
            >
              {t(msg`充值`)}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 rounded-full border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.6)] py-2.5 text-[15px] text-[color:var(--text-muted)] shadow-none"
              disabled
              aria-disabled
            >
              {t(msg`提现`)}
            </Button>
          </div>
          <div className="mt-2 text-center text-[11px] text-[#a9802f]">
            {t(msg`提现功能即将开放`)}
          </div>
        </AppSection>

        {/* 列表组：零钱明细入口 */}
        <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
          <Link
            to="/profile/wallet/transactions"
            className="flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[color:var(--surface-card-hover)] active:bg-[color:var(--surface-card-hover)]"
          >
            <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
              <Clock3 size={15} />
            </div>
            <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
              {t(msg`零钱明细`)}
            </div>
            <ChevronRight size={13} className="shrink-0 text-[color:var(--text-dim)]" />
          </Link>
        </div>

        {/* 最近几条流水预览（点「零钱明细」看全部） */}
        <AppSection className="rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
          <div className="text-[13px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`最近交易`)}
          </div>
          <div className="mt-3 space-y-2.5">
            {recentTransactions.length ? (
              recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                      {tx.description?.trim() || describeTransactionType(tx.type, t)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                      {formatDateTime(tx.createdAt)}
                    </div>
                  </div>
                  <div
                    className={`shrink-0 text-[15px] font-semibold ${
                      tx.amountCents >= 0 ? "text-[#15803d]" : "text-[color:var(--text-primary)]"
                    }`}
                  >
                    {formatSignedCents(tx.amountCents, tx.currency)}
                  </div>
                </div>
              ))
            ) : (
              <InlineNotice tone="muted">{t(msg`暂无交易记录。`)}</InlineNotice>
            )}
          </div>
        </AppSection>
      </div>

      <RechargeAmountDialog
        open={rechargeOpen}
        pending={rechargeMutation.isPending}
        errorText={rechargeError}
        onClose={() => {
          if (rechargeMutation.isPending) return;
          setRechargeOpen(false);
        }}
        onSubmit={(amountCents) => {
          if (rechargeInFlightRef.current) return;
          rechargeInFlightRef.current = true;
          rechargeMutation.mutate(amountCents, {
            onSettled: () => {
              rechargeInFlightRef.current = false;
            },
          });
        }}
      />

      <CheckoutContactDialog
        open={contactDialog.open}
        hint={contactDialog.hint}
        contact={contactDialog.contact}
        onClose={() => setContactDialog((prev) => ({ ...prev, open: false }))}
      />
    </AppPage>
  );
}
