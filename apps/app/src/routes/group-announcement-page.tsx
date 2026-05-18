import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { Copy, Share2 } from "lucide-react";
import { getGroup, updateGroup } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { buildPublicShareUrl } from "../lib/share-url";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupAnnouncementPage() {
  const t = useRuntimeTranslator();
  const { groupId } = useParams({ from: "/group/$groupId/announcement" });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        detailsAction="announcement"
        title={t(msg`正在打开桌面群公告`)}
        description={t(msg`正在切换到桌面聊天工作区中的群公告编辑视图。`)}
        loadingLabel={t(msg`打开桌面群公告...`)}
      />
    );
  }

  return <MobileGroupAnnouncementPage groupId={groupId} />;
}

function MobileGroupAnnouncementPage({ groupId }: { groupId: string }) {
  const t = useRuntimeTranslator();
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
  // 公告 textarea 字数往往比群名长，慢网下用户更可能在 groupQuery 落地前
  // 就已经开始打字 + socket conversationUpdated 还会触发 group refetch
  // → 上一版每次 announcement 改变都 setDraft 覆盖，正在编辑的内容被吞。
  // 只在首次拿到 group 数据时同步一次，之后用户控制 draft。
  const draftInitializedRef = useRef(false);

  useEffect(() => {
    if (draftInitializedRef.current) {
      return;
    }
    if (groupQuery.isLoading) {
      return;
    }
    draftInitializedRef.current = true;
    setDraft(groupQuery.data?.announcement ?? "");
  }, [groupQuery.data?.announcement, groupQuery.isLoading]);

  // 走查 Round 2：tanstack-router 在 /group/A/announcement → /group/B/announcement
  // 这种只换 param 的跳转下不重挂载组件，draftInitializedRef.current 仍为
  // true，下方 seed-effect 会 early-return，textarea 一直显示上一群 A 的公
  // 告。和 group-chat-background-page 已经做过的处理对齐，把 ref/draft 都
  // 重置一遍，等下一次 group/B 数据到达再 seed。
  useEffect(() => {
    setNotice(null);
    draftInitializedRef.current = false;
    setDraft("");
  }, [baseUrl, groupId]);

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

  // 同步防双击锁——下面「保存群公告」按钮原本只靠 disabled=isPending 兜底，
  // 但 disabled 要等 React commit 才生效，同帧内连点 2 次会同时通过两次
  // isPending=false → 两个 PATCH /groups/$id 同时飞出去；服务端虽然幂等
  // 但白白多打一份请求 + 一份 invalidate，公网隧道 RTT 600ms 下尤其浪费。
  // ref 同步赋值挡掉同帧后续 click，onSettled 解锁。
  const submittingRef = useRef(false);
  const triggerSave = () => {
    if (submittingRef.current) return;
    if (saveMutation.isPending) return;
    submittingRef.current = true;
    saveMutation.mutate(undefined, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  };

  const handleRetrySave = () => {
    setNotice(null);
    triggerSave();
  };

  async function handleShareAnnouncement() {
    const group = groupQuery.data;
    const announcement = draft.trim() || group?.announcement?.trim() || "";
    if (!group || !announcement) {
      setNotice({
        tone: "info",
        message: t(msg`当前还没有可分享的群公告。`),
      });
      return;
    }

    const groupPath = `/group/${groupId}/announcement`;
    const groupUrl = buildPublicShareUrl(groupPath);
    const announcementTitle = t(msg`${group.name} 群公告`);
    const summary = [announcementTitle, announcement, groupUrl].join("\n\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: announcementTitle,
        text: summary,
        url: groupUrl,
      });

      if (shared) {
        setNotice({
          tone: "success",
          message: t(msg`已打开系统分享面板。`),
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
          ? t(msg`当前设备暂时无法打开系统分享，请稍后重试。`)
          : t(msg`当前环境暂不支持复制群公告。`),
        actionLabel: nativeMobileShareSupported
          ? t(msg`重试分享`)
          : t(msg`重试复制`),
        onAction: () => {
          void handleShareAnnouncement();
        },
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? t(msg`系统分享暂时不可用，已复制群公告。`)
          : t(msg`群公告已复制。`),
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? t(msg`系统分享失败，请稍后重试。`)
          : t(msg`复制群公告失败，请稍后重试。`),
        actionLabel: nativeMobileShareSupported
          ? t(msg`重试分享`)
          : t(msg`重试复制`),
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
      title={t(msg`群公告`)}
      subtitle={groupQuery.data?.name ?? t(msg`群聊信息`)}
      onBack={() => {
        // 走查 R1：原版直接 navigate({to: details}) 会 push 一条新 history 项，
        // 用户 [details → announcement → 点返回] 后 history 变成
        // [details, announcement, details]，再按浏览器后退又落回 announcement
        // 死循环。和 group-chat-background-page 已实施的方案对齐，用
        // navigateBackOrFallback：能 history.back() 就 back，安全兜不住时
        // (deep link / 跨域跳入) 才 fresh navigate。
        navigateBackOrFallback(
          () => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
              ...(currentRouteHash ? { hash: currentRouteHash } : {}),
            });
          },
          `/group/${groupId}/details`,
        );
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
              nativeMobileShareSupported
                ? t(msg`分享群公告`)
                : t(msg`复制群公告`)
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
            badge={t(msg`读取中`)}
            title={t(msg`正在读取群公告`)}
            description={t(msg`稍等一下，正在同步当前群聊的公告内容。`)}
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-4">
          <MobileAnnouncementStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群公告暂时不可用`)}
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
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleErrorStateAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
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
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
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
                  {t(msg`重试保存`)}
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
                  {t(msg`返回群聊信息`)}
                </button>
              </div>
            </div>
          </InlineNotice>
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-4">
          <MobileAnnouncementStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群聊不存在`)}
            description={t(msg`这个群聊暂时不可用，可以先重试读取，或返回上一页后再试。`)}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleRetryLoad}
                  className="rounded-full"
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleMissingGroupAction}
                  className="rounded-full"
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回消息列表`)}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title={t(msg`群公告`)}>
            <div className="px-4 py-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t(msg`写一条群公告，群成员会在聊天页看到它。`)}
                rows={8}
                // 走查 R4：和姊妹页 R1-R3 同款 a11y 修法——textarea 上方 section
                // 标题"群公告"虽然渲染在视觉上方，但和这个 textarea 之间没有
                // htmlFor / aria-labelledby 关联，屏幕阅读器 focus 进来只有
                // placeholder 可读，多数 SR 实现开始打字后就不再朗读。挂
                // aria-label="群公告" 明确表达意图，跟父 ChatDetailsSection
                // 的标题一致。
                aria-label={t(msg`群公告`)}
                // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
                className="min-h-44 w-full resize-none rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-3 text-[16px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>{t(msg`留空后保存，会清空当前群公告。`)}</span>
                <span>{t(msg`${draft.trim().length} 字`)}</span>
              </div>
              <div className="mt-3 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {t(
                  msg`当前公告：${groupQuery.data.announcement?.trim() || t(msg`暂未设置`)}`,
                )}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={
                saveMutation.isPending ||
                draft.trim() ===
                  (groupQuery.data.announcement?.trim() ?? "")
              }
              onClick={triggerSave}
              className="h-10 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95 disabled:opacity-50"
            >
              {saveMutation.isPending ? t(msg`正在保存...`) : t(msg`保存群公告`)}
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
