import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, MessageCircleMore } from "lucide-react";
import { getCharacter, getOrCreateConversation } from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { useSessionStore } from "../store/session-store";

export function CharacterDetailPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const userId = useSessionStore((state) => state.userId);

  const characterQuery = useQuery({
    queryKey: ["app-character", characterId],
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

  return (
    <AppPage>
      <Button
        onClick={() => navigate({ to: "/tabs/contacts" })}
        variant="ghost"
        size="icon"
        className="text-[color:var(--text-secondary)]"
      >
        <ArrowLeft size={18} />
      </Button>

      {characterQuery.isLoading ? (
        <LoadingBlock label="正在读取角色资料..." />
      ) : character ? (
        <AppSection className="bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(13,22,35,0.74))] p-6">
          <div className="flex items-center gap-4">
            <AvatarChip name={character.name} src={character.avatar} size="lg" />
            <div>
              <div className="text-xl font-semibold text-white">{character.name}</div>
              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
            </div>
          </div>

          <p className="mt-6 text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio}</p>

          <div className="mt-6 grid gap-3">
            <div className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              专长：{character.expertDomains.join("、") || "未设置"}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              当前状态：{character.currentActivity ?? (character.isOnline ? "在线" : "离线")}
            </div>
            <div className="rounded-[24px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
              语气：{character.profile.traits.emotionalTone}
            </div>
          </div>

          <Button
            onClick={() => startChatMutation.mutate()}
            disabled={startChatMutation.isPending}
            variant="primary"
            size="lg"
            className="mt-6 inline-flex w-full justify-center gap-2 rounded-2xl"
          >
            <MessageCircleMore size={16} />
            {startChatMutation.isPending ? "正在进入对话..." : "开始聊天"}
          </Button>
          {startChatMutation.isError && startChatMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={startChatMutation.error.message} /> : null}
        </AppSection>
      ) : (
        <div className="mt-5">
          <EmptyState
            title="角色不存在"
            description={characterQuery.error instanceof Error ? characterQuery.error.message : "这个角色暂时不可用。"}
          />
        </div>
      )}
    </AppPage>
  );
}
