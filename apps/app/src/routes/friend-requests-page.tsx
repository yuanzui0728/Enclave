import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, BookUser } from "lucide-react";
import {
  acceptFriendRequest,
  declineFriendRequest,
  getFriendRequests,
} from "@yinjie/contracts";
import { getActiveLocale, useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";

type Translator = ReturnType<typeof useRuntimeTranslator>;
import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildMobileFriendRequestsRouteHash,
  parseMobileFriendRequestsRouteState,
} from "../features/contacts/mobile-friend-requests-route-state";
import { buildWorldCharactersRouteHash } from "../features/contacts/world-characters-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function FriendRequestsPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在切换到桌面新的朋友`)}
            description={t(msg`正在跳转到桌面通讯录工作区中的好友请求视图。`)}
            loadingLabel={t(msg`切换桌面好友请求...`)}
          />
        }
      >
        <DesktopContactsRouteRedirectShell pane="new-friends" />
      </Suspense>
    );
  }

  return <MobileFriendRequestsPage />;
}

function MobileFriendRequestsPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [successNotice, setSuccessNotice] = useState("");
  const routeState = parseMobileFriendRequestsRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = buildMobileFriendRequestsRouteHash({
    returnPath: safeReturnPath,
    returnHash: safeReturnHash,
  });

  const requestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });

  const acceptMutation = useMutation({
    mutationFn: (requestId: string) => acceptFriendRequest(requestId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice(t(msg`已通过好友申请。`));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends-quick-start", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-friends", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const declineMutation = useMutation({
    mutationFn: (requestId: string) => declineFriendRequest(requestId, baseUrl),
    onSuccess: async () => {
      setSuccessNotice(t(msg`好友请求已处理。`));
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });

  useEffect(() => {
    setSuccessNotice("");
  }, [baseUrl]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2400);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function openWorldCharacters() {
    void navigate({
      to: "/contacts/world-characters",
      hash: buildWorldCharactersRouteHash({
        keyword: "",
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    openWorldCharacters();
  }

  function handleRetryRequests() {
    void requestsQuery.refetch();
  }

  function handleRetryAccept() {
    if (!acceptMutation.variables) {
      return;
    }

    setSuccessNotice("");
    acceptMutation.mutate(acceptMutation.variables);
  }

  function handleRetryDecline() {
    if (!declineMutation.variables) {
      return;
    }

    setSuccessNotice("");
    declineMutation.mutate(declineMutation.variables);
  }

  return (
    <AppPage className="space-y-0 bg-[#f5f5f5] px-0 py-0">
      <TabPageTopBar
        title={t(msg`新的朋友`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() =>
              navigateBackOrFallback(() => {
                if (navigateToRouteStateReturn()) {
                  return;
                }

                void navigate({ to: "/tabs/contacts" });
              })
            }
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            onClick={openWorldCharacters}
            aria-label={t(msg`浏览世界角色`)}
          >
            <BookUser size={17} />
          </Button>
        }
      />

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {requestsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileFriendRequestsStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取好友请求`)}
              description={t(msg`稍等一下，正在同步新的好友申请。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {requestsQuery.isError && requestsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileFriendRequestsStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`新的朋友暂时不可用`)}
              description={requestsQuery.error.message}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleRetryRequests}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath
                      ? t(msg`返回上一页`)
                      : t(msg`浏览世界角色`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}
        {successNotice ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="success"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              {successNotice}
            </InlineNotice>
          </div>
        ) : null}

        {(requestsQuery.data ?? []).length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {(requestsQuery.data ?? []).map((request, index) => (
              <div
                key={request.id}
                className={cn(
                  "px-4 py-3",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <div className="flex items-start gap-3">
                  <AvatarChip
                    name={request.characterName}
                    src={request.characterAvatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] text-[color:var(--text-primary)]">
                          {request.characterName}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                          {getFriendRequestSourceLabel(t, request.triggerScene)}
                        </div>
                      </div>
                      <div className="shrink-0 text-[10px] text-[color:var(--text-dim)]">
                        {formatFriendRequestDate(t, request.createdAt)}
                      </div>
                    </div>

                    <div className="mt-2 rounded-[12px] bg-[color:var(--surface-card-hover)] px-3 py-2 text-[13px] leading-5 text-[color:var(--text-secondary)]">
                      {request.greeting || t(msg`想认识你。`)}
                    </div>

                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      <Button
                        disabled={
                          acceptMutation.isPending || declineMutation.isPending
                        }
                        onClick={() => declineMutation.mutate(request.id)}
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-[10px] border-[color:var(--border-faint)] bg-white px-3 text-[12px] shadow-none hover:bg-[#f5f7f7]"
                      >
                        {declineMutation.isPending &&
                        declineMutation.variables === request.id
                          ? t(msg`处理中...`)
                          : t(msg`拒绝`)}
                      </Button>
                      <Button
                        disabled={
                          acceptMutation.isPending || declineMutation.isPending
                        }
                        onClick={() => acceptMutation.mutate(request.id)}
                        variant="primary"
                        size="sm"
                        className="h-8 rounded-[10px] bg-[#07c160] px-3 text-[12px] text-white shadow-none hover:bg-[#06ad56]"
                      >
                        {acceptMutation.isPending &&
                        acceptMutation.variables === request.id
                          ? t(msg`接受中...`)
                          : t(msg`接受`)}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {acceptMutation.isError && acceptMutation.error instanceof Error ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {acceptMutation.error.message}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {acceptMutation.variables ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                      onClick={handleRetryAccept}
                    >
                      {t(msg`重试通过`)}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath
                      ? t(msg`返回上一页`)
                      : t(msg`浏览世界角色`)}
                  </Button>
                </div>
              </div>
            </InlineNotice>
          </div>
        ) : null}
        {declineMutation.isError && declineMutation.error instanceof Error ? (
          <div className="px-3 pt-2">
            <InlineNotice
              tone="danger"
              className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {declineMutation.error.message}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  {declineMutation.variables ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                      onClick={handleRetryDecline}
                    >
                      {t(msg`重试拒绝`)}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath
                      ? t(msg`返回上一页`)
                      : t(msg`浏览世界角色`)}
                  </Button>
                </div>
              </div>
            </InlineNotice>
          </div>
        ) : null}

        {!requestsQuery.isLoading &&
        !requestsQuery.isError &&
        !requestsQuery.data?.length ? (
          <div className="px-4 pt-4">
            <MobileFriendRequestsStatusCard
              badge={t(msg`新的朋友`)}
              title={t(msg`暂时没有新的好友请求`)}
              description={t(msg`去发现页摇一摇，或等待场景触发新的相遇。`)}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3.5 text-[11px]"
                  onClick={handleStatusBack}
                >
                  {safeReturnPath
                    ? t(msg`返回上一页`)
                    : t(msg`浏览世界角色`)}
                </Button>
              }
            />
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function getFriendRequestSourceLabel(t: Translator, triggerScene?: string) {
  if (!triggerScene) {
    return t(msg`新的朋友`);
  }

  if (triggerScene === "shake") {
    return t(msg`来自摇一摇`);
  }

  const localizedScene = getSceneLabelById(t, triggerScene);
  return t(msg`来自${localizedScene}`);
}

function getSceneLabelById(t: Translator, sceneId: string): string {
  switch (sceneId) {
    case "coffee_shop":
      return t(msg`咖啡馆`);
    case "gym":
      return t(msg`健身房`);
    case "library":
      return t(msg`图书馆`);
    case "park":
      return t(msg`公园`);
    case "classroom":
      return t(msg`教室`);
    case "lab":
      return t(msg`实验室`);
    case "office":
      return t(msg`办公室`);
    case "coworking":
      return t(msg`联合办公空间`);
    case "study_room":
      return t(msg`自习室`);
    case "restaurant":
      return t(msg`餐厅`);
    case "museum":
      return t(msg`博物馆`);
    case "bookstore":
      return t(msg`书店`);
    case "travel":
      return t(msg`旅途`);
    case "night_walk":
      return t(msg`夜晚的街道`);
    case "theater":
      return t(msg`剧场`);
    case "home":
      return t(msg`居家场景`);
    default:
      return sceneId; // i18n-ignore-line: unknown scene id passthrough
  }
}

function formatFriendRequestDate(t: Translator, createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDay = sameMonth && date.getDate() === now.getDate();

  if (sameDay) {
    return t(msg`今天`);
  }

  const formatter = new Intl.DateTimeFormat(getActiveLocale(), {
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date).replace(/\//g, "-");
}

function MobileFriendRequestsStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
