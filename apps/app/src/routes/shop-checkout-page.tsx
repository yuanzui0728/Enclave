import { useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { formatCents } from "../features/wallet/wallet-format";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useBuyGoodsMutation, useStoreGoodsQuery } from "../features/shop/use-shop";

const FIELD_CLASS =
  "rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2.5 text-[length:var(--text-title)] shadow-none";

export function ShopCheckoutPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const { goodsId } = useParams({ from: "/shop/checkout/$goodsId" });

  const goodsQuery = useStoreGoodsQuery();
  const buyMutation = useBuyGoodsMutation();

  const goods = useMemo(
    () => goodsQuery.data?.items.find((g) => g.code === goodsId) ?? null,
    [goodsQuery.data, goodsId],
  );

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const inFlightRef = useRef(false);

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/shop", replace: true });
    }, "/shop");

  const submit = () => {
    if (!goods) return;
    setError("");
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError(t(msg`请填写完整的收货人、手机号和地址。`));
      return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    buyMutation.mutate(
      {
        goodsCode: goods.code,
        quantity: 1,
        idempotencyKey: idempotencyKeyRef.current,
        shipping: { name: name.trim(), phone: phone.trim(), address: address.trim() },
      },
      {
        onSuccess: () => {
          void navigate({ to: "/shop/orders", replace: true });
        },
        onError: (e) => setError(describeRequestError(e, t(msg`下单失败，请稍后重试。`))),
        onSettled: () => {
          inFlightRef.current = false;
        },
      },
    );
  };

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      <TabPageTopBar
        title={t(msg`填写收货信息`)}
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

      <div className="mx-auto flex max-w-xl flex-col gap-3">
        {goodsQuery.isLoading ? <LoadingBlock label={t(msg`正在加载商品…`)} /> : null}
        {goodsQuery.data && !goods ? (
          <InlineNotice tone="danger">{t(msg`商品不存在或已下架。`)}</InlineNotice>
        ) : null}

        {goods ? (
          <>
            <AppSection className="flex items-center justify-between rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
              <div className="min-w-0">
                <div className="text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]">
                  {goods.name}
                </div>
                <div className="text-[length:var(--text-caption)] text-[color:var(--text-muted)]">{t(msg`实物商品`)}</div>
              </div>
              <div className="text-[length:var(--text-title)] font-semibold text-[color:var(--brand-primary)]">
                {formatCents(goods.priceCents, goods.currency)}
              </div>
            </AppSection>

            <AppSection className="space-y-3 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
              <label className="block space-y-1">
                <span className="text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">{t(msg`收货人`)}</span>
                <TextField
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t(msg`姓名`)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">{t(msg`手机号`)}</span>
                <TextField
                  value={phone}
                  inputMode="tel"
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, ""))}
                  placeholder={t(msg`联系电话`)}
                  className={FIELD_CLASS}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">{t(msg`收货地址`)}</span>
                <TextAreaField
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t(msg`省 / 市 / 区 / 详细地址`)}
                  className={`min-h-[80px] ${FIELD_CLASS}`}
                />
              </label>
            </AppSection>

            {error ? <ErrorBlock role="alert" message={error} /> : null}

            <Button
              variant="primary"
              className="w-full rounded-full bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
              disabled={buyMutation.isPending}
              onClick={submit}
            >
              {buyMutation.isPending
                ? t(msg`提交中…`)
                : t(msg`确认下单 ${formatCents(goods.priceCents, goods.currency)}`)}
            </Button>
          </>
        ) : null}
      </div>
    </AppPage>
  );
}
