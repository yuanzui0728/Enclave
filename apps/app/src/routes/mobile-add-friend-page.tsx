import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  MessageCircleMore,
  Search,
  ShieldBan,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  getBlockedCharacters,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
  listCharacters,
  sendFriendRequest,
  type FriendRequest,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";

import { AvatarChip } from "../components/avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildAddFriendSearchResults,
  formatRelationshipStatus,
  getSearchResultDisplayName,
  type AddFriendRelationshipState,
  type AddFriendSearchResult,
} from "../features/contacts/add-friend-search";
import { buildCharacterDetailRouteHash } from "../features/contacts/character-detail-route-state";
import {
  buildMobileAddFriendRouteHash,
  parseMobileAddFriendRouteState,
} from "../features/contacts/mobile-add-friend-route-state";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useCappedPending } from "../hooks/use-capped-pending";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

const DesktopAddFriendWorkspace = lazy(async () => {
  const mod = await import(
    "../features/desktop/contacts/desktop-add-friend-workspace"
  );
  return { default: mod.DesktopAddFriendWorkspace };
});

export function MobileAddFriendPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面添加朋友`)}
            description={t(msg`正在跳转到桌面添加朋友工作区。`)}
            loadingLabel={t(msg`切换桌面添加朋友...`)}
          />
        }
      >
        <DesktopAddFriendWorkspace />
      </Suspense>
    );
  }

  return <MobileAddFriend />;
}

function MobileAddFriend() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? t(msg`我`);

  const routeState = useMemo(
    () => parseMobileAddFriendRouteState(hash),
    [hash],
  );
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileAddFriendRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
        keyword: routeState.keyword,
      }),
    [routeState.keyword, safeReturnHash, safeReturnPath],
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [searchText, setSearchText] = useState(routeState.keyword ?? "");
  const [submittedKeyword, setSubmittedKeyword] = useState(
    routeState.keyword ?? "",
  );
  const [notice, setNotice] = useState<{
    message: string;
    tone: "info" | "success";
  } | null>(null);
  const [sendDialogCharacterId, setSendDialogCharacterId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (routeState.keyword) {
      setSearchText(routeState.keyword);
      setSubmittedKeyword(routeState.keyword);
    }
  }, [routeState.keyword]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const charactersQuery = useQuery({
    queryKey: ["app-characters", baseUrl],
    queryFn: () => listCharacters(baseUrl),
    staleTime: 30_000,
  });

  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });

  const blockedQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
  });

  const openChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      void navigate({ to: "/chat/$conversationId", params: { conversationId: conversation.id } });
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
    onSuccess: async () => {
      setNotice({ tone: "success", message: t(msg`好友申请已发送。`) });
      setSendDialogCharacterId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
      ]);
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
  const pendingRequestCount = pendingRequestMap.size;

  const trimmedKeyword = submittedKeyword.trim();
  const normalizedKeyword = trimmedKeyword.toLowerCase();
  const searchResults = useMemo(
    () =>
      buildAddFriendSearchResults(
        charactersQuery.data ?? [],
        normalizedKeyword,
        friendshipMap,
        pendingRequestMap,
        blockedCharacterIds,
        null,
        12,
      ),
    [
      blockedCharacterIds,
      charactersQuery.data,
      friendshipMap,
      normalizedKeyword,
      pendingRequestMap,
    ],
  );

  const sendDialogResult = useMemo(
    () =>
      searchResults.find(
        (item) => item.character.id === sendDialogCharacterId,
      ) ?? null,
    [searchResults, sendDialogCharacterId],
  );

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

  function submitSearch(keyword: string) {
    const next = keyword.trim();
    setSubmittedKeyword(next);
    setNotice(null);
  }

  function clearSearch() {
    setSearchText("");
    setSubmittedKeyword("");
    setNotice(null);
    inputRef.current?.focus();
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/tabs/chat" });
    });
  }

  function openFriendRequests() {
    void navigate({
      to: "/friend-requests",
      hash: buildMobileFriendRequestsRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  function handleResultPrimaryAction(result: AddFriendSearchResult) {
    if (result.status === "available") {
      setSendDialogCharacterId(result.character.id);
      return;
    }

    if (result.status === "friend") {
      openChatMutation.mutate(result.character.id);
      return;
    }
  }

  function handleResultOpenProfile(result: AddFriendSearchResult) {
    void navigate({
      to: "/character/$characterId",
      params: { characterId: result.character.id },
      hash: buildCharacterDetailRouteHash({
        returnPath: pathname,
        returnHash: currentRouteHash || undefined,
      }),
    });
  }

  return (
    <AppPage className="space-y-0 bg-[#ededed] px-0 py-0">
      <TabPageTopBar
        title={t(msg`添加朋友`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            onClick={handleBack}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            aria-label={t(msg`返回`)}
          >
            <ArrowLeft size={17} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            onClick={openFriendRequests}
            variant="ghost"
            size="icon"
            className="relative h-9 w-9 rounded-full text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            aria-label={t(msg`新的朋友`)}
          >
            <Users size={17} />
            {pendingRequestCount > 0 ? (
              <span className="absolute right-1 top-1 min-w-[14px] rounded-full bg-[#fa5151] px-[3px] text-[9px] font-medium leading-[14px] text-white">
                {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
              </span>
            ) : null}
          </Button>
        }
      />

      <form
        className="border-b border-[color:var(--border-faint)] bg-[#f7f7f7] px-3 py-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          submitSearch(searchText);
        }}
      >
        <div className="flex items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[8px] bg-white px-3">
            <Search size={15} className="shrink-0 text-[color:var(--text-dim)]" />
            <input
              ref={inputRef}
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t(msg`隐界号 / 角色名`)}
              className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[14px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              autoFocus
              enterKeyHint="search"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => {
                  setSearchText("");
                  inputRef.current?.focus();
                }}
                className="-mr-1 flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--text-dim)] active:bg-black/5"
                aria-label={t(msg`清空输入`)}
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
          {trimmedKeyword || searchText ? (
            <button
              type="button"
              onClick={clearSearch}
              className="h-9 shrink-0 rounded-[8px] px-2 text-[13px] text-[color:var(--text-secondary)] active:bg-black/[0.05]"
            >
              {t(msg`取消`)}
            </button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              className="h-9 shrink-0 rounded-[8px] bg-[#07c160] px-3.5 text-[13px] text-white shadow-none hover:bg-[#06ad56]"
            >
              {t(msg`搜索`)}
            </Button>
          )}
        </div>
      </form>

      {notice ? (
        <div className="px-3 pt-2">
          <InlineNotice
            tone={notice.tone}
            className="rounded-[10px] px-3 py-2 text-[12px] leading-5 shadow-none"
          >
            {notice.message}
          </InlineNotice>
        </div>
      ) : null}

      {sendRequestMutation.isError &&
      sendRequestMutation.error instanceof Error ? (
        <div className="px-3 pt-2">
          <ErrorBlock message={sendRequestMutation.error.message} />
        </div>
      ) : null}
      {openChatMutation.isError && openChatMutation.error instanceof Error ? (
        <div className="px-3 pt-2">
          <ErrorBlock message={openChatMutation.error.message} />
        </div>
      ) : null}

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        {loading ? (
          <div className="px-4 pt-6">
            <LoadingBlock label={t(msg`正在准备好友搜索目录...`)} />
          </div>
        ) : loadingError ? (
          <div className="px-3 pt-3">
            <ErrorBlock message={loadingError.message} />
          </div>
        ) : !trimmedKeyword ? (
          <MobileAddFriendWelcomeState
            onQuickSearch={(value) => {
              setSearchText(value);
              submitSearch(value);
            }}
          />
        ) : !searchResults.length ? (
          <MobileAddFriendNoResultsState keyword={trimmedKeyword} />
        ) : (
          <section className="mt-2 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {searchResults.map((result, index) => (
              <MobileAddFriendResultRow
                key={result.character.id}
                item={result}
                actionPending={
                  (result.status === "available" &&
                    sendRequestDisplayedPending &&
                    sendRequestMutation.variables?.characterId ===
                      result.character.id) ||
                  (result.status === "friend" &&
                    openChatMutation.isPending &&
                    openChatMutation.variables === result.character.id)
                }
                showDivider={index > 0}
                onPrimaryAction={() => handleResultPrimaryAction(result)}
                onOpenProfile={() => handleResultOpenProfile(result)}
              />
            ))}
          </section>
        )}
      </div>

      <MobileAddFriendSendSheet
        open={Boolean(sendDialogResult)}
        result={sendDialogResult}
        ownerName={ownerName}
        pending={sendRequestDisplayedPending}
        onClose={() => setSendDialogCharacterId(null)}
        onSubmit={async (greeting) => {
          if (!sendDialogResult) {
            return;
          }
          await sendRequestMutation.mutateAsync({
            characterId: sendDialogResult.character.id,
            greeting,
          });
        }}
      />
    </AppPage>
  );
}

function MobileAddFriendWelcomeState({
  onQuickSearch,
}: {
  onQuickSearch: (keyword: string) => void;
}) {
  const t = useRuntimeTranslator();
  const examples = [t(msg`角色名`), t(msg`隐界号`), t(msg`关系描述`)];

  return (
    <div className="flex flex-col items-center px-6 pt-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(7,193,96,0.08)] text-[#07c160]">
        <Search size={22} />
      </div>
      <div className="mt-4 text-[16px] font-medium text-[color:var(--text-primary)]">
        {t(msg`搜索隐界号或角色名`)}
      </div>
      <div className="mt-1.5 max-w-[280px] text-[12px] leading-5 text-[color:var(--text-muted)]">
        {t(msg`输入完整的隐界号能精确命中，也可以用角色名或资料关键词搜索。`)}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-1.5">
        {examples.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onQuickSearch(item)}
            className="rounded-full bg-white px-3 py-1.5 text-[12px] text-[color:var(--text-secondary)] shadow-[0_0_0_1px_rgba(15,23,42,0.06)] active:bg-[color:var(--surface-card-hover)]"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function MobileAddFriendNoResultsState({ keyword }: { keyword: string }) {
  const t = useRuntimeTranslator();
  return (
    <div className="flex flex-col items-center px-6 pt-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(15,23,42,0.05)] text-[color:var(--text-secondary)]">
        <Search size={22} />
      </div>
      <div className="mt-4 text-[16px] font-medium text-[color:var(--text-primary)]">
        {t(msg`没有找到“${keyword}”`)}
      </div>
      <div className="mt-1.5 max-w-[280px] text-[12px] leading-5 text-[color:var(--text-muted)]">
        {t(msg`请检查隐界号是否完整，或者换个关键词试试。`)}
      </div>
    </div>
  );
}

type MobileAddFriendResultRowProps = {
  item: AddFriendSearchResult;
  actionPending: boolean;
  showDivider: boolean;
  onPrimaryAction: () => void;
  onOpenProfile: () => void;
};

function MobileAddFriendResultRow({
  item,
  actionPending,
  showDivider,
  onPrimaryAction,
  onOpenProfile,
}: MobileAddFriendResultRowProps) {
  const t = useRuntimeTranslator();
  const displayName = getSearchResultDisplayName(item);
  const meta = getMobileResultStatusMeta(item.status, actionPending);
  const PrimaryIcon = meta.icon;
  const matchReasonText = t(item.matchReason);
  const subtitle =
    displayName !== item.character.name
      ? `${item.identifier} · ${t(msg`昵称`)} ${item.character.name}`
      : item.identifier;

  return (
    <div
      className={cn(
        "px-4 py-3",
        showDivider ? "border-t border-[color:var(--border-faint)]" : undefined,
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpenProfile}
          className="shrink-0 rounded-[8px] active:opacity-70"
          aria-label={t(msg`查看资料`)}
        >
          <AvatarChip
            name={displayName}
            src={item.character.avatar}
            size="wechat"
          />
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenProfile}
            className="block w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                {displayName}
              </div>
              <span className="shrink-0 text-[10px] text-[color:var(--text-dim)]">
                {t(formatRelationshipStatus(item.status))}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {subtitle}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-dim)]">
              {matchReasonText}
            </div>
          </button>

          <div className="mt-2 flex items-center justify-end">
            <Button
              type="button"
              variant={item.status === "available" ? "primary" : "secondary"}
              size="sm"
              disabled={meta.disabled}
              onClick={onPrimaryAction}
              className={cn(
                "h-8 rounded-full px-3.5 text-[12px] shadow-none",
                item.status === "available"
                  ? "bg-[#07c160] text-white hover:bg-[#06ad56]"
                  : "border-[color:var(--border-subtle)] bg-white text-[color:var(--text-secondary)]",
                item.status === "pending" || item.status === "blocked"
                  ? "opacity-70"
                  : undefined,
              )}
            >
              <PrimaryIcon size={13} />
              {t(meta.label)}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type ResultStatusMeta = {
  label: MessageDescriptor;
  icon: typeof UserPlus;
  disabled: boolean;
};

function getMobileResultStatusMeta(
  status: AddFriendRelationshipState,
  actionPending: boolean,
): ResultStatusMeta {
  if (status === "friend") {
    return {
      label: actionPending ? msg`打开中...` : msg`发消息`,
      icon: MessageCircleMore,
      disabled: actionPending,
    };
  }

  if (status === "pending") {
    return {
      label: msg`已发送`,
      icon: CheckCircle2,
      disabled: true,
    };
  }

  if (status === "blocked") {
    return {
      label: msg`已拉黑`,
      icon: ShieldBan,
      disabled: true,
    };
  }

  return {
    label: actionPending ? msg`发送中...` : msg`添加`,
    icon: UserPlus,
    disabled: actionPending,
  };
}

type MobileAddFriendSendSheetProps = {
  open: boolean;
  result: AddFriendSearchResult | null;
  ownerName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (greeting: string) => Promise<void> | void;
};

function MobileAddFriendSendSheet({
  open,
  result,
  ownerName,
  pending,
  onClose,
  onSubmit,
}: MobileAddFriendSendSheetProps) {
  const t = useRuntimeTranslator();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    if (!open || !result) {
      return;
    }

    const owner = ownerName.trim() || t(msg`我`);
    setGreeting(t(msg`你好，我是${owner}，想把你添加到通讯录里。`));
  }, [open, ownerName, result, t]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      const length = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(length, length);
    }, 80);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, pending]);

  if (!open || !result) {
    return null;
  }

  const trimmed = greeting.trim();
  const displayName = getSearchResultDisplayName(result);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(17,24,39,0.32)] sm:items-center">
      <button
        type="button"
        aria-label={t(msg`关闭`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative flex w-full max-w-[460px] flex-col rounded-t-[18px] bg-white pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] shadow-[0_-12px_32px_rgba(15,23,42,0.18)] sm:rounded-[14px]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[14px] text-[color:var(--text-secondary)] disabled:opacity-60"
          >
            {t(msg`取消`)}
          </button>
          <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
            {t(msg`好友申请`)}
          </div>
          <button
            type="button"
            disabled={pending || !trimmed}
            onClick={() => void onSubmit(trimmed)}
            className={cn(
              "text-[14px] font-medium",
              pending || !trimmed
                ? "text-[#9ca3af]"
                : "text-[#07c160] active:opacity-80",
            )}
          >
            {pending ? t(msg`发送中`) : t(msg`发送`)}
          </button>
        </div>

        <div className="px-4 pt-3.5">
          <div className="flex items-center gap-3 rounded-[10px] bg-[#f7f7f7] px-3 py-2.5">
            <AvatarChip
              name={displayName}
              src={result.character.avatar}
              size="wechat"
            />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                {displayName}
              </div>
              <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                {result.identifier}
              </div>
            </div>
          </div>

          <div className="mt-3.5 text-[12px] text-[color:var(--text-muted)]">
            {t(msg`发送验证申请，对方通过后即可成为朋友。`)}
          </div>

          <div className="mt-2.5">
            <textarea
              ref={textareaRef}
              value={greeting}
              maxLength={60}
              onChange={(event) => setGreeting(event.target.value)}
              placeholder={t(msg`请输入验证信息`)}
              rows={4}
              className="min-h-[112px] w-full resize-none rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[14px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.42)]"
            />
            <div className="mt-1 flex justify-end text-[11px] text-[color:var(--text-dim)]">
              {greeting.length}/60
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
