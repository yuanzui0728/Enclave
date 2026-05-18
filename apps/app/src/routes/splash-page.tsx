import { useEffect } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useNavigate } from "@tanstack/react-router";
import { getMyCloudProfile, getWorldOwner, isApiRequestError } from "@yinjie/contracts";
import { AppPage, AppSection } from "@yinjie/ui";

const t = translateRuntimeMessage;
import { readPersistedMobileWebRoute } from "../features/shell/mobile-web-route-persistence";
import { clearCloudRuntimeSession } from "../lib/cloud-session";
import { persistInviteCode } from "../lib/invite-code-storage";
import {
  isRemoteWebDeployment,
  requiresRemoteServiceConfiguration,
} from "../lib/runtime-config";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { isMobileWebRuntime, resolveAppRuntimeContext } from "../runtime/platform";
import {
  isCloudSessionExpired,
  useCloudSessionStore,
} from "../store/cloud-session-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function SplashPage() {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const setCloudProfile = useCloudSessionStore((state) => state.setProfile);

  useEffect(() => {
    // 通过 https://app/?invite=XXX 进来时，splash 立即 navigate 到 /welcome
    // 会丢掉 query string，需要先把邀请码落到 localStorage，让 welcome 页能继续读到。
    if (typeof window !== "undefined") {
      const queryInvite = new URLSearchParams(window.location.search).get(
        "invite",
      );
      if (queryInvite) {
        persistInviteCode(queryInvite);
      }
    }

    let cancelled = false;

    const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
    if (
      runtimeContext.hostRole === "host" ||
      requiresRemoteServiceConfiguration()
    ) {
      void navigate({ to: "/welcome", replace: true });
      return () => {
        cancelled = true;
      };
    }

    const isCloudMode =
      runtimeConfig.worldAccessMode === "cloud" || isRemoteWebDeployment();
    const cloudSession = isCloudMode
      ? useCloudSessionStore.getState()
      : null;

    // 本地校验：cloud 模式必须有未过期 token；其它路径必须有 apiBaseUrl。
    // 都是纯本地判断，不发 HTTP，不会卡。
    if (
      isCloudMode &&
      (!runtimeConfig.apiBaseUrl ||
        !cloudSession?.accessToken ||
        isCloudSessionExpired(cloudSession.expiresAt))
    ) {
      clearCloudRuntimeSession();
      void navigate({ to: "/welcome", replace: true });
      return () => {
        cancelled = true;
      };
    }
    if (!runtimeConfig.apiBaseUrl) {
      void navigate({ to: "/welcome", replace: true });
      return () => {
        cancelled = true;
      };
    }

    // 已 onboarded：立刻跳 chat / 上次路径，token + owner 验证降级为后台异步。
    // 之前实现 await profile + owner（最长 8s 超时）才决定路由，公网 RTT
    // 加 cloud-api 处理在网络略抖时就把 splash 显示拖到几秒——用户从地址栏
    // 重新点进来一直看着 "欢迎回到你的世界"，体感就是"卡在欢迎页"。
    const cachedOnboardingCompleted =
      useWorldOwnerStore.getState().onboardingCompleted;
    if (cachedOnboardingCompleted) {
      const restoredRoute = isMobileWebRuntime(runtimeConfig.appPlatform)
        ? readPersistedMobileWebRoute()
        : null;
      void navigate({
        to: restoredRoute ?? "/tabs/chat",
        replace: true,
      });

      // 后台异步刷新 profile / owner。失败若是 401/403 再清 session 弹回
      // /welcome；网络错误 / 5xx / 超时一律忽略，留着 7d session 不动
      // ——cloud-api 一重启就被踢登录的老毛病不能复发。
      // 注意：profile 401 处理不挂 cancelled —— splash 早已 unmount，但 token
      // 失效是全局事件，必须把用户弹回 /welcome，不能因为 splash 退场就吃掉。
      if (isCloudMode && cloudSession?.accessToken) {
        void getMyCloudProfile(
          cloudSession.accessToken,
          runtimeConfig.cloudApiBaseUrl,
        )
          .then((profile) => {
            if (!profile) return;
            setCloudProfile(profile);
          })
          .catch((error) => {
            if (
              isApiRequestError(error) &&
              (error.statusCode === 401 || error.statusCode === 403)
            ) {
              clearCloudRuntimeSession();
              void navigate({ to: "/welcome", replace: true });
            }
          });
      }
      void getWorldOwner(runtimeConfig.apiBaseUrl)
        .then((owner) => {
          if (!owner) return;
          hydrateOwner(owner);
        })
        .catch(() => {
          // 静默：owner 刷新失败不影响当前会话路径。
        });

      return () => {
        cancelled = true;
      };
    }

    // 没 onboarded 缓存：才需要等真实的 owner 接口（首次冷启 / 首次登录后立即开 app）
    async function continueColdBoot() {
      const profilePromise =
        isCloudMode && cloudSession?.accessToken
          ? getMyCloudProfile(
              cloudSession.accessToken,
              runtimeConfig.cloudApiBaseUrl,
            )
          : Promise.resolve(null);
      const ownerPromise = getWorldOwner(runtimeConfig.apiBaseUrl as string);
      const timeoutPromise = new Promise<never>((_, reject) =>
        window.setTimeout(
          () => reject(new Error("splash-bootstrap-timeout")),
          8000,
        ),
      );

      const [profileResult, ownerResult] = (await Promise.race([
        Promise.allSettled([profilePromise, ownerPromise]),
        timeoutPromise,
      ]).catch(() => null)) ?? [null, null];

      if (cancelled) return;

      const profileAuthExpired =
        isCloudMode &&
        profileResult?.status === "rejected" &&
        isApiRequestError(profileResult.reason) &&
        (profileResult.reason.statusCode === 401 ||
          profileResult.reason.statusCode === 403);

      if (profileAuthExpired) {
        clearCloudRuntimeSession();
        void navigate({ to: "/welcome", replace: true });
        return;
      }

      if (profileResult?.status === "fulfilled" && profileResult.value) {
        setCloudProfile(profileResult.value);
      }

      const owner =
        ownerResult?.status === "fulfilled" ? ownerResult.value : null;
      if (owner) {
        hydrateOwner(owner);
      }

      const onboardingCompletedNow =
        owner?.onboardingCompleted ??
        useWorldOwnerStore.getState().onboardingCompleted;

      const restoredRoute = isMobileWebRuntime(runtimeConfig.appPlatform)
        ? readPersistedMobileWebRoute()
        : null;
      void navigate({
        to: onboardingCompletedNow
          ? restoredRoute ?? "/tabs/chat"
          : "/welcome",
        replace: true,
      });
    }

    void continueColdBoot();

    return () => {
      cancelled = true;
    };
  }, [
    hydrateOwner,
    navigate,
    runtimeConfig.apiBaseUrl,
    runtimeConfig.appPlatform,
    runtimeConfig.cloudApiBaseUrl,
    runtimeConfig.worldAccessMode,
    setCloudProfile,
  ]);

  return (
    <AppPage className="flex min-h-full flex-col items-center justify-center bg-[#f5f5f5] px-4 py-10 text-center">
      <AppSection className="w-full max-w-xs border-black/5 bg-white px-8 py-10 shadow-none">
        <div className="mx-auto flex h-16 w-16 animate-pulse items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#07c160,#34c759)] text-xl font-semibold text-white shadow-none">
          {t(msg`隐界`)}
        </div>
        <p className="mt-6 text-sm leading-6 text-[color:var(--text-secondary)]">
          {t(msg`加载中...`)}
        </p>
      </AppSection>
    </AppPage>
  );
}
