import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ChevronRight,
  Search,
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
import { buildYinjieId } from "../../../lib/yinjie-id";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../../../store/world-owner-store";
import { buildCharacterDetailRouteHash } from "../../contacts/character-detail-route-state";
import { buildDesktopContactsRouteHash } from "../../contacts/contacts-route-state";
import { getFriendDisplayName } from "../../contacts/contact-utils";
import { useCappedPending } from "../../../hooks/use-capped-pending";
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
  matchReason: MessageDescriptor;
  pendingRequest?: FriendRequest | null;
  score: number;
  status: DesktopAddFriendRelationshipState;
};

export function DesktopAddFriendWorkspace() {
  const t = useRuntimeTranslator();
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
  const ownerName = useWorldOwnerStore((state) => state.username) ?? t(msg`我`);
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
  const newFriendsRouteHash = useMemo(
    () =>
      buildDesktopContactsRouteHash({
        pane: "new-friends",
        showWorldCharacters: false,
      }),
    [],
  );

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
        message: t(msg`好友申请已发送。`),
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
  const sendRequestDisplayedPending = useCappedPending(
    sendRequestMutation.isPending,
    500,
  );
  // 网络慢时也别让"发送中"卡 UI：500ms 后强制关闭发送弹层，请求继续在后台跑
  useEffect(() => {
    if (
      sendRequestMutation.isPending &&
      !sendRequestDisplayedPending &&
      sendDialogCharacterId !== null
    ) {
      setSendDialogCharacterId(null);
    }
  }, [
    sendRequestDisplayedPending,
    sendRequestMutation.isPending,
    sendDialogCharacterId,
  ]);

  useEffect(() => {
    setSearchText(routeState.keyword);
  }, [routeState.keyword]);

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
    if (loading || !submittedKeyword) {
      return;
    }

    if (routeState.openCompose) {
      return;
    }

    const nextHash = buildDesktopAddFriendRouteHash({
      keyword: routeState.keyword,
      characterId: selectedCharacterId ?? undefined,
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
    setSelectedCharacterId(null);
    setSendDialogCharacterId(null);
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
      hash: "",
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
        title={t(msg`添加朋友当前仅提供桌面布局`)}
        description={t(
          msg`添加朋友工作区目前只在 Web 桌面布局和桌面壳内启用，移动布局先回到新的朋友继续处理联系人入口。`,
        )}
        actionLabel={t(msg`查看新的朋友`)}
        fallbackTo="/friend-requests"
      />
    );
  }

  return (
    <DesktopUtilityShell
      title={t(msg`添加朋友`)}
      subtitle={
        submittedKeyword
          ? t(msg`搜索“${submittedKeyword}”`)
          : routeSelectedResult
            ? t(msg`查看“${getSearchResultDisplayName(routeSelectedResult)}”`)
            : routeCharacterId
              ? t(msg`查看角色资料`)
              : t(msg`通过隐界号、角色名或资料关键词查找世界角色`)
      }
      toolbar={
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void navigate({
              to: "/tabs/contacts",
              hash: newFriendsRouteHash,
            });
          }}
          className="rounded-[8px] border-[color:var(--border-faint)] bg-white px-3 shadow-none hover:bg-[color:var(--surface-console)]"
        >
          {t(msg`新的朋友`)}
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
              {t(msg`好友功能`)}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
            <DesktopAddFriendSidebarEntry
              icon={UserPlus}
              label={t(msg`添加朋友`)}
              description={t(msg`通过隐界号或角色名搜索`)}
              active
            />
            <DesktopAddFriendSidebarEntry
              icon={Users}
              label={t(msg`新的朋友`)}
              description={t(msg`查看并处理好友申请`)}
              badge={
                pendingRequestCount > 0
                  ? pendingRequestCount > 99
                    ? "99+"
                    : `${pendingRequestCount}`
                  : undefined
              }
              onClick={() => {
                void navigate({
                  to: "/tabs/contacts",
                  hash: newFriendsRouteHash,
                });
              }}
            />

            <div className="mt-4 border-t border-[rgba(15,23,42,0.06)] px-2 pt-4">
              <div className="px-3 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
                {t(msg`搜索建议`)}
              </div>
              <div className="mt-3 space-y-1.5">
                <DesktopAddFriendGuideRow
                  label={t(msg`隐界号`)}
                  value={t(msg`最适合精确查找`)}
                />
                <DesktopAddFriendGuideRow
                  label={t(msg`角色名`)}
                  value={t(msg`支持前缀和模糊匹配`)}
                />
                <DesktopAddFriendGuideRow
                  label={t(msg`资料关键词`)}
                  value={t(msg`支持备注、标签、签名和关系描述`)}
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
                placeholder={t(msg`输入隐界号、角色名或资料关键词`)}
                className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              className="h-10 rounded-[8px] bg-[#07c160] px-5 text-white shadow-none hover:bg-[#06ad56]"
            >
              {t(msg`搜索`)}
            </Button>
            {searchText || submittedKeyword || routeCharacterId ? (
              <button
                type="button"
                onClick={clearSearch}
                className="h-10 rounded-[8px] border border-[rgba(15,23,42,0.10)] bg-white px-4 text-[13px] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
              >
                {t(msg`清空`)}
              </button>
            ) : null}
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`可通过隐界号、角色名、关系描述、签名或角色简介搜索。`)}
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
                <LoadingBlock label={t(msg`正在准备好友搜索目录...`)} />
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
                        {t(msg`搜索结果`)}
                      </div>
                      <div className="text-[12px] text-[color:var(--text-muted)]">
                        {t(msg`${searchResults.length} 个`)}
                      </div>
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                      {t(msg`按匹配度排序，优先展示最接近当前搜索的角色。`)}
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
                      {t(msg`详细资料`)}
                    </div>
                    <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                      {t(msg`查看资料后再决定是否发送好友申请。`)}
                    </div>
                  </div>

                  <div className="p-6">
                    {selectedResult ? (
                      <DesktopAddFriendResultCard
                        character={selectedResult.character}
                        identifier={selectedResult.identifier}
                        matchReason={t(selectedResult.matchReason)}
                        status={selectedResult.status}
                        friendship={selectedResult.friendship}
                        pendingRequest={selectedResult.pendingRequest}
                        actionPending={
                          (selectedResult.status === "available" &&
                            sendRequestDisplayedPending &&
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
        pending={sendRequestDisplayedPending}
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
  return buildYinjieId(characterId);
}

function DesktopAddFriendWelcomeState({
  onFocusSearch,
  onQuickSearch,
}: {
  onFocusSearch: () => void;
  onQuickSearch: (keyword: string) => void;
}) {
  const t = useRuntimeTranslator();
  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(7,193,96,0.08)] text-[#07c160]">
          <Search size={28} />
        </div>
        <div className="mt-5 text-[24px] font-medium tracking-[-0.02em] text-[color:var(--text-primary)]">
          {t(msg`搜索隐界号或角色名`)}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
          {t(msg`输入更完整的隐界号能更快命中目标角色，也可以通过角色名和资料关键词查找。`)}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {[
            "yinjie_1234abcd",
            t(msg`白石`),
            t(msg`数字人`),
            t(msg`治愈系`),
          ].map((item) => (
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
            {t(msg`开始搜索`)}
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
  const t = useRuntimeTranslator();
  const missingDirectTarget = !keyword && Boolean(routeCharacterId);

  return (
    <div className="flex h-full w-full items-center justify-center px-6 py-6">
      <div className="w-full max-w-[560px] text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[color:var(--text-secondary)]">
          <Search size={28} />
        </div>
        <div className="mt-5 text-[22px] font-medium text-[color:var(--text-primary)]">
          {missingDirectTarget
            ? t(msg`没有找到该角色`)
            : t(msg`没有找到“${keyword}”`)}
        </div>
        <div className="mt-2 text-[13px] leading-6 text-[color:var(--text-muted)]">
          {missingDirectTarget
            ? t(msg`这个角色可能已被移除，或者当前世界里还没有同步到该资料。你可以重新搜索其他角色。`)
            : t(msg`请检查隐界号是否完整，或者尝试使用角色名、签名和资料关键词重新搜索。`)}
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {["yinjie_", t(msg`角色名`), t(msg`关系描述`)].map((item) => (
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
            {t(msg`重新输入`)}
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
  const t = useRuntimeTranslator();
  const displayName = getSearchResultDisplayName(item);
  const matchReasonText = t(item.matchReason);
  const detailText =
    displayName !== item.character.name
      ? t(msg`昵称：${item.character.name} · ${matchReasonText}`)
      : matchReasonText;

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
        {t(formatRelationshipStatus(item.status))}
      </div>
    </button>
  );
}

function formatRelationshipStatus(
  status: DesktopAddFriendRelationshipState,
): MessageDescriptor {
  if (status === "friend") {
    return msg`已添加`;
  }

  if (status === "pending") {
    return msg`待处理`;
  }

  if (status === "blocked") {
    return msg`黑名单`;
  }

  return msg`可添加`;
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
        ? (match?.reason ?? msg`来自当前资料页`)
        : (match?.reason ?? msg`资料关键词匹配`),
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
      reason: msg`隐界号精确匹配`,
    };
  }

  if (normalizedRemarkName) {
    if (normalizedRemarkName === normalizedKeyword) {
      return {
        score: 5,
        reason: msg`备注名精确匹配`,
      };
    }

    if (normalizedRemarkName.startsWith(normalizedKeyword)) {
      return {
        score: 15,
        reason: msg`备注名前缀匹配`,
      };
    }

    if (normalizedRemarkName.includes(normalizedKeyword)) {
      return {
        score: 25,
        reason: msg`备注名匹配`,
      };
    }
  }

  if (normalizedName === normalizedKeyword) {
    return {
      score: 10,
      reason: msg`角色名精确匹配`,
    };
  }

  if (normalizedName.startsWith(normalizedKeyword)) {
    return {
      score: 20,
      reason: msg`角色名前缀匹配`,
    };
  }

  if (normalizedName.includes(normalizedKeyword)) {
    return {
      score: 30,
      reason: msg`角色名模糊匹配`,
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
        reason: index === 0 ? msg`关系描述匹配` : msg`资料关键词匹配`,
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
          index === 0
            ? msg`地区匹配`
            : index === 1
              ? msg`来源匹配`
              : msg`标签匹配`,
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

