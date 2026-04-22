import { useEffect, useMemo, useState, type ReactNode } from "react";
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
import { isDesktopOnlyPath } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

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
        title={mode === "name" ? "正在打开桌面群聊名称" : "正在打开桌面群昵称"}
        description={
          mode === "name"
            ? "正在切换到桌面聊天工作区中的群聊名称编辑视图。"
            : "正在切换到桌面聊天工作区中的群昵称编辑视图。"
        }
        loadingLabel={
          mode === "name" ? "打开桌面群聊名称..." : "打开桌面群昵称..."
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

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

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

  const saveNicknameMutation = useMutation({
    mutationFn: (nickname: string) =>
      updateGroupOwnerProfile(groupId, { nickname }, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
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

  const saveMutation =
    mode === "name" ? saveGroupNameMutation : saveNicknameMutation;
  const trimmedDraft = draft.trim();
  const submitDisabled =
    saveMutation.isPending ||
    !trimmedDraft ||
    trimmedDraft === initialValue.trim();

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
    void Promise.all([groupQuery.refetch(), membersQuery.refetch()]);
  }

  function handleRetrySave() {
    if (!trimmedDraft) {
      return;
    }

    saveMutation.mutate(trimmedDraft);
  }

  return (
    <ChatDetailsShell
      title={mode === "name" ? "群聊名称" : "我在本群的昵称"}
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={openGroupDetails}
    >
      {groupQuery.isLoading ||
      (mode === "nickname" && membersQuery.isLoading) ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge="读取中"
            title="正在读取群聊信息"
            description="稍等一下，正在同步群聊资料和当前昵称。"
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge="读取失败"
            title="群聊信息暂时不可用"
            description={groupQuery.error.message}
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
                  重试读取
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
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
            badge="读取失败"
            title="群成员信息暂时不可用"
            description={membersQuery.error.message}
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
                  重试读取
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={openGroupDetails}
                >
                  返回群聊信息
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
            tone="danger"
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
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
                  onClick={openGroupDetails}
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
          <MobileGroupEditStatusCard
            badge="群聊"
            title="群聊不存在"
            description="这个群聊暂时不可用，可以先重试读取，或返回上一页后再试。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleRetryLoad}
                >
                  重试读取
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={handleMissingGroupBack}
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
          <ChatDetailsSection
            title={mode === "name" ? "新的群聊名称" : "新的群昵称"}
            variant="wechat"
          >
            <div className="px-4 py-4">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  mode === "name" ? "请输入群聊名称" : "请输入我在本群的昵称"
                }
                className="h-11 w-full rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
                <span>
                  {mode === "name"
                    ? "会同步显示在聊天顶部和消息列表。"
                    : "只在当前群聊里显示。"}
                </span>
                <span>{trimmedDraft.length} 字</span>
              </div>
              <div className="mt-3 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                当前内容：{initialValue.trim() || "暂未设置"}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={submitDisabled}
              onClick={() => {
                if (mode === "name") {
                  saveGroupNameMutation.mutate(trimmedDraft);
                  return;
                }

                saveNicknameMutation.mutate(trimmedDraft);
              }}
              className="h-10 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              {saveMutation.isPending ? "正在保存..." : "保存"}
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
