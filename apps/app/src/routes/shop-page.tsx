import { useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gift, Sparkles } from "lucide-react";
import { getMyCloudWallet, type GoodsSummary } from "@yinjie/contracts";
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
import { formatCents } from "../features/wallet/wallet-format";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useBuyGoodsMutation, useStoreGoodsQuery } from "../features/shop/use-shop";

function GoodsCard({
  goods,
  t,
  onPick,
}: {
  goods: GoodsSummary;
  t: ReturnType<typeof useRuntimeTranslator>;
  onPick: (g: GoodsSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(goods)}
      className="flex flex-col items-center gap-1.5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-4 text-center transition-colors active:bg-[color:var(--surface-card-hover)]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(132,204,22,0.16))] text-[#b45309]">
        {goods.iconUrl ? (
          <img src={goods.iconUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
        ) : goods.kind === "physical" ? (
          <Sparkles size={22} />
        ) : (
          <Gift size={22} />
        )}
      </div>
      <div className="line-clamp-1 text-[13px] font-medium text-[color:var(--text-primary)]">
        {goods.name}
      </div>
      <div className="text-[13px] font-semibold text-[#b45309]">
        {formatCents(goods.priceCents, goods.currency)}
      </div>
      {goods.stock !== null ? (
        <div className="text-[10px] text-[color:var(--text-muted)]">
          {t(msg`库存 ${goods.stock}`)}
        </div>
      ) : null}
    </button>
  );
}

export function ShopPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const accessToken = useCloudSessionStore((s) => s.accessToken);

  const [picked, setPicked] = useState<GoodsSummary | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [buyError, setBuyError] = useState("");
  const [buyDone, setBuyDone] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  const buyInFlightRef = useRef(false);

  const walletQuery = useQuery({
    queryKey: ["cloud-wallet", accessToken],
    queryFn: () => getMyCloudWallet(accessToken ?? ""),
    enabled: Boolean(accessToken),
  });
  const goodsQuery = useStoreGoodsQuery();
  const buyMutation = useBuyGoodsMutation();

  const { virtual, physical } = useMemo(() => {
    const items = goodsQuery.data?.items ?? [];
    return {
      virtual: items.filter((g) => g.kind === "virtual"),
      physical: items.filter((g) => g.kind === "physical"),
    };
  }, [goodsQuery.data]);

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/discover", replace: true });
    }, "/tabs/discover");

  const closeSheet = () => {
    if (buyMutation.isPending) return;
    setPicked(null);
    setQuantity(1);
    setBuyError("");
    idempotencyKeyRef.current = null;
  };

  const pick = (g: GoodsSummary) => {
    setPicked(g);
    setQuantity(1);
    setBuyError("");
    setBuyDone("");
    idempotencyKeyRef.current = crypto.randomUUID();
  };

  const confirmBuy = () => {
    if (!picked) return;
    // 实物走结算页填收货地址。
    if (picked.kind === "physical") {
      const code = picked.code;
      closeSheetSilently();
      void navigate({ to: "/shop/checkout/$goodsId", params: { goodsId: code } });
      return;
    }
    if (buyInFlightRef.current) return;
    buyInFlightRef.current = true;
    setBuyError("");
    buyMutation.mutate(
      {
        goodsCode: picked.code,
        quantity,
        idempotencyKey: idempotencyKeyRef.current ?? crypto.randomUUID(),
      },
      {
        onSuccess: (res) => {
          setBuyDone(
            t(msg`已购买「${picked.name}」，余额 ${formatCents(res.balanceCents)}`),
          );
          setPicked(null);
          setQuantity(1);
          idempotencyKeyRef.current = null;
        },
        onError: (error) => {
          setBuyError(describeRequestError(error, t(msg`购买失败，请稍后重试。`)));
        },
        onSettled: () => {
          buyInFlightRef.current = false;
        },
      },
    );
  };

  const closeSheetSilently = () => {
    setPicked(null);
    setQuantity(1);
    setBuyError("");
    idempotencyKeyRef.current = null;
  };

  const handleGoLogin = () => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  };

  const mobileTopBar = !isDesktopLayout ? (
    <TabPageTopBar
      title={t(msg`商城`)}
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
      rightActions={
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full bg-transparent text-[13px] text-[#b45309] shadow-none active:bg-black/[0.05]"
          onClick={() => void navigate({ to: "/gift-cabinet" })}
        >
          {t(msg`礼物柜`)}
        </Button>
      }
    />
  ) : null;

  if (!accessToken) {
    return (
      <AppPage
        className="bg-[color:var(--bg-canvas)] px-4 pt-6"
        style={{
          paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
        }}
      >
        {mobileTopBar}
        <AppSection className="mx-auto max-w-3xl space-y-3 px-5 py-6">
          <InlineNotice tone="info">
            {t(msg`商城需要登录隐界云账号，才能用钱包购买。`)}
          </InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {mobileTopBar}
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* 钱包余额条 */}
        <button
          type="button"
          onClick={() => void navigate({ to: "/profile/wallet" })}
          className="flex items-center justify-between rounded-[18px] border border-[color:var(--border-faint)] bg-[linear-gradient(135deg,#fff3d6,#ffe2b8)] px-5 py-3 text-left"
        >
          <span className="text-[13px] text-[#8a5a12]">{t(msg`钱包余额`)}</span>
          <span className="text-[18px] font-semibold text-[#3b2206]">
            {walletQuery.data
              ? formatCents(walletQuery.data.wallet.balanceCents, walletQuery.data.wallet.currency)
              : "—"}
          </span>
        </button>

        {buyDone ? <InlineNotice tone="success">{buyDone}</InlineNotice> : null}

        {goodsQuery.isLoading ? <LoadingBlock label={t(msg`正在加载商品…`)} /> : null}
        {goodsQuery.error ? (
          <ErrorBlock role="alert" message={describeRequestError(goodsQuery.error)} />
        ) : null}

        {virtual.length ? (
          <AppSection className="rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
            <div className="mb-3 text-[13px] font-semibold text-[color:var(--text-primary)]">
              {t(msg`虚拟好物`)}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {virtual.map((g) => (
                <GoodsCard key={g.id} goods={g} t={t} onPick={pick} />
              ))}
            </div>
          </AppSection>
        ) : null}

        {physical.length ? (
          <AppSection className="rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
            <div className="mb-3 text-[13px] font-semibold text-[color:var(--text-primary)]">
              {t(msg`实物周边`)}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {physical.map((g) => (
                <GoodsCard key={g.id} goods={g} t={t} onPick={pick} />
              ))}
            </div>
          </AppSection>
        ) : null}

        {goodsQuery.data && !virtual.length && !physical.length ? (
          <InlineNotice tone="muted">{t(msg`商城暂无在售商品。`)}</InlineNotice>
        ) : null}
      </div>

      {/* 购买底部 sheet */}
      {picked ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={closeSheet}
        >
          <div
            className="w-full max-w-md rounded-t-[24px] bg-[color:var(--bg-canvas)] px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(132,204,22,0.16))] text-[#b45309]">
                {picked.iconUrl ? (
                  <img src={picked.iconUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
                ) : (
                  <Gift size={22} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-[color:var(--text-primary)]">
                  {picked.name}
                </div>
                <div className="text-[13px] font-semibold text-[#b45309]">
                  {formatCents(picked.priceCents, picked.currency)}
                </div>
              </div>
            </div>

            {picked.description ? (
              <div className="mt-3 text-[13px] text-[color:var(--text-secondary)]">
                {picked.description}
              </div>
            ) : null}

            {picked.kind === "virtual" ? (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[13px] text-[color:var(--text-secondary)]">
                  {t(msg`数量`)}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full border border-[color:var(--border-faint)] text-[18px] text-[color:var(--text-primary)] disabled:opacity-40"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-[15px]">{quantity}</span>
                  <button
                    type="button"
                    className="h-8 w-8 rounded-full border border-[color:var(--border-faint)] text-[18px] text-[color:var(--text-primary)]"
                    onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <InlineNotice className="mt-4" tone="info">
                {t(msg`实物商品下一步填写收货地址。`)}
              </InlineNotice>
            )}

            {buyError ? <ErrorBlock className="mt-3" role="alert" message={buyError} /> : null}

            <div className="mt-5 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1 rounded-full"
                disabled={buyMutation.isPending}
                onClick={closeSheet}
              >
                {t(msg`取消`)}
              </Button>
              <Button
                variant="primary"
                className="flex-1 rounded-full bg-[#f59e0b] text-[#3b2206] hover:bg-[#d97706]"
                disabled={buyMutation.isPending}
                onClick={confirmBuy}
              >
                {picked.kind === "physical"
                  ? t(msg`去结算`)
                  : buyMutation.isPending
                    ? t(msg`购买中…`)
                    : t(msg`确认购买 ${formatCents(picked.priceCents * quantity, picked.currency)}`)}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}
