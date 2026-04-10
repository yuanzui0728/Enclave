import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { Copy, Download, Link2, QrCode, Share2 } from "lucide-react";
import {
  getConversations,
  getGroup,
  getGroupMembers,
  sendGroupMessage,
  type ConversationListItem,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import {
  readGroupInviteDeliveryRecord,
  readGroupInviteDeliveryTargets,
  readGroupInviteReopenRecords,
  writeGroupInviteReopenRecord,
  writeGroupInviteDeliveryRecord,
  type GroupInviteDeliveryRecord,
  type GroupInviteDeliveryTarget,
  type GroupInviteReopenRecord,
} from "../lib/group-invite-delivery";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  formatConversationTimestamp,
  parseTimestamp,
} from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { emitChatMessage, joinConversationRoom } from "../lib/socket";

export function GroupQrPage() {
  const { groupId } = useParams({ from: "/group/$groupId/qr" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isDesktopLayout = useDesktopLayout();
  const search = useRouterState({ select: (state) => state.location.search });
  const [notice, setNotice] = useState<string | null>(null);
  const [deliveredConversation, setDeliveredConversation] =
    useState<GroupInviteDeliveryRecord | null>(() =>
      readGroupInviteDeliveryRecord(groupId),
    );
  const [deliveryTargets, setDeliveryTargets] = useState<
    GroupInviteDeliveryTarget[]
  >(() => readGroupInviteDeliveryTargets(groupId));
  const [reopenRecords, setReopenRecords] = useState<GroupInviteReopenRecord[]>(
    () => readGroupInviteReopenRecords(groupId),
  );

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, groupId],
    queryFn: () => getGroupMembers(groupId, baseUrl),
  });
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") {
      return `/group/${groupId}`;
    }

    return new URL(`/group/${groupId}`, window.location.origin).toString();
  }, [groupId]);
  const inviteCode = `YJ-GROUP-${groupId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
  const inviteText = useMemo(() => {
    const groupName = groupQuery.data?.name ?? "隐界群聊";
    return [`邀请你加入「${groupName}」`, `群链接：${inviteLink}`, `邀请码：${inviteCode}`].join(
      "\n",
    );
  }, [groupQuery.data?.name, inviteCode, inviteLink]);
  const qrSvgMarkup = useMemo(
    () =>
      buildInviteMatrixSvg({
        code: inviteCode,
        label: groupQuery.data?.name ?? "群聊邀请",
        subtitle: `${membersQuery.data?.length ?? 0} 人群聊`,
      }),
    [groupQuery.data?.name, inviteCode, membersQuery.data?.length],
  );
  const mobileLink = useMemo(
    () => resolveMobileHandoffLink(`/group/${groupId}`),
    [groupId],
  );
  const recentConversations = useMemo(
    () =>
      [...(conversationsQuery.data ?? [])]
        .filter((item) => item.id !== groupId)
        .sort(
          (left, right) =>
            (parseTimestamp(right.lastActivityAt) ?? 0) -
            (parseTimestamp(left.lastActivityAt) ?? 0),
        )
        .slice(0, 5),
    [conversationsQuery.data, groupId],
  );
  const inviteMessage = useMemo(
    () =>
      [
        "【群邀请】",
        `邀请你加入「${groupQuery.data?.name ?? "隐界群聊"}」`,
        `群链接：${inviteLink}`,
        `邀请码：${inviteCode}`,
      ].join(" "),
    [groupQuery.data?.name, inviteCode, inviteLink],
  );
  const currentReturnSource = useMemo(() => {
    const params = new URLSearchParams(search);
    const conversationPath = params.get("from")?.trim();
    const conversationTitle = params.get("title")?.trim();

    if (!conversationPath || !conversationTitle) {
      return null;
    }

    return {
      conversationPath,
      conversationTitle,
    };
  }, [search]);
  const currentReturnSourceConversation = useMemo(() => {
    if (!currentReturnSource) {
      return null;
    }

    return (
      (conversationsQuery.data ?? []).find(
        (conversation) =>
          buildConversationPath(conversation) ===
          currentReturnSource.conversationPath,
      ) ?? null
    );
  }, [conversationsQuery.data, currentReturnSource]);
  const prioritizedRecentConversations = useMemo(() => {
    if (!currentReturnSourceConversation) {
      return recentConversations;
    }

    return recentConversations.filter(
      (conversation) => conversation.id !== currentReturnSourceConversation.id,
    );
  }, [currentReturnSourceConversation, recentConversations]);
  const relatedReturnConversations = useMemo(() => {
    if (!currentReturnSourceConversation) {
      return [] as ConversationListItem[];
    }

    const sourceIsGroup = isPersistedGroupConversation(
      currentReturnSourceConversation,
    );
    const reopenPaths = new Set(
      reopenRecords.map((record) => record.conversationPath),
    );

    return [...(conversationsQuery.data ?? [])]
      .filter(
        (conversation) =>
          conversation.id !== groupId &&
          conversation.id !== currentReturnSourceConversation.id,
      )
      .filter(
        (conversation) =>
          isPersistedGroupConversation(conversation) === sourceIsGroup,
      )
      .sort((left, right) => {
        const leftReopenWeight = reopenPaths.has(buildConversationPath(left))
          ? 1
          : 0;
        const rightReopenWeight = reopenPaths.has(buildConversationPath(right))
          ? 1
          : 0;

        if (leftReopenWeight !== rightReopenWeight) {
          return rightReopenWeight - leftReopenWeight;
        }

        return (
          (parseTimestamp(right.lastActivityAt) ?? 0) -
          (parseTimestamp(left.lastActivityAt) ?? 0)
        );
      })
      .slice(0, 3);
  }, [
    conversationsQuery.data,
    currentReturnSourceConversation,
    groupId,
    reopenRecords,
  ]);
  const deliveredPaths = useMemo(
    () => new Set(deliveryTargets.map((record) => record.conversationPath)),
    [deliveryTargets],
  );

  useEffect(() => {
    setDeliveredConversation(readGroupInviteDeliveryRecord(groupId));
    setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
  }, [groupId]);

  useEffect(() => {
    setReopenRecords(readGroupInviteReopenRecords(groupId));
  }, [groupId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(search);
    const fromPath = params.get("from")?.trim();
    const fromTitle = params.get("title")?.trim();

    if (!fromPath || !fromTitle) {
      return;
    }

    setReopenRecords(
      writeGroupInviteReopenRecord(groupId, {
        conversationPath: fromPath,
        conversationTitle: fromTitle,
      }),
    );
  }, [groupId, search]);

  async function copyText(value: string, successMessage: string) {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice("当前环境暂不支持复制。");
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      setNotice("复制失败，请稍后重试。");
    }
  }

  function downloadInviteCard() {
    if (typeof document === "undefined") {
      return;
    }

    const blob = new Blob([qrSvgMarkup], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${groupQuery.data?.name ?? "group"}-invite-card.svg`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice("群邀请卡已开始保存。");
  }

  async function sendToMobile() {
    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(mobileLink);
      pushMobileHandoffRecord({
        label: `${groupQuery.data?.name ?? "群聊"} 邀请`,
        description: `把 ${groupQuery.data?.name ?? "当前群聊"} 的邀请入口发到手机继续查看和转发。`,
        path: `/group/${groupId}`,
      });
      setNotice("群邀请入口已复制到手机。");
    } catch {
      setNotice("复制到手机失败，请稍后重试。");
    }
  }

  async function sendToConversation(conversation: ConversationListItem) {
    const conversationPath = isPersistedGroupConversation(conversation)
      ? `/group/${conversation.id}`
      : `/chat/${conversation.id}`;

    if (isPersistedGroupConversation(conversation)) {
      await sendGroupMessage(
        conversation.id,
        {
          text: inviteMessage,
        },
        baseUrl,
      );
      setDeliveredConversation(
        writeGroupInviteDeliveryRecord(groupId, {
          conversationId: conversation.id,
          conversationPath,
          conversationTitle: conversation.title,
          groupName: groupQuery.data?.name,
        }),
      );
      setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
      setNotice(`已把群邀请发到 ${conversation.title}。`);
      await queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      return;
    }

    const characterId = conversation.participants[0];
    if (!characterId) {
      setNotice("这条单聊暂时没有可用的角色目标，无法发送群邀请。");
      return;
    }

    joinConversationRoom({ conversationId: conversation.id });
    emitChatMessage({
      conversationId: conversation.id,
      characterId,
      text: inviteMessage,
    });
    window.setTimeout(() => {
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
    }, 500);
    setDeliveredConversation(
      writeGroupInviteDeliveryRecord(groupId, {
        conversationId: conversation.id,
        conversationPath,
        conversationTitle: conversation.title,
        groupName: groupQuery.data?.name,
      }),
    );
    setDeliveryTargets(readGroupInviteDeliveryTargets(groupId));
    setNotice(`已把群邀请发到 ${conversation.title}。`);
  }

  const content = (
    <>
      {groupQuery.isLoading || membersQuery.isLoading ? (
        <LoadingBlock label="正在生成群邀请卡..." />
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <ErrorBlock message={groupQuery.error.message} />
      ) : null}
      {membersQuery.isError && membersQuery.error instanceof Error ? (
        <ErrorBlock message={membersQuery.error.message} />
      ) : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      {groupQuery.data ? (
        <section className="space-y-5 rounded-[28px] border border-white/80 bg-[rgba(255,255,255,0.88)] p-5 shadow-[var(--shadow-section)] backdrop-blur">
          <div className="flex items-start gap-4">
            <GroupAvatarChip
              name={groupQuery.data.name}
              members={membersQuery.data?.map((item) => item.memberId) ?? []}
              size="wechat"
            />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold text-[color:var(--text-primary)]">
                {groupQuery.data.name}
              </div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                {membersQuery.data?.length ?? 0} 人群聊
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                最近活跃 {formatConversationTimestamp(groupQuery.data.lastActivityAt)}
              </div>
            </div>
          </div>

          {currentReturnSource ? (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,252,246,0.78)] px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium tracking-[0.16em] text-[color:var(--brand-secondary)]">
                  当前回流来源
                </div>
                <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
                  来自 {currentReturnSource.conversationTitle}
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  这次是从聊天线程直接回到群邀请页，可继续转发或回到原会话。
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigate({ to: currentReturnSource.conversationPath });
                }}
                className="shrink-0 rounded-full"
              >
                回到会话
              </Button>
              {currentReturnSourceConversation ? (
                <Button
                  size="sm"
                  onClick={() => {
                    void sendToConversation(currentReturnSourceConversation);
                  }}
                  className="shrink-0 rounded-full"
                >
                  再发回这个会话
                </Button>
              ) : null}
            </section>
          ) : null}

          <div className="overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-[linear-gradient(180deg,#fffdf8,#f8efe1)] p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <div
              className="mx-auto w-full max-w-[420px]"
              dangerouslySetInnerHTML={{ __html: qrSvgMarkup }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <ActionCard
              icon={<Link2 size={16} />}
              title="复制群链接"
              description="把当前群聊入口发给别的设备继续打开。"
              onClick={() => {
                void copyText(inviteLink, "群链接已复制。");
              }}
            />
            <ActionCard
              icon={<Share2 size={16} />}
              title="复制邀请文案"
              description="带上群链接和邀请码，一次性发给对方。"
              onClick={() => {
                void copyText(inviteText, "群邀请文案已复制。");
              }}
            />
            <ActionCard
              icon={<Copy size={16} />}
              title="发到手机"
              description="把当前群邀请入口复制到手机，并进入接力历史。"
              onClick={() => {
                void sendToMobile();
              }}
            />
            <ActionCard
              icon={<Download size={16} />}
              title="保存邀请卡"
              description="保存当前邀请卡 SVG，后续可继续转发。"
              onClick={downloadInviteCard}
            />
          </div>

          <div className="rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)] px-4 py-4 text-sm leading-7 text-[color:var(--text-secondary)]">
            当前邀请卡会承载群聊链接和邀请码。
            在同一世界实例内打开链接，可直接回到这个群聊。
          </div>

          {deliveredConversation ? (
            <section className="flex items-center justify-between gap-3 rounded-[20px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,255,255,0.72)] px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近投递到 {deliveredConversation.conversationTitle}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {formatConversationTimestamp(deliveredConversation.deliveredAt)}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  void navigate({ to: deliveredConversation.conversationPath });
                }}
                className="shrink-0 rounded-full"
              >
                回到会话
              </Button>
            </section>
          ) : null}

          {deliveryTargets.length ? (
            <section className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,248,240,0.78)] px-4 py-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近已发邀请会话
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  这些会话已经收到过这张群邀请，方便继续回跳或再次投递。
                </div>
              </div>

              <div className="space-y-2">
                {deliveryTargets.map((record) => (
                  <div
                    key={`${record.conversationPath}:${record.deliveredAt}`}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {record.conversationTitle}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        发送于 {formatConversationTimestamp(record.deliveredAt)}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void navigate({ to: record.conversationPath });
                      }}
                      className="shrink-0 rounded-full"
                    >
                      回到会话
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {reopenRecords.length ? (
            <section className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,252,246,0.72)] px-4 py-4">
              <div>
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  最近从这些会话回到邀请页
                </div>
                <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                  从聊天线程点了“回到群邀请”后，会把最近回流入口记在这里，方便再次回到消息流。
                </div>
              </div>

              <div className="space-y-2">
                {reopenRecords.map((record) => (
                  <div
                    key={`${record.conversationPath}:${record.reopenedAt}`}
                    className="flex items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {record.conversationTitle}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        回流于 {formatConversationTimestamp(record.reopenedAt)}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void navigate({ to: record.conversationPath });
                      }}
                      className="shrink-0 rounded-full"
                    >
                      回到会话
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3 rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-[rgba(255,249,238,0.62)] px-4 py-4">
            <div>
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                发到最近会话
              </div>
              <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
                直接把当前群邀请投递到最近会话，回到消息流里继续转发。
              </div>
            </div>

            {conversationsQuery.isLoading ? (
              <LoadingBlock label="正在读取最近会话..." />
            ) : null}
            {conversationsQuery.isError &&
            conversationsQuery.error instanceof Error ? (
              <ErrorBlock message={conversationsQuery.error.message} />
            ) : null}
            {!conversationsQuery.isLoading && !recentConversations.length ? (
              <div className="rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/72 px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                还没有可投递的最近会话。
              </div>
            ) : null}
            {currentReturnSourceConversation ? (
              <button
                type="button"
                onClick={() => {
                  void sendToConversation(currentReturnSourceConversation);
                }}
                className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[rgba(249,115,22,0.18)] bg-[rgba(255,250,244,0.9)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-secondary)]">
                    优先回发给来源会话
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                    {currentReturnSourceConversation.title}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    回流后可直接把当前群邀请再发回这条来源会话。
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.1)] px-3 py-1 text-xs text-[color:var(--brand-secondary)]">
                  立即回发
                </span>
              </button>
            ) : null}
            {relatedReturnConversations.length ? (
              <div className="space-y-2">
                <div className="text-xs font-medium tracking-[0.14em] text-[color:var(--brand-secondary)]">
                  来源会话附近相关会话
                </div>
                {relatedReturnConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      void sendToConversation(conversation);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[rgba(249,115,22,0.14)] bg-[rgba(255,252,246,0.88)] px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {conversation.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {isPersistedGroupConversation(conversation)
                          ? "同类群聊"
                          : "同类单聊"}{" "}
                        · 最近活跃{" "}
                        {formatConversationTimestamp(conversation.lastActivityAt)}
                        {deliveredPaths.has(buildConversationPath(conversation))
                          ? " · 已发过邀请"
                          : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.1)] px-3 py-1 text-xs text-[color:var(--brand-secondary)]">
                      发到相关会话
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            {prioritizedRecentConversations.length ? (
              <div className="space-y-2">
                {prioritizedRecentConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      void sendToConversation(conversation);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-3 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {conversation.title}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {isPersistedGroupConversation(conversation)
                          ? "群聊"
                          : "单聊"}{" "}
                        · 最近活跃{" "}
                        {formatConversationTimestamp(conversation.lastActivityAt)}
                        {deliveredPaths.has(buildConversationPath(conversation))
                          ? " · 已发过邀请"
                          : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-[rgba(249,115,22,0.1)] px-3 py-1 text-xs text-[color:var(--brand-secondary)]">
                      发到聊天
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </section>
      ) : null}
    </>
  );

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[linear-gradient(180deg,#f8f1e6,#f4f7ef)] px-5 py-5">
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            <div className="flex items-center justify-between rounded-[28px] border border-white/80 bg-[rgba(255,255,255,0.84)] px-5 py-4 shadow-[var(--shadow-section)] backdrop-blur">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--brand-secondary)]">
                  Group Invite
                </div>
                <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                  群二维码
                </div>
                {currentReturnSource ? (
                  <div className="mt-2 text-xs text-[color:var(--text-secondary)]">
                    当前来自 {currentReturnSource.conversationTitle}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {currentReturnSource ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void navigate({ to: currentReturnSource.conversationPath });
                    }}
                    className="rounded-full"
                  >
                    回到来源会话
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigate({ to: "/group/$groupId", params: { groupId } });
                  }}
                >
                  返回群聊
                </Button>
              </div>
            </div>
            {content}
          </div>
      </AppPage>
    );
  }

  return (
    <ChatDetailsShell
      title="群二维码"
      subtitle={groupQuery.data?.name ?? "群聊邀请"}
      onBack={() => {
        void navigate({
          to: "/group/$groupId/details",
          params: { groupId },
        });
      }}
    >
      <div className="space-y-3 px-3">{content}</div>
    </ChatDetailsShell>
  );
}

