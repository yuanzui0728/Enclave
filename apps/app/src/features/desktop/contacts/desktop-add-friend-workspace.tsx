import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronRight,
  QrCode,
  Search,
  Sparkles,
  UserPlus,
  Users,
  type LucideIcon,
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
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { DesktopLayoutRequiredState } from "../../../components/desktop-layout-required-state";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { buildCharacterDetailRouteHash } from "../../contacts/character-detail-route-state";
import { getFriendDisplayName } from "../../contacts/contact-utils";
import { useDesktopLayout } from "../../shell/use-desktop-layout";
import { DesktopUtilityShell } from "../desktop-utility-shell";
import { buildDesktopChatThreadPath } from "../chat/desktop-chat-route-state";
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
  const routeHash = useRouterState({ select: (state) => state.location.hash });
  const liveHash =
    routeHash ||
    (typeof window !== "undefined" ? window.location.hash : "");
  const normalizedHash = liveHash.startsWith("#")
    ? liveHash.slice(1)
    : liveHash;
  const routeState = parseDesktopAddFriendRouteState(liveHash);
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
        to: buildDesktopChatThreadPath({
          conversationId: conversation.id,
        }),
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
        (friendsQuery.data ?? []).map((item) => [
          item.character.id,
          item.friendship,
        ]),
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
  const routeCharacterId = routeState.characterId?.trim() || null;
  const normalizedKeyword = submittedKeyword.toLowerCase();
  const searchResults = useMemo(
    () =>
      buildSearchResults(
        charactersQuery.data ?? [],
        normalizedKeyword,
        friendshipMap,
        pendingRequestMap,
        blockedCharacterIds,
        routeCharacterId,
      ),
    [
      blockedCharacterIds,
      charactersQuery.data,
      friendshipMap,
      normalizedKeyword,
      pendingRequestMap,
      routeCharacterId,
    ],
  );
  const routeSelectedResult = useMemo(
    () =>
      routeCharacterId
        ? (searchResults.find(
            (item) => item.character.id === routeCharacterId,
          ) ?? null)
        : null,
    [routeCharacterId, searchResults],
  );
  const selectedResult = useMemo(() => {
    const matchedResult = searchResults.find(
      (item) => item.character.id === selectedCharacterId,
    );
    return matchedResult ?? searchResults[0] ?? null;
  }, [searchResults, selectedCharacterId]);
  const sendDialogCharacter = useMemo(() => {
    const matchedResult = searchResults.find(
      (item) => item.character.id === sendDialogCharacterId,
    );
    return matchedResult?.character ?? null;
  }, [searchResults, sendDialogCharacterId]);
  const sendDialogIdentifier = sendDialogCharacter
    ? buildCharacterIdentifier(sendDialogCharacter.id)
    : "";
  const pendingRequestCount = pendingRequestMap.size;
  const hasSearchContext =
    submittedKeyword.length > 0 || Boolean(routeCharacterId);
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
    if (!routeSelectedResult) {
      return;
    }

    setSelectedCharacterId((current) =>
      current === routeSelectedResult.character.id
        ? current
        : routeSelectedResult.character.id,
    );
  }, [routeSelectedResult]);

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

  useEffect(() => {
    if (routeState.openCompose || loading || !submittedKeyword) {
      return;
    }

    const nextCharacterId =
      selectedCharacterId ??
      (!submittedKeyword && routeCharacterId ? routeCharacterId : undefined);
    const nextHash = buildDesktopAddFriendRouteHash({
      keyword: routeState.keyword,
      characterId: nextCharacterId,
      recommendationId: routeState.recommendationId,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: "/desktop/add-friend",
      hash: nextHash,
      replace: true,
    });
  }, [
    navigate,
    normalizedHash,
    routeState.keyword,
    routeState.openCompose,
    routeState.recommendationId,
    routeCharacterId,
    selectedCharacterId,
    submittedKeyword,
    loading,
  ]);

  useEffect(() => {
    if (!routeState.openCompose || loading) {
      return;
    }

    if (routeSelectedResult) {
      setSelectedCharacterId(routeSelectedResult.character.id);

      if (routeSelectedResult.status === "available") {
        setSendDialogCharacterId(routeSelectedResult.character.id);
      }
    }

    const nextHash = buildDesktopAddFriendRouteHash({
      keyword: routeState.keyword,
      characterId:
        routeSelectedResult?.character.id ??
        selectedResult?.character.id ??
        undefined,
      recommendationId: routeState.recommendationId,
    });

    if ((nextHash ?? "") === normalizedHash) {
      return;
    }

    void navigate({
      to: "/desktop/add-friend",
      hash: nextHash,
      replace: true,
    });
  }, [
    loading,
    navigate,
    normalizedHash,
    routeSelectedResult,
    routeState.keyword,
    routeState.openCompose,
    routeState.recommendationId,
    selectedResult?.character.id,
  ]);

  const submitKeywordSearch = (keyword: string) => {
    const nextKeyword = keyword.trim();
    void navigate({
      to: "/desktop/add-friend",
      hash: buildDesktopAddFriendRouteHash({
        keyword: nextKeyword,
      }),
      replace: true,
    });
  };

  const clearSearch = () => {
    setSearchText("");
    setSelectedCharacterId(null);
    setSendDialogCharacterId(null);
    void navigate({
      to: "/desktop/add-friend",
      hash: undefined,
      replace: true,
    });

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  if (!isDesktopLayout) {
    return (
      <DesktopLayoutRequiredState
        title="添加朋友当前仅提供桌面布局"
        description="添加朋友工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到新的朋友继续处理联系人入口。"
        actionLabel="查看新的朋友"
        fallbackTo="/friend-requests"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title="添加朋友"
      subtitle={
        submittedKeyword
          ? `搜索“${submittedKeyword}”`
          : routeSelectedResult
            ? `查看“${getSearchResultDisplayName(routeSelectedResult)}”`
            : routeCharacterId
              ? "查看角色资料"
              : "通过隐界号、角色名或资料关键词查找世界角色"
      }
      toolbar={
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigate({ to: "/friend-requests" });
          }}
          className="rounded-[8px] border-[color:var(--border-faint)] bg-white px-3 shadow-none hover:bg-[color:var(--surface-console)]"
        >
          新的朋友
          {pendingRequestCount > 0
            ? ` ${pendingRequestCount > 99 ? "99+" : pendingRequestCount}`
            : ""}
        </Button>
      }
      className="bg-[#ededed]"
      sidebarClassName="w-[236px] bg-[#e9e9e9]"
      contentClassName="bg-[#ededed]"
      asideClassName="w-[286px] bg-[#f3f3f3]"
      sidebar={
        <div className="flex h-full min-h-0 flex-col bg-[#e9e9e9]">
          <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-4">
            <div className="text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
              好友功能
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
            <DesktopAddFriendSidebarEntry
              icon={UserPlus}
              label="添加朋友"
              description="通过隐界号或角色名搜索"
              active
            />
            <DesktopAddFriendSidebarEntry
              icon={Users}
              label="新的朋友"
              description="查看并处理好友申请"
              badge={
                pendingRequestCount > 0
                  ? pendingRequestCount > 99
                    ? "99+"
                    : `${pendingRequestCount}`
                  : undefined
              }
              onClick={() => {
                void navigate({ to: "/friend-requests" });
              }}
            />

            <div className="mt-4 border-t border-[rgba(15,23,42,0.06)] px-2 pt-4">
              <div className="px-3 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                搜索建议
              </div>
              <div className="mt-3 space-y-1.5">
                <DesktopAddFriendGuideRow
                  label="隐界号"
                  value="最适合精确查找"
                />
                <DesktopAddFriendGuideRow
                  label="角色名"
                  value="支持前缀和模糊匹配"
                />
                <DesktopAddFriendGuideRow
                  label="资料关键词"
                  value="支持备注、标签、签名和关系描述"
                />
              </div>
            </div>
          </div>
        </div>
      }
      aside={
        <div className="flex h-full min-h-0 flex-col bg-[#f3f3f3]">
          <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#f7f7f7] px-5 py-4">
            <div className="flex items-center gap-2 text-[14px] font-medium text-[color:var(--text-primary)]">
              <QrCode size={16} className="text-[#15803d]" />
              <span>我的隐界名片</span>
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              别人可以通过隐界号或二维码找到你
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-5">
            <div className="rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white p-5 shadow-none">
              <div className="flex items-center gap-3">
                <AvatarChip name={ownerName} src={ownerAvatar} size="wechat" />
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                    {ownerName}
                  </div>
                  <div className="mt-1 text-[13px] text-[color:var(--text-muted)]">
                    {ownerId
                      ? buildCharacterIdentifier(ownerId)
                      : "隐界号待生成"}
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[8px] border border-[rgba(15,23,42,0.06)] bg-[#fafafa] p-4">
                <FakeQrPanel />
              </div>

              <div className="mt-4 rounded-[8px] bg-[#f7f7f7] px-3 py-3 text-[12px] leading-6 text-[color:var(--text-secondary)]">
                {ownerSignature?.trim() ||
                  "把自己的世界展示给别人，也可以通过隐界号被快速搜索到。"}
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white">
              <div className="border-b border-[rgba(15,23,42,0.06)] px-4 py-3 text-[12px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                当前状态
              </div>
              <div className="px-4 py-2">
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
      <div className="flex h-full min-h-0 flex-col bg-[#ededed]">
        <form
          className="border-b border-[rgba(15,23,42,0.06)] bg-[#f7f7f7] px-6 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            submitKeywordSearch(searchText);
          }}
        >
          <div className="flex items-center gap-3">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[8px] border border-[rgba(15,23,42,0.10)] bg-white px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <Search
                size={18}
                className="shrink-0 text-[color:var(--text-dim)]"
              />
              <input
                ref={inputRef}
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="输入隐界号、角色名或资料关键词"
                className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              className="h-10 rounded-[8px] bg-[#07c160] px-5 text-white shadow-none hover:bg-[#06ad56]"
            >
              搜索
            </Button>
            {searchText || submittedKeyword || routeCharacterId ? (
              <button
                type="button"
                onClick={clearSearch}
                className="h-10 rounded-[8px] border border-[rgba(15,23,42,0.10)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
              >
                清空
              </button>
            ) : null}
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
            可通过隐界号、角色名、关系描述、签名或角色简介搜索。
          </div>
        </form>

        {notice ? (
          <div className="px-6 pt-4">
            <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
          </div>
        ) : null}
        {sendRequestMutation.isError &&
        sendRequestMutation.error instanceof Error ? (
          <div className="px-6 pt-4">
            <ErrorBlock message={sendRequestMutation.error.message} />
          </div>
        ) : null}
        {openChatMutation.isError && openChatMutation.error instanceof Error ? (
          <div className="px-6 pt-4">
            <ErrorBlock message={openChatMutation.error.message} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 px-6 py-6">
          <div className="flex h-full min-h-[420px] overflow-hidden rounded-[10px] border border-[rgba(15,23,42,0.08)] bg-white shadow-none">
            {loading ? (
              <div className="flex h-full w-full items-center justify-center px-6">
                <LoadingBlock label="正在准备好友搜索目录..." />
              </div>
            ) : loadingError ? (
              <div className="w-full px-6 py-6">
                <ErrorBlock message={loadingError.message} />
              </div>
            ) : !hasSearchContext ? (
              <DesktopAddFriendWelcomeState
                onFocusSearch={() => inputRef.current?.focus()}
                onQuickSearch={(keyword) => {
                  setSearchText(keyword);
                  submitKeywordSearch(keyword);
                }}
              />
            ) : !searchResults.length ? (
              <DesktopAddFriendNoResultsState
                keyword={submittedKeyword}
                routeCharacterId={routeCharacterId}
                onRetry={() => {
                  setSearchText("");
                  inputRef.current?.focus();
                }}
                onQuickSearch={(keyword) => {
                  setSearchText(keyword);
                  submitKeywordSearch(keyword);
                }}
              />
            ) : (
              <div className="grid h-full min-h-0 w-full xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="min-h-0 border-b border-[rgba(15,23,42,0.06)] bg-[#fcfcfc] xl:border-b-0 xl:border-r">
                  <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#f8f8f8] px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                        搜索结果
                      </div>
                      <div className="text-[12px] text-[color:var(--text-muted)]">
                        {searchResults.length} 个
                      </div>
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                      按匹配度排序，优先展示最接近当前搜索的角色。
                    </div>
                  </div>

                  <div className="max-h-full overflow-auto p-2.5">
                    <div className="space-y-1.5">
                      {searchResults.map((item) => (
                        <DesktopAddFriendResultRow
                          key={item.character.id}
                          item={item}
                          selected={
                            selectedResult?.character.id === item.character.id
                          }
                          onClick={() =>
                            setSelectedCharacterId(item.character.id)
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 overflow-auto">
                  <div className="border-b border-[rgba(15,23,42,0.06)] bg-[#fbfbfb] px-6 py-4">
                    <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                      详细资料
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                      查看资料后再决定是否发送好友申请。
                    </div>
                  </div>

                  <div className="p-6">
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
                            hash: buildCharacterDetailRouteHash({
                              returnPath: "/desktop/add-friend",
                              returnHash: normalizedHash || undefined,
                            }),
                          });
                        }}
                        onPrimaryAction={() => {
                          if (selectedResult.status === "friend") {
                            openChatMutation.mutate(
                              selectedResult.character.id,
                            );
                            return;
                          }

                          if (selectedResult.status === "available") {
                            setSendDialogCharacterId(
                              selectedResult.character.id,
                            );
                          }
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
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

function DesktopAddFriendWelcomeState({
  onFocusSearch,
  onQuickSearch,
}: {
  onFocusSearch: () => void;
  onQuickSearch: (keyword: string) => void;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(7,193,96,0.08)] text-[#07c160]">
          <Search size={28} />
        </div>
        <div className="mt-5 text-[24px] font-medium tracking-[-0.02em] text-[color:var(--text-primary)]">
          搜索隐界号或角色名
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
          输入更完整的隐界号能更快命中目标角色，也可以通过角色名和资料关键词查找。
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["yinjie_1234abcd", "白石", "数字人", "治愈系"].map((item) => (
            <SearchExampleChip
              key={item}
              label={item}
              onClick={() => onQuickSearch(item)}
            />
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={onFocusSearch}
            className="rounded-[8px] border-[rgba(15,23,42,0.10)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            开始搜索
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopAddFriendNoResultsState({
  keyword,
  routeCharacterId,
  onRetry,
  onQuickSearch,
}: {
  keyword: string;
  routeCharacterId?: string | null;
  onRetry: () => void;
  onQuickSearch: (keyword: string) => void;
}) {
  const missingDirectTarget = !keyword && Boolean(routeCharacterId);

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[color:var(--text-secondary)]">
          <Search size={28} />
        </div>
        <div className="mt-5 text-[22px] font-medium text-[color:var(--text-primary)]">
          {missingDirectTarget ? "没有找到该角色" : `没有找到“${keyword}”`}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
          {missingDirectTarget
            ? "这个角色可能已被移除，或者当前世界里还没有同步到该资料。你可以重新搜索其他角色。"
            : "请检查隐界号是否完整，或者尝试使用角色名、签名和资料关键词重新搜索。"}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["yinjie_", "角色名", "关系描述"].map((item) => (
            <SearchExampleChip
              key={item}
              label={item}
              onClick={() => onQuickSearch(item)}
            />
          ))}
        </div>
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={onRetry}
            className="rounded-[8px] border-[rgba(15,23,42,0.10)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
          >
            重新输入
          </Button>
        </div>
      </div>
    </div>
  );
}

function DesktopAddFriendSidebarEntry({
  icon: Icon,
  label,
  description,
  active = false,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  active?: boolean;
  badge?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[8px] px-3 py-3 text-left transition",
        active
          ? "bg-[rgba(7,193,96,0.08)] text-[color:var(--text-primary)]"
          : "text-[color:var(--text-primary)] hover:bg-[rgba(15,23,42,0.04)]",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px]",
          active
            ? "bg-white text-[#07c160]"
            : "bg-white/70 text-[color:var(--text-secondary)]",
        )}
      >
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{label}</div>
        <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
          {description}
        </div>
      </div>
      {badge ? (
        <span className="rounded-full bg-[#fa5151] px-1.5 py-0.5 text-[10px] text-white">
          {badge}
        </span>
      ) : null}
      {!badge && !active ? (
        <ChevronRight size={15} className="text-[color:var(--text-dim)]" />
      ) : null}
    </button>
  );
}

function DesktopAddFriendGuideRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[8px] px-3 py-2.5 text-[12px] text-[color:var(--text-secondary)]">
      <span>{label}</span>
      <span className="text-[color:var(--text-muted)]">{value}</span>
    </div>
  );
}

function SearchExampleChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
    >
      {label}
    </button>
  );
}

function DesktopAddFriendResultRow({
  item,
  selected,
  onClick,
}: {
  item: SearchResultItem;
  selected: boolean;
  onClick: () => void;
}) {
  const displayName = getSearchResultDisplayName(item);
  const detailText =
    displayName !== item.character.name
      ? `昵称：${item.character.name} · ${item.matchReason}`
      : item.matchReason;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[8px] border px-3 py-3 text-left transition",
        selected
          ? "border-[rgba(7,193,96,0.12)] bg-[rgba(7,193,96,0.08)]"
          : "border-transparent bg-transparent hover:border-[rgba(15,23,42,0.06)] hover:bg-white",
      )}
    >
      <AvatarChip
        name={displayName}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
          {displayName}
        </div>
        <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
          {item.identifier}
        </div>
        <div className="mt-1 truncate text-[11px] text-[color:var(--text-dim)]">
          {detailText}
        </div>
      </div>
      <div className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
        {formatRelationshipStatus(item.status)}
      </div>
    </button>
  );
}

