import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MessageCircleMore, OctagonAlert, ShieldBan } from "lucide-react";
import { blockCharacter, createModerationReport, getCharacter, getOrCreateConversation } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { promptForSafetyReason } from "../lib/safety";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useSessionStore } from "../store/session-store";

export function CharacterDetailPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.userId);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId),
  });

  const character = characterQuery.data;

  const startChatMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !character) {
        return;
      }

      return getOrCreateConversation({
        userId,
        characterId: character.id,
      });
    },
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }
      navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
  });
  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !character) {
        return;
      }

      const reason = promptForSafetyReason(`举报 ${character.name}`);
      if (!reason) {
        return;
      }

      return createModerationReport({
        userId,
        targetType: "character",
        targetId: character.id,
        reason,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["moderation-reports", baseUrl, userId] });
    },
  });
  const blockMutation = useMutation({
    mutationFn: async () => {
      if (!userId || !character) {
        return;
      }

      const reason = promptForSafetyReason(`屏蔽 ${character.name}`);
      return blockCharacter({
        userId,
        characterId: character.id,
        reason: reason ?? undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-chat-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-discover-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-moments-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends-quick-start", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-group-friends", baseUrl, userId] }),
      ]);
      await navigate({ to: "/tabs/contacts" });
    },
  });

  useEffect(() => {
    startChatMutation.reset();
    reportMutation.reset();
    blockMutation.reset();
  }, [baseUrl, characterId]);

  return (
    <AppPage>
      <AppHeader
        eyebrow="角色"
        title={character?.name ?? "角色资料"}
        description={character?.relationship ?? "查看角色档案、当前状态和进入对话的入口。"}
        actions={
          <Button
            onClick={() => navigate({ to: "/tabs/contacts" })}
            variant="ghost"
            size="icon"
            className="text-[color:var(--text-secondary)]"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      {characterQuery.isLoading ? (
        <LoadingBlock label="正在读取角色资料..." />
      ) : character ? (
        <AppSection className="space-y-5 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(13,22,35,0.74))] p-6">
          <div className="flex items-center gap-4">
            <AvatarChip name={character.name} src={character.avatar} size="lg" />
            <div>
              <div className="text-xl font-semibold text-white">{character.name}</div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
            </div>
          </div>

          <p className="text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio}</p>

          <div className="grid gap-3">
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              专长：{character.expertDomains.join("、") || "未设置"}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              当前状态：{character.currentActivity ?? (character.isOnline ? "在线" : "离线")}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              语气：{character.profile.traits.emotionalTone}
            </div>
          </div>

          <Button
            onClick={() => startChatMutation.mutate()}
            disabled={startChatMutation.isPending}
            variant="primary"
            size="lg"
            className="inline-flex w-full justify-center gap-2 rounded-2xl"
          >
            <MessageCircleMore size={16} />
            {startChatMutation.isPending ? "正在进入对话..." : "开始聊天"}
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => reportMutation.mutate()}
              disabled={reportMutation.isPending}
              variant="secondary"
              size="lg"
              className="inline-flex w-full justify-center gap-2 rounded-2xl"
            >
              <OctagonAlert size={16} />
              {reportMutation.isPending ? "提交中..." : "举报角色"}
            </Button>
            <Button
              onClick={() => blockMutation.mutate()}
              disabled={blockMutation.isPending}
              variant="danger"
              size="lg"
              className="inline-flex w-full justify-center gap-2 rounded-2xl"
            >
              <ShieldBan size={16} />
              {blockMutation.isPending ? "屏蔽中..." : "屏蔽角色"}
            </Button>
          </div>
          {startChatMutation.isError && startChatMutation.error instanceof Error ? <ErrorBlock message={startChatMutation.error.message} /> : null}
          {reportMutation.isError && reportMutation.error instanceof Error ? <ErrorBlock message={reportMutation.error.message} /> : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? <ErrorBlock message={blockMutation.error.message} /> : null}
          {reportMutation.isSuccess ? <InlineNotice tone="success">举报已提交，我们会保留这条安全记录。</InlineNotice> : null}
        </AppSection>
      ) : (
        <EmptyState
          title="角色不存在"
          description={characterQuery.error instanceof Error ? characterQuery.error.message : "这个角色暂时不可用。"}
        />
      )}
    </AppPage>
  );
}
