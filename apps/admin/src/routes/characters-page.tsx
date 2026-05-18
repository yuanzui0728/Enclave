import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { listCharacters, type Character } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  MetricCard,
  StatusPill,
} from "@yinjie/ui";
import {
  AdminCallout,
  AdminDangerZone,
  AdminEmptyState,
  AdminErrorState,
  AdminPageHero,
  AdminPillSelectField,
  AdminPillTextField,
  AdminRecordCard,
  AdminSelectableCard,
  AdminSectionHeader,
  AdminSkeletonCard,
  AdminSoftBox,
  AdminTabs,
  AdminValueCard,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { CharactersWikiSyncSection } from "./characters-wiki-sync-section";
import {
  compareAdminText,
  formatAdminDateTime as formatLocalizedDateTime,
} from "../lib/format";

type WorkspaceTab = "overview" | "registry" | "wiki-sync";
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

const WORKSPACE_TAB_MESSAGES: Array<{ key: WorkspaceTab; label: ReturnType<typeof msg> }> = [
  { key: "overview", label: msg`运营总览` },
  { key: "registry", label: msg`角色名册` },
  { key: "wiki-sync", label: msg`Wiki 同步` },
];

export function CharactersPage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("overview");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
      setPendingDeleteId(null);
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
    setPendingDeleteId(null);
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

  useEffect(() => {
    if (pendingDeleteId && pendingDeleteId !== selectedCharacterId) {
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, selectedCharacterId]);

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
    const labels: string[] = [];
    if (search.trim()) {
      labels.push(t(msg`关键词：${search.trim()}`));
    }
    if (friendFilter !== "all") {
      labels.push(friendFilter === "friend" ? t(msg`仅好友角色`) : t(msg`仅世界角色`));
    }
    if (statusFilter !== "all") {
      labels.push(statusFilter === "online" ? t(msg`仅在线`) : t(msg`仅离线`));
    }
    if (relationshipFilter !== "all") {
      labels.push(t(msg`关系：${formatRelationshipType(relationshipFilter)}`));
    }
    return labels;
  }, [friendFilter, relationshipFilter, search, statusFilter]);

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
    setSearch("");
    setFriendFilter("all");
    setStatusFilter("all");
    setRelationshipFilter("all");
    setSelectedCharacterId(characterId);
    setWorkspaceTab("registry");
  }

  function jumpToRegistryWithFilter(filter: {
    friend?: FriendFilter;
    status?: StatusFilter;
    relationship?: Character["relationshipType"] | "all";
  }) {
    setSearch("");
    setFriendFilter(filter.friend ?? "all");
    setStatusFilter(filter.status ?? "all");
    setRelationshipFilter(filter.relationship ?? "all");
    setWorkspaceTab("registry");
  }

  return (
    <div className="space-y-6">
      {charactersQuery.isLoading ? (
        <AdminSkeletonCard rows={4} showAction />
      ) : null}
      {charactersQuery.isError && charactersQuery.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`角色名册加载失败`)}
          detail={charactersQuery.error.message}
          onRetry={() => charactersQuery.refetch()}
          retryLabel={t(msg`重新加载角色`)}
        />
      ) : null}
      {friendIdsQuery.isError && friendIdsQuery.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`朋友角色列表加载失败`)}
          detail={friendIdsQuery.error.message}
          onRetry={() => friendIdsQuery.refetch()}
          retryLabel={t(msg`重新加载好友标记`)}
        />
      ) : null}
      {deleteMutation.isError && deleteMutation.error instanceof Error ? (
        <AdminErrorState
          title={t(msg`删除角色失败`)}
          detail={deleteMutation.error.message}
          onRetry={() => deleteMutation.reset()}
          retryLabel={t(msg`清除错误`)}
        />
      ) : null}

      <AdminPageHero
        eyebrow={t(msg`角色中心`)}
        title={t(msg`角色运营工作台`)}
        description={t(msg`先看角色池结构和运营焦点，再进入单角色工作区做编辑、运行排查和工厂操作。`)}
        actions={
          <>
            <Link to="/characters/$characterId" params={{ characterId: "new" }}>
              <Button variant="primary" size="lg">
                {t(msg`新建角色`)}
              </Button>
            </Link>
            <Link to="/characters/wechat-sync">
              <Button variant="secondary" size="lg">
                {t(msg`一键同步微信朋友`)}
              </Button>
            </Link>
          </>
        }
        metrics={[
          { label: t(msg`角色总数`), value: summary.totalCount },
          { label: t(msg`好友角色`), value: summary.friendCount },
          { label: t(msg`当前在线`), value: summary.onlineCount },
          { label: t(msg`独立模型路由`), value: summary.overrideRoutingCount },
        ]}
      />

      <AdminTabs
        tabs={WORKSPACE_TAB_MESSAGES.map((tab) => ({ key: tab.key, label: t(tab.label) }))}
        activeKey={workspaceTab}
        onChange={(key) => setWorkspaceTab(key as WorkspaceTab)}
      />

      {workspaceTab === "overview" ? (
        emptyWorld ? (
          <AdminEmptyState
            title={t(msg`当前世界还没有角色名册`)}
            description={t(msg`先创建第一个角色，或者从微信朋友同步一批角色，再回来查看结构和运营摘要。`)}
            actions={
              <>
                <Link to="/characters/$characterId" params={{ characterId: "new" }}>
                  <Button variant="primary">{t(msg`新建角色`)}</Button>
                </Link>
                <Link to="/characters/wechat-sync">
                  <Button variant="secondary">{t(msg`同步微信朋友`)}</Button>
                </Link>
              </>
            }
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_360px]">
            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`优先关注角色`)}
                  actions={
                    <StatusPill tone={attentionCharacters.length ? "warning" : "healthy"}>
                      {attentionCharacters.length ? t(msg`有待处理项`) : t(msg`状态稳定`)}
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
                              {friendIds.has(character.id) ? t(msg`好友`) : t(msg`世界角色`)}
                            </StatusPill>
                            <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                              {character.isOnline ? t(msg`在线`) : t(msg`离线`)}
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
                            {t(msg`定位到名册`)}
                          </Button>
                        }
                      />
                    ))
                  ) : (
                    <AdminSoftBox>{t(msg`当前角色池没有明显的待处理角色，可继续扩充或抽查运行状态。`)}</AdminSoftBox>
                  )}
                </div>
              </Card>

              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`角色池结构`)}
                  actions={
                    <StatusPill tone={summary.onlineCount > 0 ? "healthy" : "muted"}>
                      {t(msg`在线 ${summary.onlineCount} / ${summary.totalCount}`)}
                    </StatusPill>
                  }
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    label={t(msg`世界角色`)}
                    value={summary.worldCount}
                    {...buildMetricJumpProps(() =>
                      jumpToRegistryWithFilter({ friend: "world" }),
                    )}
                  />
                  <MetricCard
                    label={t(msg`离线角色`)}
                    value={summary.offlineCount}
                    {...buildMetricJumpProps(() =>
                      jumpToRegistryWithFilter({ status: "offline" }),
                    )}
                  />
                  <MetricCard label={t(msg`手动托管`)} value={summary.manualManagedCount} />
                  <MetricCard label={t(msg`资料待补齐`)} value={summary.incompleteProfileCount} />
                  <MetricCard label={t(msg`联系人导入`)} value={summary.wechatImportedCount} />
                  <MetricCard label={t(msg`近 7 天活跃`)} value={summary.recentActiveCount} />
                </div>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title={t(msg`关系分布`)} />
                  <div className="mt-4 grid gap-3">
                    {summary.relationshipBreakdown.map((item) => (
                      <AdminValueCard
                        key={item.label}
                        label={item.label}
                        value={t(msg`${item.count} 个角色`)}
                      />
                    ))}
                  </div>
                </Card>

                <Card className="bg-[color:var(--surface-console)]">
                  <AdminSectionHeader title={t(msg`来源分布`)} />
                  <div className="mt-4 grid gap-3">
                    {summary.sourceBreakdown.map((item) => (
                      <AdminValueCard
                        key={item.label}
                        label={item.label}
                        value={t(msg`${item.count} 个角色`)}
                      />
                    ))}
                  </div>
                </Card>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader title={t(msg`下一步建议`)} />
                <div className="mt-4">
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    onClick={() => setWorkspaceTab("registry")}
                  >
                    {t(msg`进入角色名册`)}
                  </Button>
                </div>
                <AdminSoftBox className="mt-4 leading-6">
                  {resolveOpsSuggestion(summary)}
                </AdminSoftBox>
              </Card>
            </div>
          </div>
        )
      ) : workspaceTab === "wiki-sync" ? (
        <CharactersWikiSyncSection
          initialCharacterId={selectedCharacterId || undefined}
          onClearInitialCharacter={() => setSelectedCharacterId("")}
        />
      ) : (
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <AdminSectionHeader
              title={t(msg`筛选工作台`)}
              actions={
                hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    {t(msg`重置筛选`)}
                  </Button>
                ) : null
              }
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <AdminPillTextField
                value={search}
                onChange={setSearch}
                placeholder={t(msg`搜索角色名、关系、领域或 bio`)}
                className="min-w-[220px] flex-1"
              />
              <AdminPillSelectField
                value={friendFilter}
                onChange={(value) => setFriendFilter(value as FriendFilter)}
                className="min-w-[120px]"
              >
                <option value="all">{t(msg`全部角色`)}</option>
                <option value="friend">{t(msg`好友`)}</option>
                <option value="world">{t(msg`世界角色`)}</option>
              </AdminPillSelectField>
              <AdminPillSelectField
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                className="min-w-[120px]"
              >
                <option value="all">{t(msg`全部状态`)}</option>
                <option value="online">{t(msg`在线`)}</option>
                <option value="offline">{t(msg`离线`)}</option>
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
                <option value="all">{t(msg`全部关系`)}</option>
                <option value="self">{t(msg`自己`)}</option>
                <option value="family">{t(msg`家人`)}</option>
                <option value="friend">{t(msg`朋友`)}</option>
                <option value="expert">{t(msg`专家`)}</option>
                <option value="mentor">{t(msg`导师`)}</option>
                <option value="custom">{t(msg`自定义`)}</option>
              </AdminPillSelectField>
            </div>
            {activeFilterLabels.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {activeFilterLabels.map((label) => (
                  <StatusPill key={label} tone="muted">
                    {label}
                  </StatusPill>
                ))}
              </div>
            ) : null}
          </Card>

          {!filteredCharacters.length && !charactersQuery.isLoading ? (
            <AdminEmptyState
              title={t(msg`当前筛选没有匹配角色`)}
              description={t(msg`调整关键词或筛选条件后，再继续搜索。`)}
              actions={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={resetFilters}>
                    {t(msg`清空筛选`)}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
              <Card className="bg-[color:var(--surface-console)]">
                <AdminSectionHeader
                  title={t(msg`角色名册`)}
                  actions={
                    <StatusPill tone={filteredCharacters.length ? "healthy" : "muted"}>
                      {t(msg`共 ${filteredCharacters.length} 个结果`)}
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
                                {character.relationship || t(msg`未填写关系`)}
                              </div>
                            </div>
                          </div>
                        }
                        subtitle={
                          <div className="flex flex-wrap gap-2">
                            <StatusPill tone={isFriend ? "healthy" : "muted"}>
                              {isFriend ? t(msg`好友`) : t(msg`世界角色`)}
                            </StatusPill>
                            <StatusPill tone={character.isOnline ? "healthy" : "muted"}>
                              {character.isOnline ? t(msg`在线`) : t(msg`离线`)}
                            </StatusPill>
                            {character.modelRoutingMode === "character_override" ? (
                              <StatusPill tone="warning">{t(msg`独立模型`)}</StatusPill>
                            ) : null}
                            {isCharacterManualManaged(character) ? (
                              <StatusPill tone="warning">{t(msg`手动托管`)}</StatusPill>
                            ) : null}
                          </div>
                        }
                        meta={
                          <div className="space-y-2">
                            <div className="text-xs leading-5 text-[color:var(--text-muted)]">
                              {t(msg`${formatSourceType(character.sourceType)} · 最近活跃 ${formatDateTime(character.lastActiveAt)}`)}
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
                              ? t(msg`当前查看`)
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
                            {friendIds.has(selectedCharacter.id) ? t(msg`好友`) : t(msg`世界角色`)}
                          </StatusPill>
                          <StatusPill
                            tone={selectedCharacter.isOnline ? "healthy" : "muted"}
                          >
                            {selectedCharacter.isOnline ? t(msg`在线`) : t(msg`离线`)}
                          </StatusPill>
                        </div>
                        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                          {selectedCharacter.relationship || t(msg`未填写关系描述`)}
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[color:var(--text-secondary)]">
                          {selectedCharacter.bio?.trim() || t(msg`当前还没有填写角色 bio。`)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <AdminValueCard
                        label={t(msg`关系类型`)}
                        value={formatRelationshipType(selectedCharacter.relationshipType)}
                      />
                      <AdminValueCard
                        label={t(msg`来源`)}
                        value={formatSourceType(selectedCharacter.sourceType)}
                      />
                      <AdminValueCard
                        label={t(msg`在线模式`)}
                        value={formatMode(selectedCharacter.onlineMode)}
                      />
                      <AdminValueCard
                        label={t(msg`活动模式`)}
                        value={formatMode(selectedCharacter.activityMode)}
                      />
                      <AdminValueCard
                        label={t(msg`当前活动`)}
                        value={selectedCharacter.currentActivity || t(msg`未设置`)}
                      />
                      <AdminValueCard
                        label={t(msg`最近活跃`)}
                        value={formatDateTime(selectedCharacter.lastActiveAt)}
                      />
                      <AdminValueCard
                        label={t(msg`活跃时段`)}
                        value={formatActiveHours(selectedCharacter)}
                      />
                      <AdminValueCard
                        label={t(msg`模型路由`)}
                        value={formatModelRoutingMode(selectedCharacter.modelRoutingMode)}
                      />
                    </div>

                    <div className="mt-3 space-y-3">
                      <AdminValueCard
                        label={t(msg`记忆摘要`)}
                        value={
                          selectedCharacter.profile.memorySummary?.trim() ||
                          t(msg`当前还没有记忆摘要。`)
                        }
                      />
                      <AdminValueCard
                        label={t(msg`模型绑定`)}
                        value={formatCharacterModelBinding(selectedCharacter)}
                      />
                    </div>
                  </Card>

                  <Card className="bg-[color:var(--surface-console)]">
                    <AdminSectionHeader title={t(msg`快捷操作`)} />
                    <div className="mt-4 space-y-3">
                      <Link
                        to="/characters/$characterId"
                        params={{ characterId: selectedCharacter.id }}
                      >
                        <Button variant="primary" className="w-full justify-center">
                          {t(msg`进入行为管理`)}
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
                            {t(msg`打开运行台`)}
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
                            {t(msg`打开角色工厂`)}
                          </Button>
                        </Link>
                      </div>
                      <Button
                        variant="secondary"
                        className="w-full justify-center"
                        onClick={() => setWorkspaceTab("wiki-sync")}
                      >
                        {t(msg`从 Wiki 同步该角色`)}
                      </Button>
                    </div>
                  </Card>

                  <AdminDangerZone
                    description={
                      isProtectedCharacter(selectedCharacter)
                        ? t(msg`默认保底角色不可删除。`)
                        : t(msg`删除角色会移除关联的好友、会话、动态和蓝图数据。`)
                    }
                  >
                    {pendingDeleteId === selectedCharacter.id &&
                    !isProtectedCharacter(selectedCharacter) ? (
                      <AdminCallout
                        tone="warning"
                        title={t(msg`确认删除「${selectedCharacter.name}」？`)}
                        description={t(msg`此操作会级联清理该角色的会话、动态、Feed、好友关系、蓝图等数据，且不可撤销。`)}
                        actions={
                          <>
                            <Button
                              variant="danger"
                              onClick={() =>
                                deleteMutation.mutate(selectedCharacter.id)
                              }
                              disabled={deleteMutation.isPending}
                            >
                              {deletingCharacterId === selectedCharacter.id
                                ? t(msg`删除中...`)
                                : t(msg`确认删除`)}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setPendingDeleteId(null)}
                              disabled={deleteMutation.isPending}
                            >
                              {t(msg`取消`)}
                            </Button>
                          </>
                        }
                      />
                    ) : (
                      <Button
                        variant="danger"
                        className="w-full justify-center"
                        disabled={
                          deleteMutation.isPending ||
                          isProtectedCharacter(selectedCharacter)
                        }
                        onClick={() => setPendingDeleteId(selectedCharacter.id)}
                      >
                        {isProtectedCharacter(selectedCharacter)
                          ? t(msg`默认角色受保护`)
                          : t(msg`删除当前角色`)}
                      </Button>
                    )}
                  </AdminDangerZone>
                </div>
              ) : (
                <AdminEmptyState
                  title={t(msg`先从左侧选择一个角色`)}
                  description={t(msg`选中角色后，这里会显示状态摘要、快捷操作和谨慎操作入口。`)}
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

function resolveOpsSuggestion(summary: CharacterSummary) {
  const t = translateRuntimeMessage;
  if (summary.totalCount === 0) {
    return t(msg`先建角色或导入微信朋友，让角色池形成基础规模。`);
  }
  if (summary.incompleteProfileCount > 0) {
    return t(msg`优先去角色名册筛出资料未补齐的角色，先补画像，再继续做运行逻辑抽查。`);
  }
  if (summary.manualManagedCount > 0) {
    return t(msg`优先检查手动托管角色，确认这些人工锁定是否还需要保留。`);
  }
  if (summary.overrideRoutingCount > 0) {
    return t(msg`当前有独立模型角色，建议抽查其绑定模型与备注是否仍符合当前配置。`);
  }
  return t(msg`当前结构比较稳定，可以继续扩充角色池，或抽查重点角色的运行台与工厂配置。`);
}

function resolveCharacterAttentionReasons(
  character: Character,
  isFriend: boolean,
) {
  const t = translateRuntimeMessage;
  const reasons: string[] = [];

  if (isCharacterProfileIncomplete(character)) {
    reasons.push(t(msg`画像资料还不完整`));
  }
  if (isCharacterManualManaged(character)) {
    reasons.push(t(msg`在线/活动模式处于手动托管`));
  }
  if (character.modelRoutingMode === "character_override") {
    reasons.push(t(msg`使用独立模型路由`));
  }
  if (!isFriend && character.sourceType !== "default_seed") {
    reasons.push(t(msg`尚未成为好友`));
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
    return translateRuntimeMessage(msg`未设置`);
  }
  return `${character.activeHoursStart}:00 - ${character.activeHoursEnd}:00`;
}

function formatMode(value?: "auto" | "manual") {
  if (value === "manual") {
    return translateRuntimeMessage(msg`手动`);
  }
  return translateRuntimeMessage(msg`自动`);
}

function formatModelRoutingMode(
  value?: "inherit_default" | "character_override",
) {
  return value === "character_override"
    ? translateRuntimeMessage(msg`角色独立覆盖`)
    : translateRuntimeMessage(msg`继承全局默认`);
}

function formatCharacterModelBinding(character: Character) {
  const t = translateRuntimeMessage;
  if (character.modelRoutingMode !== "character_override") {
    return t(msg`当前继承全局默认路由。`);
  }

  const segments = [
    character.inferenceProviderAccountId
      ? `Provider ${character.inferenceProviderAccountId}`
      : t(msg`未绑定 Provider`),
    character.inferenceModelId
      ? t(msg`模型 ${character.inferenceModelId}`)
      : t(msg`未绑定模型 ID`),
    character.allowOwnerKeyOverride
      ? t(msg`允许世界主人 Key 覆盖`)
      : t(msg`不允许世界主人 Key 覆盖`),
  ];

  if (character.modelRoutingNotes?.trim()) {
    segments.push(t(msg`备注：${character.modelRoutingNotes.trim()}`));
  }

  return segments.join("；");
}

function formatRelationshipType(value?: Character["relationshipType"]) {
  switch (value) {
    case "self":
      return translateRuntimeMessage(msg`自己`);
    case "family":
      return translateRuntimeMessage(msg`家人`);
    case "friend":
      return translateRuntimeMessage(msg`朋友`);
    case "expert":
      return translateRuntimeMessage(msg`专家`);
    case "mentor":
      return translateRuntimeMessage(msg`导师`);
    case "custom":
      return translateRuntimeMessage(msg`自定义`);
    default:
      return translateRuntimeMessage(msg`未设置`);
  }
}

function formatSourceType(value?: Character["sourceType"]) {
  switch (value) {
    case "default_seed":
      return translateRuntimeMessage(msg`默认保底`);
    case "preset_catalog":
      return translateRuntimeMessage(msg`名人预设`);
    case "manual_admin":
      return translateRuntimeMessage(msg`后台手建`);
    case "need_generated":
      return translateRuntimeMessage(msg`需求生成`);
    case "shake_generated":
      return translateRuntimeMessage(msg`摇一摇生成`);
    case "ai_generated":
      return translateRuntimeMessage(msg`AI 生成`);
    case "wechat_import":
      return translateRuntimeMessage(msg`联系人导入`);
    case "model_persona":
      return translateRuntimeMessage(msg`模型人格`);
    default:
      return translateRuntimeMessage(msg`未标记来源`);
  }
}

function buildMetricJumpProps(onJump: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onJump,
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onJump();
      }
    },
    className:
      "cursor-pointer transition hover:border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-card-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--brand-primary)]",
  };
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
