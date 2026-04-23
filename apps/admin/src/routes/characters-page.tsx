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
  StatusPill,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminDangerZone,
  AdminEmptyState,
  AdminPageHero,
  AdminPillSelectField,
  AdminPillTextField,
  AdminRecordCard,
  AdminSelectableCard,
  AdminSectionHeader,
  AdminSoftBox,
  AdminTabs,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import {
  compareAdminText,
  formatAdminDateTime as formatLocalizedDateTime,
} from "../lib/format";

type WorkspaceTab = "overview" | "registry";
type FriendFilter = "all" | "friend" | "world";
type StatusFilter = "all" | "online" | "offline";

type CharacterSummary = {
  totalCount: number;
  friendCount: number;
  worldCount: number;
  onlineCount: number;
  offlineCount: number;
  manualManagedCount: number;
  overrideRoutingCount: number;
  incompleteProfileCount: number;
  wechatImportedCount: number;
  recentActiveCount: number;
  relationshipBreakdown: Array<{ label: string; count: number }>;
  sourceBreakdown: Array<{ label: string; count: number }>;
};

const WORKSPACE_TABS: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "overview", label: "运营总览" },
  { key: "registry", label: "角色名册" },
];

export function CharactersPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [relationshipFilter, setRelationshipFilter] = useState<
    Character["relationshipType"] | "all"
  >("all");
  const [friendFilter, setFriendFilter] = useState<FriendFilter>("all");
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
        queryClient.invalidateQueries({
          queryKey: ["admin-characters-crud", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-characters", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-system-status", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-character-friend-ids", baseUrl],
        }),
      ]);
    },
  });

  const deletingCharacterId = deleteMutation.isPending
    ? deleteMutation.variables
    : null;
  const resetDeleteMutation = useEffectEvent(() => {
    deleteMutation.reset();
  });

  useEffect(() => {
    resetDeleteMutation();
  }, [baseUrl, resetDeleteMutation]);

  const friendIds = useMemo(
    () => new Set(friendIdsQuery.data ?? []),
    [friendIdsQuery.data],
  );
  const characters = charactersQuery.data ?? [];

  const sortedCharacters = useMemo(
    () =>
      [...characters].sort((left, right) =>
        compareCharactersForOps(left, right, friendIds),
      ),
    [characters, friendIds],
  );

  const filteredCharacters = useMemo(
    () =>
      sortedCharacters.filter((character) => {
        const normalizedName = character.name.toLowerCase();
        const normalizedRelationship = character.relationship.toLowerCase();
        const normalizedBio = character.bio.toLowerCase();
        const matchesSearch =
          !deferredSearch ||
          normalizedName.includes(deferredSearch) ||
          normalizedRelationship.includes(deferredSearch) ||
          normalizedBio.includes(deferredSearch) ||
          character.expertDomains.some((domain) =>
            domain.toLowerCase().includes(deferredSearch),
          );
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "online"
            ? character.isOnline
            : !character.isOnline);
        const matchesRelationship =
          relationshipFilter === "all" ||
          character.relationshipType === relationshipFilter;
        const isFriend = friendIds.has(character.id);
        const matchesFriend =
          friendFilter === "all" ||
          (friendFilter === "friend" ? isFriend : !isFriend);
        return (
          matchesSearch &&
          matchesStatus &&
          matchesRelationship &&
          matchesFriend
        );
      }),
    [
      deferredSearch,
      friendFilter,
      friendIds,
      relationshipFilter,
      sortedCharacters,
      statusFilter,
    ],
  );

  useEffect(() => {
    if (!filteredCharacters.length) {
      if (selectedCharacterId) {
        setSelectedCharacterId("");
      }
      return;
    }

    if (
      !selectedCharacterId ||
      !filteredCharacters.some(
        (character) => character.id === selectedCharacterId,
      )
    ) {
      setSelectedCharacterId(filteredCharacters[0].id);
    }
  }, [filteredCharacters, selectedCharacterId]);

  const selectedCharacter = useMemo(
    () =>
      filteredCharacters.find((character) => character.id === selectedCharacterId) ??
      filteredCharacters[0] ??
      null,
    [filteredCharacters, selectedCharacterId],
  );

  const summary = useMemo(
    () => buildCharacterSummary(sortedCharacters, friendIds),
    [friendIds, sortedCharacters],
  );

  const attentionCharacters = useMemo(
    () =>
      sortedCharacters
        .map((character) => ({
          character,
          reasons: resolveCharacterAttentionReasons(
            character,
            friendIds.has(character.id),
          ),
        }))
        .filter((item) => item.reasons.length > 0)
        .slice(0, 4),
    [friendIds, sortedCharacters],
  );

  const hasActiveFilters =
    Boolean(search.trim()) ||
    statusFilter !== "all" ||
    relationshipFilter !== "all" ||
    friendFilter !== "all";

  const activeFilterLabels = useMemo(() => {
    const labels = [`当前结果 ${filteredCharacters.length} 个`];
    if (search.trim()) {
      labels.push(`关键词：${search.trim()}`);
    }
    if (friendFilter !== "all") {
      labels.push(friendFilter === "friend" ? "仅好友角色" : "仅世界角色");
    }
    if (statusFilter !== "all") {
      labels.push(statusFilter === "online" ? "仅在线" : "仅离线");
    }
    if (relationshipFilter !== "all") {
      labels.push(`关系：${formatRelationshipType(relationshipFilter)}`);
    }
    if (selectedCharacter) {
      labels.push(`当前选中：${selectedCharacter.name}`);
    }
    return labels;
  }, [
    filteredCharacters.length,
    friendFilter,
    relationshipFilter,
    search,
    selectedCharacter,
    statusFilter,
  ]);

  const leadTone = resolveLeadTone(summary);
  const leadTitle = resolveLeadTitle(summary);
  const leadDescription = resolveLeadDescription(summary, filteredCharacters.length);
  const emptyWorld =
    !charactersQuery.isLoading &&
    !charactersQuery.isError &&
    characters.length === 0;

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setRelationshipFilter("all");
    setFriendFilter("all");
  }

  function openCharacterInRegistry(characterId: string) {
    setSelectedCharacterId(characterId);
    setWorkspaceTab("registry");
  }

  return (
    <div className="space-y-6">
      {charactersQuery.isLoading ? (
        <LoadingBlock label="正在加载角色中心..." />
      ) : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? (
        <ErrorBlock message={charactersQuery.error.message} />
      ) : null}
      {friendIdsQuery.isError && friendIdsQuery.error instanceof Error ? (
        <ErrorBlock message={friendIdsQuery.error.message} />
      ) : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? (
        <ErrorBlock message={deleteMutation.error.message} />
      ) : null}

      <AdminPageHero
        eyebrow="角色中心"
        title="角色运营工作台"
        description="先看角色池结构和运营焦点，再进入单角色工作区做编辑、运行排查和工厂操作。"
        badges={[
          "角色名册",
          "运行状态抽查",
          "画像维护与工厂跳转",
        ]}
        actions={
          <>
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary" size="lg">
                新建角色
              </Button>
            </Link>
            <Link to="/characters/wechat-sync">
              <Button variant="secondary" size="lg">
                一键同步微信朋友
              </Button>
            </Link>
          </>
        }
        metrics={[
          { label: "角色总数", value: summary.totalCount },
          { label: "好友角色", value: summary.friendCount },
          { label: "当前在线", value: summary.onlineCount },
          { label: "独立模型路由", value: summary.overrideRoutingCount },
        ]}
      />

      <AdminCallout
        title={leadTitle}
        description={leadDescription}
        tone={leadTone}
        actions={
          emptyWorld ? (
            <>
              <Link to="/characters/$characterId" params={{ characterId: "new" }}>
                <Button variant="primary">新建第一个角色</Button>
              </Link>
              <Link to="/characters/wechat-sync">
                <Button variant="secondary">先从微信导入</Button>
              </Link>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setWorkspaceTab("registry")}
              >
                打开角色名册
              </Button>
              {selectedCharacter ? (
                <Button
                  variant="primary"
                  onClick={() => openCharacterInRegistry(selectedCharacter.id)}
                >
                  查看当前选中角色
                </Button>
              ) : null}
            </>
          )
        }
      />

      <AdminTabs
        tabs={WORKSPACE_TABS}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
      />

      {workspaceTab === "overview" ? (
        emptyWorld ? (
          <AdminEmptyState
            title="当前世界还没有角色名册"
            description="先创建第一个角色，或者从微信朋友同步一批角色，再回来查看结构和运营摘要。"
            actions={
              <>
                <Link to="/characters/$characterId" params={{ characterId: "new" }}>
                  <Button variant="primary">新建角色</Button>
                </Link>
                <Link to="/characters/wechat-sync">
                  <Button variant="secondary">同步微信朋友</Button>
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="角色池结构"
                  actions={
                    <StatusPill tone={summary.onlineCount > 0 ? "healthy" : "muted"}>
                      在线 {summary.onlineCount} / {summary.totalCount}
                    </StatusPill>
                  }
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <MetricCard label="世界角色" value={summary.worldCount} />
                  <MetricCard label="离线角色" value={summary.offlineCount} />
                  <MetricCard label="手动托管" value={summary.manualManagedCount} />
                  <MetricCard label="资料待补齐" value={summary.incompleteProfileCount} />
                  <MetricCard label="微信导入" value={summary.wechatImportedCount} />
                  <MetricCard label="近 7 天活跃" value={summary.recentActiveCount} />
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title="关系分布" />
                  <div className="mt-4 grid gap-3">
                    {summary.relationshipBreakdown.map((item) => (
                      <AdminValueCard
                        key={item.label}
                        label={item.label}
                        value={`${item.count} 个角色`}
                      />
                    ))}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title="来源分布" />
                  <div className="mt-4 grid gap-3">
                    {summary.sourceBreakdown.map((item) => (
                      <AdminValueCard
                        key={item.label}
                        label={item.label}
                        value={`${item.count} 个角色`}
                      />
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title="运营动作" />
                <div className="mt-4 space-y-3">
                  <Link to="/characters/$characterId" params={{ characterId: "new" }}>
                    <Button variant="primary" className="w-full justify-center">
                      新建角色
                    </Button>
                  </Link>
                  <Link to="/characters/wechat-sync">
                    <Button variant="secondary" className="w-full justify-center">
                      打开微信朋友同步
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => setWorkspaceTab("registry")}
                  >
                    进入角色名册
                  </Button>
                </div>
                <AdminSoftBox className="mt-4 leading-6">
                  {resolveOpsSuggestion(summary)}
                </AdminSoftBox>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="优先关注角色"
                  actions={
                    <StatusPill tone={attentionCharacters.length ? "warning" : "healthy"}>
                      {attentionCharacters.length ? "有待处理项" : "状态稳定"}
                    </StatusPill>
                  }
                />
                <div className="mt-4 space-y-3">
                  {attentionCharacters.length ? (
                    attentionCharacters.map(({ character, reasons }) => (
                      <AdminRecordCard
                        key={character.id}
                        title={character.name}
                        badges={
                          <div className="flex flex-wrap gap-2">
                            <StatusPill tone={friendIds.has(character.id) ? "healthy" : "muted"}>
                              {friendIds.has(character.id) ? "好友" : "世界角色"}
                            </StatusPill>
                            <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                              {character.isOnline ? "在线" : "离线"}
                            </StatusPill>
                          </div>
                        }
                        meta={`${formatSourceType(character.sourceType)} · ${formatRelationshipType(character.relationshipType)}`}
                        description={reasons.join("；")}
                        actions={
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openCharacterInRegistry(character.id)}
                          >
                            定位到名册
                          </Button>
                        }
                      />
                    ))
                  ) : (
                    <AdminSoftBox>当前角色池没有明显的待处理角色，可继续扩充或抽查运行状态。</AdminSoftBox>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title="筛选工作台"
              actions={
                hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    重置筛选
                  </Button>
                ) : null
              }
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <AdminPillTextField
                value={search}
                onChange={setSearch}
                placeholder="搜索角色名、关系、领域或 bio"
                className="min-w-[220px] flex-1"
              />
              <AdminPillSelectField
                value={friendFilter}
                onChange={(value) => setFriendFilter(value as FriendFilter)}
                className="min-w-[120px]"
              >
                <option value="all">全部角色</option>
                <option value="friend">好友</option>
                <option value="world">世界角色</option>
              </AdminPillSelectField>
              <AdminPillSelectField
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                className="min-w-[120px]"
              >
                <option value="all">全部状态</option>
                <option value="online">在线</option>
                <option value="offline">离线</option>
              </AdminPillSelectField>
              <AdminPillSelectField
                value={relationshipFilter}
                onChange={(value) =>
                  setRelationshipFilter(
                    value as Character["relationshipType"] | "all",
                  )
                }
                className="min-w-[136px]"
              >
                <option value="all">全部关系</option>
                <option value="self">自己</option>
                <option value="family">家人</option>
                <option value="friend">朋友</option>
                <option value="expert">专家</option>
                <option value="mentor">导师</option>
                <option value="custom">自定义</option>
              </AdminPillSelectField>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeFilterLabels.map((label) => (
                <StatusPill key={label} tone="muted">
                  {label}
                </StatusPill>
              ))}
            </div>
          </Card>

          {!filteredCharacters.length && !charactersQuery.isLoading ? (
            <AdminEmptyState
              title="当前筛选没有匹配角色"
              description="调整关键词或筛选条件后，再继续搜索。"
              actions={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    清空筛选
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title="角色名册"
                  actions={
                    <StatusPill tone={filteredCharacters.length ? "healthy" : "muted"}>
                      共 {filteredCharacters.length} 个结果
                    </StatusPill>
                  }
                />
                <div className="mt-4 space-y-3">
                  {filteredCharacters.map((character) => {
                    const isFriend = friendIds.has(character.id);
                    const attentionReasons = resolveCharacterAttentionReasons(
                      character,
                      isFriend,
                    );

                    return (
                      <AdminSelectableCard
                        key={character.id}
                        active={selectedCharacter?.id === character.id}
                        title={
                          <div className="flex items-center gap-3">
                            <CharacterAvatar
                              name={character.name}
                              src={character.avatar}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="truncate">{character.name}</div>
                              <div className="mt-1 truncate text-sm font-normal text-[color:var(--text-secondary)]">
                                {character.relationship || "未填写关系"}
                              </div>
                            </div>
                          </div>
                        }
                        subtitle={
                          <div className="flex flex-wrap gap-2">
                            <StatusPill tone={isFriend ? "healthy" : "muted"}>
                              {isFriend ? "好友" : "世界角色"}
                            </StatusPill>
                            <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                              {character.isOnline ? "在线" : "离线"}
                            </StatusPill>
                            {character.modelRoutingMode === "character_override" ? (
                              <StatusPill tone="warning">独立模型</StatusPill>
                            ) : null}
                            {isCharacterManualManaged(character) ? (
                              <StatusPill tone="warning">手动托管</StatusPill>
                            ) : null}
                          </div>
                        }
                        meta={
                          <div className="space-y-2">
                            <div className="text-xs leading-5 text-[color:var(--text-muted)]">
                              {formatSourceType(character.sourceType)} · 最近活跃{" "}
                              {formatDateTime(character.lastActiveAt)}
                            </div>
                            {character.expertDomains.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {character.expertDomains
                                  .slice(0, 4)
                                  .map((domain) => (
                                    <span
                                      key={`${character.id}-${domain}`}
                                      className="rounded-full border border-[color:var(--border-faint)] bg-white/80 px-2.5 py-0.5 text-xs text-[color:var(--text-muted)]"
                                    >
                                      {domain}
                                    </span>
                                  ))}
                                {character.expertDomains.length > 4 ? (
                                  <span className="text-xs text-[color:var(--text-muted)]">
                                    +{character.expertDomains.length - 4}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {attentionReasons.length ? (
                              <div className="text-xs leading-5 text-amber-700">
                                {attentionReasons.join("；")}
                              </div>
                            ) : null}
                          </div>
                        }
                        badge={
                          <StatusPill
                            tone={
                              selectedCharacter?.id === character.id
                                ? "healthy"
                                : "muted"
                            }
                          >
                            {selectedCharacter?.id === character.id
                              ? "当前查看"
                              : formatRelationshipType(character.relationshipType)}
                          </StatusPill>
                        }
                        onClick={() => setSelectedCharacterId(character.id)}
                      />
                    );
                  })}
                </div>
              </Card>

              {selectedCharacter ? (
                <div className="space-y-6">
                  <Card className="bg-[color:var(--surface-console)]">
                    <div className="flex items-start gap-4">
                      <CharacterAvatar
                        name={selectedCharacter.name}
                        src={selectedCharacter.avatar}
                        size="lg"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-[color:var(--text-primary)]">
                            {selectedCharacter.name}
                          </h3>
                          <StatusPill
                            tone={
                              friendIds.has(selectedCharacter.id)
                                ? "healthy"
                                : "muted"
                            }
                          >
                            {friendIds.has(selectedCharacter.id) ? "好友" : "世界角色"}
                          </StatusPill>
                          <StatusPill
                            tone={selectedCharacter.isOnline ? "healthy" : "muted"}
                          >
                            {selectedCharacter.isOnline ? "在线" : "离线"}
                          </StatusPill>
                        </div>
                        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                          {selectedCharacter.relationship || "未填写关系描述"}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {selectedCharacter.bio?.trim() || "当前还没有填写角色 bio。"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <AdminValueCard
                        label="关系类型"
                        value={formatRelationshipType(selectedCharacter.relationshipType)}
                      />
                      <AdminValueCard
                        label="来源"
                        value={formatSourceType(selectedCharacter.sourceType)}
                      />
                      <AdminValueCard
                        label="在线模式"
                        value={formatMode(selectedCharacter.onlineMode)}
                      />
                      <AdminValueCard
                        label="活动模式"
                        value={formatMode(selectedCharacter.activityMode)}
                      />
                      <AdminValueCard
                        label="当前活动"
                        value={selectedCharacter.currentActivity || "未设置"}
                      />
                      <AdminValueCard
                        label="最近活跃"
                        value={formatDateTime(selectedCharacter.lastActiveAt)}
                      />
                      <AdminValueCard
                        label="活跃时段"
                        value={formatActiveHours(selectedCharacter)}
                      />
                      <AdminValueCard
                        label="模型路由"
                        value={formatModelRoutingMode(selectedCharacter.modelRoutingMode)}
                      />
                    </div>

                    <AdminSoftBox className="mt-4 leading-6">
                      {resolveCharacterDetailHint(
                        selectedCharacter,
                        friendIds.has(selectedCharacter.id),
                      )}
                    </AdminSoftBox>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title="快捷操作" />
                    <div className="mt-4 space-y-3">
                      <Link
                        to="/characters/$characterId"
                        params={{ characterId: selectedCharacter.id }}
                      >
                        <Button variant="primary" className="w-full justify-center">
                          进入行为管理
                        </Button>
                      </Link>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Link
                          to="/characters/$characterId/runtime"
                          params={{ characterId: selectedCharacter.id }}
                        >
                          <Button
                            variant="secondary"
                            className="w-full justify-center"
                          >
                            打开运行台
                          </Button>
                        </Link>
                        <Link
                          to="/characters/$characterId/factory"
                          params={{ characterId: selectedCharacter.id }}
                        >
                          <Button
                            variant="secondary"
                            className="w-full justify-center"
                          >
                            打开角色工厂
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title="角色画像与路由摘要" />
                    <div className="mt-4 space-y-3">
                      <AdminValueCard
                        label="记忆摘要"
                        value={
                          selectedCharacter.profile.memorySummary?.trim() ||
                          "当前还没有记忆摘要。"
                        }
                      />
                      <AdminValueCard
                        label="领域标签"
                        value={
                          selectedCharacter.expertDomains.length
                            ? selectedCharacter.expertDomains.join("、")
                            : "当前未填写领域标签。"
                        }
                      />
                      <AdminValueCard
                        label="模型绑定"
                        value={formatCharacterModelBinding(selectedCharacter)}
                      />
                    </div>
                  </Card>

                  <AdminDangerZone
                    description={
                      isProtectedCharacter(selectedCharacter)
                        ? "默认保底角色不可删除。"
                        : "删除角色会移除关联的好友、会话、动态和蓝图数据。"
                    }
                  >
                    <Button
                      variant="danger"
                      className="w-full justify-center"
                      disabled={
                        deleteMutation.isPending ||
                        isProtectedCharacter(selectedCharacter)
                      }
                      onClick={() => deleteMutation.mutate(selectedCharacter.id)}
                    >
                      {isProtectedCharacter(selectedCharacter)
                        ? "默认角色受保护"
                        : deletingCharacterId === selectedCharacter.id
                          ? "删除中..."
                          : "删除当前角色"}
                    </Button>
                  </AdminDangerZone>
                </div>
              ) : (
                <AdminEmptyState
                  title="先从左侧选择一个角色"
                  description="选中角色后，这里会显示状态摘要、快捷操作和谨慎操作入口。"
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function buildCharacterSummary(
  characters: Character[],
  friendIds: Set<string>,
): CharacterSummary {
  const totalCount = characters.length;
  const friendCount = characters.filter((character) =>
    friendIds.has(character.id),
  ).length;
  const onlineCount = characters.filter((character) => character.isOnline).length;
  const manualManagedCount = characters.filter((character) =>
    isCharacterManualManaged(character),
  ).length;
  const overrideRoutingCount = characters.filter(
    (character) => character.modelRoutingMode === "character_override",
  ).length;
  const incompleteProfileCount = characters.filter((character) =>
    isCharacterProfileIncomplete(character),
  ).length;
  const wechatImportedCount = characters.filter(
    (character) => character.sourceType === "wechat_import",
  ).length;
  const recentActiveCount = characters.filter((character) =>
    wasRecentlyActive(character.lastActiveAt),
  ).length;

  return {
    totalCount,
    friendCount,
    worldCount: totalCount - friendCount,
    onlineCount,
    offlineCount: totalCount - onlineCount,
    manualManagedCount,
    overrideRoutingCount,
    incompleteProfileCount,
    wechatImportedCount,
    recentActiveCount,
    relationshipBreakdown: buildBreakdown(characters, (character) =>
      formatRelationshipType(character.relationshipType),
    ),
    sourceBreakdown: buildBreakdown(characters, (character) =>
      formatSourceType(character.sourceType),
    ),
  };
}

function buildBreakdown(
  characters: Character[],
  getLabel: (character: Character) => string,
) {
  const buckets = new Map<string, number>();
  characters.forEach((character) => {
    const label = getLabel(character);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  });
  return [...buckets.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) =>
      right.count !== left.count
        ? right.count - left.count
        : compareAdminText(left.label, right.label),
    );
}

function compareCharactersForOps(
  left: Character,
  right: Character,
  friendIds: Set<string>,
) {
  const onlineDelta = Number(right.isOnline) - Number(left.isOnline);
  if (onlineDelta !== 0) {
    return onlineDelta;
  }

  const friendDelta =
    Number(friendIds.has(right.id)) - Number(friendIds.has(left.id));
  if (friendDelta !== 0) {
    return friendDelta;
  }

  const attentionDelta =
    resolveCharacterAttentionReasons(right, friendIds.has(right.id)).length -
    resolveCharacterAttentionReasons(left, friendIds.has(left.id)).length;
  if (attentionDelta !== 0) {
    return attentionDelta;
  }

  const rightTime = resolveTimestamp(right.lastActiveAt);
  const leftTime = resolveTimestamp(left.lastActiveAt);
  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return compareAdminText(left.name, right.name);
}

function resolveLeadTone(summary: CharacterSummary) {
  if (summary.totalCount === 0 || summary.incompleteProfileCount > 0) {
    return "warning" as const;
  }
  if (summary.manualManagedCount > 0 || summary.overrideRoutingCount > 0) {
    return "info" as const;
  }
  return "success" as const;
}

function resolveLeadTitle(summary: CharacterSummary) {
  if (summary.totalCount === 0) {
    return "当前世界还没有角色名册";
  }
  if (summary.incompleteProfileCount > 0) {
    return `${summary.incompleteProfileCount} 个角色资料仍待补齐`;
  }
  if (summary.manualManagedCount > 0) {
    return `${summary.manualManagedCount} 个角色处于手动托管状态`;
  }
  if (summary.overrideRoutingCount > 0) {
    return `${summary.overrideRoutingCount} 个角色启用了独立模型路由`;
  }
  return "角色池结构稳定，可以继续扩充或抽查运行状态";
}

function resolveLeadDescription(
  summary: CharacterSummary,
  filteredCount: number,
) {
  if (summary.totalCount === 0) {
    return "先创建第一个角色，或者从微信朋友同步一批角色，再开始做角色运营。";
  }
  if (summary.incompleteProfileCount > 0) {
    return `建议优先补齐 bio、记忆摘要或领域标签，避免角色进入运行台后缺少稳定画像。当前筛选口径命中 ${filteredCount} 个角色。`;
  }
  if (summary.manualManagedCount > 0) {
    return `建议确认这些角色是否仍需人工锁定在线/活动模式，避免长期与调度器状态脱节。当前筛选口径命中 ${filteredCount} 个角色。`;
  }
  if (summary.overrideRoutingCount > 0) {
    return `建议继续抽查独立模型角色的路由绑定和备注，确保角色级覆盖仍然符合当前运营口径。当前筛选口径命中 ${filteredCount} 个角色。`;
  }
  return `当前角色池共 ${summary.totalCount} 个角色，其中 ${summary.friendCount} 个已成为好友，可直接进入名册抽查单角色状态。`;
}

function resolveOpsSuggestion(summary: CharacterSummary) {
  if (summary.totalCount === 0) {
    return "先建角色或导入微信朋友，让角色池形成基础规模。";
  }
  if (summary.incompleteProfileCount > 0) {
    return "优先去角色名册筛出资料未补齐的角色，先补画像，再继续做运行逻辑抽查。";
  }
  if (summary.manualManagedCount > 0) {
    return "优先检查手动托管角色，确认这些人工锁定是否还需要保留。";
  }
  if (summary.overrideRoutingCount > 0) {
    return "当前有独立模型角色，建议抽查其绑定模型与备注是否仍符合当前配置。";
  }
  return "当前结构比较稳定，可以继续扩充角色池，或抽查重点角色的运行台与工厂配置。";
}

function resolveCharacterDetailHint(character: Character, isFriend: boolean) {
  const reasons = resolveCharacterAttentionReasons(character, isFriend);
  if (!reasons.length) {
    return "这个角色当前没有明显待处理项，可以直接进入行为管理、运行台或角色工厂继续操作。";
  }
  return `当前建议：${reasons.join("；")}。`;
}

function resolveCharacterAttentionReasons(
  character: Character,
  isFriend: boolean,
) {
  const reasons: string[] = [];

  if (isCharacterProfileIncomplete(character)) {
    reasons.push("画像资料还不完整");
  }
  if (isCharacterManualManaged(character)) {
    reasons.push("在线/活动模式处于手动托管");
  }
  if (character.modelRoutingMode === "character_override") {
    reasons.push("使用独立模型路由");
  }
  if (!isFriend && character.sourceType !== "default_seed") {
    reasons.push("尚未成为好友");
  }

  return reasons;
}

function isCharacterProfileIncomplete(character: Character) {
  return (
    !character.bio?.trim() ||
    !character.profile.memorySummary?.trim() ||
    character.expertDomains.length === 0
  );
}

function isCharacterManualManaged(character: Character) {
  return (
    character.onlineMode === "manual" || character.activityMode === "manual"
  );
}

function wasRecentlyActive(value?: string | null) {
  const timestamp = resolveTimestamp(value);
  if (!timestamp) {
    return false;
  }
  return Date.now() - timestamp <= 7 * 24 * 60 * 60 * 1000;
}

function resolveTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatDateTime(value?: string | null) {
  return formatLocalizedDateTime(
    value,
    {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    },
    "none",
  );
}

function formatActiveHours(character: Character) {
  if (
    character.activeHoursStart == null ||
    character.activeHoursEnd == null
  ) {
    return "未设置";
  }
  return `${character.activeHoursStart}:00 - ${character.activeHoursEnd}:00`;
}

function formatMode(value?: "auto" | "manual") {
  if (value === "manual") {
    return "手动";
  }
  return "自动";
}

function formatModelRoutingMode(
  value?: "inherit_default" | "character_override",
) {
  return value === "character_override" ? "角色独立覆盖" : "继承全局默认";
}

function formatCharacterModelBinding(character: Character) {
  if (character.modelRoutingMode !== "character_override") {
    return "当前继承全局默认路由。";
  }

  const segments = [
    character.inferenceProviderAccountId
      ? `Provider ${character.inferenceProviderAccountId}`
      : "未绑定 Provider",
    character.inferenceModelId
      ? `模型 ${character.inferenceModelId}`
      : "未绑定模型 ID",
    character.allowOwnerKeyOverride ? "允许世界主人 Key 覆盖" : "不允许世界主人 Key 覆盖",
  ];

  if (character.modelRoutingNotes?.trim()) {
    segments.push(`备注：${character.modelRoutingNotes.trim()}`);
  }

  return segments.join("；");
}

function formatRelationshipType(value?: Character["relationshipType"]) {
  switch (value) {
    case "self":
      return "自己";
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
      return "未设置";
  }
}

function formatSourceType(value?: Character["sourceType"]) {
  switch (value) {
    case "default_seed":
      return "默认保底";
    case "preset_catalog":
      return "名人预设";
    case "manual_admin":
      return "后台手建";
    case "need_generated":
      return "需求生成";
    case "shake_generated":
      return "摇一摇生成";
    case "ai_generated":
      return "AI 生成";
    case "wechat_import":
      return "微信导入";
    case "model_persona":
      return "模型人格";
    default:
      return "未标记来源";
  }
}

function isProtectedCharacter(character: Character) {
  return (
    character.deletionPolicy === "protected" ||
    character.sourceType === "default_seed"
  );
}

function CharacterAvatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm"
      ? "h-11 w-11 text-base"
      : size === "lg"
        ? "h-16 w-16 text-2xl"
        : "h-12 w-12 text-xl";
  const trimmedSrc = src?.trim() ?? "";

  if (isLikelyAdminAvatarImageSource(trimmedSrc)) {
    return (
      <img
        src={resolveAdminAvatarSrc(trimmedSrc)}
        alt={name}
        className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-[color:var(--border-faint)]`}
      />
    );
  }

  const fallbackLabel = resolveAdminAvatarFallbackLabel(name, trimmedSrc);
  return (
    <div
      className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-[linear-gradient(160deg,rgba(255,247,237,0.98),rgba(255,255,255,0.92))] text-[color:var(--text-primary)] ring-1 ring-[color:var(--border-faint)]`}
    >
      {fallbackLabel}
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

function isLikelyAdminAvatarImageSource(value: string) {
  if (!value) {
    return false;
  }

  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value) ||
    /^data:image\//i.test(value) ||
    /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(value)
  );
}

function resolveAdminAvatarFallbackLabel(name: string, src: string) {
  const normalized = src.trim();
  if (!normalized) {
    return name.slice(0, 1);
  }

  if (normalized.length <= 4) {
    return normalized;
  }

  return name.slice(0, 1);
}
