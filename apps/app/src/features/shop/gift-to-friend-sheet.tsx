import { useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { describeRequestError } from "../../lib/request-error";
import { useGiftMutation, useStoreInventoryQuery } from "./use-shop";

type Props = {
  open: boolean;
  characterId: string;
  characterName: string;
  characterAvatar?: string | null;
  onClose: () => void;
};

// 从好友资料页送礼：列出自己拥有的虚拟收藏，点一件即赠送给该 AI 好友（消耗库存，不扣钱包）。
// 库存里只会有虚拟可赠送商品（实物从不入库存）；后端再校验一次 isGiftable。
export function GiftToFriendSheet({
  open,
  characterId,
  characterName,
  characterAvatar,
  onClose,
}: Props) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const inventoryQuery = useStoreInventoryQuery();
  const giftMutation = useGiftMutation();
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const inFlightRef = useRef(false);

  if (!open) return null;

  const items = inventoryQuery.data ?? [];

  const send = (goodsCode: string, name: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError("");
    setDone("");
    giftMutation.mutate(
      {
        goodsCode,
        characterId,
        quantity: 1,
        idempotencyKey: crypto.randomUUID(),
        characterName,
        characterAvatar: characterAvatar ?? undefined,
      },
      {
        onSuccess: () => setDone(t(msg`已把「${name}」送给 ${characterName}`)),
        onError: (e) => setError(describeRequestError(e, t(msg`赠送失败，请稍后重试。`))),
        onSettled: () => {
          inFlightRef.current = false;
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[24px] bg-[color:var(--bg-canvas)] px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[15px] font-semibold text-[color:var(--text-primary)]">
            {t(msg`送礼物给 ${characterName}`)}
          </span>
          <button
            type="button"
            className="text-[13px] text-[color:var(--text-secondary)]"
            onClick={onClose}
          >
            {t(msg`关闭`)}
          </button>
        </div>

        {done ? <InlineNotice tone="success">{done}</InlineNotice> : null}
        {error ? <ErrorBlock className="mb-2" role="alert" message={error} /> : null}

        {inventoryQuery.isLoading ? <LoadingBlock label={t(msg`正在加载收藏…`)} /> : null}

        {inventoryQuery.data && !items.length ? (
          <div className="space-y-3 py-4 text-center">
            <InlineNotice tone="muted">{t(msg`你还没有可赠送的礼物。`)}</InlineNotice>
            <Button
              variant="primary"
              className="rounded-full bg-[#f59e0b] text-[#3b2206]"
              onClick={() => {
                onClose();
                void navigate({ to: "/shop" });
              }}
            >
              {t(msg`去商城购买`)}
            </Button>
          </div>
        ) : null}

        {items.length ? (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2.5 overflow-y-auto">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={giftMutation.isPending}
                onClick={() => send(item.goodsCode, item.name)}
                className="flex flex-col items-center gap-1.5 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-2 py-3 text-center transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(132,204,22,0.16))] text-[#b45309]">
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="h-8 w-8 rounded-[9px] object-cover" />
                  ) : (
                    <Gift size={20} />
                  )}
                </div>
                <div className="line-clamp-1 text-[12px] font-medium text-[color:var(--text-primary)]">
                  {item.name}
                </div>
                <div className="text-[11px] text-[color:var(--text-muted)]">×{item.quantity}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
