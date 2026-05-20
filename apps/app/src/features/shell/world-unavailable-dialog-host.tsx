import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { useCloudSessionStore } from "../../store/cloud-session-store";
import { useWorldUnavailableDialogStore } from "../../store/world-unavailable-dialog-store";
import { disconnectChatSocket } from "../../lib/socket";

export function WorldUnavailableDialogHost() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const open = useWorldUnavailableDialogStore((state) => state.open);
  const message = useWorldUnavailableDialogStore((state) => state.message);
  const closeDialog = useWorldUnavailableDialogStore(
    (state) => state.closeDialog,
  );

  // dialog 一旦打开就立即把 socket 关掉，避免 socket.io 自己后台重连 503 风暴；
  // session 这里不直接清，留给用户按"重新登录"按钮 → 主动 clear → 跳 /welcome。
  // （这样用户能看到对话框知道发生了什么；他们不点也不至于陷入死循环。）
  useEffect(() => {
    if (open) {
      disconnectChatSocket();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleRelogin = () => {
    closeDialog();
    useCloudSessionStore.getState().clearSession();
    void navigate({ to: "/welcome", replace: true });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
          {t(msg`世界状态`)}
        </div>
        <h2 className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]">
          {t(msg`世界已休眠，请重新登录`)}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          {t(msg`长时间未使用，你的世界已自动关闭以节省资源。重新登录会自动唤起你的世界，几秒内即可继续使用。`)}
        </p>
        {message ? (
          <p className="mt-2 text-xs leading-6 text-[color:var(--text-muted)]">
            {message}
          </p>
        ) : null}
        <div className="mt-6">
          <Button
            variant="primary"
            className="w-full rounded-2xl bg-[#07c160] text-white shadow-none hover:bg-[#06ad56]"
            onClick={handleRelogin}
          >
            {t(msg`重新登录`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