function formatRelationshipStatus(status: DesktopAddFriendRelationshipState) {
  if (status === "friend") {
    return "已添加";
  }

  if (status === "pending") {
    return "待处理";
  }

  if (status === "blocked") {
    return "黑名单";
  }

  return "可添加";
}

function buildSearchResults(
  characters: Character[],
  normalizedKeyword: string,
  friendshipMap: Map<string, FriendListItem["friendship"]>,
  pendingRequestMap: Map<string, FriendRequest>,
  blockedCharacterIds: Set<string>,
  routeCharacterId?: string | null,
) {
  if (!normalizedKeyword && !routeCharacterId) {
    return [] as SearchResultItem[];
  }

  const results: SearchResultItem[] = [];

  for (const character of characters) {
    if (character.relationshipType === "self") {
      continue;
    }

    const friendship = friendshipMap.get(character.id) ?? null;
    const identifier = buildCharacterIdentifier(character.id);
    const directRouteTarget =
      Boolean(routeCharacterId) && character.id === routeCharacterId;
    const match = normalizedKeyword
      ? matchCharacter(character, identifier, normalizedKeyword, friendship)
      : null;
    if (!match && !directRouteTarget) {
      continue;
    }

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
      matchReason: directRouteTarget
        ? (match?.reason ?? "来自当前资料页")
        : (match?.reason ?? "资料关键词匹配"),
      pendingRequest,
      score: directRouteTarget
        ? Math.min(match?.score ?? 0, 0)
        : (match?.score ?? 0),
      status,
    });
  }

  return results
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return getSearchResultDisplayName(left).localeCompare(
        getSearchResultDisplayName(right),
        "zh-CN",
      );
    })
    .slice(0, 8);
}

