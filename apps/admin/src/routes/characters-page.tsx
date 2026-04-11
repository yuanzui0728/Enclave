import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { deleteCharacter, getSystemStatus, listCharacters, type Character } from "@yinjie/contracts";
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
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

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
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const charactersQuery = useQuery({
    queryKey: ["admin-characters-crud", baseUrl],
    queryFn: () => listCharacters(baseUrl),
  });
  const systemStatusQuery = useQuery({
    queryKey: ["admin-characters-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });
  const digitalHumanSummary = buildDigitalHumanAdminSummary(
    systemStatusQuery.data?.digitalHumanGateway,
  );

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
      return matchesSearch && matchesStatus && matchesRelationship;
    });
  }, [charactersQuery.data, deferredSearch, relationshipFilter, statusFilter]);

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
      <AdminCallout
        title="角色运营路径"
        description="先筛角色，再在中间看摘要，右侧直接进入编辑、工厂和运行逻辑台。"
        tone="muted"
      />
      <AdminCallout
        title={
          digitalHumanSummary.ready
            ? "数字人链路已进入可联调状态"
            : `数字人当前阻塞：${digitalHumanSummary.statusLabel}`
        }
        description={`${digitalHumanSummary.description} ${digitalHumanSummary.nextStep}`}
        tone={digitalHumanSummary.ready ? "success" : "warning"}
        actions={
          digitalHumanSummary.ready ? null : (
            <Link to="/setup">
              <Button variant="secondary">前往设置页补齐配置</Button>
            </Link>
          )
        }
      />

      {charactersQuery.isLoading ? <LoadingBlock label="正在加载角色名册..." /> : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? <ErrorBlock message={charactersQuery.error.message} /> : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? <ErrorBlock message={deleteMutation.error.message} /> : null}

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

          <div className="mt-4 space-y-3">
            <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索角色、关系或擅长领域" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <SelectField value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "online" | "offline")}>
                <option value="all">全部状态</option>
                <option value="online">仅看在线</option>
                <option value="offline">仅看离线</option>
              </SelectField>
              <SelectField
                value={relationshipFilter}
                onChange={(event) => setRelationshipFilter(event.target.value as Character["relationshipType"] | "all")}
              >
                <option value="all">全部关系类型</option>
                <option value="family">家人</option>
                <option value="friend">朋友</option>
                <option value="expert">专家</option>
                <option value="mentor">导师</option>
                <option value="custom">自定义</option>
              </SelectField>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {filteredCharacters.map((character) => (
              <button
                key={character.id}
                type="button"
                onClick={() => setSelectedCharacterId(character.id)}
                className={
                  character.id === selectedCharacterId
                    ? "block w-full rounded-[20px] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] px-4 py-3.5 text-left shadow-[var(--shadow-soft)] ring-1 ring-[color:var(--brand-primary)]/15"
                    : "block w-full rounded-[20px] border border-transparent bg-[color:var(--surface-card)] px-4 py-3.5 text-left shadow-[var(--shadow-soft)] transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)]"
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[color:var(--text-primary)]">{character.name}</div>
                    <div className="mt-1 truncate text-sm text-[color:var(--text-secondary)]">{character.relationship}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[color:var(--text-muted)]">
                      <span>{formatRelationshipType(character.relationshipType)}</span>
                      <span>领域 {character.expertDomains.length}</span>
                      <span>场景 {character.triggerScenes?.length ?? 0}</span>
                    </div>
                  </div>
                  <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                    {character.isOnline ? "在线" : "离线"}
                  </StatusPill>
                </div>
              </button>
            ))}

            {!filteredCharacters.length && !charactersQuery.isLoading ? (
              <AdminEmptyState
                title="当前筛选没有匹配角色"
                description="调整关键词、在线状态或关系类型后，再继续筛选。"
              />
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
                    <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">
                      {selectedCharacter.bio || "这个角色还没有填写简介，建议先补齐基本定位和使用场景。"}
                    </p>
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
              description="选中后就能查看角色摘要，并直接进入编辑、工厂和运行逻辑台。"
            />
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminEyebrow>快捷动作</AdminEyebrow>
            {selectedCharacter ? (
              <div className="mt-4 space-y-4">
                <AdminActionGroup
                  title="首选动作"
                  description="优先维护角色资料，确保关系、提示词和基础设定处于可运营状态。"
                >
                  <Link to="/characters/$characterId" params={{ characterId: selectedCharacter.id }}>
                    <Button variant="primary" size="lg" className="w-full justify-center">编辑基础资料</Button>
                  </Link>
                </AdminActionGroup>

                <AdminActionGroup
                  title="更多入口"
                  description="需要排查制造链路或运行状态时，再进入下面两个工作区。"
                >
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
                  description="删除角色会直接移除这个运营对象。确认不再需要后再执行。"
                >
                  <Button
                    onClick={() => deleteMutation.mutate(selectedCharacter.id)}
                    disabled={deleteMutation.isPending}
                    variant="danger"
                    size="lg"
                    className="w-full justify-center"
                  >
                    {deletingCharacterId === selectedCharacter.id ? "删除中..." : "删除角色"}
                  </Button>
                </AdminDangerZone>
              </div>
            ) : (
              <div className="mt-4 text-sm text-[color:var(--text-secondary)]">当前没有可操作角色。</div>
            )}
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <AdminEyebrow>运营建议</AdminEyebrow>
            <div className="mt-4 space-y-3">
              <AdminHintCard title="新角色创建" detail="先补齐关系、擅长领域和触发场景，再进入编辑页完善提示词和记忆。" />
              <AdminHintCard title="角色制造" detail="需要大改人格、口头禅或长期设定时，优先进入工厂页维护配方。" />
              <AdminHintCard title="运行排查" detail="角色回复异常或活动状态不对时，直接进入运行逻辑台看在线模式、活动和最近执行。" />
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
    default:
      return type;
  }
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
