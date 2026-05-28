import { Suspense, lazy, useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  Languages,
  ShieldCheck,
  SunMoon,
  UsersRound,
} from "lucide-react";
import { updateWorldOwner } from "@yinjie/contracts";
import {
  SUPPORTED_LOCALE_LABELS,
  useAppLocale,
  useRuntimeTranslator,
} from "@yinjie/i18n";
import { AppPage, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useAppearance } from "../hooks/use-appearance";
import type { AppearanceMode } from "../store/appearance-store";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { shouldShowCloudAccountControls } from "../lib/cloud-session";
import { navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useCloudSessionStore } from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

// 桌面 tabs（个人资料 / AI 设置 / 快捷键 / 语言 / 协议 / 会员中心 / 账号安全）
// 走查 R1（2026-05-17 新一轮）：原本 ProfileSettingsPage 把桌面所有 tab 内容
// 都静态 import 进来（DesktopUtilityShell / DesktopChatConfirmDialog /
// LanguageSwitcher / SubscriptionPanel / AccountSecurityPanel /
// CheckoutContactDialog + workspace-contracts 的 cloud-subscription / invite /
// world-owner mutation 一堆），构出 27KB 主 chunk + 4 个 ~13KB 桌面专属辅助
// chunk。移动端只用 entry list（多语言 + 账号安全 2 个按钮）却为这 12KB+
// 桌面代码付了下载 + parse + 内存。
// 拆出 ProfileSettingsDesktop 走 React.lazy：桌面用户多花一次 chunk request，
// 移动端 /profile/settings 只装载本文件。
const ProfileSettingsDesktop = lazy(() =>
  import("./profile-settings-desktop").then((mod) => ({
    default: mod.ProfileSettingsDesktop,
  })),
);

export function ProfileSettingsPage() {
  // 第四轮 R1：之前路由组件顶层同时订阅 runtimeConfig / worldOwner.id /
  // cloudSession.accessToken / cloudSession.phone / useAppLocale 五路状态——
  // 但桌面分支根本不读，全部走 lazy 出去的 ProfileSettingsDesktop。结果是
  // 桌面用户切到 /desktop/settings 时，每次 cloud-session 心跳 / world-owner
  // hydrate / locale 激活，都拽着这个外壳 re-render（虽然只重渲 Suspense
  // 节点，但还是触发 React 调度 + zustand 比对）。把 mobile-only 状态搬进
  // ProfileSettingsMobileEntry, 桌面外壳只订阅 useDesktopLayout 这一个信号。
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    // Suspense fallback 给空——桌面 utility shell 切到 settings 的瞬间空一两帧
    // 比放骨架屏更接近"已经在 settings 内部"的预期；DesktopUtilityShell
    // 自身有边框 + sidebar 框架（lazy chunk 还在下载时已经看不到 fallback）。
    return (
      <Suspense fallback={null}>
        <ProfileSettingsDesktop />
      </Suspense>
    );
  }

  return <ProfileSettingsMobileEntry />;
}

