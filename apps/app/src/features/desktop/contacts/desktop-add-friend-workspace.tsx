import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CheckCircle2,
  QrCode,
  Search,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import {
  getBlockedCharacters,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
  listCharacters,
  sendFriendRequest,
  type Character,
  type FriendListItem,
  type FriendRequest,
} from "@yinjie/contracts";
import {
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { DesktopUtilityShell } from "../desktop-utility-shell";
import { useDesktopLayout } from "../../shell/use-desktop-layout";
import {
  buildDesktopAddFriendRouteHash,
  parseDesktopAddFriendRouteState,
} from "./desktop-add-friend-route-state";
import {
  DesktopAddFriendResultCard,
  type DesktopAddFriendRelationshipState,
} from "./desktop-add-friend-result-card";
import { DesktopAddFriendSendDialog } from "./desktop-add-friend-send-dialog";

type SearchResultItem = {
  character: Character;
  identifier: string;
  friendship?: FriendListItem["friendship"] | null;
  matchReason: string;
  pendingRequest?: FriendRequest | null;
  score: number;
  status: DesktopAddFriendRelationshipState;
};

export function DesktopAddFriendWorkspace() {
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = parseDesktopAddFriendRouteState(hash);
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerId = useWorldOwnerStore((state) => state.id);
  const ownerSignature = useWorldOwnerStore((state) => state.signature);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchText, setSearchText] = useState(routeState.keyword);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "info" | "success";
  } | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );
  const [sendDialogCharacterId, setSendDialogCharacterId] = useState<
    string | null
  >(null);

  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 30_000,
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: isDesktopLayout,
    staleTime: 15_000,
  });

  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
    enabled: isDesktopLayout,
  });

  const blockedQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    enabled: isDesktopLayout,
  });

  const openChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
      });
    },
  });

  const sendRequestMutation = useMutation({
    mutationFn: async ({
      characterId,
      greeting,
    }: {
      characterId: string;
      greeting: string;
    }) => sendFriendRequest({ characterId, greeting }, baseUrl),
    onSuccess: async (_, variables) => {
      setNotice({
        tone: "success",
        message: "好友申请已发送。",
      });
      setSendDialogCharacterId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-friends", baseUrl],
        }),
      ]);
      setSelectedCharacterId(variables.characterId);
    },
  });

  useEffect(() => {
    if (searchText !== routeState.keyword) {
      setSearchText(routeState.keyword);
    }
  }, [routeState.keyword, searchText]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const friendshipMap = useMemo(
    () =>
      new Map(
        (friendsQuery.data ?? []).map((item) => [item.character.id, item.friendship]),
      ),
    [friendsQuery.data],
  );
  const pendingRequestMap = useMemo(() => {
    const map = new Map<string, FriendRequest>();
    for (const request of friendRequestsQuery.data ?? []) {
      if (request.status === "pending") {
        map.set(request.characterId, request);
      }
    }
    return map;
  }, [friendRequestsQuery.data]);
  const blockedCharacterIds = useMemo(
    () => new Set((blockedQuery.data ?? []).map((item) => item.characterId)),
    [blockedQuery.data],
  );

  const submittedKeyword = routeState.keyword.trim();
  const normalizedKeyword = submittedKeyword.toLowerCase();
  const searchResults = useMemo(
    () =>
      buildSearchResults(
        charactersQuery.data ?? [],
        normalizedKeyword,
        friendshipMap,
        pendingRequestMap,
        blockedCharacterIds,
      ),
    [
      blockedCharacterIds,
      charactersQuery.data,
      friendshipMap,
      normalizedKeyword,
      pendingRequestMap,
    ],
  );
  const selectedResult = useMemo(
    () => {
      const matchedResult = searchResults.find(
        (item) => item.character.id === selectedCharacterId,
      );
      return matchedResult ?? searchResults[0] ?? null;
    },
    [searchResults, selectedCharacterId],
  );
  const sendDialogCharacter = useMemo(
    () => {
      const matchedResult = searchResults.find(
        (item) => item.character.id === sendDialogCharacterId,
      );
      return matchedResult?.character ?? null;
    },
    [searchResults, sendDialogCharacterId],
  );
  const sendDialogIdentifier = sendDialogCharacter
    ? buildCharacterIdentifier(sendDialogCharacter.id)
    : "";
  const pendingRequestCount = pendingRequestMap.size;
  const hasSearched = submittedKeyword.length > 0;
  const loading =
    charactersQuery.isLoading ||
    friendsQuery.isLoading ||
    friendRequestsQuery.isLoading ||
    blockedQuery.isLoading;
  const loadingError =
    (charactersQuery.error instanceof Error && charactersQuery.error) ||
    (friendsQuery.error instanceof Error && friendsQuery.error) ||
    (friendRequestsQuery.error instanceof Error && friendRequestsQuery.error) ||
    (blockedQuery.error instanceof Error && blockedQuery.error) ||
    null;

  useEffect(() => {
    if (!searchResults.length) {
      setSelectedCharacterId(null);
      return;
    }

    if (
      selectedCharacterId &&
      searchResults.some((item) => item.character.id === selectedCharacterId)
    ) {
      return;
    }

    const firstResult = searchResults[0];
    if (!firstResult) {
      setSelectedCharacterId(null);
      return;
    }

    setSelectedCharacterId(firstResult.character.id);
  }, [searchResults, selectedCharacterId]);

  if (!isDesktopLayout) {
    return null;
  }

  return (
    <DesktopUtilityShell
      title="添加朋友"
      subtitle={
        hasSearched
          ? `当前搜索“${submittedKeyword}”，命中 ${searchResults.length} 个候选角色`
          : "通过隐界号或角色名搜索世界角色，并发送好友申请。"
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <UserPlus size={16} className="text-[#07c160]" />
              <span>好友入口</span>
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              保持微信电脑版的主流程：搜索、看资料、发验证。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[14px] border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.08)] px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  添加朋友
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  搜索隐界号、角色名或资料关键词
                </div>
              </div>
              <span className="rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-[#15803d]">
                当前
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                void navigate({ to: "/friend-requests" });
              }}
              className="mt-2 flex w-full items-center justify-between rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-3 text-left transition hover:bg-[color:var(--surface-console)]"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  新的朋友
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  查看好友申请和通过记录
                </div>
              </div>
              <span className="rounded-full bg-[rgba(239,68,68,0.08)] px-2 py-0.5 text-[11px] text-[#b91c1c]">
                {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
              </span>
            </button>

            <div className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-4">
              <div className="text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                添加提示
              </div>
              <div className="mt-3 space-y-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5">
                  优先按隐界号精确搜索，能最快命中目标角色。
                </div>
                <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5">
                  发送验证后，不会立刻成为好友；需要对方通过。
                </div>
                <div className="rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5">
                  已在通讯录中的角色会直接显示“发消息”。
                </div>
              </div>
            </div>
          </div>
        </div>
      }
      aside={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
              <QrCode size={16} className="text-[#15803d]" />
              <span>我的名片</span>
            </div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">
              先确认自己的隐界号，方便在桌面端互相添加。
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
              <div className="flex items-center gap-3">
                <AvatarChip name={ownerName} src={ownerAvatar} size="wechat" />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-medium text-[color:var(--text-primary)]">
                    {ownerName}
                  </div>
                  <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                    {ownerId ? buildCharacterIdentifier(ownerId) : "隐界号待生成"}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-[18px] bg-[linear-gradient(180deg,rgba(248,250,250,0.96),rgba(241,245,249,0.92))] p-4">
                <FakeQrPanel />
              </div>
              <div className="mt-4 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                {ownerSignature?.trim() || "把自己的世界展示给别人，也可以通过隐界号被快速搜索到。"}
              </div>
            </div>

            <div className="mt-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-4">
              <div className="text-xs font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                当前状态
              </div>
              <div className="mt-3 space-y-2">
                <StatusMetaRow
                  icon={Sparkles}
                  label="待处理好友申请"
                  value={`${pendingRequestCount}`}
                />
                <StatusMetaRow
                  icon={CheckCircle2}
                  label="已在通讯录"
                  value={`${friendsQuery.data?.length ?? 0}`}
                />
                <StatusMetaRow
                  icon={Users}
                  label="可搜索角色"
                  value={`${charactersQuery.data?.length ?? 0}`}
                />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <div className="h-full px-6 py-6">
        <form
          className="rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,250,0.88))] p-5 shadow-[var(--shadow-soft)]"
          onSubmit={(event) => {
            event.preventDefault();
            const nextKeyword = searchText.trim();
            void navigate({
              to: "/desktop/add-friend",
              hash: buildDesktopAddFriendRouteHash({
                keyword: nextKeyword,
              }),
              replace: true,
            });
          }}
        >
          <div className="flex items-center gap-3">
            <label className="flex min-w-0 flex-1 items-center gap-3 rounded-[18px] border border-[color:var(--border-faint)] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <Search size={18} className="shrink-0 text-[color:var(--text-dim)]" />
              <input
                ref={inputRef}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="输入隐界号、角色名、签名或资料关键词"
                className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="rounded-[16px] bg-[#07c160] px-7 text-white shadow-none hover:bg-[#06ad56]"
            >
              搜索
            </Button>
            {searchText || submittedKeyword ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => {
                  setSearchText("");
                  void navigate({
                    to: "/desktop/add-friend",
                    hash: undefined,
                    replace: true,
                  });
                }}
                className="rounded-[16px] border-[color:var(--border-faint)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
              >
                清空
              </Button>
            ) : null}
          </div>
          <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
            可搜索示例：`yinjie_1234abcd`、角色名、角色简介里的关键词。
          </div>
        </form>

        {notice ? (
          <div className="mt-4">
            <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
          </div>
        ) : null}
        {sendRequestMutation.isError &&
        sendRequestMutation.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={sendRequestMutation.error.message} />
          </div>
        ) : null}
        {openChatMutation.isError && openChatMutation.error instanceof Error ? (
          <div className="mt-4">
            <ErrorBlock message={openChatMutation.error.message} />
          </div>
        ) : null}

        <div className="mt-5 h-[calc(100%-124px)] min-h-[420px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.72)]">
          {loading ? (
            <div className="flex h-full items-center justify-center px-6">
              <LoadingBlock label="正在准备好友搜索目录..." />
            </div>
          ) : loadingError ? (
            <div className="px-6 py-6">
              <ErrorBlock message={loadingError.message} />
            </div>
          ) : !hasSearched ? (
            <div className="flex h-full items-center justify-center px-6">
              <EmptyState
                title="搜索朋友"
                description="在上方输入隐界号或角色名，找到目标后可直接发送好友申请。"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => inputRef.current?.focus()}
                  >
                    开始搜索
                  </Button>
                }
              />
            </div>
          ) : !searchResults.length ? (
            <div className="flex h-full items-center justify-center px-6">
              <EmptyState
                title="没有找到匹配结果"
                description="试试输入更完整的隐界号，或换一个角色名/资料关键词。"
                action={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearchText("");
                      inputRef.current?.focus();
                    }}
                  >
                    重新输入
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid h-full min-h-0 xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="border-b border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.84)] xl:border-b-0 xl:border-r">
                <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
                  <div className="text-sm font-medium text-[color:var(--text-primary)]">
                    搜索结果
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                    优先显示最接近当前关键词的角色。
                  </div>
                </div>
                <div className="max-h-full overflow-auto p-3">
                  <div className="space-y-2">
                    {searchResults.map((item) => (
                      <button
                        key={item.character.id}
                        type="button"
                        onClick={() => setSelectedCharacterId(item.character.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[16px] border px-3 py-3 text-left transition",
                          selectedResult?.character.id === item.character.id
                            ? "border-[rgba(7,193,96,0.18)] bg-[rgba(7,193,96,0.08)]"
                            : "border-transparent bg-white hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]",
                        )}
                      >
                        <AvatarChip
                          name={item.character.name}
                          src={item.character.avatar}
                          size="wechat"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                            {item.friendship?.remarkName?.trim() ||
                              item.character.name}
                          </div>
                          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
                            {item.matchReason}
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            item.status === "friend"
                              ? "bg-[rgba(22,163,74,0.08)] text-[#15803d]"
                              : item.status === "pending"
                                ? "bg-[rgba(250,204,21,0.10)] text-[#a16207]"
                                : item.status === "blocked"
                                  ? "bg-[rgba(254,226,226,0.82)] text-[#b91c1c]"
                                  : "bg-[rgba(7,193,96,0.08)] text-[#15803d]",
                          )}
                        >
                          {item.status === "friend"
                            ? "已加"
                            : item.status === "pending"
                              ? "待通过"
                              : item.status === "blocked"
                                ? "黑名单"
                                : "可添加"}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="min-h-0 overflow-auto p-4">
                {selectedResult ? (
                  <DesktopAddFriendResultCard
                    character={selectedResult.character}
                    identifier={selectedResult.identifier}
                    matchReason={selectedResult.matchReason}
                    status={selectedResult.status}
                    friendship={selectedResult.friendship}
                    pendingRequest={selectedResult.pendingRequest}
                    actionPending={
                      (selectedResult.status === "available" &&
                        sendRequestMutation.isPending &&
                        sendRequestMutation.variables?.characterId ===
                          selectedResult.character.id) ||
                      (selectedResult.status === "friend" &&
                        openChatMutation.isPending &&
                        openChatMutation.variables ===
                          selectedResult.character.id)
                    }
                    onOpenProfile={() => {
                      void navigate({
                        to: "/character/$characterId",
                        params: {
                          characterId: selectedResult.character.id,
                        },
                      });
                    }}
                    onPrimaryAction={() => {
                      if (selectedResult.status === "friend") {
                        openChatMutation.mutate(selectedResult.character.id);
                        return;
                      }

                      if (selectedResult.status === "available") {
                        setSendDialogCharacterId(selectedResult.character.id);
                      }
                    }}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <DesktopAddFriendSendDialog
        open={Boolean(sendDialogCharacterId && sendDialogCharacter)}
        character={sendDialogCharacter}
        identifier={sendDialogIdentifier}
        ownerName={ownerName}
        pending={sendRequestMutation.isPending}
        onClose={() => setSendDialogCharacterId(null)}
        onSubmit={async (greeting) => {
          if (!sendDialogCharacterId) {
            return;
          }

          await sendRequestMutation.mutateAsync({
            characterId: sendDialogCharacterId,
            greeting,
          });
        }}
      />
    </DesktopUtilityShell>
  );
}

function buildCharacterIdentifier(characterId: string) {
  return `yinjie_${characterId.slice(0, 8)}`;
}

function buildSearchResults(
  characters: Character[],
  normalizedKeyword: string,
  friendshipMap: Map<string, FriendListItem["friendship"]>,
  pendingRequestMap: Map<string, FriendRequest>,
  blockedCharacterIds: Set<string>,
) {
  if (!normalizedKeyword) {
    return [] as SearchResultItem[];
  }

  const results: SearchResultItem[] = [];

  for (const character of characters) {
    if (character.relationshipType === "self") {
      continue;
    }

    const identifier = buildCharacterIdentifier(character.id);
    const match = matchCharacter(character, identifier, normalizedKeyword);
    if (!match) {
      continue;
    }

    const friendship = friendshipMap.get(character.id) ?? null;
    const pendingRequest = pendingRequestMap.get(character.id) ?? null;
    const status: DesktopAddFriendRelationshipState = blockedCharacterIds.has(
      character.id,
    )
      ? "blocked"
      : friendship
        ? "friend"
        : pendingRequest
          ? "pending"
          : "available";

    results.push({
      character,
      friendship,
      identifier,
      matchReason: match.reason,
      pendingRequest,
      score: match.score,
      status,
    });
  }

  return results
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return left.character.name.localeCompare(right.character.name, "zh-CN");
    })
    .slice(0, 8);
}

