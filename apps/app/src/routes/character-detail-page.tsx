import { useEffect, useEffectEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MessageCircleMore } from "lucide-react";
import { getCharacter, getOrCreateConversation } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function CharacterDetailPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
  });

  const character = characterQuery.data;

  const startChatMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        return;
      }

      return getOrCreateConversation({ characterId: character.id }, baseUrl);
    },
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      void navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
    },
  });

  const resetStartChatMutation = useEffectEvent(() => {
    startChatMutation.reset();
  });

  useEffect(() => {
    resetStartChatMutation();
  }, [baseUrl, characterId, resetStartChatMutation]);

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
        <AppSection className="space-y-5 p-6">
          <div className="flex items-center gap-4">
            <AvatarChip name={character.name} src={character.avatar} size="lg" />
            <div>
              <div className="text-xl font-semibold text-[color:var(--text-primary)]">{character.name}</div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
            </div>
          </div>

          <p className="text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio}</p>

          <div className="grid gap-3">
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              专长：{character.expertDomains.join("、") || "未设置"}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              当前状态：{(character.currentActivity ?? character.currentStatus ?? character.relationship) || "暂无状态"}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
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

          {startChatMutation.isError && startChatMutation.error instanceof Error ? (
            <ErrorBlock message={startChatMutation.error.message} />
          ) : null}
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