function ProfileSettingsMobileEntry() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const ownerId = useWorldOwnerStore((state) => state.id);
  const cloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const cloudPhone = useCloudSessionStore((state) => state.phone);
  const { requestedLocale } = useAppLocale();
  const { mode: appearanceMode, setMode: setAppearanceMode } = useAppearance();

  const appearanceOptions: Array<{ value: AppearanceMode; label: string }> = [
    { value: "light", label: t(msg`浅色`) },
    { value: "dark", label: t(msg`深色`) },
    { value: "system", label: t(msg`跟随系统`) },
  ];

  const showCloudAccountEntries = shouldShowCloudAccountControls({
    worldAccessMode: runtimeConfig.worldAccessMode,
    runtimeApiBaseUrl: runtimeConfig.apiBaseUrl,
    runtimeCloudPhone: runtimeConfig.cloudPhone,
    accessToken: cloudAccessToken,
    sessionPhone: cloudPhone,
    worldOwnerId: ownerId,
  });

  const apiBaseUrl = runtimeConfig.apiBaseUrl;
  // 分身相遇 opt-in：world owner 的 encounterOptedIn 列是唯一真源——cloud-api 撮合池
  // 的 optedIn 由 world 每次推快照覆盖。所以必须走 world-api updateWorldOwner 写，
  // world.controller 改了该字段会即时推快照同步到 cloud-api；否则只写 cloud 中心会被
  // 下一次画像重建的快照回滚。
  const storeOptedIn = useWorldOwnerStore((state) => state.encounterOptedIn);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

  // optimistic 本地状态：随 store 真源落地，toggle 时立刻翻转，失败回滚。
  const [optedIn, setOptedIn] = useState(storeOptedIn);
  useEffect(() => {
    setOptedIn(storeOptedIn);
  }, [storeOptedIn]);

  const optInMutation = useMutation({
    mutationFn: (next: boolean) =>
      updateWorldOwner({ encounterOptedIn: next }, apiBaseUrl),
    onSuccess: (owner) => {
      hydrateOwner(owner);
      setOptedIn(owner.encounterOptedIn !== false);
    },
    onError: () => {
      setOptedIn(storeOptedIn);
    },
  });

  function handleToggleOptIn() {
    if (optInMutation.isPending) return;
    const next = !optedIn;
    setOptedIn(next); // optimistic
    optInMutation.mutate(next);
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`设置`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          // 第三轮 R1：之前用 UI <Button variant="ghost"> + className "shadow-none"
          // 直接把 tokens.css 全局 :focus-visible 的 box-shadow 焦点环压成 0——
          // 键盘 tab 到 back 按钮看不见任何高亮（语言/账号安全两个子页都已经走
          // 朴素 <button>，三页样式不一致）。改成跟两个子页同款 plain <button>，
          // a11y 一致。
          <button
            type="button"
            onClick={() =>
              // 与其他 /profile/* 子页保持同款返回逻辑（navigateBackOrFallback）：
              // history.back() 优先以保留 /tabs/profile 滚动位置；否则降级到 navigate。
              // 之前直接 navigate({to:"/tabs/profile"}) 会向 history 推一格，从 settings
              // 退回 profile 后再按浏览器/Android Back 又会回到 settings。
              navigateBackOrFallback(
                () => void navigate({ to: "/tabs/profile", replace: true }),
                "/tabs/profile",
              )
            }
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
            aria-label={t(msg`返回资料页`)}
          >
            <ArrowLeft size={17} />
          </button>
        }
      />
      <div className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
        <button
          type="button"
          onClick={() => void navigate({ to: "/profile/settings/language" })}
          className="flex w-full items-center gap-2.5 px-4 py-2.75 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-black/[0.04]"
        >
          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(56,189,248,0.12)] text-[#0891b2]">
            <Languages size={15} />
          </div>
          <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
            {t(msg`多语言`)}
          </div>
          <div
            data-i18n-skip="true"
            className="text-[12px] text-[color:var(--text-muted)]"
          >
            {SUPPORTED_LOCALE_LABELS[requestedLocale]}
          </div>
          <ChevronRight
            size={13}
            className="shrink-0 text-[color:var(--text-dim)]"
          />
        </button>
        {showCloudAccountEntries ? (
          <button
            type="button"
            onClick={() =>
              void navigate({ to: "/profile/settings/account-security" })
            }
            className="flex w-full items-center gap-2.5 border-t border-[color:var(--border-faint)] px-4 py-2.75 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-black/[0.04]"
          >
            <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(64,169,255,0.12)] text-[#1677ff]">
              <ShieldCheck size={15} />
            </div>
            <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
              {t(msg`账号安全`)}
            </div>
            <ChevronRight
              size={13}
              className="shrink-0 text-[color:var(--text-dim)]"
            />
          </button>
        ) : null}
      </div>

      {/* 外观：浅色 / 深色 / 跟随系统。纯前端，写 appearance-store（localStorage 持久），
          mobile-shell 按解析结果挂 data-appearance 切兰花薰衣(白天)/深空夜紫(夜间)。 */}
      <div className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
        <div className="flex w-full items-center gap-2.5 px-4 pb-1.5 pt-2.75 text-left">
          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
            <SunMoon size={15} />
          </div>
          <div className="min-w-0 flex-1 text-[14px] text-[color:var(--text-primary)]">
            {t(msg`外观`)}
          </div>
        </div>
        <div className="px-4 pb-3 pt-1">
          <div className="flex gap-1 rounded-[12px] bg-[color:var(--surface-soft)] p-1">
            {appearanceOptions.map((option) => {
              const active = appearanceMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setAppearanceMode(option.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex-1 rounded-[10px] py-1.5 text-[12px] font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    active
                      ? "bg-[color:var(--surface-card)] text-[color:var(--text-primary)] shadow-[var(--shadow-soft)]"
                      : "text-[color:var(--text-secondary)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 分身相遇 opt-in：跨用户撮合池开关，默认开。写走 world-api（owner 列为真源），
          跟 账号安全 同款 showCloudAccountEntries 门禁（local-world / 没登云账号的不显示）。 */}
      {showCloudAccountEntries ? (
        <div className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
          <div className="flex w-full items-center gap-2.5 px-4 py-2.75 text-left">
            <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[rgba(244,63,94,0.12)] text-[#f43f5e]">
              <UsersRound size={15} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-[color:var(--text-primary)]">
                {t(msg`允许我的分身参与社交相遇`)}
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--text-muted)]">
                {t(msg`关闭后别人无法和你的分身相遇，你也收不到新的相遇。`)}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={optedIn}
              aria-label={t(msg`允许我的分身参与社交相遇`)}
              onClick={handleToggleOptIn}
              disabled={optInMutation.isPending}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                optedIn
                  ? "bg-[color:var(--brand-primary)]"
                  : "bg-[color:var(--border-subtle)]",
                optInMutation.isPending && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-[var(--shadow-soft)] transition-[left]",
                  optedIn ? "left-[1.375rem]" : "left-0.5",
                )}
              />
            </button>
          </div>
        </div>
      ) : null}
    </AppPage>
  );
}
