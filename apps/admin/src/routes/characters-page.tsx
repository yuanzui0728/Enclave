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
  AdminEyebrow,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

export function CharactersPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [relationshipFilter, setRelationshipFilter] = useState<Character["relationshipType"] | "all">("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const charactersQuery = useQuery({
    queryKey: ["admin-characters-crud", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });
  const presetsQuery = useQuery({
    queryKey: ["admin-character-presets", baseUrl],
    queryFn: () => adminApi.listCharacterPresets(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCharacter(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-presets", baseUrl] }),
      ]);
    },
  });

  const installPresetMutation = useMutation({
    mutationFn: (presetKey: string) => adminApi.installCharacterPreset(presetKey),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-presets", baseUrl] }),
      ]);
    },
  });

  const installPresetBatchMutation = useMutation({
    mutationFn: (presetKeys: string[]) => adminApi.installCharacterPresetBatch(presetKeys),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-presets", baseUrl] }),
      ]);
    },
  });

  const deletingCharacterId = deleteMutation.isPending ? deleteMutation.variables : null;
  const installingPresetKey = installPresetMutation.isPending ? installPresetMutation.variables : null;
  const isInstallingAnyPreset = installPresetMutation.isPending || installPresetBatchMutation.isPending;

  const resetDeleteMutation = useEffectEvent(() => { deleteMutation.reset(); });
  useEffect(() => { resetDeleteMutation(); }, [baseUrl, resetDeleteMutation]);

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
      return matchesSearch && matchesStatus && matchesRelationship;
    });
  }, [charactersQuery.data, deferredSearch, relationshipFilter, statusFilter]);

  const presetGroups = useMemo(() => {
    const groups = new Map<string, {
      groupKey: string;
      groupLabel: string;
      groupDescription: string;
      groupOrder: number;
      presets: NonNullable<typeof presetsQuery.data>[number][];
      installedCount: number;
    }>();

    for (const preset of presetsQuery.data ?? []) {
      const existing = groups.get(preset.groupKey);
      if (existing) {
        existing.presets.push(preset);
        if (preset.installed) existing.installedCount += 1;
        continue;
      }
      groups.set(preset.groupKey, {
        groupKey: preset.groupKey,
        groupLabel: preset.groupLabel,
        groupDescription: preset.groupDescription,
        groupOrder: preset.groupOrder,
        presets: [preset],
        installedCount: preset.installed ? 1 : 0,
      });
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        remainingPresetKeys: group.presets.filter((p) => !p.installed).map((p) => p.presetKey),
        totalCount: group.presets.length,
      }))
      .sort((a, b) => a.groupOrder - b.groupOrder);
  }, [presetsQuery.data]);

  const remainingPresetKeys = useMemo(
    () => (presetsQuery.data ?? []).filter((p) => !p.installed).map((p) => p.presetKey),
    [presetsQuery.data],
  );

  return (
    <div className="space-y-6">
      {charactersQuery.isLoading ? <LoadingBlock label="正在加载角色名册..." /> : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
      {presetsQuery.isError && presetsQuery.error instanceof Error ? <ErrorBlock message={presetsQuery.error.message} /> : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}
      {installPresetMutation.isError && installPresetMutation.error instanceof Error ? <ErrorBlock message={installPresetMutation.error.message} /> : null}
      {installPresetBatchMutation.isError && installPresetBatchMutation.error instanceof Error ? <ErrorBlock message={installPresetBatchMutation.error.message} /> : null}

      {!charactersQuery.isLoading && !charactersQuery.isError && (charactersQuery.data?.length ?? 0) === 0 ? (
        <AdminCallout
          title="当前还没有角色"
          description="先创建第一个角色，才能启用私聊、朋友圈和场景触发能力。"
          tone="warning"
          actions={
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary">新建第一个角色</Button>
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* 左列：角色列表 */}
        <div className="space-y-4">
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
          </div>

          {/* 角色卡片列表 */}
          <div className="space-y-3">
            {filteredCharacters.map((character) => (
              <Card key={character.id} className="bg-[color:var(--surface-console)]">
                <div className="flex items-start gap-4">
                  <CharacterAvatar name={character.name} src={character.avatar} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-[color:var(--text-primary)]">{character.name}</span>
                          <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                            {character.isOnline ? "在线" : "离线"}
                          </StatusPill>
                        </div>
                        <div className="mt-0.5 text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
                      </div>
                    </div>

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
            ))}

            {!filteredCharacters.length && !charactersQuery.isLoading ? (
              <AdminEmptyState
                title="当前筛选没有匹配角色"
                description="调整关键词或在线状态后，再继续筛选。"
              />
            ) : null}
          </div>
        </div>

        {/* 右列：名人预设 */}
        <div className="space-y-4">
          <Card className="bg-[color:var(--surface-console)]">
            <div className="flex items-start justify-between gap-3">
              <AdminEyebrow>名人预设</AdminEyebrow>
              <Button
                variant="primary"
                size="sm"
                onClick={() => installPresetBatchMutation.mutate(remainingPresetKeys)}
                disabled={!remainingPresetKeys.length || isInstallingAnyPreset}
              >
                {installPresetBatchMutation.isPending
                  ? "安装中..."
                  : remainingPresetKeys.length
                    ? `安装剩余 ${remainingPresetKeys.length}`
                    : "全部已安装"}
              </Button>
            </div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              已安装 {(presetsQuery.data ?? []).filter((p) => p.installed).length} / {presetsQuery.data?.length ?? 0}
            </div>

            <div className="mt-4 space-y-3">
              {presetGroups.map((group) => (
                <div
                  key={group.groupKey}
                  className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[color:var(--text-primary)]">{group.groupLabel}</div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        已安装 {group.installedCount} / {group.totalCount}
                      </div>
                    </div>
                    <Button
                      variant={group.remainingPresetKeys.length ? "primary" : "secondary"}
                      size="sm"
                      onClick={() => installPresetBatchMutation.mutate(group.remainingPresetKeys)}
                      disabled={!group.remainingPresetKeys.length || isInstallingAnyPreset}
                    >
                      {group.remainingPresetKeys.length ? `安装本组` : "已安装"}
                    </Button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {group.presets.map((preset) => (
                      <div
                        key={preset.presetKey}
                        className="flex items-center justify-between gap-3 rounded-[16px] border border-[color:var(--border-faint)] bg-white/70 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-[color:var(--text-primary)]">
                            {preset.avatar} {preset.name}
                          </div>
                          <div className="truncate text-xs text-[color:var(--text-secondary)]">{preset.relationship}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusPill tone={preset.installed ? "healthy" : "muted"}>
                            {preset.installed ? "已安装" : "未安装"}
                          </StatusPill>
                          {!preset.installed ? (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => installPresetMutation.mutate(preset.presetKey)}
                              disabled={isInstallingAnyPreset}
                            >
                              {installingPresetKey === preset.presetKey ? "安装中..." : "安装"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {!presetsQuery.isLoading && !(presetsQuery.data ?? []).length ? (
                <AdminEmptyState
                  title="当前没有可安装预设"
                  description="后端预设目录为空时，这里不会显示可安装名人角色。"
                />
              ) : null}
            </div>
          </Card>
        </div>
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
    return <img src={src} alt={name} className={`${dim} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${dim} flex items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-[color:var(--text-primary)] shrink-0`}>
      {name.slice(0, 1)}
    </div>
  );
}
