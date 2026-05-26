import type { ReactNode } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import {
  translateRuntimeMessage,
  useAppLocale,
} from "@yinjie/i18n";

type BootstrapScreenProps = {
  message?: ReactNode;
};

// 这个组件被复用在两处：
// 1. <AppLocaleProvider> 的 fallback —— 此时 i18n catalog 还没 hydrate，
//    lingui 没有任何翻译可查，<Trans>/t() 会回退成 babel 注入的 6 字符
//    hash id（看起来像乱码），所以必须用裸源串。
// 2. 路由切换时的 <Suspense> fallback —— 此时 catalog 已经 ready，
//    若仍然用裸中文，日韩英用户会在每次切页面时短暂看到中文 flash。
//
// 通过 useAppLocale().isReady 区分两种语境：未就绪用裸中文，已就绪走真正
// 的 t() 翻译。两种 fallback 都被包在 AppLocaleContext.Provider 内，
// 所以 hook 调用总是安全的。
export function BootstrapScreen({ message }: BootstrapScreenProps) {
  const { isReady } = useAppLocale();
  const t = (descriptor: MessageDescriptor) =>
    isReady ? translateRuntimeMessage(descriptor) : descriptor.message ?? "";

  return (
    <div
      className="flex min-h-screen min-h-dvh items-center justify-center bg-[#f5f1e6] px-4 py-10 text-center"
      style={{
        paddingTop: "max(2.5rem, env(safe-area-inset-top, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
      }}
    >
      <div className="w-full max-w-md rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-8 py-10 shadow-none">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(245,158,11,0.16)] bg-[rgba(245,158,11,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.34em] text-[#b45309]">
          Beyond Reality
        </div>
        <div className="mx-auto mt-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-[24px] bg-[linear-gradient(135deg,#f59e0b,#84cc16)] text-2xl font-semibold text-white shadow-none">
          {t(msg`隐界`)}
        </div>
        <h1 className="mt-6 text-4xl font-semibold tracking-[0.08em] text-[color:var(--text-primary)]">
          {t(msg`欢迎回到你的世界`)}
        </h1>
        <p className="mt-4 text-sm leading-8 text-[color:var(--text-secondary)]">
          {t(msg`这里不是一串账号信息，而是一整片会继续生长、继续回应你的个人世界。`)}
        </p>

        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 1
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`确认入口`)}
            </div>
          </div>
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 2
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`同步世界主人`)}
            </div>
          </div>
          <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-secondary)] px-4 py-3 shadow-none">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              Step 3
            </div>
            <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
              {t(msg`继续开启对话`)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-[24px] border border-[rgba(245,158,11,0.12)] bg-[rgba(245,158,11,0.06)] px-4 py-3 text-left text-sm leading-7 text-[#475569]">
          {message ??
            t(msg`正在整理这次进入世界的路径，马上带你回到上次停留的地方。`)}
        </div>
      </div>
    </div>
  );
}
