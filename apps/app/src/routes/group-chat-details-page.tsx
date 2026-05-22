import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
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
import { useGroupBackground } from "../features/chat/backgrounds/use-conversation-background";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { ChatMemberGrid } from "../features/chat-details/chat-member-grid";
import { ChatSettingRow } from "../features/chat-details/chat-setting-row";
import { MobileDetailsActionSheet } from "../features/chat-details/mobile-details-action-sheet";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
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
import { translateRuntimeMessage } from "@yinjie/i18n";

export function GroupChatDetailsPage() {
  const { groupId } = useParams({ from: "/group/$groupId/details" });
  const isDesktopLayout = useDesktopLayout();
  const t = translateRuntimeMessage;

  if (isDesktopLayout) {
    return (
      <DesktopChatRouteRedirectShell
        conversationId={groupId}
        panel="details"
        title={t(msg`正在打开桌面群聊信息`)}
        description={t(msg`正在切换到桌面聊天中的群聊信息侧栏。`)}
        loadingLabel={t(msg`打开桌面群聊信息...`)}
      />
    );
  }

  return <MobileGroupChatDetailsPage groupId={groupId} />;
}

function MobileGroupChatDetailsPage({ groupId }: { groupId: string }) {
  const t = translateRuntimeMessage;
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
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
  // 这一行展示的是「这个群当前实际生效的背景」——可能继承全局默认，也可能是
  // group-chat-background-page 单独保存过的 custom 背景，必须用 group 维度的
  // background query 取 effectiveBackground，否则覆盖后这里还是显示全局默认，
  // 和点进去能看到的实际不符。
  const backgroundQuery = useGroupBackground(groupId);
  // 走查移动端群聊 R2：和姊妹 chat-details-page R3（commit cdc13e28a）同款问
  // 题——本页若干「点行进二级页」按钮（成员九宫格 character 头像 / 添加 /
  // 移除 / 群聊名称 / 群公告 / 查找聊天记录 / 聊天背景 / 我在本群的昵称）
  // 原本都走 `onClick={() => { void navigate(...) }}`、没挂 disabled / 没同步
  // ref 守。同帧 <16ms 双击让 tanstack-router push 2 条相同 history → 用户从
  // 二级页要按 2 次返回；ChatSettingRow / ChatMemberGrid tile 内 onClick 没
  // throttle，每个 tap 都直冲 navigate。
  // 用一个共享 ref 守住所有前进按钮：第一次成功后 page unmount，第二次根本
  // 不该再飞；raf 复位兜底 navigate 没真正切走的边界（比如成员页 fallback）。
  const rowNavigateFiredRef = useRef(false);
  const guardRowNavigation = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (rowNavigateFiredRef.current) return;
        rowNavigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            rowNavigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );
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
      {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回消息列表`)}
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
        {t(msg`重试读取`)}
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
      {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回消息列表`)}
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

  // 走查移动端群聊 R2：和姊妹路径 chat-details-page.tsx 走查 R1（commit
  // 92247a693）同款修法——本页一连串 mutation onSuccess 调 showNotice("群聊已
  // 置顶。"/"已开启消息免打扰。"/"群聊记录已清空。"/"群消息已开启强提醒。" 等）
  // 原版没 auto-dismiss，notice 一直挂在 details 顶部直到用户切设置 / groupId
  // 切换 / 离开页才消。单聊版同位置已经按 chat-list / chat-list-page 口径对齐
  // 3.5s 自动消。本页 notice 形态比单聊简单（只有 showBackAction 一个 secondary
  // action，没单聊那条 secondaryActionLabel 分支），但口径一致：只要挂着可点
  // 的 primary action 或 secondary back action 就不自动消，给用户时间点。
  // showBackAction=true 时 InlineNoticeActionButton 是用户唯一可继续的入口
  // （404/退群失败兜底），auto-dismiss 把它秒走会让用户卡在不可恢复状态。
  useEffect(() => {
    if (
      !notice ||
      (notice.actionLabel && notice.onAction) ||
      notice.showBackAction
    ) {
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

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      setGroupPinned(groupId, { pinned }, baseUrl),
    onSuccess: (_, pinned) => {
      // 走查 R4：原本 await Promise.all 3 条 invalidate 才 resolve；
      // pinSubmittingRef 依赖 pinMutation.isPending 翻 false 才解锁，await
      // 链下 isPending 一直拉着，公网隧道 RTT ~600ms × 3 ≈ 1.8s 内用户都没法
      // 再点 toggle。fire-and-forget：notice 已经发了，cache 让目标页自己拉。
      showNotice(pinned ? t(msg`群聊已置顶。`) : t(msg`群聊已取消置顶。`));
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    // 失败时 toggle 不会被 invalidate 拉回 → UI 看着没动，没提示。和单聊
    // chat-details-page 同步加 onError。
    onError: (error, pinned) => {
      showNotice(
        describeRequestError(
          error,
          pinned
            ? t(msg`置顶失败，请稍后再试。`)
            : t(msg`取消置顶失败，请稍后再试。`),
        ),
      );
    },
  });

  const preferencesMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateGroupPreferences>[1]) =>
      updateGroupPreferences(groupId, payload, baseUrl),
    onSuccess: (_, payload) => {
      const nextNotice =
        payload.isMuted !== undefined
          ? payload.isMuted
            ? t(msg`已开启群消息免打扰。`)
            : t(msg`已关闭群消息免打扰。`)
          : payload.showMemberNicknames !== undefined
            ? payload.showMemberNicknames
              ? t(msg`已开启显示群成员昵称。`)
              : t(msg`已关闭显示群成员昵称。`)
            : payload.notifyOnAtMe !== undefined
              ? payload.notifyOnAtMe
                ? t(msg`开启了 @我 通知。`)
                : t(msg`关闭了 @我 通知。`)
              : payload.notifyOnAtAll !== undefined
                ? payload.notifyOnAtAll
                  ? t(msg`开启了 @所有人 通知。`)
                  : t(msg`关闭了 @所有人 通知。`)
                : payload.notifyOnAnnouncement !== undefined
                  ? payload.notifyOnAnnouncement
                    ? t(msg`开启了群公告通知。`)
                    : t(msg`关闭了群公告通知。`)
                  : t(msg`群聊设置已更新。`);

      // 走查 R4：同 pinMutation 改法。preferencesMutation.isPending 控制 5 个
      // 偏好 toggle 的 sync ref，await 链下解锁延迟用户连续切偏好的间隔被强制
      // 拉长 ~1.8s。fire-and-forget。
      showNotice(nextNotice);
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error) => {
      showNotice(
        describeRequestError(error, t(msg`群聊设置更新失败，请稍后再试。`)),
      );
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => clearGroupMessages(groupId, baseUrl),
    onSuccess: () => {
      // 走查 R4：同 pin/preferences 改法。clearMutation.isPending 进入 busy
      // 求和，await 链下整个详情页所有按钮都被 disable，公网隧道 ~1.8s 体感
      // 卡顿。fire-and-forget 让 UI 立刻响应；活跃群聊页面的 messages cache
      // 由当前清群操作的服务端 emit 路径自动同步。
      showNotice(t(msg`群聊记录已清空。`));
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-messages", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    },
    onError: (error) => {
      showNotice(
        describeRequestError(error, t(msg`清空群聊记录失败，请稍后再试。`)),
      );
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveGroup(groupId, baseUrl),
    onSuccess: () => {
      // 本会话 R1：原版 await Promise.all 5 条 invalidate 才 navigate——5 条
      // 中只有 app-conversations / app-contact-groups 在 navigate 目的地用得
      // 上，其它 3 条（group / group-members / group-messages）是当前已卸载
      // 页面的旧 cache，等不等都没意义。await 链下用户点"确认退出"后整页要
      // 多卡 ~600ms 公网隧道 RTT 才会跳走。fire-and-forget 即可：服务端
      // leaveGroup 已经触发 emit_conversation_updated，chat-list 那条 socket
      // 订阅会自己 invalidate。
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-members", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-messages", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      void navigate({ to: "/tabs/chat", replace: true });
    },
    onError: (error) => {
      showNotice(
        describeRequestError(error, t(msg`退出群聊失败，请稍后再试。`)),
      );
    },
  });

  const hideMutation = useMutation({
    mutationFn: () => hideGroup(groupId, baseUrl),
    onSuccess: () => {
      // 走查 Round 3：hideGroup 完成后 group-contacts-page 已经靠 socket
      // conversationUpdated 触发 invalidate；但 socket 断开 / cloud token
      // 失效那几百 ms 落到 hideGroup 后，事件投递不过来，contacts/groups
      // 列表会继续显示这条群（visibleGroups 过滤 isHidden=true 拿不到新
      // 的 isHidden 值）。和 pin/preferences/leave 几条同源对齐，显式
      // invalidate 一遍 app-contact-groups。
      // 本会话 R1：和 leaveMutation 同款，原本 await 这 3 条让用户多等
      // ~600ms 才跳走。fire-and-forget 即可，socket 路径 + invalidate 双保
      // 险，进 /tabs/chat 后 conversationsQuery 会自然刷新。
      void queryClient.invalidateQueries({
        queryKey: ["app-group", baseUrl, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      if (navigateToRouteStateReturn({ replace: true })) {
        return;
      }

      void navigate({ to: "/tabs/chat", replace: true });
    },
    onError: (error) => {
      showNotice(
        describeRequestError(error, t(msg`隐藏群聊失败，请稍后再试。`)),
      );
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
  const ownerDisplayName = ownerMember?.memberName?.trim() || t(msg`我`);
  // 把"添加"/"移除"这两条本地化标签提到 useMemo 外面算：本文件用的是
  // translateRuntimeMessage 直引用而不是 useRuntimeTranslator 钩子，所以
  // useMemo 的 deps 里加 t 也是 stable ref——locale 切换后 deps 不会变，
  // 缓存的 "添加" / "移除" 仍是上个语言。提到外面后每次 render 直接读 t()
  // 拿到当前 locale 文案，再走 string deps 触发 useMemo 重算。
  const addMemberLabel = t(msg`添加`);
  const removeMemberLabel = t(msg`移除`);
  const memberItems = useMemo(() => {
    const members = (membersQuery.data ?? []).slice(0, visibleMemberCount);

    return [
      ...members.map((member) => ({
        key: member.id,
        label: member.memberName || member.memberId,
        src: member.memberAvatar,
        // 点群成员头像：character → 打开角色资料页；自己（user 类型 owner）
        // 不挂 onClick 走 ChatMemberGrid 的 button 默认 no-op，避免 deadlink
        // 跳到 /character/owner-uuid（不是角色）报 404。桌面端
        // desktop-chat-details-panel.tsx 已经按 memberType 分支处理过，
        // 移动端原本完全没挂 onClick 整个 grid 哑掉。
        onClick:
          member.memberType === "character"
            ? guardRowNavigation(() => {
                void navigate({
                  to: "/character/$characterId",
                  params: { characterId: member.memberId },
                  hash: buildCharacterDetailRouteHash({
                    returnPath: `/group/${groupId}/details`,
                    returnHash: groupRouteHash,
                  }),
                });
              })
            : undefined,
      })),
      {
        key: "add",
        label: addMemberLabel,
        kind: "add" as const,
        onClick: guardRowNavigation(() => {
          void navigate({
            to: "/group/$groupId/members/add",
            params: { groupId },
            ...(groupRouteHash ? { hash: groupRouteHash } : {}),
          });
        }),
      },
      {
        key: "remove",
        label: removeMemberLabel,
        kind: "remove" as const,
        onClick: guardRowNavigation(() => {
          void navigate({
            to: "/group/$groupId/members/remove",
            params: { groupId },
            ...(groupRouteHash ? { hash: groupRouteHash } : {}),
          });
        }),
      },
    ];
  }, [
    addMemberLabel,
    groupId,
    groupRouteHash,
    guardRowNavigation,
    membersQuery.data,
    navigate,
    removeMemberLabel,
    visibleMemberCount,
  ]);

  const hasCollapsedMembers = totalMemberCount > COLLAPSED_MEMBER_PREVIEW_COUNT;
  const dangerSheetConfig =
    dangerSheetAction === "hide"
      ? {
          title: t(msg`隐藏聊天`),
          description: t(
            msg`该群聊会先从消息列表中隐藏，收到新消息后会再次出现。`,
          ),
          confirmLabel: t(msg`隐藏聊天`),
          confirmDescription: t(msg`不删除聊天记录`),
          confirmDanger: false,
          onConfirm: () => hideMutation.mutate(),
        }
      : dangerSheetAction === "clear"
        ? {
            title: t(msg`清空聊天记录`),
            description: t(
              msg`仅清空当前群聊历史消息，群成员和群资料会继续保留。`,
            ),
            confirmLabel: t(msg`清空聊天记录`),
            confirmDescription: t(msg`此操作不可恢复`),
            confirmDanger: true,
            onConfirm: () => clearMutation.mutate(),
          }
        : dangerSheetAction === "leave"
          ? {
              title: t(msg`删除并退出`),
              description: t(
                msg`删除并退出后，该群聊会从当前世界中移除，后续需要重新建群才能继续使用。`,
              ),
              confirmLabel: t(msg`删除并退出`),
              confirmDescription: t(msg`该群聊会被移除`),
              confirmDanger: true,
              onConfirm: () => leaveMutation.mutate(),
            }
          : null;

  // 同步防双击锁——下面 danger sheet「隐藏聊天 / 清空聊天记录 / 删除并退出」
  // 确认按钮虽然 disabled={busy} 兜底但 busy = mutations.isPending 是 React
  // state 经 commit 才生效。同帧双击 → 两个 mutate 同时飞，第二个的服务端
  // 响应往往是 404 / 失败 → setNotice 显示"退出群聊失败"覆盖掉第一个成功
  // 路径的"已退出群聊"，用户以为操作失败其实早就成功了。
  const dangerActionBusyRef = useRef(false);
  const busy =
    pinMutation.isPending ||
    preferencesMutation.isPending ||
    clearMutation.isPending ||
    leaveMutation.isPending ||
    hideMutation.isPending;

  // 走查新会话 R1：和姊妹 chat-details-page R2（commit 2d6d33d57）/ 桌面单聊
  // R29（commit 01dcc31c6）同款修法——下面 6 条 ChatSettingRow（置顶聊天 /
  // 消息免打扰 / @我仍通知 / @所有人仍通知 / 群公告仍通知 / 显示群成员昵称）
  // 原本只裸跑 `xxxMutation.mutate(...)`，既没挂 disabled={busy} 也没 sync ref
  // 锁。同帧 <16ms 第二次 click 都看到 isPending=false → mutation.mutate 飞
  // 2 次，公网隧道 RTT 双倍消耗 + onSuccess 让 notice 文本闪两次。
  // preferencesMutation 多个偏好 key 共享一个 mutation，逐 key sync ref 兜同
  // 帧 double-tap；isPending 翻 false 后 useEffect 复位 5 个偏好 ref，
  // pinMutation.isPending 单独复位 pinSubmittingRef。
  const pinSubmittingRef = useRef(false);
  const mutedSubmittingRef = useRef(false);
  const notifyAtMeSubmittingRef = useRef(false);
  const notifyAtAllSubmittingRef = useRef(false);
  const notifyAnnouncementSubmittingRef = useRef(false);
  const showMemberNicknamesSubmittingRef = useRef(false);
  useEffect(() => {
    if (!pinMutation.isPending) {
      pinSubmittingRef.current = false;
    }
  }, [pinMutation.isPending]);
  useEffect(() => {
    if (!preferencesMutation.isPending) {
      mutedSubmittingRef.current = false;
      notifyAtMeSubmittingRef.current = false;
      notifyAtAllSubmittingRef.current = false;
      notifyAnnouncementSubmittingRef.current = false;
      showMemberNicknamesSubmittingRef.current = false;
    }
  }, [preferencesMutation.isPending]);
  const handleTogglePin = (next: boolean) => {
    if (pinSubmittingRef.current) {
      return;
    }
    pinSubmittingRef.current = true;
    pinMutation.mutate(next);
  };
  const handleToggleMuted = (next: boolean) => {
    if (mutedSubmittingRef.current) {
      return;
    }
    mutedSubmittingRef.current = true;
    preferencesMutation.mutate({ isMuted: next });
  };
  const handleToggleNotifyAtMe = (next: boolean) => {
    if (notifyAtMeSubmittingRef.current) {
      return;
    }
    notifyAtMeSubmittingRef.current = true;
    preferencesMutation.mutate({ notifyOnAtMe: next });
  };
  const handleToggleNotifyAtAll = (next: boolean) => {
    if (notifyAtAllSubmittingRef.current) {
      return;
    }
    notifyAtAllSubmittingRef.current = true;
    preferencesMutation.mutate({ notifyOnAtAll: next });
  };
  const handleToggleNotifyAnnouncement = (next: boolean) => {
    if (notifyAnnouncementSubmittingRef.current) {
      return;
    }
    notifyAnnouncementSubmittingRef.current = true;
    preferencesMutation.mutate({ notifyOnAnnouncement: next });
  };
  const handleToggleShowMemberNicknames = (next: boolean) => {
    if (showMemberNicknamesSubmittingRef.current) {
      return;
    }
    showMemberNicknamesSubmittingRef.current = true;
    preferencesMutation.mutate({ showMemberNicknames: next });
  };

  return (
    <ChatDetailsShell
      title={groupQuery.data?.name || t(msg`群聊信息`)}
      subtitle={
        membersQuery.data
          ? t(msg`${membersQuery.data.length} 人群聊`)
          : t(msg`群聊信息`)
      }
      onBack={() => {
        navigateBackOrFallback(() => {
          void navigate({
            to: "/group/$groupId",
            params: { groupId },
            ...(groupRouteHash ? { hash: groupRouteHash } : {}),
          });
        }, `/group/${groupId}`);
      }}
    >
      {groupQuery.isLoading || membersQuery.isLoading ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在读取群聊信息`)}
            description={t(msg`稍等一下，正在同步群成员、群资料和消息设置。`)}
            tone="loading"
          />
        </div>
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群聊信息暂时不可用`)}
            description={describeRequestError(groupQuery.error)}
            tone="danger"
            action={statusRetryAction}
          />
        </div>
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <div className="px-2.5">
          <MobileGroupDetailsStatusCard
            badge={t(msg`成员`)}
            title={t(msg`群成员信息暂时不可用`)}
            description={describeRequestError(membersQuery.error)}
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
            {notice.showBackAction ||
            (notice.actionLabel && notice.onAction) ? (
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
            badge={t(msg`群聊`)}
            title={t(msg`群聊不存在`)}
            description={t(
              msg`这个群聊暂时不可用，可以先重试读取，或返回消息列表后再试。`,
            )}
            action={statusRetryAction}
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title={t(msg`群聊成员`)} variant="wechat">
            <ChatMemberGrid items={memberItems} variant="wechat" />
            {hasCollapsedMembers || memberGridExpanded ? (
              <button
                type="button"
                onClick={() => setMemberGridExpanded((current) => !current)}
                className="flex min-h-10 w-full items-center justify-center border-t border-[color:var(--border-faint)] px-4 text-[13px] text-[#576b95]"
              >
                {memberGridExpanded
                  ? t(msg`收起群成员`)
                  : t(msg`查看更多群成员`)}
              </button>
            ) : null}
            <div className="divide-y divide-[color:var(--border-faint)] border-t border-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`群主`)}
                value={ownerDisplayName}
                variant="wechat"
              />
              <ChatSettingRow
                label={t(msg`群管理`)}
                value={t(msg`成员与资料`)}
                variant="wechat"
                onClick={() => setManagementSheetOpen(true)}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title={t(msg`群聊资料`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`群聊名称`)}
                value={groupQuery.data.name}
                variant="wechat"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: "/group/$groupId/edit/name",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                })}
              />
              <ChatSettingRow
                label={t(msg`群公告`)}
                value={groupQuery.data.announcement?.trim() || t(msg`暂无`)}
                variant="wechat"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                })}
              />
              <ChatSettingRow
                label={t(msg`查找聊天记录`)}
                variant="wechat"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: "/group/$groupId/search",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                })}
              />
              <ChatSettingRow
                label={t(msg`聊天背景`)}
                value={getChatBackgroundLabel(
                  backgroundQuery.data?.effectiveBackground,
                )}
                variant="wechat"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: "/group/$groupId/background",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                })}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title={t(msg`聊天设置`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`消息免打扰`)}
                variant="wechat"
                checked={groupQuery.data.isMuted}
                disabled={busy}
                onToggle={handleToggleMuted}
              />
              {groupQuery.data.isMuted ? (
                <>
                  <ChatSettingRow
                    label={t(msg`@我仍通知`)}
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtMe}
                    disabled={busy}
                    onToggle={handleToggleNotifyAtMe}
                  />
                  <ChatSettingRow
                    label={t(msg`@所有人仍通知`)}
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAtAll}
                    disabled={busy}
                    onToggle={handleToggleNotifyAtAll}
                  />
                  <ChatSettingRow
                    label={t(msg`群公告仍通知`)}
                    variant="wechat"
                    checked={groupQuery.data.notifyOnAnnouncement}
                    disabled={busy}
                    onToggle={handleToggleNotifyAnnouncement}
                  />
                </>
              ) : null}
              <ChatSettingRow
                label={t(msg`置顶聊天`)}
                variant="wechat"
                checked={groupQuery.data.isPinned}
                disabled={busy}
                onToggle={handleTogglePin}
              />
              <ChatSettingRow
                label={t(msg`我在本群的昵称`)}
                value={ownerMember?.memberName || t(msg`未设置`)}
                variant="wechat"
                onClick={guardRowNavigation(() => {
                  void navigate({
                    to: "/group/$groupId/edit/nickname",
                    params: { groupId },
                    ...(groupRouteHash ? { hash: groupRouteHash } : {}),
                  });
                })}
              />
              <ChatSettingRow
                label={t(msg`显示群成员昵称`)}
                variant="wechat"
                checked={groupQuery.data.showMemberNicknames}
                disabled={busy}
                onToggle={handleToggleShowMemberNicknames}
              />
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title={t(msg`危险操作`)} variant="wechat">
            <div className="divide-y divide-[color:var(--border-faint)]">
              <ChatSettingRow
                label={t(msg`隐藏聊天`)}
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("hide")}
              />
              <ChatSettingRow
                label={t(msg`清空聊天记录`)}
                danger
                disabled={busy}
                variant="wechat"
                onClick={() => setDangerSheetAction("clear")}
              />
              <ChatSettingRow
                label={t(msg`删除并退出`)}
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
                    {describeRequestError(pinMutation.error)}
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
                    {describeRequestError(preferencesMutation.error)}
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
                    {describeRequestError(clearMutation.error)}
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
                    {describeRequestError(leaveMutation.error)}
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
                    {describeRequestError(hideMutation.error)}
                  </span>
                  {renderOperationBackAction()}
                </div>
              </InlineNotice>
            </div>
          ) : null}

          <MobileDetailsActionSheet
            open={managementSheetOpen}
            title={t(msg`群管理`)}
            description={t(
              msg`${ownerDisplayName} 可快速管理成员、公告和群资料。`,
            )}
            onClose={() => setManagementSheetOpen(false)}
            actions={[
              {
                key: "expand-members",
                label: memberGridExpanded
                  ? t(msg`收起成员列表`)
                  : hasCollapsedMembers
                    ? t(msg`查看全部群成员`)
                    : t(msg`已显示全部群成员`),
                description: memberGridExpanded
                  ? t(msg`回到紧凑预览状态`)
                  : t(msg`当前共 ${totalMemberCount} 人`),
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
                label: t(msg`添加成员`),
                description: t(msg`继续把联系人拉进当前群聊`),
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
                label: t(msg`移除成员`),
                description: t(msg`选择需要移出群聊的成员`),
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
                label: t(msg`编辑群公告`),
                description: t(msg`发布或修改群内置顶公告`),
                onClick: () => {
                  setManagementSheetOpen(false);
                  void navigate({
                    to: "/group/$groupId/announcement",
                    params: { groupId },
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
                        if (dangerActionBusyRef.current || busy) {
                          return;
                        }
                        dangerActionBusyRef.current = true;
                        setDangerSheetAction(null);
                        try {
                          dangerSheetConfig.onConfirm();
                        } finally {
                          // hide/clear/leave mutation 走完后 busy 会翻回 false
                          // —— 用 setTimeout 0 把锁丢到下个 task，覆盖完同帧
                          // 合成 click 后立刻解锁，不影响后续重试。
                          window.setTimeout(() => {
                            dangerActionBusyRef.current = false;
                          }, 0);
                        }
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
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium tracking-[0.04em]",
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
