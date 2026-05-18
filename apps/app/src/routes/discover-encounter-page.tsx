import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Compass, LoaderCircle, Sparkles } from "lucide-react";
import { isApiRequestError, keepShakeSession, shake } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  InlineNotice,
} from "@yinjie/ui";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useShakeDetector } from "../hooks/use-shake-detector";
import { translateAppErrorCode } from "../lib/error-translate";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DiscoverEncounterPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/discover",
      hash: hash || undefined,
      replace: true,
    });
  }, [hash, isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到桌面发现页`)}
        description={t(msg`桌面端的发现入口已经收口到桌面发现工作区，先回到主发现页。`)}
        loadingLabel={t(msg`正在切换到桌面发现页...`)}
      />
    );
  }

  return <MobileDiscoverEncounterPage />;
}

const NON_RETRYABLE_SHAKE_ERROR_CODES = new Set([
  "SHAKE_DAILY_LIMIT",
  "SHAKE_DISABLED",
  "SHAKE_CYBER_AVATAR_NO_SIGNAL",
  // 走查 Round 1：cooldown 是时间窗口，立刻重试只会再次拿到同一个 SHAKE_COOLDOWN。
  // legacyMessage 已经告诉用户「请至少间隔 X 分钟」，再放个「重试摇一摇」按钮等于
  // 鼓励用户撞同一面墙；归到 non-retryable，只留「回发现页」让用户体面退出。
  "SHAKE_COOLDOWN",
]);

function isShakeErrorRetryable(error: Error) {
  if (!isApiRequestError(error)) {
    return true;
  }
  const code = error.code ?? error.errorCode;
  if (!code) {
    return true;
  }
  return !NON_RETRYABLE_SHAKE_ERROR_CODES.has(code);
}

function MobileDiscoverEncounterPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warning">("info");
  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const preview = await shake(undefined, baseUrl);
      if (!preview) {
        return null;
      }

      await keepShakeSession(preview.id, baseUrl);
      return preview;
    },
    onMutate: () => {
      // 上一次"X 已加入通讯录"的 success notice 在新一次摇一摇等 AI（~60s）期间
      // 还挂在原地，按钮 disabled 成"正在寻找..."又显示着上一个人的名字，用户会
      // 怀疑是不是还没真的开始摇。统一在 mutate 起手时清掉旧 notice。
      setMessage(""); // i18n-ignore-line: clearing state
      setTone("info");
    },
    onSuccess: (result) => {
      if (!result) {
        setTone("warning");
        setMessage(t(msg`附近暂时没有新的相遇。`));
        return;
      }

      const characterName = result.character.name ?? t(msg`世界角色`);
      const greeting = result.greeting ?? t(msg`刚刚和你打了招呼。`);
      setTone("success");
      setMessage(
        t(msg`${characterName} 已加入通讯录：${greeting}`),
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] }),
      ]);
    },
  });

  const { permissionState, requestPermission } = useShakeDetector({
    enabled: !shakeMutation.isPending,
    onShake: () => {
      if (shakeMutation.isPending) {
        return;
      }
      shakeMutation.mutate();
    },
  });

  const handleShakeButtonClick = async () => {
    if (shakeMutation.isPending) {
      return;
    }
    if (permissionState === "needs-permission") {
      // heroDescription 明说"首次使用请点下方按钮授权动作传感器，之后晃动手机即可
      // 触发相遇"——iOS 首次点击应只走 requestPermission()，授权完成后让用户自己
      // 决定下一步（摇手机 / 再次点击），不要顺手扣掉一次每日额度。
      await requestPermission();
      return;
    }
    shakeMutation.mutate();
  };

  const heroDescription = (() => {
    switch (permissionState) {
      case "granted":
        return t(msg`晃动手机即可开始相遇，也可以直接点下方按钮。每次相遇都会直接加入你的通讯录。`);
      case "needs-permission":
        return t(msg`首次使用请点下方按钮授权动作传感器，之后晃动手机即可触发相遇。`);
      case "denied":
        return t(msg`已拒绝动作传感器授权，可在系统设置开启，或点下方按钮手动触发相遇。`);
      default:
        // 走查 Round 1：'unsupported'（设备没有动作传感器 / 桌面浏览器 / WebView 屏蔽）
        // 走兜底分支，但兜底文案完全没提到「点按钮」也能摇一摇——用户看不到怎么触发。
        // 与 'denied' 分支对齐，明确告诉用户：只能点按钮。
        return t(msg`当前设备不支持晃动触发，点下方按钮手动触发相遇，每次结果都会直接加入你的通讯录。`);
    }
  })();

  const heroButtonLabel = (() => {
    if (shakeMutation.isPending) {
      return t(msg`正在寻找...`);
    }
    if (permissionState === "needs-permission") {
      return t(msg`开启摇一摇`);
    }
    return t(msg`摇一摇`);
  })();

  useEffect(() => {
    setMessage(""); // i18n-ignore-line: clearing state
    setTone("info");
  }, [baseUrl]);

  function navigateToRouteStateReturn() {
    if (
      !routeState.returnPath ||
      isDesktopOnlyPath(routeState.returnPath)
    ) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  // 走查 Round 1（2 次会话）：错误条上的"返回上一页 / 回发现页"按钮直接 navigate
  // 到 routeState.returnPath / /tabs/discover，是 push 不是 pop——用户点完落到
  // discover 后再按系统返回，又会被弹回 encounter 错误页。跟顶栏的 onBack 一样
  // 走 navigateBackOrFallback：能 history.back() 就 pop，落不到 same-origin 才
  // 走 fallback。
  const handleBack = () => {
    navigateBackOrFallback(
      () => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        void navigate({ to: "/tabs/discover" });
      },
      (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
        ? routeState.returnPath
        : undefined) ?? "/tabs/discover",
    );
  };

  return (
    <MobileDiscoverToolShell
      title={t(msg`摇一摇`)}
      subtitle={t(msg`随机遇见新的世界居民`)}
      heroTitle={t(msg`随机相遇`)}
      heroDescription={heroDescription}
      heroVisual={<Compass size={28} />}
      heroAction={
        <Button
          onClick={() => void handleShakeButtonClick()}
          disabled={shakeMutation.isPending}
          variant="primary"
          className="h-12 w-full rounded-full bg-[#07c160] text-white hover:bg-[#06ad56]"
        >
          {/* 走查 Round 1：AI 端到端 ~60s（planning + 角色生成两次推理），按钮原来全程
              只有「正在寻找...」一行文字、没有 spinner——公网隧道 + 移动端用户经常以为
              页面卡死多次点按钮。disabled 防住了重复 mutate，但视觉缺少"它正在干活"的
              反馈。对齐 chat 模块用的 LoaderCircle + animate-spin。 */}
          {shakeMutation.isPending ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {heroButtonLabel}
        </Button>
      }
      notice={
        message ? (
          <InlineNotice
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={tone}
          >
            {message}
          </InlineNotice>
        ) : null
      }
      onBack={handleBack}
    >
      {shakeMutation.isError && shakeMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">
              {/* 走查 Round 3：跟 profile-info-* 同款——后端 AppError 优先走
                  translateAppErrorCode 出当前 locale 文案，miss 时回退 raw
                  error.message（一般是 legacyMessage 的中文兜底）。否则
                  en-US/ja-JP/ko-KR 用户摇出 SHAKE_DAILY_LIMIT 等会看到原样
                  「今日摇一摇次数已达到上限。」。*/}
              {(isApiRequestError(shakeMutation.error)
                ? translateAppErrorCode(shakeMutation.error)
                : null) ?? shakeMutation.error.message}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {/* 走查 Round 2：SHAKE_DAILY_LIMIT / SHAKE_DISABLED / SHAKE_CYBER_AVATAR_NO_SIGNAL
                  在本次访问内不会因重试变好，再点一次只会拿到同一份 error；隐掉「重试摇
                  一摇」按钮，留「回发现页」让用户体面退出。COOLDOWN / AI 暂时性失败 /
                  网络错误等仍保留重试。 */}
              {isShakeErrorRetryable(shakeMutation.error) ? (
                <button
                  type="button"
                  onClick={() => shakeMutation.mutate()}
                  className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {t(msg`重试摇一摇`)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
                  ? t(msg`返回上一页`)
                  : t(msg`回发现页`)}
              </button>
            </div>
          </div>
        </InlineNotice>
      ) : null}
    </MobileDiscoverToolShell>
  );
}