function ActionCard({
  description,
  icon,
  onClick,
  title,
}: {
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[22px] border border-[rgba(15,23,42,0.08)] bg-white px-4 py-4 text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(249,115,22,0.1)] text-[color:var(--brand-secondary)]">
        {icon}
      </div>
      <div className="mt-3 text-sm font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-1 text-xs leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </button>
  );
}

function buildConversationPath(conversation: ConversationListItem) {
  return isPersistedGroupConversation(conversation)
    ? `/group/${conversation.id}`
    : `/chat/${conversation.id}`;
}

function buildInviteMatrixSvg({
  code,
  label,
  subtitle,
}: {
  code: string;
  label: string;
  subtitle: string;
}) {
  const cells = 25;
  const cellSize = 8;
  const matrixSize = cells * cellSize;
  const width = 360;
  const height = 440;
  const offsetX = (width - matrixSize) / 2;
  const offsetY = 64;
  const seed = hashCode(`${code}:${label}:${subtitle}`);
  const rects: string[] = [];

  for (let row = 0; row < cells; row += 1) {
    for (let col = 0; col < cells; col += 1) {
      if (isFinderCell(row, col, cells)) {
        continue;
      }

      const value = bitFromSeed(seed, row, col);
      if (!value) {
        continue;
      }

      rects.push(
        `<rect x="${offsetX + col * cellSize}" y="${offsetY + row * cellSize}" width="${cellSize}" height="${cellSize}" rx="2" fill="#111827" />`,
      );
    }
  }

  const finder = createFinderBlocks(offsetX, offsetY, cellSize, cells);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <rect width="${width}" height="${height}" rx="28" fill="#fffdf8"/>
  <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="22" fill="#ffffff" stroke="#f2e8dc"/>
  <text x="${width / 2}" y="42" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#111827" font-weight="700">${escapeXml(
    label,
  )}</text>
  <text x="${width / 2}" y="60" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#6b7280">${escapeXml(
    subtitle,
  )}</text>
  <rect x="${offsetX - 12}" y="${offsetY - 12}" width="${matrixSize + 24}" height="${matrixSize + 24}" rx="18" fill="#fff8ee" stroke="#f1e5d2"/>
  ${finder}
  ${rects.join("")}
  <text x="${width / 2}" y="${offsetY + matrixSize + 44}" text-anchor="middle" font-size="12" font-family="monospace" fill="#374151">${escapeXml(
    code,
  )}</text>
  <text x="${width / 2}" y="${offsetY + matrixSize + 66}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#9ca3af">群邀请卡</text>
