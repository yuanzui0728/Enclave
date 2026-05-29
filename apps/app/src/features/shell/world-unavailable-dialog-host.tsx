import { useEffect, useId, useRef } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { useCloudSessionStore } from "../../store/cloud-session-store";
import { useWorldUnavailableDialogStore } from "../../store/world-unavailable-dialog-store";
import { disconnectChatSocket, getChatSocket } from "../../lib/socket";
import { queryClient } from "../../lib/query-client";

export function WorldUnavailableDialogHost() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const open = useWorldUnavailableDialogStore((state) => state.open);
  const closeDialog = useWorldUnavailableDialogStore(
    (state) => state.closeDialog,
  );
  const titleId = useId();
  const descId = useId();
  // 走查新一轮 R1（移动端我-tab 端到端 2026-05-22）：原 dialog 完全无 a11y +
  // 防双击。补：
  // 1) role="dialog" + aria-modal + aria-labelledby/describedby —— modal 必备语义；
  // 2) 打开时 focus 主操作「重试」按钮（非 destructive，安全默认），让键盘/SR
  //    用户立刻能 Enter 触发；
  // 3) reloginInFlightRef 同帧双击锁仅给次级「重新登录」用 —— clearSession 幂等但
  //    navigate 会推 2 格 history；主「重试」全幂等无需锁。
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const reloginInFlightRef = useRef(false);

  // dialog 一旦打开就立即把 socket 关掉，避免 socket.io 自己后台重连 503 风暴；
  // session 不动，留给用户：主「重试」→ 重连 socket 复活；次级「重新登录」→ 清
  // session 跳 /welcome。（用户能看到对话框知道发生了什么，不至于陷入死循环。）
  useEffect(() => {
    if (open) {
      disconnectChatSocket();
    }
  }, [open]);

  // 走查新一轮 R1：focus management —— open 翻 true 时把焦点放到主「重试」按钮。
  // setTimeout(0) 避开 click→pointerup 序列里 chromium 把 focus 还原回触发按钮的
  // 兜底（和 desktop-chat-confirm-dialog R5 同款）。「重试」关闭对话框后停在原页
  // （不 navigate），不还原 previousFocus 也无碍。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      primaryButtonRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) {
    return null;
  }

  // 主操作：温和重试。共享世界是常驻多租户进程，从不真的「休眠」——绝大多数
  // 这个弹窗是服务端短暂繁忙/恢复中（502/503），登出对恢复毫无帮助，只会白白
  // 让用户重新登录。这里只重连 socket + 重新拉取查询，不动 session。
  // 全部同步且幂等（getChatSocket 按 baseUrl 去重、invalidateQueries 自去抖），
  // 重复点击无副作用，不需要 in-flight 锁（不像 relogin 会推 history）。
  const handleRetry = () => {
    closeDialog();
    getChatSocket();
    void queryClient.invalidateQueries();
  };

  const handleRelogin = () => {
    // sync ref 锁：同帧双击 React state 还没 propagate，两次 click 都过门 →
    // clearSession + navigate 各跑 2 次；clearSession 幂等但 navigate 会撞
    // 2 格 history（虽 replace:true 也保护不住）。和 account-security /
    // profile-feedback 同款修法。
    if (reloginInFlightRef.current) return;
    reloginInFlightRef.current = true;
    closeDialog();
    useCloudSessionStore.getState().clearSession();
    void navigate({ to: "/welcome", replace: true });
  };

  // 文案沿革：早期标题「世界已休眠，请重新登录」+ 渲染后端英文 message，
  // 误导新注册用户以为账号没建上。现彻底中性化：共享 world 是常驻多租户进程，
  // 不存在「休眠」，502/503 基本是服务端短暂繁忙/恢复中，故标题「连接暂时中断」、
  // 主操作温和「重试」而非强制登出；后端英文 message 不渲染。
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-[var(--radius-xl)] bg-[color:var(--surface-card)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
      >
        <div className="text-[length:var(--text-eyebrow)] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
          {t(msg`世界状态`)}
        </div>
        <h2
          id={titleId}
          className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]"
        >
          {t(msg`连接暂时中断`)}
        </h2>
        <p
          id={descId}
          className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]"
        >
          {t(msg`服务器正忙或正在恢复，通常几秒内就会自动恢复。你的账号和数据都安全保存在云端，点「重试」即可继续。`)}
        </p>
        <div className="mt-6">
          <Button
            ref={primaryButtonRef}
            variant="primary"
            // 走查新一轮 R1：补 active:bg- 让移动 tap 有按压反馈（同 R3 修过的
            // profile-subscription 邀请「复制链接」/「联系开通」）。
            className="w-full rounded-[var(--radius-md)] bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] shadow-none hover:bg-[color:var(--brand-primary)] active:opacity-90"
            onClick={handleRetry}
          >
            {t(msg`重试`)}
          </Button>
          <button
            type="button"
            className="mt-3 w-full text-center text-sm text-[color:var(--text-muted)] underline-offset-4 hover:underline"
            onClick={handleRelogin}
          >
            {t(msg`仍无法恢复？重新登录`)}
          </button>
        </div>
      </div>
    </div>
  );
}
