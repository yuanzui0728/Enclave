import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { useEffect } from "react";
import { onChatError } from "../../lib/socket";
import { handleSocketSubscriptionExpiredError } from "../../lib/subscription-expired";
import { useSubscriptionExpiredDialogStore } from "../../store/subscription-expired-dialog-store";

export function SubscriptionExpiredDialogHost() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const open = useSubscriptionExpiredDialogStore((state) => state.open);

  // 全局监听 SUBSCRIPTION_EXPIRED socket 'error' 事件 —— 群聊后台 cron / 调度器
  // 拦截时通过 server.emit broadcast 发到所有 sockets。1v1 use-conversation-thread
  // 只在 1v1 页 mount 时订阅 onChatError;用户切到群聊 / 视频号 / 个人主页
  // 就收不到 dialog。这里挂到 root-layout 全局,所有页面都覆盖。其他业务 error
  // 不处理(只识别 SUBSCRIPTION_EXPIRED 走 dialog 逻辑)。
  useEffect(() => {
    const off = onChatError((payload) => {
      if (payload.code !== "SUBSCRIPTION_EXPIRED") {
        return;
      }
      handleSocketSubscriptionExpiredError(payload);
    });
    return off;
  }, []);

  const message = useSubscriptionExpiredDialogStore((state) => state.message);
  const meta = useSubscriptionExpiredDialogStore((state) => state.meta);
  const closeDialog = useSubscriptionExpiredDialogStore(
    (state) => state.closeDialog,
  );

  if (!open) {
    return null;
  }

  const title = meta?.copy.expiredTitle || t(msg`需要会员才能继续`);
  const detail = meta?.copy.expiredHint || message;
  const actionLabel = meta?.copy.expiredCta || t(msg`去开通会员`);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[24px] bg-[color:var(--surface-card)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
          {t(msg`AI 访问权限`)}
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {message}
        </p>
        {detail && detail !== message ? (
          <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            {detail}
          </p>
        ) : null}
        {meta?.expiredAt ? (
          <p className="mt-2 text-xs text-[color:var(--text-muted)]">
            {t(msg`到期时间：${new Date(meta.expiredAt).toLocaleString()}`)}
          </p>
        ) : null}
        {meta?.copy.checkoutContactInfo ? (
          <p className="mt-4 rounded-2xl bg-[#f6f7f7] px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]">
            {meta.copy.checkoutManualHint}
            <br />
            {meta.copy.checkoutContactInfo}
          </p>
        ) : null}
        <div className="mt-6 flex gap-3">
          <Button
            variant="secondary"
            className="flex-1 rounded-2xl border-[color:var(--border-faint)] bg-[#f5f1e6] shadow-none"
            onClick={() => closeDialog()}
          >
            {t(msg`稍后再说`)}
          </Button>
          <Button
            variant="primary"
            className="flex-1 rounded-[16px] bg-[#f59e0b] text-[#3b2206] shadow-none hover:bg-[#d97706]"
            onClick={() => {
              closeDialog();
              void navigate({ to: "/profile/subscription" });
            }}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
