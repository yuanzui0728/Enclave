import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listCharacters, type Character } from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  SelectField,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminDangerZone,
  AdminEmptyState,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function CharactersPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [relationshipFilter, setRelationshipFilter] = useState<Character["relationshipType"] | "all">("all");
  const [friendFilter, setFriendFilter] = useState<"all" | "friend" | "world">("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const charactersQuery = useQuery({
    queryKey: ["admin-characters-crud", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });
  const friendIdsQuery = useQuery({
    queryKey: ["admin-character-friend-ids", baseUrl],
    queryFn: () => adminApi.getFriendCharacterIds(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCharacter(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-friend-ids", baseUrl] }),
      ]);
    },
  });

  const deletingCharacterId = deleteMutation.isPending ? deleteMutation.variables : null;

  const resetDeleteMutation = useEffectEvent(() => { deleteMutation.reset(); });
  useEffect(() => { resetDeleteMutation(); }, [baseUrl, resetDeleteMutation]);

  const friendIds = useMemo(
    () => new Set(friendIdsQuery.data ?? []),
    [friendIdsQuery.data],
  );

  const filteredCharacters = useMemo(() => {
    const list = charactersQuery.data ?? [];
    return list.filter((character) => {
      const matchesSearch =
        !deferredSearch ||
        character.name.toLowerCase().includes(deferredSearch) ||
        character.relationship.toLowerCase().includes(deferredSearch) ||
        character.expertDomains.some((domain) => domain.toLowerCase().includes(deferredSearch));
      const matchesStatus =
        statusFilter === "all" || (statusFilter === "online" ? character.isOnline : !character.isOnline);
      const matchesRelationship =
        relationshipFilter === "all" || character.relationshipType === relationshipFilter;
      const isFriend = friendIds.has(character.id);
      const matchesFriend =
        friendFilter === "all" ||
        (friendFilter === "friend" ? isFriend : !isFriend);
      return matchesSearch && matchesStatus && matchesRelationship && matchesFriend;
    });
  }, [charactersQuery.data, deferredSearch, friendFilter, friendIds, relationshipFilter, statusFilter]);

  return (
    <div className="space-y-6">
      {charactersQuery.isLoading ? <LoadingBlock label="正在加载世界角色..." /> : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}

      {!charactersQuery.isLoading && !charactersQuery.isError && (charactersQuery.data?.length ?? 0) === 0 ? (
        <AdminCallout
          title="当前世界还没有角色"
          description="先创建第一个角色，才能启用私聊、朋友圈和场景触发能力。"
          tone="warning"
          actions={
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary">新建第一个角色</Button>
            </Link>
          }
        />
      ) : null}

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]">
          <TextField
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索角色名、关系或领域"
          />
        </div>
        <SelectField
          value={friendFilter}
          onChange={(e) => setFriendFilter(e.target.value as "all" | "friend" | "world")}
          className="w-28"
        >
          <option value="all">全部角色</option>
          <option value="friend">好友</option>
          <option value="world">世界角色</option>
        </SelectField>
        <SelectField
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "online" | "offline")}
          className="w-28"
        >
          <option value="all">全部状态</option>
          <option value="online">在线</option>
          <option value="offline">离线</option>
        </SelectField>
        <SelectField
          value={relationshipFilter}
          onChange={(e) => setRelationshipFilter(e.target.value as Character["relationshipType"] | "all")}
          className="w-28"
        >
          <option value="all">全部关系</option>
          <option value="family">家人</option>
          <option value="friend">朋友</option>
          <option value="expert">专家</option>
          <option value="mentor">导师</option>
          <option value="custom">自定义</option>
        </SelectField>
        <Link to="/characters/$characterId" params={{ characterId: "new" }}>
          <Button variant="primary" size="sm">新建角色</Button>
        </Link>
        <Link to="/characters/wechat-sync">
          <Button variant="secondary" size="sm">一键同步微信朋友</Button>
        </Link>
      </div>

      {/* 世界角色列表 */}
      <div className="space-y-3">
        {filteredCharacters.map((character) => {
          const isFriend = friendIds.has(character.id);
          return (
            <Card key={character.id} className="bg-[color:var(--surface-console)]">
              <div className="flex items-start gap-4">
                <CharacterAvatar name={character.name} src={character.avatar} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="truncate font-semibold text-[color:var(--text-primary)]">{character.name}</span>
                    <StatusPill tone={isFriend ? "healthy" : "muted"}>
                      {isFriend ? "好友" : "世界角色"}
                    </StatusPill>
                    <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                      {character.isOnline ? "在线" : "离线"}
                    </StatusPill>
                  </div>
                  <div className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>

                  {character.expertDomains.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {character.expertDomains.slice(0, 4).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
                        >
                          {domain}
                        </span>
                      ))}
                      {character.expertDomains.length > 4 ? (
                        <span className="text-xs text-[color:var(--text-muted)]">+{character.expertDomains.length - 4}</span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex items-center gap-2">
                    <Link to="/characters/$characterId" params={{ characterId: character.id }} className="flex-1">
                      <Button variant="primary" size="sm" className="w-full justify-center">进入工作区</Button>
                    </Link>
                    <AdminDangerZone
                      title=""
                      description={
                        isProtectedCharacter(character)
                          ? "默认保底角色不可删除。"
                          : "删除角色会移除关联的好友、会话、动态和蓝图数据。"
                      }
                    >
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={deleteMutation.isPending || isProtectedCharacter(character)}
                        onClick={() => deleteMutation.mutate(character.id)}
                      >
                        {isProtectedCharacter(character) ? "受保护" : deletingCharacterId === character.id ? "删除中..." : "删除"}
                      </Button>
                    </AdminDangerZone>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {!filteredCharacters.length && !charactersQuery.isLoading ? (
          <AdminEmptyState
            title="当前筛选没有匹配角色"
            description="调整关键词或筛选条件后，再继续搜索。"
          />
        ) : null}
      </div>
    </div>
  );
}

function isProtectedCharacter(character: Character) {
  return character.deletionPolicy === "protected" || character.sourceType === "default_seed";
}

function CharacterAvatar({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-10 w-10 text-base" : "h-12 w-12 text-xl";
  if (src?.trim()) {
    return <img src={resolveAdminAvatarSrc(src)} alt={name} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} flex items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-[color:var(--text-primary)] shrink-0`}>
      {name.slice(0, 1)}
    </div>
  );
}

function resolveAdminAvatarSrc(src: string) {
  if (!src.startsWith("/api/")) {
    return src;
  }

  try {
    return new URL(src, `${resolveAdminCoreApiBaseUrl()}/`).toString();
  } catch {
    return src;
  }
}
