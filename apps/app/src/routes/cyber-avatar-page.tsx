import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { LoaderCircle, Sparkles } from "lucide-react";
import {
  generateCyberAvatarSelfPortrait,
  getCyberAvatarSelfProfile,
  isApiRequestError,
  type CyberAvatarSelfProfile,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice, cn } from "@yinjie/ui";
import { CyberAvatarPortrait } from "../features/cyber-avatar/cyber-avatar-portrait";
import { CyberAvatarReportSheet } from "../features/cyber-avatar/cyber-avatar-report-sheet";
import { CyberAvatarSelfChatThread } from "../features/cyber-avatar/cyber-avatar-self-chat-thread";
import { EmptyState } from "../components/empty-state";
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { translateAppErrorCode } from "../lib/error-translate";
import { MOBILE_EXPLORE_HOME_PATH } from "../lib/explore-home";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function CyberAvatarPage() {
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
        description={t(msg`赛博分身当前只在移动端开放，先回到主发现页。`)}
        loadingLabel={t(msg`正在切换到桌面发现页...`)}
      />
    );
  }

  return <MobileCyberAvatarPage />;
}

function MobileCyberAvatarPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const gender = useWorldOwnerStore((state) => state.gender);

  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );
  const [reportOpen, setReportOpen] = useState(false);

  const profileQuery = useQuery({
    queryKey: ["cyber-avatar-me", baseUrl],
    queryFn: () => getCyberAvatarSelfProfile(baseUrl),
  });

  // 生成/重新生成专属 AI 立绘：后端同步出图，成功直接用返回的 profile 回填 query
  // （省一次 GET），失败由按钮区的 InlineNotice 按 code 本地化展示。
  const portraitMutation = useMutation({
    mutationFn: () => generateCyberAvatarSelfPortrait(baseUrl),
    onSuccess: (next: CyberAvatarSelfProfile) => {
      queryClient.setQueryData(["cyber-avatar-me", baseUrl], next);
    },
  });

  const profile = profileQuery.data ?? null;

  const heroDescription = profile?.liveState?.mood
    ? profile.liveState.mood
    : t(msg`你的数字镜像，由你在世界里的全部互动塑造而成。`);

  function navigateToRouteStateReturn() {
    if (!routeState.returnPath || isDesktopOnlyPath(routeState.returnPath)) {
      return false;
    }
    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  const handleBack = () =>
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

  const lowData = profile != null && profile.readiness === "empty";

  return (
    <MobileDiscoverToolShell
      title={t(msg`赛博分身`)}
      subtitle={t(msg`和你的数字镜像对话`)}
      heroBadge={t(msg`镜像`)}
      heroTitle={t(msg`赛博分身`)}
      heroVisual={<Sparkles size={28} />}
      heroDescription={heroDescription}
      onBack={handleBack}
    >
      {profileQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[color:var(--text-muted)]">
          <LoaderCircle size={16} className="animate-spin" />
          {t(msg`正在加载你的赛博分身…`)}
        </div>
      ) : profileQuery.isError && profileQuery.error instanceof Error ? (
        <InlineNotice
          className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
          tone="danger"
          role="alert"
        >
          {(isApiRequestError(profileQuery.error)
            ? translateAppErrorCode(profileQuery.error)
            : null) ?? profileQuery.error.message}
        </InlineNotice>
      ) : profile == null ? null : lowData ? (
        // 空态（0 信号）：纯引导，无手动重建按钮——分身在后端定时静默自动更新。
        <EmptyState
          icon={<Sparkles size={24} strokeWidth={1.6} />}
          title={t(msg`你的赛博分身还在成形中`)}
          description={t(
            msg`多去世界里互动吧——聊天、发动态、参与讨论，你的分身会越来越像你。`,
          )}
        />
      ) : (
        <>
          {/* 数字镜像舞台：有专属 AI 立绘则展示立绘（SVG 剪影即时占位），
              无图则展示 SVG 剪影（按资料性别男/女，未填=女像）。
              背景柔光用 color-mix(var(--brand-primary)) 随日/夜主题自适配。 */}
          <div className="relative flex h-[320px] items-center justify-center overflow-hidden rounded-[24px] border border-[color:var(--brand-primary)]/12 bg-[radial-gradient(120%_90%_at_50%_12%,color-mix(in_srgb,var(--brand-primary)_16%,transparent),color-mix(in_srgb,var(--brand-primary)_5%,transparent)_55%,transparent)]">
            <CyberAvatarPortrait
              portraitImageUrl={profile.portraitImageUrl}
              gender={gender}
              className="h-[290px]"
            />
          </div>

          {/* 生成/重新生成专属 AI 立绘。首张免费、重新生成按量计费（钱包）。 */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => portraitMutation.mutate()}
              disabled={portraitMutation.isPending}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))] px-5 py-2.5 text-[length:var(--text-body)] font-semibold text-[color:var(--text-on-brand)] transition-opacity active:opacity-90",
                portraitMutation.isPending && "opacity-60",
              )}
            >
              {portraitMutation.isPending ? (
                <>
                  <LoaderCircle size={15} className="animate-spin" />
                  {t(msg`正在生成你的专属立绘…`)}
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  {profile.portraitImageUrl
                    ? t(msg`重新生成立绘`)
                    : t(msg`生成我的专属立绘`)}
                </>
              )}
            </button>
            {portraitMutation.isError &&
            portraitMutation.error instanceof Error ? (
              <InlineNotice
                className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
                tone="danger"
                role="alert"
              >
                {(isApiRequestError(portraitMutation.error)
                  ? translateAppErrorCode(portraitMutation.error)
                  : null) ?? t(msg`立绘生成失败，请稍后再试。`)}
              </InlineNotice>
            ) : profile.portraitImageUrl ? (
              <p className="px-1 text-center text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                {t(msg`首张免费，重新生成将消耗少量钱包余额`)}
              </p>
            ) : null}
          </div>

          {/* 次级入口：按需揭示「结论报告」（叙事化自我画像，底部 sheet 浮层呈现）。
              做成低调描边样式，不与上面的立绘渐变主按钮抢视觉。 */}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border border-[rgba(124,91,217,0.24)] bg-[color:var(--surface-card)] px-5 py-2.5 text-[length:var(--text-body)] font-medium text-[color:var(--brand-primary)] transition-opacity active:opacity-80"
          >
            <Sparkles size={15} />
            {t(msg`了解你自己 · 结论报告`)}
          </button>

          {/* 与分身对话：现在是这页的主交互（不再藏在 tab 后）。 */}
          <CyberAvatarSelfChatThread baseUrl={baseUrl} />

          <CyberAvatarReportSheet
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            profile={profile}
            baseUrl={baseUrl}
          />
        </>
      )}
    </MobileDiscoverToolShell>
  );
}
