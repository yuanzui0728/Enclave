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
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
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
  const [searchText, setSearchText] = useState(routeState.keyword ?? "");
  const [submittedKeyword, setSubmittedKeyword] = useState(
    routeState.keyword ?? "",
  );
  // currentRouteHash 编码当前已提交的搜索词（不是初始 URL 里的 keyword）：用户
  // 在 /add-friend 上敲 "Alice" 搜出来后点头像看资料 / 点右上"新的朋友"，
  // 子页面带的 returnHash 要能让用户返回时看到 "Alice" 的结果，而不是落回
  // welcome 状态。原写法 keyword 取 routeState.keyword（初始 URL），用户搜
  // 完跳子页再返回，搜索词全丢。
  const currentRouteHash = useMemo(
    () =>
      buildMobileAddFriendRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
        keyword: submittedKeyword.trim() || undefined,
      }),
    [submittedKeyword, safeReturnHash, safeReturnPath],
  );

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<{
    message: string;
    tone: "info" | "success";
  } | null>(null);
  const [sendDialogCharacterId, setSendDialogCharacterId] = useState<
    string | null
  >(null);
  const previousBaseUrlRef = useRef(baseUrl);

  // baseUrl 切换（切账号 / 切世界）后旧 character.id 在新世界里基本不存在：
  // 1) submittedKeyword="Alice" 残留 → buildAddFriendSearchResults 在新世界字典
  //    里 filter 出空 → "没有找到 Alice" 误导态，用户以为新世界没人叫 Alice。
  // 2) sendDialogCharacterId 还指向旧世界的 character.id，sendDialogResult 通过
  //    searchResults.find 在新世界数据里找不到 → 立即变成 null → MobileAddFriend
  //    SendSheet 接到 open=false 自动关掉，用户正在敲的招呼语整段丢失，且没有任何
  //    "切世界了" 之类提示，看着像点击没生效。
  // 3) 旧的 notice（来自上个世界的 "好友申请已发送。"）2.4s 内还会在新世界顶端
  //    继续吊着，跟新世界毫无关系。
  // 4) 走查 R3 补：旧世界踩过的 sendRequest/openChat 4xx 错误，mutation.isError
  //    依然是 true，page-level ErrorBlock（line ~544）会把旧世界的错误一路挂在新
  //    世界顶端（SOCIAL_FRIEND_TARGET_NOT_FOUND 之类，文案完全跟新世界对不上）。
  //    mutation.reset() 在 baseUrl 翻面时一并把这两条 mutation 的 isError/error 清掉。
  //    实际 reset 调用放在两条 mutation 声明之后的下一条 useEffect，这里只先做 UI
  //    state 的同步清理；如果在这里直接引用 mutation.reset 会读到 use-before-init。
  // 上述四条本质都是"旧世界 UI 状态泄漏到新世界"，统一在 baseUrl 翻面那一刻清掉。
  useEffect(() => {
    if (previousBaseUrlRef.current === baseUrl) {
      return;
    }
    previousBaseUrlRef.current = baseUrl;
    setSearchText("");
    setSubmittedKeyword("");
    setSendDialogCharacterId(null);
    setNotice(null);
  }, [baseUrl]);

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

  // 用 direction=all 拿全集：默认 inbound-only 拿不到用户主动发出的 outbound
  // 请求，导致用户已经申请过的角色行还显示「可添加」可以再点一次（后端会
  // 静默 dedupe，但 UI 上误导用户以为可以再加）。和 character-detail-page 用
  // 同一个 ['app-friend-requests', baseUrl, 'all'] key 共享 react-query 缓存。
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl, "all"],
    queryFn: () => getFriendRequests(baseUrl, { direction: "all" }),
    // 跟兄弟 query（charactersQuery / friendsQuery）一致：用户在通讯录 → +
    // 添加朋友 → 角色详情来回切时不要每次都强制 refetch；同一 baseUrl 短时间
    // 内复用缓存即可，被本页 sendRequestMutation.onSuccess 主动 invalidate
    // 之后会立刻刷新。
    staleTime: 15_000,
  });

  const blockedQuery = useQuery({
    queryKey: ["app-contacts-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
    staleTime: 30_000,
  });

  const openChatMutation = useMutation({
    mutationFn: (characterId: string) =>
      getOrCreateConversation({ characterId }, baseUrl),
    onSuccess: (conversation) => {
      // 与 contacts-page.tsx 的 startChatMutation 对齐：conversation 可能为
      // null（被拉黑 / 权限受限时后端会返回空），漏 null 守护会让
      // navigate 取 .id 时 throw。
      if (!conversation) {
        // 静默 return 会让按钮从「打开中...」直接闪回「发消息」，用户看不到
        // 任何反馈，以为「点了没反应」会再点一次。给一条 info 提示告诉用户
        // 当前打不开的可能原因（多半是对方刚被拉黑 / 权限变了），避免无脑
        // 重试。
        setNotice({
          tone: "info",
          message: t(
            msg`暂时无法打开会话，对方可能已被屏蔽或权限受限，稍后再试。`,
          ),
        });
        return;
      }
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

  // 走查 R3：baseUrl 翻面时把 sendRequest / openChat 两条 mutation 的 isError
  // 也清掉。上面那条 UI state 清理 effect 跑得早，那时 mutation 还没初始化，
  // 这里独立一条 effect、放在 mutation 声明之后；走 ref 把 reset 函数固化避免
  // 把 mutation 本身当成 dep 触发无关 re-run。详细动机见上方 baseUrl effect
  // 第 4 条注释。
  const sendRequestResetRef = useRef(sendRequestMutation.reset);
  sendRequestResetRef.current = sendRequestMutation.reset;
  const openChatResetRef = useRef(openChatMutation.reset);
  openChatResetRef.current = openChatMutation.reset;
  const baseUrlMutationResetRef = useRef(baseUrl);
  useEffect(() => {
    if (baseUrlMutationResetRef.current === baseUrl) {
      return;
    }
    baseUrlMutationResetRef.current = baseUrl;
    sendRequestResetRef.current();
    openChatResetRef.current();
  }, [baseUrl]);

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
  // 右上角 "新的朋友" badge 只算需要用户处理的 inbound 请求（acceptAt=null
  // 是角色主动发起、等用户决定）；outbound 那些是用户已经发出去、等角色
  // 自动通过的，不应该在 badge 上提醒用户去 /friend-requests 操作。
  const pendingRequestCount = useMemo(() => {
    let count = 0;
    for (const request of friendRequestsQuery.data ?? []) {
      if (request.status === "pending" && !request.acceptAt) {
        count += 1;
      }
    }
    return count;
  }, [friendRequestsQuery.data]);

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
    navigateBackOrFallback(
      () => {
        if (safeReturnPath) {
          void navigate({
            to: safeReturnPath,
            ...(safeReturnHash ? { hash: safeReturnHash } : {}),
          });
          return;
        }

        void navigate({ to: "/tabs/chat" });
      },
      safeReturnPath ?? "/tabs/chat",
    );
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

    // inbound pending（对方发来的、还在等用户决定）：按钮不再 disabled，点击
    // 跳到 /friend-requests 让用户去通过 / 拒绝。outbound pending（用户已发）
    // 按钮还是 disabled，handler 不会触发。
    if (
      result.status === "pending" &&
      result.pendingRequest &&
      !result.pendingRequest.acceptAt
    ) {
      openFriendRequests();
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
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in，
              // 这里 autoFocus 进来就直接抖。
              className="min-w-0 flex-1 border-0 bg-transparent px-0 py-0 text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              autoFocus
              enterKeyHint="search"
              // 隐界号是带下划线的小写英数 ID（yinjie_alice123）；iOS 默认会
              // 自动大写句首字母 + 自动纠正"alice"→"Alice"，用户键入完按"搜
              // 索"被静默改成"Yinjie_Alice123"，跟服务端存的 ID 永远 case-
              // mismatch（matchCharacter 内部已经 toLowerCase，所以 case 不是
              // 直接致命，但 autocorrect 把"alice123"换成"alike123"才是真坑——
              // 用户根本意识不到自己敲的不是原 ID）。同 profile-info-name /
              // mobile-search-workspace 同款关 autocorrect / autocaps / spell。
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => {
                  // X 同时清掉 searchText 和 submittedKeyword——之前只清
                  // searchText，结果输入框已经空了、底下还在显示上一个 keyword
                  // 的结果，看着像「点 X 没反应」。submittedKeyword 一起清才会
                  // 回到 welcome 态，跟「取消」按钮一致。
                  setSearchText("");
                  setSubmittedKeyword("");
                  setNotice(null);
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
            <ErrorBlock message={loadingError.message}>
              {/* 对齐 friend-requests-page / contacts-page 的错误重试模板：4 条
                  query 任一挂掉时用户原本只能退页再进；这里把 refetch 一次性
                  重跑 4 条，让用户原地恢复。 */}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    void charactersQuery.refetch();
                    void friendsQuery.refetch();
                    void friendRequestsQuery.refetch();
                    void blockedQuery.refetch();
                  }}
                  className="rounded-full border border-[rgba(220,38,38,0.18)] bg-white px-3 py-1 text-[11px] font-medium text-[color:var(--state-danger-text)]"
                >
                  {t(msg`重试读取`)}
                </button>
              </div>
            </ErrorBlock>
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
                  // capped pending（500ms）只用来兜 sheet 自动关闭，row 上的
                  // 按钮要锁到真正的 mutation 完成为止，不然慢网下：发送 → 弹层
                  // 自动收 → row 又变回"添加" → 用户再点一次就触发第二条发送，
                  // 后端最终收到两条 friend request。这里看真实的 isPending。
                  (result.status === "available" &&
                    sendRequestMutation.isPending &&
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
        // 走查 R2：sendRequest 失败时 ErrorBlock 在 AppPage 文档流里渲染 (line ~544)
        // 但 sheet 是 fixed inset-0 z-50 整屏覆盖，错误被完全盖住。用户只看到
        // 按钮从"发送中"复位回"发送"，以为只是手抖没点中，再点一次又踩同一个
        // 4xx，整个循环里没有任何"为什么失败"的反馈。把 mutation.error 透传进
        // sheet 内部展示在 textarea 下方——既不关 sheet 也不丢用户已敲的 greeting，
        // 用户能直接看到"对方拒绝/限流/网络断开"，再决定是否重试或改文案。只在
        // sheet 仍开着的时候透传，免得关闭后又把"我自己"打来的过期 error 拍回来。
        errorMessage={
          sendDialogResult &&
          sendRequestMutation.isError &&
          sendRequestMutation.error instanceof Error
            ? sendRequestMutation.error.message
            : null
        }
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
  // chip 必须是「真能搜的字符串」而不是描述用法的标签。原来用 ["角色名",
  // "隐界号", "关系描述"]——点击就把这些 label 作为 keyword 提交，几乎永远
  // 命中不到东西。第二轮换成 ["yinjie_1234abcd","白石","数字人","治愈系"]
  // 依然全部命中 0：fake yinjie_ ID 必定不匹配，"白石/数字人/治愈系" 在当前
  // 世界角色池里没有任何角色名 / 资料 / expertDomains 命中。点一下就直接
  // 落到 "没有找到 X" 空态，比不放 chip 还误导用户。
  // 改成默认 seed 角色池里高命中的关键词（角色名前缀 / 关系描述 / expert
  // domain 都会命中）：林 = 13 命中（林佑/林医生/林晨…），老师 = 11 命中
  // （苏老师 + profile.relationship 含「老师」一片），导师 = 6 命中，复盘 =
  // 6 命中。隐界号格式提示由顶端 placeholder「隐界号 / 角色名」承担，不再
  // 硬编码 fake yinjie_ chip。
  const examples = [
    t(msg`林`),
    t(msg`老师`),
    t(msg`导师`),
    t(msg`复盘`),
  ];

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
      {/* 走查 R3：原版标题没 max-w / break-words，submittedKeyword 来自 URL
          hash 的 q= 参数，攻击者诱导用户打开 /add-friend#q=<60 个无空格字符>
          时标题文本会撑破窄屏（iOS 320px 容器只剩 ~270px），整页落到水平
          滚动。Chinese 在字间会自然换行不踩；纯 ASCII 长串才会爆。加 mx-auto
          max-w-[280px] + break-words 跟下方描述统一收紧；description 已经有
          max-w-[280px] 就是这套防线，title 漏了一个。 */}
      <div className="mx-auto mt-4 max-w-[280px] break-words text-[16px] font-medium text-[color:var(--text-primary)]">
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
  const meta = getMobileResultStatusMeta(
    item.status,
    actionPending,
    item.pendingRequest,
  );
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
              {/* badge 跟按钮文案对齐：Bug W 之后 outbound pending 按钮显示
                  "已发送"、inbound pending 显示"待处理"，但顶部 badge 一律
                  formatRelationshipStatus("pending")="待处理"——同一行 badge 跟
                  button 描述对不上。pending 状态时按 acceptAt 区分。 */}
              <span className="shrink-0 text-[10px] text-[color:var(--text-dim)]">
                {item.status === "pending" && item.pendingRequest?.acceptAt
                  ? t(msg`已发送`)
                  : t(formatRelationshipStatus(item.status))}
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
                // 按 meta.disabled 加 opacity-70 而不是按 status：Bug W 之后
                // inbound pending（acceptAt=null）按钮其实是可点的（跳 /friend-requests），
                // 旧 status==="pending" 一刀切的话会把 inbound 也变成 70% 透明，
                // 看起来跟 disabled 一样让人不敢点。outbound pending / blocked
                // 仍是真 disabled，由 meta.disabled 维持原样。
                meta.disabled ? "opacity-70" : undefined,
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
  pendingRequest?: AddFriendSearchResult["pendingRequest"],
): ResultStatusMeta {
  if (status === "friend") {
    return {
      label: actionPending ? msg`打开中...` : msg`发消息`,
      icon: MessageCircleMore,
      disabled: actionPending,
    };
  }

  if (status === "pending") {
    // acceptAt=null 表示对方（角色）主动发来的、还在等用户决定的 inbound 请求；
    // acceptAt=set 表示用户自己发出去、等角色 auto-accept 的 outbound。原来一律
    // 显示成"已发送"会让用户以为是自己发的（实际可能是摇一摇 / 相遇 inbound），
    // 而且没有任何指引去 /friend-requests 处理。inbound 改成"待处理"并可点击。
    const isInbound = !pendingRequest?.acceptAt;
    if (isInbound) {
      return {
        label: msg`待处理`,
        icon: UserPlus,
        disabled: false,
      };
    }
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
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (greeting: string) => Promise<void> | void;
};

function MobileAddFriendSendSheet({
  open,
  result,
  ownerName,
  pending,
  errorMessage,
  onClose,
  onSubmit,
}: MobileAddFriendSendSheetProps) {
  const t = useRuntimeTranslator();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [greeting, setGreeting] = useState("");

  // 只在弹层打开 / 切换到不同角色时重置 greeting；以前 dep 用 result 整个对象，
  // searchResults useMemo 一旦重算 result 引用就变，这条 effect 会把用户已经
  // 改过的 greeting 直接覆盖回模板（在网络一抖 / friendRequestsQuery 自动 refresh
  // 时复现）。
  // 二次收紧：ownerName / t 也别进 dep —— ownerName 来自 world-owner-store，
  // hydrate 完 / 用户在另一处改了用户名 / WS 推过来都会让引用换；t 来自
  // useRuntimeTranslator，locale 一变就换。这两条本来都和"用户正在敲招呼"
  // 互不相干，但只要进 dep，effect 一重跑就把 draft 拍回模板，用户的"hi
  // 啊好久不见"立刻被覆盖成"你好，我是X，想把你添加到通讯录里。"
  // 用 sessionRef 标记"这次会话已经初始化过模板了"——同一个 (open=true,
  // targetCharacterId) 组合下不再重置。
  const targetCharacterId = result?.character.id ?? null;
  const initializedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !targetCharacterId) {
      initializedSessionRef.current = null;
      return;
    }
    if (initializedSessionRef.current === targetCharacterId) {
      return;
    }
    initializedSessionRef.current = targetCharacterId;
    const owner = ownerName.trim() || t(msg`我`);
    setGreeting(t(msg`你好，我是${owner}，想把你添加到通讯录里。`));
  }, [open, ownerName, targetCharacterId, t]);

  // 把 "首次聚焦/把光标移到末尾" 和 "Escape 监听" 拆成两条 effect：
  // 原写法把 onClose（父组件每次 render 都是新箭头函数）放进 deps，导致父端
  // 任何 re-render（如 friendRequestsQuery 后台 refetch）都会把这条 effect 重跑
  // → cleanup + 重新 setTimeout(80ms)。用户正在编辑 greeting 时光标会被强制
  // 跳到文本末尾。focus 只在 open 翻转那一次跑一次就行。
  useEffect(() => {
    if (!open) {
      return;
    }
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
      const length = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(length, length);
    }, 80);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, pending]);

  // 原生壳硬件 Back：sheet 打开时先关 sheet，不让 BACK 把用户从 /add-friend 直
  // 接 history.back 弹回 /tabs/contacts。pending 中（正在发送）不拦避免打断。
  useEffect(() => {
    if (!open || pending) {
      return;
    }
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [open, onClose, pending]);

  // 走查 R1：sheet 是 fixed inset-0，但没锁 body scroll —— iOS Safari WKWebView
  // 上用户用手指在半透明遮罩 / sheet 之外区域滑动会"穿透"滚动底层 /add-friend
  // 的搜索结果列表，遮罩看着不动、底下列表却在飘。同 share-card-modal /
  // channels-forward-picker 同款 body.style.overflow="hidden" 兜一下。
  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

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

      <div
        // pb 接 --keyboard-inset：iOS WKWebView 上软键盘弹起会盖住 fixed
        // 元素，sheet 底部「取消 / 发送」按钮看不见。mobile-shell 把 keyboard
        // 高度写进 --keyboard-inset CSS 变量，这里 max(safe-area, keyboard)
        // 抬高 sheet 内容，保证按钮始终高于键盘。
        className="relative flex w-full max-w-[460px] flex-col rounded-t-[18px] bg-white pb-[calc(max(env(safe-area-inset-bottom,0px),var(--keyboard-inset,0px))+0.75rem)] shadow-[0_-12px_32px_rgba(15,23,42,0.18)] sm:rounded-[14px]"
      >
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
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
              className="min-h-[112px] w-full resize-none rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-[16px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.42)]"
            />
            <div className="mt-1 flex justify-end text-[11px] text-[color:var(--text-dim)]">
              {greeting.length}/60
            </div>
          </div>

          {/* 走查 R2：失败原因渲染在 sheet 内部（textarea 下方）。父端 page-level
              的 ErrorBlock 被 z-50 sheet 完全盖住，不在这里二次展示用户就只能反复
              踩同一个 4xx。 */}
          {errorMessage ? (
            <div
              role="alert"
              className="mt-2.5 rounded-[10px] border border-[rgba(220,38,38,0.18)] bg-[rgba(254,242,242,0.94)] px-3 py-2 text-[12px] leading-5 text-[color:var(--state-danger-text)]"
            >
              {errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
