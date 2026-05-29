import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Compass, LoaderCircle, Sparkles, UserPlus } from "lucide-react";
import {
  dismissShakeSession,
  getActiveShakeSession,
  isApiRequestError,
  keepShakeSession,
  shake,
  type ShakeDiscoverySessionPreview,
} from "@yinjie/contracts";
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
import { MOBILE_EXPLORE_HOME_PATH } from "../lib/explore-home";
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
        description={t(msg`桌面端的发现入口已经收口到桌面发现，先回到主发现页。`)}
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
  // 非会员摇一摇好友已达上限：后端抛 402 SUBSCRIPTION_EXPIRED，全局 handler 会弹出
  // 会员开通对话框。重试只会撞同一面墙（必须先删好友或开通会员），隐掉「重试摇一摇」。
  "SUBSCRIPTION_EXPIRED",
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
  // 摇出后的待确认相遇：此刻后端只建了 preview（status='preview_ready'），尚未
  // 创角色、未加好友。用户点「加为好友」才 keep（落库 + 入通讯录），点「跳过」/
  // 「换一个」才 dismiss。null = 当前没有待确认的相遇。
  const [preview, setPreview] = useState<ShakeDiscoverySessionPreview | null>(
    null,
  );
  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );

  // 摇完 preview 后用户切走再回来（或刷新），preview 只存在组件 state 里会丢——
  // 后端 active session 仍是 preview_ready，挂载时拉一次恢复，避免「同意闸」把已经
  // 摇到的相遇白白扔掉。记录「已为哪个 baseUrl seed 过」：切 world（baseUrl 变）时
  // 自然 !== 当前 baseUrl → 为新 world 重新 seed 一次；用户主动摇/keep/skip 后置成
  // 当前 baseUrl，挡住迟到的 active-session 查询把本地最新状态盖回去。
  const seededBaseUrlRef = useRef<string | undefined>(undefined);
  const activeShakeQuery = useQuery({
    queryKey: ["app-shake-active", baseUrl],
    queryFn: () => getActiveShakeSession(baseUrl),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const shakeMutation = useMutation({
    mutationFn: async (vars?: { mode?: "new" | "reroll" }) => {
      // 「换一个」走 reroll：后端在同一帧里把当前 preview_ready 会话 dismiss 掉再
      // 生成新的（原子，且绕过 cooldown），保证一定换到不同的人。普通首摇走 new；
      // new 模式下若已有 active preview_ready，后端会原样返回它（不重复生成）。
      const mode = vars?.mode === "reroll" ? "reroll" : "new";
      // 后端 planning + 角色生成两次推理 + fallback provider，正常 ~60s。后端已给
      // 单次 attempt 加了 45s 上界，但隧道 / 网络层若整体卡住，fetch 本身没有
      // timeout 会无限挂起，按钮一直停在「正在寻找...」。给整个请求一个 150s 的
      // 兜底上限（够正常流程 + 一次 provider fallback），超时 abort 并转成可重试
      // 的友好错误，绝不让用户对着 spinner 干等。
      // 用 AbortController + setTimeout 而非 AbortSignal.timeout()：后者要 Safari
      // 16+ / Chrome 103+，vite/esbuild 不会 polyfill 这个运行时 API，旧版移动端
      // WebView 上会直接 TypeError 把每次摇一摇都摔掉。对齐 client-public-ip.ts 的
      // 既有写法。controller.signal.aborted 判定「是我们的超时」比对 DOMException
      // name（浏览器 TimeoutError vs undici AbortError）更稳。
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 150_000);
      let previewResult: Awaited<ReturnType<typeof shake>>;
      try {
        previewResult = await shake({ mode }, baseUrl, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            t(msg`摇一摇等待超时，可能是网络或服务器繁忙，请稍后重试。`),
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
      // 只摇出 preview，绝不在这里 keep——是否加为好友交给用户在卡片上点「加为
      // 好友」决定（同意闸）。此刻后端没建角色、没加好友。
      return previewResult ?? null;
    },
    onMutate: () => {
      // 上一次"X 已加入通讯录"的 success notice 在新一次摇一摇等 AI（~60s）期间
      // 还挂在原地，按钮 disabled 成"正在寻找..."又显示着上一个人的名字，用户会
      // 怀疑是不是还没真的开始摇。统一在 mutate 起手时清掉旧 notice。
      setMessage(""); // i18n-ignore-line: clearing state
      setTone("info");
      // 走查 Round 4：上一次「加为好友」失败留下的 keepMutation 错误条，若不清，换一个
      // (reroll) 摇出新人后会挂在新卡片下面（错误条只看 keepMutation.isError）。新一轮
      // 摇起手时一并归零，旧错误不串到新相遇上。
      keepMutation.reset();
      // 一旦用户主动摇，就把当前 world 标记为已 seed，别再让迟到的 active-session
      // 查询把本地最新状态 seed 回去盖掉。
      seededBaseUrlRef.current = baseUrl;
    },
    onSuccess: (result) => {
      if (!result) {
        setPreview(null);
        setTone("warning");
        setMessage(t(msg`附近暂时没有新的相遇。`));
        return;
      }
      // 摇到了人：展示待确认卡片，等用户点「加为好友」/「跳过」。
      setPreview(result);
      setMessage(""); // i18n-ignore-line: clearing state
      setTone("info");
    },
  });

  // 用户点「加为好友」= 同意，这一步才真正落库（建角色 + 加好友 + 落 greeting）。
  const keepMutation = useMutation({
    mutationFn: async (target: ShakeDiscoverySessionPreview) => {
      const result = await keepShakeSession(target.id, baseUrl);
      // 走查 Round 2：invalidate 放在 mutationFn 里，组件在请求期间被切走时也能
      // 刷新 friend-requests / friends / conversations 三个 cache（queryClient 是
      // app 级单例），下次切回 chat/contacts 直接看到新好友。
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl] }),
      ]);
      return { result, target };
    },
    onSuccess: ({ result, target }) => {
      setPreview(null);
      const characterName =
        result.characterName ?? target.character.name ?? t(msg`世界角色`);
      const greeting = target.greeting?.trim() || t(msg`刚刚和你打了招呼。`);
      setTone("success");
      setMessage(t(msg`${characterName} 已加入通讯录：${greeting}`));
    },
  });

  // 用户点「跳过」= 不加为好友，丢弃这次相遇（不入通讯录）。
  const dismissMutation = useMutation({
    mutationFn: async (target: ShakeDiscoverySessionPreview) => {
      await dismissShakeSession(target.id, { reason: "user_skipped" }, baseUrl);
    },
    onMutate: () => {
      // 乐观清掉卡片：dismiss 是「不要这个人」，无论后端成功与否用户都不该再看到它。
      setPreview(null);
      setTone("info");
      setMessage(t(msg`已跳过这次相遇。`));
    },
  });

  // 发起一次摇一摇。若当前已有待确认 preview，「再摇」语义 =「换一个」：走 reroll
  // 模式，由后端原子地丢弃当前会话再生成新的（不在客户端各发一枪、避免 race 把同
  // 一个人原样返回）。生成成功前保留旧卡片（其按钮在 shake 进行中禁用），失败（如撞
  // 每日上限）时旧卡片仍在，不至于把一个有效的待确认相遇白白丢掉。
  const triggerShake = () => {
    if (shakeMutation.isPending || keepMutation.isPending) {
      return;
    }
    shakeMutation.mutate({ mode: preview ? "reroll" : "new" });
  };

  const { permissionState, requestPermission } = useShakeDetector({
    enabled: !shakeMutation.isPending && !keepMutation.isPending,
    onShake: () => {
      triggerShake();
    },
  });

  const handleShakeButtonClick = async () => {
    if (shakeMutation.isPending || keepMutation.isPending) {
      return;
    }
    if (permissionState === "needs-permission") {
      // heroDescription 明说"首次使用请点下方按钮授权动作传感器，之后晃动手机即可
      // 触发相遇"——iOS 首次点击应只走 requestPermission()，授权完成后让用户自己
      // 决定下一步（摇手机 / 再次点击），不要顺手扣掉一次每日额度。
      await requestPermission();
      return;
    }
    triggerShake();
  };

  const heroDescription = (() => {
    switch (permissionState) {
      case "granted":
        return t(msg`晃动手机即可开始相遇，也可以直接点下方按钮。摇出后由你决定是否加为好友。`);
      case "needs-permission":
        return t(msg`首次使用请点下方按钮授权动作传感器，之后晃动手机即可触发相遇。`);
      case "denied":
        return t(msg`已拒绝动作传感器授权，可在系统设置开启，或点下方按钮手动触发相遇。`);
      default:
        // 走查 Round 1：'unsupported'（设备没有动作传感器 / 桌面浏览器 / WebView 屏蔽）
        // 走兜底分支，但兜底文案完全没提到「点按钮」也能摇一摇——用户看不到怎么触发。
        // 与 'denied' 分支对齐，明确告诉用户：只能点按钮。
        return t(msg`当前设备不支持晃动触发，点下方按钮手动触发相遇，摇出后由你决定是否加为好友。`);
    }
  })();

  const heroButtonLabel = (() => {
    if (shakeMutation.isPending) {
      return t(msg`正在寻找...`);
    }
    if (preview) {
      // 已有待确认 preview 时，再点主按钮 =「换一个」（丢弃当前再摇）。
      return t(msg`换一个`);
    }
    if (permissionState === "needs-permission") {
      return t(msg`开启摇一摇`);
    }
    return t(msg`摇一摇`);
  })();

  // 切 world（baseUrl 变）时把上一个 world 的瞬时 UI 立即清掉：旧卡片 / 旧成功提示 /
  // 旧错误条都不该带到新 world。声明在下面的 seed effect 之前——同一次 baseUrl 变化的
  // effect flush 里 reset 先把 preview 置 null，seed 后跑（声明序靠后）若命中新 world
  // 的缓存会再把 preview 设回去，最终以 seed 的结果为准，不会把旧卡片留在屏上。
  // 不动 seededBaseUrlRef：它仍指向旧 baseUrl，与新 baseUrl 不等，seed effect 据此为
  // 新 world 重新 seed。
  useEffect(() => {
    setMessage(""); // i18n-ignore-line: clearing state
    setTone("info");
    setPreview(null);
    // 走查 Round 5：mutation 的 isError/error 也要归零，否则切到新 world 红色错误条
    // 还挂着旧 world 的 SHAKE_DAILY_LIMIT 等带 worldId 含义的提示。
    shakeMutation.reset();
    keepMutation.reset();
    dismissMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  // 为当前 world 恢复未决 preview：仅当本 baseUrl 尚未 seed 过、且 active-session 查询
  // 已返回时跑一次。命中 preview_ready → 显示卡片；否则置 null（顺带清掉 reset 之外的
  // 残留）。切 world 后 seededBaseUrlRef !== baseUrl，自动为新 world 再 seed 一次。
  useEffect(() => {
    if (seededBaseUrlRef.current === baseUrl) {
      return;
    }
    if (!activeShakeQuery.isSuccess) {
      return;
    }
    seededBaseUrlRef.current = baseUrl;
    const active = activeShakeQuery.data;
    setPreview(active && active.status === "preview_ready" ? active : null);
  }, [baseUrl, activeShakeQuery.isSuccess, activeShakeQuery.data]);

  // 让 active-shake 查询缓存与本地 preview 保持同步：keep/dismiss/换一个 后把缓存
  // 写成最新（已解决→null / 换到新人→新 preview）。否则 staleTime:Infinity 的缓存
  // 会在用户切走再回来（组件重挂、state 归零）时，把一个已经被 keep/dismiss 的旧
  // preview_ready 重新 seed 成卡片——让人看到「已经加过的人」又冒出来要你再决定一次。
  // 仅当本 baseUrl 已完成 seed 后才同步：避免挂载首帧 / world-switch 过渡帧用旧 preview
  // 写错 world 的缓存键。
  useEffect(() => {
    if (seededBaseUrlRef.current !== baseUrl) {
      return;
    }
    queryClient.setQueryData(["app-shake-active", baseUrl], preview);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, baseUrl]);

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

        void navigate({ to: MOBILE_EXPLORE_HOME_PATH });
      },
      (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
        ? routeState.returnPath
        : undefined) ?? MOBILE_EXPLORE_HOME_PATH,
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
          disabled={shakeMutation.isPending || keepMutation.isPending}
          aria-busy={shakeMutation.isPending || undefined}
          variant="primary"
          // 走查 Round 3：variant=primary 自带 [background-image:var(--brand-gradient)]
          // 是橙黄色渐变；只盖 bg-[color:var(--brand-primary)]（color，不带 image）会被橙色渐变覆盖，
          // 实际渲染出来是橙色不是设计想要的微信绿。补 [background-image:none]
          // 让 bg-color 真正生效。
          className="h-12 w-full rounded-[var(--radius-md)] bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)] [background-image:none]"
        >
          {/* 走查 Round 1：AI 端到端 ~60s（planning + 角色生成两次推理），按钮原来全程
              只有「正在寻找...」一行文字、没有 spinner——公网隧道 + 移动端用户经常以为
              页面卡死多次点按钮。disabled 防住了重复 mutate，但视觉缺少"它正在干活"的
              反馈。对齐 chat 模块用的 LoaderCircle + animate-spin。
              走查 Round 1（a11y）：disabled 拦住了点击但盲用户没有"页面在等 AI"的语义反馈，
              补 aria-busy 让 SR 朗读"忙碌"状态，与 chat send 按钮 loading 行为对齐。 */}
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
          // 走查 Round 1（a11y）：「X 已加入通讯录」「附近暂时没有新的相遇」这类成功/警告
          // 反馈是用户摇完 ~60s 等到的关键结果——之前是裸 InlineNotice，盲用户只能从
          // 按钮 disabled 状态推断完成，没有内容上下文。挂 role=status + aria-live=polite
          // 让 SR 在 AI 跑完一刻读出结果（与 account-security-panel 的 success/info 收口一致）。
          <InlineNotice
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] shadow-none"
            tone={tone}
            role="status"
            aria-live="polite"
          >
            {message}
          </InlineNotice>
        ) : null
      }
      onBack={handleBack}
    >
      {preview ? (
        // 待确认相遇卡片：摇出后展示对方信息，用户点「加为好友」才入通讯录（同意闸），
        // 点「跳过」丢弃。role=status + aria-live=polite，让 SR 在 AI 跑完一刻读出结果。
        <section
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3.5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/12 text-[length:var(--text-section)]">
              {preview.character.avatar?.trim() || "🙂"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--text-body)] font-semibold text-[color:var(--text-primary)]">
                {preview.character.name?.trim() || t(msg`世界角色`)}
              </div>
              {preview.character.relationship?.trim() ? (
                <div className="mt-0.5 truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                  {preview.character.relationship}
                </div>
              ) : null}
            </div>
          </div>

          {preview.character.expertDomains &&
          preview.character.expertDomains.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {preview.character.expertDomains.slice(0, 4).map((domain, index) => (
                <span
                  key={`${domain}-${index}`}
                  className="inline-flex items-center rounded-full bg-[color:var(--brand-primary)]/10 px-2 py-0.5 text-[length:var(--text-eyebrow)] text-[color:var(--brand-primary)]"
                >
                  {domain}
                </span>
              ))}
            </div>
          ) : null}

          {preview.greeting?.trim() ? (
            <div className="mt-2.5 whitespace-pre-line break-words rounded-[var(--radius-sm)] bg-[color:var(--surface-card-hover)] px-3 py-2 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
              {preview.greeting}
            </div>
          ) : null}

          {preview.matchReason?.trim() ? (
            <div className="mt-2 text-[length:var(--text-eyebrow)] leading-5 text-[color:var(--text-muted)]">
              {t(msg`相遇理由：${preview.matchReason}`)}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              disabled={keepMutation.isPending || shakeMutation.isPending}
              onClick={() => dismissMutation.mutate(preview)}
              variant="secondary"
              size="sm"
              className="h-9 min-w-[4rem] rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 text-[length:var(--text-caption)] shadow-none hover:bg-[color:var(--surface-card-hover)]"
            >
              {t(msg`跳过`)}
            </Button>
            <Button
              type="button"
              disabled={keepMutation.isPending || shakeMutation.isPending}
              aria-busy={keepMutation.isPending || undefined}
              onClick={() => keepMutation.mutate(preview)}
              variant="primary"
              size="sm"
              className="h-9 min-w-[5.5rem] rounded-full bg-[color:var(--brand-primary)] px-3 text-[length:var(--text-caption)] text-[color:var(--text-on-brand)] shadow-none hover:bg-[color:var(--brand-primary)] [background-image:none]"
            >
              {keepMutation.isPending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <UserPlus size={14} />
              )}
              {keepMutation.isPending ? t(msg`添加中...`) : t(msg`加为好友`)}
            </Button>
          </div>

          {keepMutation.isError && keepMutation.error instanceof Error ? (
            <div className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-4 text-[color:var(--state-danger-text)]">
              {(isApiRequestError(keepMutation.error)
                ? translateAppErrorCode(keepMutation.error)
                : null) ?? keepMutation.error.message}
            </div>
          ) : null}
        </section>
      ) : null}

      {shakeMutation.isError && shakeMutation.error instanceof Error ? (
        // 走查 Round 1（a11y）：danger 错误（SHAKE_DAILY_LIMIT / SHAKE_COOLDOWN /
        // SHAKE_AI_*_FAILED 等）必须立即打断 SR 当前朗读告诉用户摇失败了，挂 role=alert
        // （隐含 aria-live=assertive）。与 account-security-panel 的 danger feedback 对齐。
        <InlineNotice
          className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] shadow-none"
          tone="danger"
          role="alert"
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
                  // 走查：走 triggerShake 而非硬编码 mode:"new"。一次失败的「换一个」会
                  // 保留旧卡片（preview 非空），此时重试必须用 reroll；否则 new 模式撞到
                  // 服务端仍 active 的 preview_ready 会把同一个人原样返回。triggerShake
                  // 按 preview 是否存在自动选 reroll / new。
                  onClick={() => triggerShake()}
                  className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {t(msg`重试摇一摇`)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleBack}
                className="rounded-full border border-[color:var(--state-danger-bg)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
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
