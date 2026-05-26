import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  getGroup,
  getGroupMembers,
  updateGroup,
  updateGroupOwnerProfile,
} from "@yinjie/contracts";
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
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

type GroupChatEditMode = "name" | "nickname";

export function GroupChatNameEditPage() {
  const { groupId } = useParams({ from: "/group/$groupId/edit/name" });
  return <GroupChatEditPage groupId={groupId} mode="name" />;
}

export function GroupChatNicknameEditPage() {
  const { groupId } = useParams({ from: "/group/$groupId/edit/nickname" });
  return <GroupChatEditPage groupId={groupId} mode="nickname" />;
}

function GroupChatEditPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupChatEditMode;
}) {
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        detailsAction={mode === "name" ? "group-name" : "group-nickname"}
        title={mode === "name" ? t(msg`正在打开桌面群聊名称`) : t(msg`正在打开桌面群昵称`)}
        description={
          mode === "name"
            ? t(msg`正在切换到桌面聊天中的群聊名称编辑视图。`)
            : t(msg`正在切换到桌面聊天中的群昵称编辑视图。`)
        }
        loadingLabel={
          mode === "name" ? t(msg`打开桌面群聊名称...`) : t(msg`打开桌面群昵称...`)
        }
      />
    );
  }

  return <MobileGroupChatEditPage groupId={groupId} mode={mode} />;
}