</svg>`.trim();
}

function createFinderBlocks(
  offsetX: number,
  offsetY: number,
  cellSize: number,
  cells: number,
) {
  return [
    createFinder(offsetX, offsetY, cellSize, 0, 0),
    createFinder(offsetX, offsetY, cellSize, cells - 7, 0),
    createFinder(offsetX, offsetY, cellSize, 0, cells - 7),
  ].join("");
}

function createFinder(
  offsetX: number,
  offsetY: number,
  cellSize: number,
  col: number,
  row: number,
) {
  const x = offsetX + col * cellSize;
  const y = offsetY + row * cellSize;
  const outer = cellSize * 7;
  const inner = cellSize * 5;
  const core = cellSize * 3;

  return `
    <rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="8" fill="#111827"/>
    <rect x="${x + cellSize}" y="${y + cellSize}" width="${inner}" height="${inner}" rx="6" fill="#fffdf8"/>
    <rect x="${x + cellSize * 2}" y="${y + cellSize * 2}" width="${core}" height="${core}" rx="4" fill="#111827"/>
  `;
}

function isFinderCell(row: number, col: number, cells: number) {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= cells - 7;
  const inBottomLeft = row >= cells - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

function bitFromSeed(seed: number, row: number, col: number) {
  const mixed =
    ((seed ^ (row * 374761393)) + col * 668265263 + row * col * 31) >>> 0;
  return ((mixed ^ (mixed >>> 13) ^ (mixed >>> 21)) & 1) === 1;
}

function hashCode(input: string) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function escapeXml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
