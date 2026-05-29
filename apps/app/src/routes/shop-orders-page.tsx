import { useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { GoodsOrderStatus } from "@yinjie/contracts";
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
import { formatCents } from "../features/wallet/wallet-format";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useStoreOrdersQuery } from "../features/shop/use-shop";

function statusLabel(status: GoodsOrderStatus, t: ReturnType<typeof useRuntimeTranslator>) {
  switch (status) {
    case "completed":
      return t(msg`已完成`);
    case "pending":
      return t(msg`待发货`);
    case "shipped":
      return t(msg`已发货`);
    case "delivered":
      return t(msg`已送达`);
    case "cancelled":
      return t(msg`已取消`);
    case "refunded":
      return t(msg`已退款`);
    default:
      return status;
  }
}

const STATUS_COLOR: Record<GoodsOrderStatus, string> = {
  completed: "bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]",
  pending: "bg-[color:var(--brand-primary)]/16 text-[color:var(--brand-primary)]",
  shipped: "bg-[color:var(--state-info-bg)] text-[color:var(--state-info-text)]",
  delivered: "bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]",
  cancelled: "bg-black/[0.06] text-[color:var(--text-muted)]",
  refunded: "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]",
};

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

export function ShopOrdersPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  const [page, setPage] = useState(1);

  const ordersQuery = useStoreOrdersQuery(page);

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/shop", replace: true });
    }, "/shop");

  const handleGoLogin = () => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  };

  const topBar = (
    <TabPageTopBar
      title={t(msg`我的订单`)}
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
  );

  if (!accessToken) {
    return (
      <AppPage
        className="bg-[color:var(--bg-canvas)] px-4 pt-6"
        style={{
          paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
        }}
      >
        {topBar}
        <AppSection className="mx-auto max-w-3xl space-y-3 px-5 py-6">
          <InlineNotice tone="info">{t(msg`订单需要登录隐界云账号。`)}</InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  const orders = ordersQuery.data?.items ?? [];
  const totalPages = ordersQuery.data?.totalPages ?? 1;

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {topBar}
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {ordersQuery.isLoading ? <LoadingBlock label={t(msg`正在加载订单…`)} /> : null}
        {ordersQuery.error ? (
          <ErrorBlock role="alert" message={describeRequestError(ordersQuery.error)} />
        ) : null}

        {ordersQuery.data && !orders.length ? (
          <InlineNotice tone="muted">{t(msg`还没有订单。`)}</InlineNotice>
        ) : null}

        {orders.map((order) => (
          <AppSection
            key={order.id}
            className="space-y-1.5 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
                {order.goodsName}
                {order.quantity > 1 ? ` ×${order.quantity}` : ""}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[length:var(--text-eyebrow)] ${STATUS_COLOR[order.status]}`}
              >
                {statusLabel(order.status, t)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              <span>{formatDateTime(order.createdAt)}</span>
              <span className="text-[length:var(--text-body)] font-semibold text-[color:var(--brand-primary)]">
                {formatCents(order.totalPriceCents, order.currency)}
              </span>
            </div>
            {order.shipping ? (
              <div className="text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
                {t(msg`收货：${order.shipping.name} · ${order.shipping.phone}`)}
                <div className="text-[color:var(--text-muted)]">{order.shipping.address}</div>
                {order.trackingNo ? (
                  <div className="text-[color:var(--text-muted)]">
                    {t(msg`物流单号：${order.trackingNo}`)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </AppSection>
        ))}

        {totalPages > 1 ? (
          <div className="flex items-center justify-center gap-4 pt-2 text-[length:var(--text-caption)]">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t(msg`上一页`)}
            </Button>
            <span className="text-[color:var(--text-muted)]">
              {page} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t(msg`下一页`)}
            </Button>
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}
