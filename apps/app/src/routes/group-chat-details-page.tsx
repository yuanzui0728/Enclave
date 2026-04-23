import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import {
  clearGroupMessages,
  getGroup,
  getGroupMembers,
  hideGroup,
  leaveGroup,
  setGroupPinned,
  updateGroupPreferences,
} from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { InlineNoticeActionButton } from "../components/inline-notice-action-button";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useDefaultChatBackground } from "../features/chat/backgrounds/use-conversation-background";
import { ChatCallFallbackSection } from "../features/chat-details/chat-call-fallback-section";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { DesktopChatRouteRedirectShell } from "../features/chat/chat-route-redirect-shell";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildGroupInviteReturnSearch } from "../lib/group-invite-delivery";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { isDesktopOnlyPath } from "../lib/history-back";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        title="正在打开桌面群聊信息"
        description="正在切换到桌面聊天工作区中的群聊信息侧栏。"
        loadingLabel="打开桌面群聊信息..."
      />
    );
  }

  return <MobileGroupChatDetailsPage groupId={groupId} />;
}

function MobileGroupChatDetailsPage({ groupId }: { groupId: string }) {
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const routeState = useMemo(() => parseMobileGroupRouteState(hash), [hash]);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const [notice, setNotice] = useState<{
    message: string;
    showBackAction?: boolean;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const [memberGridExpanded, setMemberGridExpanded] = useState(false);
  const [managementSheetOpen, setManagementSheetOpen] = useState(false);
  const [dangerSheetAction, setDangerSheetAction] = useState<
    "hide" | "clear" | "leave" | null
  >(null);
  const ownerQuery = useDefaultChatBackground();
  const groupRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }) || undefined,
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });

  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });

  const navigateToRouteStateReturn = ({
    replace = false,
  }: {
    replace?: boolean;
  } = {}) => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
      replace,
    });
    return true;
  };
  const statusBackAction = (
    <Button
      type="button"
      variant="secondary"
      onClick={() => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        void navigate({ to: "/tabs/chat" });
      }}
      className="rounded-full"
    >
      {safeReturnPath ? "返回上一页" : "返回消息列表"}
    </Button>
  );
  const handleRetryLoad = () => {
    void Promise.all([groupQuery.refetch(), membersQuery.refetch()]);
  };
  const statusRetryAction = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={handleRetryLoad}
        className="rounded-full"
      >
        重试读取
      </Button>
      {statusBackAction}
    </div>
  );
  const renderOperationBackAction = () => (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="h-7 shrink-0 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[11px]"
      onClick={() => {
        if (navigateToRouteStateReturn()) {
          return;
        }

        void navigate({ to: "/tabs/chat" });
      }}
    >
      {safeReturnPath ? "返回上一页" : "返回消息列表"}
    </Button>
  );
  const showNotice = (
    message: string,
    options?: {
      showBackAction?: boolean;
      actionLabel?: string;
      onAction?: () => void;
    },
  ) => {
    setNotice({
      message,
      ...(options?.showBackAction ? { showBackAction: true } : {}),
      ...(options?.actionLabel && options?.onAction
        ? {
            actionLabel: options.actionLabel,
            onAction: options.onAction,
          }
        : {}),
    });
  };

  useEffect(() => {
    setNotice(null);
    setMemberGridExpanded(false);
    setManagementSheetOpen(false);
    setDangerSheetAction(null);
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

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setGroupPinned(groupId, { pinned }, baseUrl),
    onSuccess: async (_, pinned) => {
      showNotice(pinned ? "群聊已置顶。" : "群聊已取消置顶。");
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
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateGroupPreferences>[1]) =>
      updateGroupPreferences(groupId, payload, baseUrl),
    onSuccess: async (_, payload) => {
      const nextNotice =
        payload.isMuted !== undefined
          ? payload.isMuted
            ? "已开启群消息免打扰。"
            : "已关闭群消息免打扰。"
          : payload.savedToContacts !== undefined
            ? payload.savedToContacts
              ? "已保存到通讯录。"
              : "已从通讯录移除。"
            : payload.showMemberNicknames !== undefined
              ? payload.showMemberNicknames
                ? "已开启显示群成员昵称。"
                : "已关闭显示群成员昵称。"
              : payload.notifyOnAtMe !== undefined
                ? payload.notifyOnAtMe
                  ? "开启了 @我 通知。"
                  : "关闭了 @我 通知。"
                : payload.notifyOnAtAll !== undefined
                  ? payload.notifyOnAtAll
                    ? "开启了 @所有人 通知。"
                    : "关闭了 @所有人 通知。"
                  : payload.notifyOnAnnouncement !== undefined
                    ? payload.notifyOnAnnouncement
                      ? "开启了群公告通知。"
                      : "关闭了群公告通知。"
                    : "群聊设置已更新。";

      showNotice(nextNotice);
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
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGroupMessages(groupId, baseUrl),
    onSuccess: async () => {
      showNotice("群聊记录已清空。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroup(groupId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-members", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contact-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      void navigate({ to: "/tabs/chat", replace: true });
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => hideGroup(groupId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      void navigate({ to: "/tabs/chat", replace: true });
    },
  });

  const visibleMemberCount = memberGridExpanded
    ? undefined
    : COLLAPSED_MEMBER_PREVIEW_COUNT;
  const ownerMember = useMemo(
    () =>
      (membersQuery.data ?? []).find(
        (item) => item.role === "owner" && item.memberType === "user",
      ),
    [membersQuery.data],
  );
  const totalMemberCount = membersQuery.data?.length ?? 0;
  const ownerDisplayName = ownerMember?.memberName?.trim() || "我";
  const groupSummary = useMemo(() => {
    const group = groupQuery.data;
    if (!group) {
      return null;
    }

    const groupPath = `/group/${groupId}`;
    const groupUrl =
      typeof window === "undefined"
        ? groupPath
        : `${window.location.origin}${groupPath}`;

    return {
      title: `${group.name} 群聊`,
      text: [`${group.name} 群聊`, `${totalMemberCount} 人群聊`, groupUrl].join(
        "\n",
      ),
      url: groupUrl,
    };
  }, [groupId, groupQuery.data, totalMemberCount]);

  async function handleShareGroup() {
    if (!groupSummary) {
      return;
    }

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell(groupSummary);

      if (shared) {
        showNotice("已打开系统分享面板。");
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      showNotice(
        nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制群聊摘要。",
        { showBackAction: true },
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(groupSummary.text);
      showNotice(
        nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制群聊摘要。"
          : "群聊摘要已复制。",
      );
    } catch {
      showNotice(
        nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制群聊摘要失败，请稍后重试。",
        {
          showBackAction: true,
          actionLabel: nativeMobileShareSupported ? "重试分享" : "重试复制",
          onAction: () => {
            void handleShareGroup();
          },
        },
      );
    }
  }

  const memberItems = useMemo(() => {
    const members = (membersQuery.data ?? []).slice(0, visibleMemberCount);

    return [
      ...members.map((member) => ({
        key: member.id,
        label: member.memberName ?? member.memberId,
        src: member.memberAvatar,
      })),
      {
        key: "add",
        label: "添加",
        kind: "add" as const,
        onClick: () => {
          void navigate({
            to: "/group/$groupId/members/add",
            params: { groupId },
            ...(groupRouteHash ? { hash: groupRouteHash } : {}),
          });
        },
      },
      {
        key: "remove",
        label: "移除",
        kind: "remove" as const,
        onClick: () => {
          void navigate({
            to: "/group/$groupId/members/remove",
            params: { groupId },
            ...(groupRouteHash ? { hash: groupRouteHash } : {}),
          });
        },
      },
    ];
  }, [groupId, groupRouteHash, membersQuery.data, navigate, visibleMemberCount]);

  const hasCollapsedMembers = totalMemberCount > COLLAPSED_MEMBER_PREVIEW_COUNT;
  const dangerSheetConfig =
    dangerSheetAction === "hide"
      ? {
          title: "隐藏聊天",
          description: "该群聊会先从消息列表中隐藏，收到新消息后会再次出现。",
          confirmLabel: "隐藏聊天",
          confirmDescription: "不删除聊天记录",
          confirmDanger: false,
          onConfirm: () => hideMutation.mutate(),
        }
      : dangerSheetAction === "clear"
        ? {
            title: "清空聊天记录",
            description: "仅清空当前群聊历史消息，群成员和群资料会继续保留。",
            confirmLabel: "清空聊天记录",
            confirmDescription: "此操作不可恢复",
            confirmDanger: true,
            onConfirm: () => clearMutation.mutate(),
          }
        : dangerSheetAction === "leave"
          ? {
              title: "删除并退出",
              description:
                "删除并退出后，该群聊会从当前世界中移除，后续需要重新建群才能继续使用。",
              confirmLabel: "删除并退出",
              confirmDescription: "该群聊会被移除",
              confirmDanger: true,
              onConfirm: () => leaveMutation.mutate(),
            }
          : null;

  const busy =
    pinMutation.isPending ||
    preferencesMutation.isPending ||
    clearMutation.isPending ||
    leaveMutation.isPending ||
    hideMutation.isPending;

  return (
    <ChatDetailsShell
      title={groupQuery.data?.name ?? "群聊信息"}
      subtitle={
        membersQuery.data ? `${membersQuery.data.length} 人群聊` : "群聊信息"
      }
      onBack={() => {
        void navigate({
          to: "/group/$groupId",
          params: { groupId },
          ...(groupRouteHash ? { hash: groupRouteHash } : {}),
        });
      }}
      rightActions={
        groupSummary ? (
          <Button
            type="button"
            onClick={() => void handleShareGroup()}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-[color:var(--surface-card-hover)]"
            aria-label={
              nativeMobileShareSupported ? "分享群聊" : "复制群聊摘要"
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
      {groupQuery.isLoading || membersQuery.isLoading ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge="读取中"
            title="正在读取群聊信息"
            description="稍等一下，正在同步群成员、群资料和消息设置。"
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge="群聊"
            title="群聊信息暂时不可用"
            description={groupQuery.error.message}
            tone="danger"
            action={statusRetryAction}
          />
        </div>
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge="成员"
            title="群成员信息暂时不可用"
            description={membersQuery.error.message}
            tone="danger"
            action={statusRetryAction}
          />
        </div>
      ) : null}
      {notice ? (
        <div className="px-2.5">
          <InlineNotice
            tone="info"
            className="rounded-[11px] px-2.5 py-1.5 text-[10px] leading-4 shadow-none"
          >
            {notice.showBackAction || (notice.actionLabel && notice.onAction) ? (
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1">{notice.message}</span>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {notice.actionLabel && notice.onAction ? (
                    <InlineNoticeActionButton
                      label={notice.actionLabel}
                      onClick={notice.onAction}
                    />
                  ) : null}
                  {notice.showBackAction ? renderOperationBackAction() : null}
                </div>
              </div>
            ) : (
              notice.message
            )}
          </InlineNotice>
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge="群聊"
            title="群聊不存在"
            description="这个群聊暂时不可用，可以先重试读取，或返回消息列表后再试。"
            action={statusRetryAction}
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title="群聊成员" variant="wechat">
            <ChatMemberGrid items={memberItems} variant="wechat" />
            {hasCollapsedMembers || memberGridExpanded ? (
              <button
                type="button"
                onClick={() => setMemberGridExpanded((current) => !current)}
                className="flex min-h-10 w-full items-center justify-center border-t border-[color:var(--border-faint)] px-4 text-[13px] text-[#576b95]"
              >
                {memberGridExpanded ? "收起群成员" : "查看更多群成员"}
              </button>
            ) : null}
            <div className="divide-y divide-[color:var(--border-faint)] border-t border-[color:var(--border-faint)]">
              <ChatSettingRow
                label="群主"
                value={ownerDisplayName}
                variant="wechat"
              />
              <ChatSettingRow
                label="全部群成员"
                value={`${totalMemberCount} 人`}
                variant="wechat"
                onClick={() => {
                  if (!hasCollapsedMembers) {
                    showNotice(`当前群聊共有 ${totalMemberCount} 位成员。`);
                    return;
                  }
                  setMemberGridExpanded(true);
                  showNotice(`已展开全部 ${totalMemberCount} 位群成员。`);
                }}
              />
              <ChatSettingRow
                label="群管理"
                value="成员与资料"
                variant="wechat"
                onClick={() => setManagementSheetOpen(true)}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="群聊资料" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="群聊名称"
                value={groupQuery.data.name}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/edit/name",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
              <ChatSettingRow
                label="群公告"
                value={groupQuery.data.announcement?.trim() || "暂无"}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
              <ChatSettingRow
                label="群二维码"
                value="查看邀请卡"
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/qr",
                    params: { groupId },
                    search: buildGroupInviteReturnSearch({
                      conversationPath: `/group/${groupId}`,
                      conversationTitle: groupQuery.data?.name ?? "当前群聊",
                    }),
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
              <ChatSettingRow
                label="查找聊天记录"
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/search",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
              <ChatSettingRow
                label="聊天背景"
                value={getChatBackgroundLabel(
                  ownerQuery.data?.defaultChatBackground,
                )}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/background",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="聊天设置" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="消息免打扰"
                variant="wechat"
                checked={groupQuery.data.isMuted}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ isMuted: checked });
                }}
              />
              {groupQuery.data.isMuted ? (
                <>
                  <ChatSettingRow
                    label="@我仍通知"
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtMe}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtMe: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="@所有人仍通知"
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtAll}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({ notifyOnAtAll: checked });
                    }}
                  />
                  <ChatSettingRow
                    label="群公告仍通知"
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAnnouncement}
                    onToggle={(checked) => {
                      preferencesMutation.mutate({
                        notifyOnAnnouncement: checked,
                      });
                    }}
                  />
                </>
              ) : null}
              <ChatSettingRow
                label="置顶聊天"
                variant="wechat"
                checked={groupQuery.data.isPinned}
                onToggle={(checked) => pinMutation.mutate(checked)}
              />
              <ChatSettingRow
                label="保存到通讯录"
                variant="wechat"
                checked={groupQuery.data.savedToContacts}
                onToggle={(checked) => {
                  preferencesMutation.mutate({ savedToContacts: checked });
                }}
              />
              <ChatSettingRow
                label="我在本群的昵称"
                value={ownerMember?.memberName ?? "未设置"}
                variant="wechat"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId/edit/nickname",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                }}
              />
              <ChatSettingRow
                label="显示群成员昵称"
                variant="wechat"
                checked={groupQuery.data.showMemberNicknames}
                onToggle={(checked) => {
                  preferencesMutation.mutate({
                    showMemberNicknames: checked,
                  });
                }}
              />
            </div>
          </ChatDetailsSection>

          <ChatCallFallbackSection
            variant="wechat"
            voiceValue="群语音"
            videoValue="群视频"
            onSelectKind={(kind) => {
              void navigate({
                to:
                  kind === "voice"
                    ? "/group/$groupId/voice-call"
                    : "/group/$groupId/video-call",
                params: { groupId },
                ...(groupRouteHash ? { hash: groupRouteHash } : {}),
              });
            }}
          />

          <ChatDetailsSection title="危险操作" variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label="隐藏聊天"
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("hide")}
              />
              <ChatSettingRow
                label="清空聊天记录"
                danger
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("clear")}
              />
              <ChatSettingRow
                label="删除并退出"
                danger
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("leave")}
              />
            </div>
          </ChatDetailsSection>

          {pinMutation.isError && pinMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {pinMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {preferencesMutation.isError &&
          preferencesMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {preferencesMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {clearMutation.isError && clearMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {clearMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {leaveMutation.isError && leaveMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {leaveMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}
          {hideMutation.isError && hideMutation.error instanceof Error ? (
            <div className="px-2.5">
              <InlineNotice
                tone="danger"
                className="rounded-[14px] border border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))] px-3 py-2 text-[11px] leading-[1.45] shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    {hideMutation.error.message}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}

          <MobileDetailsActionSheet
            open={managementSheetOpen}
            title="群管理"
            description={`${ownerDisplayName} 可快速管理成员、公告和群资料。`}
            onClose={() => setManagementSheetOpen(false)}
            actions={[
              {
                key: "expand-members",
                label: memberGridExpanded
                  ? "收起成员列表"
                  : hasCollapsedMembers
                    ? "查看全部群成员"
                    : "已显示全部群成员",
                description: memberGridExpanded
                  ? "回到紧凑预览状态"
                  : `当前共 ${totalMemberCount} 人`,
                disabled: !memberGridExpanded && !hasCollapsedMembers,
                onClick: () => {
                  setManagementSheetOpen(false);
                  if (!memberGridExpanded && !hasCollapsedMembers) {
                    return;
                  }
                  setMemberGridExpanded((current) => !current);
                },
              },
              {
                key: "add-member",
                label: "添加成员",
                description: "继续把联系人拉进当前群聊",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/members/add",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                },
              },
              {
                key: "remove-member",
                label: "移除成员",
                description: "选择需要移出群聊的成员",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/members/remove",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                },
              },
              {
                key: "announcement",
                label: "编辑群公告",
                description: "发布或修改群内置顶公告",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                },
              },
              {
                key: "qr",
                label: "查看群二维码",
                description: "打开邀请卡与分享入口",
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/qr",
                    params: { groupId },
                    search: buildGroupInviteReturnSearch({
                      conversationPath: `/group/${groupId}`,
                      conversationTitle: groupQuery.data?.name ?? "当前群聊",
                    }),
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                },
              },
            ]}
          />

          <MobileDetailsActionSheet
            open={dangerSheetConfig !== null}
            title={dangerSheetConfig?.title ?? ""}
            description={dangerSheetConfig?.description}
            onClose={() => setDangerSheetAction(null)}
            actions={
              dangerSheetConfig
                ? [
                    {
                      key: "confirm",
                      label: dangerSheetConfig.confirmLabel,
                      description: dangerSheetConfig.confirmDescription,
                      danger: dangerSheetConfig.confirmDanger,
                      disabled: busy,
                      onClick: () => {
                        setDangerSheetAction(null);
                        dangerSheetConfig.onConfirm();
                      },
                    },
                  ]
                : []
            }
          />
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function MobileGroupDetailsStatusCard({
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

const COLLAPSED_MEMBER_PREVIEW_COUNT = 13;
