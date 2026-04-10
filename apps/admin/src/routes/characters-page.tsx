import { useEffect, useEffectEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { deleteCharacter, listCharacters, type Character } from "@yinjie/contracts";
import { AppHeader, Button, Card, ErrorBlock, InlineNotice, LoadingBlock, StatusPill } from "@yinjie/ui";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

function relationshipTone(type: Character["relationshipType"]) {
  switch (type) {
    case "family":
      return "healthy";
    case "expert":
      return "warning";
    default:
      return "muted";
  }
}

export function CharactersPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();

  const charactersQuery = useQuery({
    queryKey: ["admin-characters-crud", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCharacter(id, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
      ]);
    },
  });

  const deletingCharacterId = deleteMutation.isPending ? deleteMutation.variables : null;

  const resetDeleteMutation = useEffectEvent(() => {
    deleteMutation.reset();
  });

  useEffect(() => {
    resetDeleteMutation();
  }, [baseUrl, resetDeleteMutation]);

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="角色管理"
        title="角色名册"
        description="在这里维护驱动私聊、群聊、朋友圈、广场互动和场景触发的角色集合。"
        actions={
          <Link to="/characters/$characterId" params={{ characterId: "new" }}>
            <Button variant="primary" size="lg">新建角色</Button>
          </Link>
        }
      />

      <InlineNotice tone="muted">
        先补齐角色身份、关系和擅长领域，再进入角色编辑页细化提示词、记忆和推理配置。
      </InlineNotice>

      {charactersQuery.isLoading ? <LoadingBlock label="正在加载角色名册..." /> : null}

      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}

      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}

      {!charactersQuery.isLoading && !charactersQuery.isError && (charactersQuery.data?.length ?? 0) === 0 ? (
        <InlineNotice tone="warning">当前还没有角色。先创建第一个角色，才能启用私聊、朋友圈和场景触发能力。</InlineNotice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {(charactersQuery.data ?? []).map((character) => (
          <Card key={character.id} className="bg-[color:var(--surface-console)]">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <CharacterAvatar name={character.name} src={character.avatar} />
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
                  </div>
                </div>
                <p className="mt-4 line-clamp-3 text-sm leading-7 text-[color:var(--text-secondary)]">{character.bio || "暂无角色简介。"}</p>
              </div>
              <StatusPill tone={relationshipTone(character.relationshipType)}>{formatRelationshipType(character.relationshipType)}</StatusPill>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(character.expertDomains.length ? character.expertDomains : ["general"]).map((domain) => (
                <span
                  key={domain}
                  className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                >
                  {domain === "general" ? "通用" : domain}
                </span>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between text-xs text-[color:var(--text-muted)]">
              <div>在线状态：{character.isOnline ? "在线" : "离线"}</div>
              <div>当前活动：{character.currentActivity ?? "未设置"}</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/characters/$characterId"
                params={{ characterId: character.id }}
                className="inline-flex"
              >
                <Button variant="secondary" size="sm">编辑</Button>
              </Link>
              <Link
                to="/characters/$characterId/factory"
                params={{ characterId: character.id }}
                className="inline-flex"
              >
                <Button variant="secondary" size="sm">工厂</Button>
              </Link>
              <Link
                to="/characters/$characterId/runtime"
                params={{ characterId: character.id }}
                className="inline-flex"
              >
                <Button variant="secondary" size="sm">运行</Button>
              </Link>
              <Button
                onClick={() => deleteMutation.mutate(character.id)}
                disabled={deleteMutation.isPending}
                variant="danger"
                size="sm"
              >
                {deletingCharacterId === character.id ? "删除中..." : "删除"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function formatRelationshipType(type: Character["relationshipType"]) {
  switch (type) {
    case "family":
      return "家人";
    case "friend":
      return "朋友";
    case "expert":
      return "专家";
    case "mentor":
      return "导师";
    case "custom":
      return "自定义";
    default:
      return type;
  }
}

function CharacterAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src?.trim()) {
    return <img src={src} alt={name} className="h-12 w-12 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-xl text-[color:var(--text-primary)]">
      {name.slice(0, 1)}
    </div>
  );
}
