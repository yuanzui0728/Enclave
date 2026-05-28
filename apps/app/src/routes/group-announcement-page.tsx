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
import { describeRequestError } from "../lib/request-error";
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
        description={t(msg`正在切换到桌面聊天中的群公告编辑视图。`)}
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

  // 走查移动端群聊 R5：和姊妹路径 chat-background-page R2（c16fa822e）/
  // group-chat-background-page 本会话 R1 / group-chat-details 本会话 R2 同款
  // 修法——setNotice 一串成功/提示文案（"已打开系统分享面板。"/"群公告已复制。"/
  // "当前还没有可分享的群公告。"等）原版没 auto-dismiss，notice 一直挂在
  // ChatDetailsShell 顶部直到用户切 groupId 或离开页才消。
  //
  // tone="success" 走的是 line 418 纯文案分支，无 action 按钮兜底，停留在
  // 屏幕上是干扰；tone="info" + actionLabel/onAction 时（重试分享/复制）用户
  // 可能要点 action，不能秒消。无 actionLabel 的 info（"当前还没有可分享的
  // 群公告。"）只渲染一条返回按钮——返回按钮独立于 notice 状态，notice 消
  // 了不影响用户操作，3.5s 后清理 visual 噪音。和姊妹页 chat-details R3 口径
  // 对齐。
  useEffect(() => {
    if (!notice || (notice.actionLabel && notice.onAction)) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  // 走查 2026-05-22 R1：handleShareAnnouncement 是 async 函数（先 await
  // shareWithNativeShell 弹原生 share sheet、再退路径 await navigator.clipboard
  // .writeText），上方右上角入口 onClick={() => void handleShareAnnouncement()}
  // 完全没 busy 守，慢网或弹原生 sheet 那几百 ms 用户连点 2 次会同时进入两条
  // share/clipboard 路径——iOS Safari 实测会因为重叠请求 share-sheet 直接报
  // NotAllowedError 让两条都失败；Web 端也会触发两条 navigator.clipboard
  // .writeText 同时打 + 两条 setNotice 闪现成功提示。和姊妹 chat-details-page
  // / chat-list-page 同款 ref 同步赋值：第一次 click 翻 true 后同帧后续 click
  // 都被早返，finally 解锁。"重试分享/复制" 的 notice onAction 复用同一把锁。
  const sharingRef = useRef(false);
  async function handleShareAnnouncement() {
    if (sharingRef.current) return;
    sharingRef.current = true;
    try {
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
    } finally {
      sharingRef.current = false;
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGroup(
        groupId,
        { announcement: draft.trim() ? draft.trim() : null },
        baseUrl,
      ),
    onSuccess: () => {
      // 走查 R1：原本 await Promise.all(invalidateQueries) 才 navigate，
      // 公网隧道 RTT ~600ms × 3 条 invalidate 都要等服务端重新返回
      // groups/contact-groups/conversations 才放行导航，用户点完"保存"
      // 看着 spinner 多转 1-2s 才跳回详情页。invalidate 是给其它页面
      // 拉刷用的（详情页自己也是 react-query 监听同 key 会自动重拉），
      // 完全可以 fire-and-forget，导航马上发生。
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
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
      subtitle={groupQuery.data?.name || t(msg`群聊信息`)}
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
        // 走查 2026-05-22 R1：右上角 分享/复制 按钮原版只看 groupQuery.data 是否
        // 加载完，公告还在 "暂未设置" 且用户也没新输入草稿时按钮依然亮着，
        // 用户点了只会收到 "当前还没有可分享的群公告。" 的 notice ——既然
        // onClick 在这种状态下必然变成无操作 notice，干脆在 saved announcement
        // 和 draft 都为空时隐藏入口；用户开始打字（draft 非空）也算可分享，
        // 不会破坏「输入中也能分享草稿」的语义。
        groupQuery.data &&
        (groupQuery.data.announcement?.trim() || draft.trim()) ? (
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
            description={describeRequestError(groupQuery.error)}
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
            // 新会话走查 R2：handleShareAnnouncement 成功/失败的反馈 notice
            // （"已打开系统分享面板"/"群公告已复制"/"系统分享失败，请稍后重试"）
            // 3.5s auto-dismiss，但盲人 SR 完全感知不到分享操作的结果。
            // tone="success" 用 role="status"+polite；tone="info" 包含可重试
            // action 时用 role="alert"+assertive 让用户立刻知道要重试。
            role={notice.tone === "info" ? "alert" : "status"}
            aria-live={notice.tone === "info" ? "assertive" : "polite"}
            tone={notice.tone}
            className="rounded-[16px] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
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
                      className="h-7 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[11px]"
                      onClick={notice.onAction}
                    >
                      {notice.actionLabel}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[11px]"
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
            // 新会话走查 R2：saveMutation 失败时本条 notice 是用户唯一的错误
            // 反馈。盲人 SR 之前点完"保存群公告"听不到任何"保存失败"播报，
            // 以为操作生效转身离开。role="alert"+assertive 立刻播报。和姊妹
            // group-chat-edit-page saveMutation error 同款修法。
            role="alert"
            tone="danger"
            className="rounded-[16px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{describeRequestError(saveMutation.error)}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="rounded-full border border-[rgba(180,130,20,0.08)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
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
                  className="rounded-full border border-[rgba(220,38,38,0.14)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
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
                className="min-h-44 w-full resize-none rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-3 text-[16px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--brand-primary)]/18 focus:bg-[color:var(--surface-card)]"
              />
              {/* 走查 2026-05-22 R1：原版无论有没有现有公告，都常驻一条
                  "留空后保存，会清空当前群公告。"——在 announcement 还是
                  "暂未设置" 的新群里没有任何可被"清空"的内容，这条提示纯属
                  误导（用户会以为我空着提交就能"清空"什么，结果其实保存按钮
                  在 draft==='' 时本来就被 disabled）。只有当真有公告内容时
                  才显示这条提示。 */}
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>
                  {groupQuery.data.announcement?.trim()
                    ? t(msg`留空后保存，会清空当前群公告。`)
                    : null}
                </span>
                <span>{t(msg`${draft.trim().length} 字`)}</span>
              </div>
              <div className="mt-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
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
              className="h-10 w-full rounded-[12px] bg-[color:var(--brand-primary)] text-white hover:opacity-95 disabled:opacity-50"
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
      // 新会话走查 R1：和姊妹 group-chat-details/edit / group-call StatusCard
      // 同款——"群公告暂时不可用" / "群聊不存在" 这两条 danger 路径下卡片
      // 是页面主视觉，盲人 SR 听不到错误原因。role="alert"+assertive 主动播报；
      // tone="loading" 用 role="status"+polite 让"正在读取群公告"被朗读。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
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
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
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