function MobileGroupChatEditPage({
  groupId,
  mode,
}: {
  groupId: string;
  mode: GroupChatEditMode;
}) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
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

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
    enabled: mode === "nickname",
  });

  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );

  const initialValue =
    mode === "name"
      ? (groupQuery.data?.name ?? "")
      : (ownerMember?.memberName?.trim() ?? "");
  const [draft, setDraft] = useState("");
  // 用户在输入框打字时，groupQuery / membersQuery 的异步到达不能把 draft 直接
  // 覆盖回服务端值——慢网下用户可能已经输入半截，被这条 useEffect 吞掉只
  // 剩服务端的旧名字 / 旧昵称。改成"只在第一次拿到加载完成的源数据时同步
  // 一次"，之后用户控制 draft。
  const draftInitializedRef = useRef(false);

  // 走查 Round 2：name/nickname 模式切换、或在两个群 edit 页之间切（routeparam
  // 改但组件不重挂），draftInitializedRef 仍为 true → 下方 seed-effect 直接
  // return，输入框继续显示上一个上下文的值。与 group-chat-background-page
  // 已实施的方案对齐，强制重置 ref + draft，等下一轮源数据到达再 seed。
  useEffect(() => {
    draftInitializedRef.current = false;
    setDraft("");
  }, [baseUrl, groupId, mode]);

  useEffect(() => {
    if (draftInitializedRef.current) {
      return;
    }
    if (mode === "name" ? groupQuery.isLoading : membersQuery.isLoading) {
      return;
    }
    draftInitializedRef.current = true;
    setDraft(initialValue);
  }, [groupQuery.isLoading, initialValue, membersQuery.isLoading, mode]);

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

  const saveGroupNameMutation = useMutation({
    mutationFn: (name: string) => updateGroup(groupId, { name }, baseUrl),
    onSuccess: () => {
      // 走查 R1：原本 await Promise.all(invalidateQueries) 才 navigate，
      // 公网隧道 RTT ~600ms × 3 条 invalidate 排队等响应，用户点完保存
      // 看着 spinner 多转 1-2s 才跳回详情页。invalidate 是给其它页面拉刷
      // 用的（详情页也是 react-query 监听同 key 会自动重拉），fire-and-forget
      // 让导航立刻发生即可。
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

  const saveNicknameMutation = useMutation({
    mutationFn: (nickname: string) =>
      updateGroupOwnerProfile(groupId, { nickname }, baseUrl),
    onSuccess: () => {
      // 同上：fire-and-forget 不卡 navigate。
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
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

  const saveMutation =
    mode === "name" ? saveGroupNameMutation : saveNicknameMutation;
  const trimmedDraft = draft.trim();
  const submitDisabled =
    saveMutation.isPending ||
    !trimmedDraft ||
    trimmedDraft === initialValue.trim();
  // 同步防双击锁——下面「保存」按钮原本只靠 disabled=submitDisabled 兜底，
  // 但 disabled 要等 React commit 才生效，同帧内连点 2 次会同时通过两次
  // isPending=false → 两个 PATCH /groups/$id 同时飞出去（公网隧道 ~600ms RTT
  // 下并不罕见）。和 mobile-moments-publish-page Round 6 同款修法：ref 同步
  // 赋值挡掉同帧后续 click，onSettled 解锁。
  const submittingRef = useRef(false);
  const handleSave = () => {
    if (submittingRef.current) return;
    if (submitDisabled) return;
    submittingRef.current = true;
    saveMutation.mutate(trimmedDraft, {
      onSettled: () => {
        submittingRef.current = false;
      },
    });
  };

  function openGroupDetails() {
    void navigate({
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  }

  function handleMissingGroupBack() {
    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
      });
      return;
    }

    void navigate({ to: "/tabs/chat" });
  }

  function handleRetryLoad() {
    // mode === "name" 路径下 membersQuery 是 enabled:false（line 106-107），
    // 但 React Query 的 refetch() 会绕过 enabled 直接触发 fetch —— 用户在
    // 「群聊不存在」status card 上点「重试读取」时，name mode 也会白白多打
    // 一次 GET /api/groups/$id/members，公网隧道 ~600ms RTT 的浪费 + 后端
    // 请求噪音。按 mode 收口：只在 nickname mode 才捎带 members refetch。
    //
    // 走查 R67：原版 `const refetches = [groupQuery.refetch()]`，TS 推导成
    // Promise<QueryObserverResult<Group, Error>>[]，push members refetch
    // (Promise<QueryObserverResult<GroupMember[], Error>>) 时 TS 报 TS2345。
    // 类型不一致让 pnpm tsc 直接抛错，CI build 卡这条。Promise.all 只用来
    // 并发起飞、不消费 result，泛用 Promise<unknown> 数组即可。
    const refetches: Promise<unknown>[] = [groupQuery.refetch()];
    if (mode === "nickname") {
      refetches.push(membersQuery.refetch());
    }
    void Promise.all(refetches);
  }

  function handleRetrySave() {
    if (!trimmedDraft) {
      return;
    }
    handleSave();
  }

  return (
    <ChatDetailsShell
      title={mode === "name" ? t(msg`群聊名称`) : t(msg`我在本群的昵称`)}
      subtitle={groupQuery.data?.name || t(msg`群聊信息`)}
      onBack={() => {
        // 走查 R1：openGroupDetails 直接 navigate({to: details}) push 一条新
        // history 项，用户 [details → edit → 点返回] 后浏览器后退会落回 edit
        // 死循环。和 group-chat-background-page 同口径用 navigateBackOrFallback：
        // 能 history.back() 就 back，deep link / 跨域跳入兜不住时才 fresh navigate。
        navigateBackOrFallback(openGroupDetails, `/group/${groupId}/details`);
      }}
    >
      {groupQuery.isLoading ||
      (mode === "nickname" && membersQuery.isLoading) ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在读取群聊信息`)}
            description={t(msg`稍等一下，正在同步群聊资料和当前昵称。`)}
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`群聊信息暂时不可用`)}
            description={describeRequestError(groupQuery.error)}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => {
                    void groupQuery.refetch();
                  }}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  {t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
            tone="danger"
          />
        </div>
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`群成员信息暂时不可用`)}
            description={describeRequestError(membersQuery.error)}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => {
                    void membersQuery.refetch();
                  }}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  {t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
            tone="danger"
          />
        </div>
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <div className="px-4">
          <InlineNotice
            // 新会话走查 R2：saveGroupName / saveNickname mutation 失败时本条
            // notice 是用户唯一的错误反馈。盲人 SR 之前点完"保存"按钮听不到
            // 任何"保存失败"播报，以为操作生效转身离开。role="alert" +
            // aria-live="assertive" 立刻播报 error.message。和姊妹 create-group-page
            // createMutation error R(新一轮 R1) 同款修法。
            role="alert"
            tone="danger"
            className="rounded-[12px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{describeRequestError(saveMutation.error)}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleRetrySave}
                  className="rounded-full border border-[rgba(180, 130, 20, 0.08)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {t(msg`重试保存`)}
                </button>
                <button
                  type="button"
                  onClick={openGroupDetails}
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
          <MobileGroupEditStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群聊不存在`)}
            description={t(msg`这个群聊暂时不可用，可以先重试读取，或返回上一页后再试。`)}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleMissingGroupBack}
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回消息列表`)}
                </Button>
              </div>
            }
          />
        </div>
      ) : null}

      {/* 走查 Round 2：nickname 模式下 groupQuery.data 先到、membersQuery 还在
          loading 时，原版 {groupQuery.data ? <input /> : null} 会先把输入框露
          出来。draftInit effect 此时仍 early-return（membersQuery.isLoading=
          true），用户能打字 → 等 membersQuery 加载完成 effect 才触发
          setDraft(initialValue) 把用户输入覆盖回服务端值。把表单门槛拉到"该
          模式所需的全部 query 都 ready"，和 draftInit 守门口径一致。 */}
      {groupQuery.data && (mode === "name" || !membersQuery.isLoading) ? (
        <>
          <ChatDetailsSection
            title={mode === "name" ? t(msg`新的群聊名称`) : t(msg`新的群昵称`)}
            variant="wechat"
          >
            <div className="px-4 py-4">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  mode === "name" ? t(msg`请输入群聊名称`) : t(msg`请输入我在本群的昵称`)
                }
                // 走查 R5：和姊妹页 R1-R4 同款 a11y 修法——上方 ChatDetailsSection
                // 标题"新的群聊名称 / 新的群昵称"在视觉上是标签但没 htmlFor /
                // aria-labelledby 关联，屏幕阅读器 focus 进来只能读 placeholder，
                // 用户打字后多数 SR 就不再朗读。挂 aria-label 与 mode 标题一致。
                aria-label={
                  mode === "name" ? t(msg`群聊名称`) : t(msg`我在本群的昵称`)
                }
                // 走查 R5：原版只能点"保存"按钮提交；这里只是个单行输入框，
                // 用户在键盘上按 Enter（包括 iOS / Android 软键盘的 Return /
                // "完成"）是直觉行为。和姊妹页 group-announcement / chat-list
                // 已有的 enterKeyHint=done 口径对齐——Enter 直接触发 handleSave，
                // 不破 disabled 兜底（handleSave 里有 submitDisabled / 双击锁
                // 守护）。enterKeyHint=done 让软键盘 Return 键长得像"完成"。
                // 走查移动端群聊 R1：原版 Enter 提交没拦 IME composing，CJK
                // 用户用拼音/五笔/Wubi 在候选词列表里按 Enter 确认候选词时，
                // 我们 preventDefault + handleSave 会把"确认候选词"误吞成
                // "提交群名/昵称"——输入半截就被保存了，剩下的拼音串当成被
                // 取消的候选词丢失。和姊妹路径 profile-info-name-page R(...)、
                // checkout-contact-dialog R5 同款修法：`event.nativeEvent.isComposing`
                // 或 keyCode===229 任一为真都视为 IME 进行中，跳过提交让 IME
                // 自己接管 Enter。
                enterKeyHint="done"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) {
                    return;
                  }
                  if (
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  ) {
                    return;
                  }
                  event.preventDefault();
                  handleSave();
                }}
                className="h-11 w-full rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(245, 158, 11,0.18)] focus:bg-[color:var(--surface-card)]"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
                <span>
                  {mode === "name"
                    ? t(msg`会同步显示在聊天顶部和消息列表。`)
                    : t(msg`只在当前群聊里显示。`)}
                </span>
                <span>{t(msg`${trimmedDraft.length} 字`)}</span>
              </div>
              <div className="mt-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                {t(msg`当前内容：${initialValue.trim() || t(msg`暂未设置`)}`)}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={submitDisabled}
              onClick={handleSave}
              className="h-10 w-full rounded-[12px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              {saveMutation.isPending ? t(msg`正在保存...`) : t(msg`保存`)}
            </Button>
          </div>
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function MobileGroupEditStatusCard({
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
      // 新会话走查 R1：和姊妹 group-chat-details / group-call MobileCallStatusCard
      // 同款——load 失败 / 群不存在时该卡是页面主视觉，盲人 SR 进入"群聊信息
      // 暂时不可用"页面只能听到静默。role="alert" + aria-live="assertive" 主动
      // 朗读 badge+title+description；loading 用 polite 兜底"正在读取群聊信息"。
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
            : "bg-[rgba(245, 158, 11,0.1)] text-[#f59e0b]",
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
