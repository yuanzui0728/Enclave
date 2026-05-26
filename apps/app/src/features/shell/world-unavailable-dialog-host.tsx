import { useEffect, useId, useRef } from "react";
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
  const closeDialog = useWorldUnavailableDialogStore(
    (state) => state.closeDialog,
  );
  const titleId = useId();
  const descId = useId();
  // 走查新一轮 R1（移动端我-tab 端到端 2026-05-22）：原 dialog 完全无 a11y +
  // 防双击。补：
  // 1) role="dialog" + aria-modal + aria-labelledby/describedby —— modal 必备语义；
  // 2) 打开时 focus 「重新登录」按钮（这里是唯一 action，安全，不像 confirm dialog
  //    可能误触发 destructive 操作），让键盘/SR 用户立刻能 Enter 触发；
  // 3) reloginButtonRef + reloginInFlightRef 同款 sync ref 锁防同帧双击 ——
  //    clearSession 是幂等但 navigate 会推 2 格 history（无 replace 也能撞）。
  const reloginButtonRef = useRef<HTMLButtonElement | null>(null);
  const reloginInFlightRef = useRef(false);

  // dialog 一旦打开就立即把 socket 关掉，避免 socket.io 自己后台重连 503 风暴；
  // session 这里不直接清，留给用户按"重新登录"按钮 → 主动 clear → 跳 /welcome。
  // （这样用户能看到对话框知道发生了什么；他们不点也不至于陷入死循环。）
  useEffect(() => {
    if (open) {
      disconnectChatSocket();
    }
  }, [open]);

  // 走查新一轮 R1：focus management —— open 翻 true 时把焦点放到「重新登录」
  // 按钮上。setTimeout(0) 避开 click→pointerup 序列里 chromium 把 focus 还原
  // 回触发按钮的兜底（和 desktop-chat-confirm-dialog R5 同款）。这里 dialog
  // 关闭后会立即 navigate /welcome，所以不还原 previousFocus（welcome 自己
  // 接管 focus）。
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      reloginButtonRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) {
    return null;
  }

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

  // 历史上这里标题是「世界已休眠，请重新登录」+ 把后端英文 message
  // ("World instance is not ready for this account.") 当 fine-print 渲染。
  // 新注册用户 world 暖机几秒内若命中这条 503，会把 "this account" 误读为
  // 「我账号没建上」→ 报"验证码过了但没建号"。改成中性表述：world 启动中
  // 或已休眠都用同一条文案，避免暗示注册失败；后端英文 message 不再渲染。
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
      >
        <div className="text-[11px] uppercase tracking-[0.26em] text-[color:var(--text-muted)]">
          {t(msg`世界状态`)}
        </div>
        <h2
          id={titleId}
          className="mt-3 text-2xl font-semibold text-[color:var(--text-primary)]"
        >
          {t(msg`世界暂时离线`)}
        </h2>
        <p
          id={descId}
          className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]"
        >
          {t(msg`你的世界正在启动或已自动休眠。重新登录会立即唤醒它，几秒内即可继续使用——你的账号和数据都已安全保存在云端。`)}
        </p>
        <div className="mt-6">
          <Button
            ref={reloginButtonRef}
            variant="primary"
            // 走查新一轮 R1：补 active:bg- 让移动 tap 有按压反馈（同 R3 修过的
            // profile-subscription 邀请「复制链接」/「联系开通」）。
            className="w-full rounded-[16px] bg-[#f59e0b] text-[#3b2206] shadow-none hover:bg-[#d97706] active:bg-[#069750]"
            onClick={handleRelogin}
          >
            {t(msg`重新登录`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
