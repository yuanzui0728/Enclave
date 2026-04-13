import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  getGroup,
  getGroupMembers,
  updateGroup,
  updateGroupOwnerProfile,
} from "@yinjie/contracts";
import { Button, InlineNotice, cn } from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { isMissingGroupError } from "../lib/group-route-fallback";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

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
      ? groupQuery.data?.name ?? ""
      : ownerMember?.memberName?.trim() ?? "";
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [groupId, groupQuery.error, groupQuery.isLoading, navigate]);

  const saveGroupNameMutation = useMutation({
    mutationFn: (name: string) => updateGroup(groupId, { name }, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-saved-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
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

  return (
    <ChatDetailsShell
      title={mode === "name" ? "群聊名称" : "我在本群的昵称"}
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={() => {
        void navigate({ to: "/group/$groupId/details", params: { groupId } });
      }}
    >
      {groupQuery.isLoading || (mode === "nickname" && membersQuery.isLoading) ? (
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
            {saveMutation.error.message}
          </InlineNotice>
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-4">
          <MobileGroupEditStatusCard
            badge="群聊"
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页再试一次。"
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
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
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
    </section>
  );
}