function matchCharacter(
  character: Character,
  identifier: string,
  normalizedKeyword: string,
) {
  const normalizedName = character.name.trim().toLowerCase();
  const normalizedIdentifier = identifier.toLowerCase();
  const normalizedId = character.id.toLowerCase();

  if (
    normalizedIdentifier === normalizedKeyword ||
    normalizedId.startsWith(normalizedKeyword)
  ) {
    return {
      score: 0,
      reason: "隐界号精确匹配",
    };
  }

  if (normalizedName === normalizedKeyword) {
    return {
      score: 10,
      reason: "角色名精确匹配",
    };
  }

  if (normalizedName.startsWith(normalizedKeyword)) {
    return {
      score: 20,
      reason: "角色名前缀匹配",
    };
  }

  if (normalizedName.includes(normalizedKeyword)) {
    return {
      score: 30,
      reason: "角色名模糊匹配",
    };
  }

  const statusMatchFields = [
    character.relationship,
    character.currentStatus,
    character.currentActivity,
    character.bio,
    character.expertDomains.join(" "),
  ];

  for (const [index, field] of statusMatchFields.entries()) {
    if (field?.toLowerCase().includes(normalizedKeyword)) {
      return {
        score: 40 + index,
        reason: index === 0 ? "关系描述匹配" : "资料关键词匹配",
      };
    }
  }

  return null;
}