function matchCharacter(
  character: Character,
  identifier: string,
  normalizedKeyword: string,
  friendship?: FriendListItem["friendship"] | null,
) {
  const normalizedName = character.name.trim().toLowerCase();
  const normalizedIdentifier = identifier.toLowerCase();
  const normalizedId = character.id.toLowerCase();
  const normalizedRemarkName =
    friendship?.remarkName?.trim()?.toLowerCase() ?? "";

  if (
    normalizedIdentifier === normalizedKeyword ||
    normalizedId.startsWith(normalizedKeyword)
  ) {
    return {
      score: 0,
      reason: "隐界号精确匹配",
    };
  }

  if (normalizedRemarkName) {
    if (normalizedRemarkName === normalizedKeyword) {
      return {
        score: 5,
        reason: "备注名精确匹配",
      };
    }

    if (normalizedRemarkName.startsWith(normalizedKeyword)) {
      return {
        score: 15,
        reason: "备注名前缀匹配",
      };
    }

    if (normalizedRemarkName.includes(normalizedKeyword)) {
      return {
        score: 25,
        reason: "备注名匹配",
      };
    }
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

  const contactMatchFields = [
    friendship?.region?.trim() ?? "",
    friendship?.source?.trim() ?? "",
    friendship?.tags?.filter(Boolean).join(" ") ?? "",
  ];

  for (const [index, field] of contactMatchFields.entries()) {
    if (field.toLowerCase().includes(normalizedKeyword)) {
      return {
        score: 50 + index,
        reason:
          index === 0 ? "地区匹配" : index === 1 ? "来源匹配" : "标签匹配",
      };
    }
  }

  return null;
}

function getSearchResultDisplayName(
  item: Pick<SearchResultItem, "character" | "friendship">,
) {
  return item.friendship
    ? getFriendDisplayName({
        character: item.character,
        friendship: item.friendship,
      })
    : item.character.name;
}

function FakeQrPanel() {
  const cells = [
    1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1,
    0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1,
    1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1,
    1, 0, 1, 1, 0, 1,
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="grid h-[144px] w-[144px] grid-cols-9 gap-[3px] rounded-[10px] bg-white p-[10px] shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
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
      <div className="mt-3 text-[12px] text-[color:var(--text-muted)]">
        扫一扫上面的二维码图案，加我为朋友
      </div>
    </div>
  );
}

function StatusMetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(15,23,42,0.06)] py-3 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#f5f5f5] text-[#15803d]">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-[color:var(--text-muted)]">
          {label}
        </div>
        <div className="mt-0.5 text-[14px] font-medium text-[color:var(--text-primary)]">
          {value}
        </div>
      </div>
    </div>
  );
}
