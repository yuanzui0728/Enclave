import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { getGroup, updateGroup } from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { isDesktopOnlyPath } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupAnnouncementPage() {
  const { groupId } = useParams({ from: "/group/$groupId/announcement" });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        detailsAction="announcement"
        title="正在打开桌面群公告"
        description="正在切换到桌面聊天工作区中的群公告编辑视图。"
        loadingLabel="打开桌面群公告..."
      />
    );
  }

  return <MobileGroupAnnouncementPage groupId={groupId} />;
}

function MobileGroupAnnouncementPage({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const routeState = parseMobileGroupRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(groupQuery.data?.announcement ?? "");
  }, [groupQuery.data?.announcement]);

  useEffect(() => {
    setNotice(null);
  }, [groupId]);

  useEffect(() => {
    if (
      groupQuery.isLoading ||
      !isMissingGroupError(groupQuery.error, groupId)
    ) {
      return;
    }

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
  ]);

  const navigateToRouteStateReturn = () => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  };

  const handleErrorStateAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  };

  const handleMissingGroupAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/chat" });
  };

  const handleRetryLoad = () => {
    void groupQuery.refetch();
  };

  const handleRetrySave = () => {
    setNotice(null);
    saveMutation.mutate();
  };

  async function handleShareAnnouncement() {
    const group = groupQuery.data;
    const announcement = draft.trim() || group?.announcement?.trim() || "";
    if (!group || !announcement) {
      setNotice({
        tone: "info",
        message: "当前还没有可分享的群公告。",
      });
      return;
    }

    const groupPath = `/group/${groupId}/announcement`;
    const groupUrl =
      typeof window === "undefined"
        ? groupPath
        : `${window.location.origin}${groupPath}`;
    const summary = [`${group.name} 群公告`, announcement, groupUrl].join(
      "\n\n",
    );

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${group.name} 群公告`,
        text: summary,
        url: groupUrl,
      });

      if (shared) {
        setNotice({
          tone: "success",
          message: "已打开系统分享面板。",
        });
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制群公告。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制群公告。"
          : "群公告已复制。",
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制群公告失败，请稍后重试。",
        actionLabel: nativeMobileShareSupported ? "重试分享" : "重试复制",
        onAction: () => {
          void handleShareAnnouncement();
        },
      });
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGroup(
        groupId,
        { announcement: draft.trim() ? draft.trim() : null },
        baseUrl,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
        ...(currentRouteHash ? { hash: currentRouteHash } : {}),
        replace: true,
      });
    },
  });

  return (
    <ChatDetailsShell
      title="群公告"
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={() => {
        void navigate({
          to: "/group/$groupId/details",
          params: { groupId },
          ...(currentRouteHash ? { hash: currentRouteHash } : {}),
        });
      }}
      rightActions={
        groupQuery.data ? (
          <Button
            type="button"
            onClick={() => void handleShareAnnouncement()}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-[color:var(--surface-card-hover)]"
            aria-label={
              nativeMobileShareSupported ? "分享群公告" : "复制群公告"
            }
          >
            {nativeMobileShareSupported ? (
              <Share2 size={18} />
            ) : (
              <Copy size={18} />
            )}
          </Button>
        ) : undefined
      }
    >
      {groupQuery.isLoading ? (
        <div className="px-4">
          <MobileAnnouncementStatusCard
            badge="读取中"
            title="正在读取群公告"
            description="稍等一下，正在同步当前群聊的公告内容。"
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-4">
          <MobileAnnouncementStatusCard
            badge="群聊"
            title="群公告暂时不可用"
            description={groupQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRetryLoad}
                  className="rounded-full"
                >
                  重试读取
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleErrorStateAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? "返回上一页" : "返回群聊信息"}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}
      {notice ? (
        <div className="px-4">
          <InlineNotice
            tone={notice.tone}
            className="rounded-[14px] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
          >
            {notice.tone === "info" ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{notice.message}</span>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {notice.actionLabel && notice.onAction ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
                      onClick={notice.onAction}
                    >
                      {notice.actionLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
                    onClick={handleErrorStateAction}
                  >
                    {safeReturnPath ? "返回上一页" : "返回群聊信息"}
                  </Button>
                </div>
              </div>
            ) : (
              notice.message
            )}
          </InlineNotice>
        </div>
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <div className="px-4">
          <InlineNotice
            tone="danger"
            className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{saveMutation.error.message}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  重试保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void navigate({
                      to: "/group/$groupId/details",
                      params: { groupId },
                      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
                    });
                  }}
                  className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                >
                  返回群聊信息
                </button>
              </div>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-4">
          <MobileAnnouncementStatusCard
            badge="群聊"
            title="群聊不存在"
            description="这个群聊暂时不可用，可以先重试读取，或返回上一页后再试。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRetryLoad}
                  className="rounded-full"
                >
                  重试读取
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleMissingGroupAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? "返回上一页" : "返回消息列表"}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title="群公告">
            <div className="px-4 py-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="写一条群公告，群成员会在聊天页看到它。"
                rows={8}
                className="min-h-44 w-full resize-none rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-3 text-[15px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>留空后保存，会清空当前群公告。</span>
                <span>{draft.trim().length} 字</span>
              </div>
              <div className="mt-3 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                当前公告：{groupQuery.data.announcement?.trim() || "暂未设置"}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="h-10 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              {saveMutation.isPending ? "正在保存..." : "保存群公告"}
            </Button>
          </div>
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function MobileAnnouncementStatusCard({
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