function FakeQrPanel() {
  const cells = [
    1, 1, 1, 0, 0, 1, 1, 0, 1,
    1, 0, 1, 0, 1, 0, 1, 0, 1,
    1, 1, 1, 0, 1, 1, 1, 0, 1,
    0, 0, 0, 1, 0, 0, 1, 0, 0,
    1, 1, 0, 1, 1, 0, 0, 1, 1,
    0, 1, 0, 0, 1, 1, 0, 1, 0,
    1, 1, 1, 0, 1, 0, 1, 1, 1,
    1, 0, 0, 0, 0, 1, 0, 0, 1,
    1, 1, 1, 1, 0, 1, 1, 0, 1,
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="grid h-[132px] w-[132px] grid-cols-9 gap-[3px] rounded-[16px] bg-white p-[10px] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
        {cells.map((cell, index) => (
          <div
            key={index}
            className={cn(
              "rounded-[2px]",
              cell ? "bg-[#111827]" : "bg-transparent",
            )}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1 text-[12px] leading-6 text-[color:var(--text-secondary)]">
        <div className="font-medium text-[color:var(--text-primary)]">
          我的二维码
        </div>
        <div className="mt-2">
          桌面端当前先提供名片式展示，后续可继续接扫码添加与原生分享。
        </div>
      </div>
    </div>
  );
}

function StatusMetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white text-[#15803d] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-[color:var(--text-muted)]">{label}</div>
        <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
          {value}
        </div>
      </div>
    </div>
  );
}
