import { useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Gift } from "lucide-react";
import type { GiftRecordSummary, InventoryItemSummary } from "@yinjie/contracts";
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
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useGiftCabinetQuery } from "../features/shop/use-shop";

type Tab = "received" | "collection";

function GiftIcon({ iconUrl }: { iconUrl: string | null }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--brand-primary)_18%,transparent),color-mix(in_srgb,var(--brand-secondary)_16%,transparent))] text-[color:var(--brand-primary)]">
      {iconUrl ? (
        <img src={iconUrl} alt="" className="h-9 w-9 rounded-[10px] object-cover" />
      ) : (
        <Gift size={22} />
      )}
    </div>
  );
}

export function GiftCabinetPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const accessToken = useCloudSessionStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>("received");

  const cabinetQuery = useGiftCabinetQuery();

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/discover", replace: true });
    }, "/tabs/discover");

  const handleGoLogin = () => {
    clearCloudRuntimeSession();
    void navigate({ to: "/welcome", replace: true });
  };

  const topBar = (
    <TabPageTopBar
      title={t(msg`礼物柜`)}
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
          className="rounded-full bg-transparent text-[13px] text-[color:var(--brand-primary)] shadow-none active:bg-black/[0.05]"
          onClick={() => void navigate({ to: "/shop/orders" })}
        >
          {t(msg`我的订单`)}
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
          <InlineNotice tone="info">
            {t(msg`礼物柜需要登录隐界云账号。`)}
          </InlineNotice>
          <Button onClick={handleGoLogin} className="w-full">
            {t(msg`去登录云账号`)}
          </Button>
        </AppSection>
      </AppPage>
    );
  }

  const received: GiftRecordSummary[] = cabinetQuery.data?.receivedGifts ?? [];
  const collection: InventoryItemSummary[] = cabinetQuery.data?.inventory ?? [];

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom: "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {topBar}
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* 分段控件 */}
        <div
          role="tablist"
          className="flex rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-1 text-[13px]"
        >
          {(
            [
              { key: "received", label: t(msg`收到的礼物`) },
              { key: "collection", label: t(msg`我的收藏`) },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`flex-1 rounded-full py-1.5 transition-colors ${
                tab === item.key
                  ? "bg-[color:var(--brand-primary)] font-medium text-[color:var(--text-on-brand)]"
                  : "text-[color:var(--text-secondary)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {cabinetQuery.isLoading ? <LoadingBlock label={t(msg`正在加载礼物柜…`)} /> : null}
        {cabinetQuery.error ? (
          <ErrorBlock role="alert" message={describeRequestError(cabinetQuery.error)} />
        ) : null}

        {cabinetQuery.data && tab === "received" ? (
          received.length ? (
            <div className="grid grid-cols-1 gap-2.5">
              {received.map((g) => (
                <AppSection
                  key={g.id}
                  className="flex items-center gap-3 rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 shadow-none"
                >
                  <GiftIcon iconUrl={g.iconUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                      {g.name}
                      {g.quantity > 1 ? ` ×${g.quantity}` : ""}
                    </div>
                    <div className="truncate text-[12px] text-[color:var(--text-muted)]">
                      {g.characterName
                        ? t(msg`来自 ${g.characterName}`)
                        : t(msg`来自好友`)}
                      {g.message ? ` · ${g.message}` : ""}
                    </div>
                  </div>
                </AppSection>
              ))}
            </div>
          ) : (
            <InlineNotice tone="muted">{t(msg`还没有收到礼物。`)}</InlineNotice>
          )
        ) : null}

        {cabinetQuery.data && tab === "collection" ? (
          collection.length ? (
            <div className="grid grid-cols-3 gap-2.5">
              {collection.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col items-center gap-1.5 rounded-[18px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-4 text-center"
                >
                  <GiftIcon iconUrl={item.iconUrl} />
                  <div className="line-clamp-1 text-[13px] font-medium text-[color:var(--text-primary)]">
                    {item.name}
                  </div>
                  <div className="text-[12px] text-[color:var(--text-muted)]">×{item.quantity}</div>
                </div>
              ))}
            </div>
          ) : (
            <InlineNotice tone="muted">{t(msg`收藏柜空空如也，去商城逛逛吧。`)}</InlineNotice>
          )
        ) : null}
      </div>
    </AppPage>
  );
}
