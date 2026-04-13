import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listCharacters, type Character } from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  SelectField,
  StatusPill,
  TextField,
} from "@yinjie/ui";
import {
  AdminActionGroup,
  AdminCallout,
  AdminDangerZone,
  AdminEmptyState,
  AdminEyebrow,
  AdminHintCard,
  AdminInfoRow,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [relationshipFilter, setRelationshipFilter] = useState<Character["relationshipType"] | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<Character["sourceType"] | "all">("all");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
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
    onSuccess: async (character) => {
      setSelectedCharacterId(character.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-character-presets", baseUrl] }),
      ]);
    },
  });

  const installPresetBatchMutation = useMutation({
    mutationFn: (payload: { scope: "all" | "group"; groupKey?: string; presetKeys: string[] }) =>
      adminApi.installCharacterPresetBatch(payload.presetKeys),
    onSuccess: async (result) => {
      const firstInstalledCharacter = result.installedCharacters[0];
      if (firstInstalledCharacter) {
        setSelectedCharacterId(firstInstalledCharacter.id);
      }
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
  const installingPresetBatch = installPresetBatchMutation.isPending ? installPresetBatchMutation.variables : null;
  const installingGroupKey = installingPresetBatch?.scope === "group" ? installingPresetBatch.groupKey ?? null : null;
  const installingAllPresets = installingPresetBatch?.scope === "all";
  const isInstallingAnyPreset = installPresetMutation.isPending || installPresetBatchMutation.isPending;

  const resetDeleteMutation = useEffectEvent(() => {
    deleteMutation.reset();
  });

  useEffect(() => {
    resetDeleteMutation();
  }, [baseUrl, resetDeleteMutation]);

  const filteredCharacters = useMemo(() => {
    const list = charactersQuery.data ?? [];
    return list.filter((character) => {
      const matchesSearch =
        !deferredSearch ||
        character.name.toLowerCase().includes(deferredSearch) ||
        character.relationship.toLowerCase().includes(deferredSearch) ||
        character.expertDomains.some((domain) => domain.toLowerCase().includes(deferredSearch));
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "online" ? character.isOnline : !character.isOnline);
      const matchesRelationship =
        relationshipFilter === "all" || character.relationshipType === relationshipFilter;
      const matchesSource = sourceFilter === "all" || character.sourceType === sourceFilter;
      return matchesSearch && matchesStatus && matchesRelationship && matchesSource;
    });
  }, [charactersQuery.data, deferredSearch, relationshipFilter, sourceFilter, statusFilter]);

  const presetGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        groupKey: string;
        groupLabel: string;
        groupDescription: string;
        groupOrder: number;
        presets: NonNullable<typeof presetsQuery.data>[number][];
        installedCount: number;
      }
    >();

    for (const preset of presetsQuery.data ?? []) {
      const existing = groups.get(preset.groupKey);
      if (existing) {
        existing.presets.push(preset);
        if (preset.installed) {
          existing.installedCount += 1;
        }
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
        remainingPresetKeys: group.presets.filter((preset) => !preset.installed).map((preset) => preset.presetKey),
        totalCount: group.presets.length,
      }))
      .sort((left, right) => left.groupOrder - right.groupOrder);
  }, [presetsQuery.data]);

  const remainingPresetKeys = useMemo(
    () => (presetsQuery.data ?? []).filter((preset) => !preset.installed).map((preset) => preset.presetKey),
    [presetsQuery.data],
  );

  useEffect(() => {
    if (!filteredCharacters.length) {
      if (selectedCharacterId) {
        setSelectedCharacterId("");
      }
      return;
    }

    if (!selectedCharacterId || !filteredCharacters.some((item) => item.id === selectedCharacterId)) {
      setSelectedCharacterId(filteredCharacters[0].id);
    }
  }, [filteredCharacters, selectedCharacterId]);

  const selectedCharacter =
    filteredCharacters.find((item) => item.id === selectedCharacterId) ??
    charactersQuery.data?.find((item) => item.id === selectedCharacterId) ??
    null;

  return (
    <div className="space-y-6">

      {charactersQuery.isLoading ? <LoadingBlock label="正在加载角色名册..." /> : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
      {presetsQuery.isError && presetsQuery.error instanceof Error ? <ErrorBlock message={presetsQuery.error.message} /> : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}
      {installPresetMutation.isError && installPresetMutation.error instanceof Error ? (
        <ErrorBlock message={installPresetMutation.error.message} />
      ) : null}
      {installPresetBatchMutation.isError && installPresetBatchMutation.error instanceof Error ? (
        <ErrorBlock message={installPresetBatchMutation.error.message} />
      ) : null}

      {!charactersQuery.isLoading && !charactersQuery.isError && (charactersQuery.data?.length ?? 0) === 0 ? (
        <AdminCallout
          title="当前还没有角色"
          tone="warning"
          actions={
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary">新建第一个角色</Button>
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_320px]">
        <Card className="bg-[color:var(--surface-console)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <AdminEyebrow>角色列表</AdminEyebrow>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                {filteredCharacters.length} / {charactersQuery.data?.length ?? 0}
              </div>
            </div>
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary" size="sm">新建角色</Button>
            </Link>
          </div>

          <div className="mt-4 space-y-2">
            <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索角色名、关系或领域" />
            <div className="flex gap-2">
              <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "online" | "offline")} className="flex-1">
                <option value="all">全部状态</option>
                <option value="online">在线</option>
                <option value="offline">离线</option>
              </SelectField>
              <SelectField
                value={relationshipFilter}
                onChange={(event) => setRelationshipFilter(event.target.value as Character["relationshipType"] | "all")}
                className="flex-1"
              >
                <option value="all">全部关系</option>
                <option value="family">家人</option>
                <option value="friend">朋友</option>
                <option value="expert">专家</option>
                <option value="mentor">导师</option>
                <option value="custom">自定义</option>
              </SelectField>
              <SelectField
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as Character["sourceType"] | "all")}
                className="flex-1"
              >
                <option value="all">全部来源</option>
                <option value="default_seed">保底</option>
                <option value="preset_catalog">预设</option>
                <option value="manual_admin">手工</option>
              </SelectField>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {filteredCharacters.map((character) => (
              <div
                key={character.id}
                className={
                  character.id === selectedCharacterId
                    ? "rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] p-3 shadow-[var(--shadow-soft)] ring-1 ring-[color:var(--brand-primary)]/15"
                    : "rounded-[20px] border border-transparent bg-[color:var(--surface-card)] p-3 shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)]"
                }
              >
                <button
                  type="button"
                  onClick={() => setSelectedCharacterId(character.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[color:var(--text-primary)]">{character.name}</div>
                      <div className="mt-0.5 truncate text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
                    </div>
                    <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                      {character.isOnline ? "在线" : "离线"}
                    </StatusPill>
                  </div>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <Link to="/characters/$characterId" params={{ characterId: character.id }} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full justify-center">编辑</Button>
                  </Link>
                  <Link to="/characters/$characterId/factory" params={{ characterId: character.id }} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full justify-center">工厂</Button>
                  </Link>
                  <Link to="/characters/$characterId/runtime" params={{ characterId: character.id }} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full justify-center">调试</Button>
                  </Link>
                </div>
              </div>
            ))}

            {!filteredCharacters.length && !charactersQuery.isLoading ? (
              <AdminEmptyState title="当前筛选没有匹配角色" />
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          {selectedCharacter ? (
            <>
              <Card className="bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(255,247,235,0.92)_42%,rgba(237,250,244,0.95))]">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-4">
                      <CharacterAvatar name={selectedCharacter.name} src={selectedCharacter.avatar} />
                      <div className="min-w-0">
                        <div className="truncate text-2xl font-semibold text-[color:var(--text-primary)]">{selectedCharacter.name}</div>
                        <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{selectedCharacter.relationship}</div>
                      </div>
                    </div>
                    {selectedCharacter.bio ? (
                      <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
                        {selectedCharacter.bio}
                      </p>
                    ) : null}
                  </div>
                  <StatusPill tone={relationshipTone(selectedCharacter.relationshipType)}>
                    {formatRelationshipType(selectedCharacter.relationshipType)}
                  </StatusPill>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard label="在线状态" value={selectedCharacter.isOnline ? "在线" : "离线"} />
                  <MetricCard label="当前活动" value={formatActivity(selectedCharacter.currentActivity)} />
                  <MetricCard label="朋友圈频率" value={selectedCharacter.momentsFrequency} />
                  <MetricCard label="视频号频率" value={selectedCharacter.feedFrequency} />
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminEyebrow>角色摘要</AdminEyebrow>
                <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text-primary)]">擅长领域</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(selectedCharacter.expertDomains.length ? selectedCharacter.expertDomains : ["general"]).map((domain) => (
                        <span
                          key={domain}
                          className="rounded-full border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-1 text-xs text-[color:var(--text-secondary)]"
                        >
                          {domain === "general" ? "通用" : domain}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--text-primary)]">运行信号</div>
                    <div className="mt-3 grid gap-2 text-sm text-[color:var(--text-secondary)]">
                      <AdminInfoRow label="角色来源" value={formatCharacterSourceType(selectedCharacter.sourceType)} />
                      <AdminInfoRow label="删除策略" value={formatDeletionPolicy(selectedCharacter.deletionPolicy)} />
                      <AdminInfoRow label="触发场景" value={selectedCharacter.triggerScenes?.join("、") || "未配置"} />
                      <AdminInfoRow label="互动频率" value={selectedCharacter.activityFrequency || "未配置"} />
                      <AdminInfoRow label="亲密度" value={String(selectedCharacter.intimacyLevel ?? 0)} />
                      <AdminInfoRow label="模板角色" value={selectedCharacter.isTemplate ? "是" : "否"} />
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <AdminEmptyState
              className="bg-[color:var(--surface-console)]"
              title="先从左侧选择一个角色"
            />
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminEyebrow>快捷动作</AdminEyebrow>
            {selectedCharacter ? (
              <div className="mt-4 space-y-4">
                <AdminActionGroup title="首选动作">
                  <Link to="/characters/$characterId" params={{ characterId: selectedCharacter.id }}>
                    <Button variant="primary" size="lg" className="w-full justify-center">编辑基础资料</Button>
                  </Link>
                </AdminActionGroup>

                <AdminActionGroup title="更多入口">
                  <div className="grid gap-3">
                    <Link to="/characters/$characterId/factory" params={{ characterId: selectedCharacter.id }}>
                      <Button variant="secondary" size="lg" className="w-full justify-center">打开角色工厂</Button>
                    </Link>
                    <Link to="/characters/$characterId/runtime" params={{ characterId: selectedCharacter.id }}>
                      <Button variant="secondary" size="lg" className="w-full justify-center">打开运行逻辑台</Button>
                    </Link>
                  </div>
                </AdminActionGroup>

                <AdminDangerZone
                  title="危险操作"
                  description={
                    isProtectedCharacter(selectedCharacter)
                      ? undefined
                      : "删除角色会移除这个世界角色以及它关联的好友、会话、动态和蓝图数据。"
                  }
                >
                  <Button
                    onClick={() => deleteMutation.mutate(selectedCharacter.id)}
                    disabled={deleteMutation.isPending || isProtectedCharacter(selectedCharacter)}
                    variant="danger"
                    size="lg"
                    className="w-full justify-center"
                  >
                    {isProtectedCharacter(selectedCharacter)
                      ? "默认角色不可删除"
                      : deletingCharacterId === selectedCharacter.id
                        ? "删除中..."
                        : "删除角色"}
                  </Button>
                </AdminDangerZone>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-secondary)]">当前没有可操作角色。</div>
            )}
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminEyebrow>名人预设</AdminEyebrow>
            <div className="mt-4 space-y-3">
              <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-[color:var(--text-primary)]">预设库概览</div>
                    <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                      当前已安装 {(presetsQuery.data ?? []).filter((preset) => preset.installed).length} / {presetsQuery.data?.length ?? 0}
                      ，可直接按分组一键注入到当前世界。
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      installPresetBatchMutation.mutate({
                        scope: "all",
                        presetKeys: remainingPresetKeys,
                      })
                    }
                    disabled={!remainingPresetKeys.length || isInstallingAnyPreset}
                  >
                    {installingAllPresets
                      ? "安装中..."
                      : remainingPresetKeys.length
                        ? `安装剩余 ${remainingPresetKeys.length}`
                        : "全部已安装"}
                  </Button>
                </div>
              </div>

              {presetGroups.map((group) => (
                <div
                  key={group.groupKey}
                  className="rounded-[20px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-4 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-[color:var(--text-primary)]">{group.groupLabel}</div>
                      <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {group.groupDescription}
                      </div>
                      <div className="mt-2 text-xs text-[color:var(--text-muted)]">
                        已安装 {group.installedCount} / {group.totalCount}
                      </div>
                    </div>
                    <Button
                      variant={group.remainingPresetKeys.length ? "primary" : "secondary"}
                      size="sm"
                      onClick={() =>
                        installPresetBatchMutation.mutate({
                          scope: "group",
                          groupKey: group.groupKey,
                          presetKeys: group.remainingPresetKeys,
                        })
                      }
                      disabled={!group.remainingPresetKeys.length || isInstallingAnyPreset}
                    >
                      {installingGroupKey === group.groupKey
                        ? "安装中..."
                        : group.remainingPresetKeys.length
                          ? `安装本组 ${group.remainingPresetKeys.length}`
                          : "本组已安装"}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {group.presets.map((preset) => {
                      const installing = installingPresetKey === preset.presetKey;
                      return (
                        <div
                          key={preset.presetKey}
                          className="rounded-[18px] border border-[color:var(--border-faint)] bg-white/70 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-semibold text-[color:var(--text-primary)]">
                                {preset.avatar} {preset.name}
                              </div>
                              <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
                                {preset.relationship}
                              </div>
                            </div>
                            <StatusPill tone={preset.installed ? "healthy" : "muted"}>
                              {preset.installed ? "已安装" : "未安装"}
                            </StatusPill>
                          </div>
                          <div className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                            {preset.description}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
                            {preset.expertDomains.map((domain) => (
                              <span
                                key={domain}
                                className="rounded-full border border-[color:var(--border-faint)] bg-white/70 px-3 py-1"
                              >
                                {domain}
                              </span>
                            ))}
                          </div>
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="text-xs text-[color:var(--text-muted)]">
                              {preset.installed
                                ? `已进入世界角色：${preset.installedCharacterName ?? preset.name}`
                                : ""}
                            </div>
                            <Button
                              variant={preset.installed ? "secondary" : "primary"}
                              size="sm"
                              onClick={() => installPresetMutation.mutate(preset.presetKey)}
                              disabled={preset.installed || isInstallingAnyPreset}
                            >
                              {installing ? "安装中..." : preset.installed ? "已安装" : "安装到世界"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!presetsQuery.isLoading && !(presetsQuery.data ?? []).length ? (
                <AdminEmptyState title="当前没有可安装预设" />
              ) : null}
            </div>
          </Card>

          <Card className=”bg-[color:var(--surface-console)]”>
            <AdminEyebrow>运营建议</AdminEyebrow>
            <div className=”mt-4 space-y-3”>
              <AdminHintCard title=”新角色创建” />
              <AdminHintCard title=”预设注入” />
              <AdminHintCard title=”角色制造” />
              <AdminHintCard title=”运行排查” />
            </div>
          </Card>
        </div>
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
    case "self":
      return "自己";
    default:
      return type;
  }
}

function formatCharacterSourceType(sourceType?: Character["sourceType"]) {
  switch (sourceType) {
    case "default_seed":
      return "默认保底";
    case "preset_catalog":
      return "名人预设";
    case "manual_admin":
      return "后台手工";
    default:
      return "后台手工";
  }
}

function formatDeletionPolicy(policy?: Character["deletionPolicy"]) {
  switch (policy) {
    case "protected":
      return "受保护";
    case "archive_allowed":
      return "允许删除";
    default:
      return "允许删除";
  }
}

function isProtectedCharacter(character: Character) {
  return character.deletionPolicy === "protected" || character.sourceType === "default_seed";
}

function formatActivity(activity: Character["currentActivity"]) {
  switch (activity) {
    case "free":
      return "空闲";
    case "working":
      return "工作中";
    case "eating":
      return "吃饭中";
    case "resting":
      return "休息中";
    case "commuting":
      return "通勤中";
    case "sleeping":
      return "睡觉中";
    default:
      return "未设置";
  }
}

function CharacterAvatar({ name, src }: { name: string; src?: string | null }) {
  if (src?.trim()) {
    return <img src={src} alt={name} className="h-16 w-16 rounded-full object-cover" />;
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-2xl text-[color:var(--text-primary)]">
      {name.slice(0, 1)}
    </div>
  );
}
