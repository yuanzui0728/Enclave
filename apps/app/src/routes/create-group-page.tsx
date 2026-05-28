import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import {
  createGroup,
  getFriends,
  SELF_CHARACTER_ID,
  type FriendListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, InlineNotice, cn } from "@yinjie/ui";

type Translator = ReturnType<typeof useRuntimeTranslator>;
import { AvatarChip } from "../components/avatar-chip";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildContactSections,
  createFriendDirectoryItems,
  getFriendDisplayName,
  matchesFriendSearch,
  type FriendDirectoryItem,
} from "../features/contacts/contact-utils";
import { RouteRedirectState } from "../components/route-redirect-state";
import { buildMobileGroupRouteHash } from "../features/chat/mobile-group-route-state";
import {
  buildDesktopChatRouteHash,
  buildDesktopChatThreadPath,
} from "../features/desktop/chat/desktop-chat-route-state";
import { buildDesktopContactsRouteHash } from "../features/desktop/contacts/desktop-contacts-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { parseCreateGroupRouteHash } from "../lib/create-group-route-state";
import {
  isDesktopOnlyPath,
  navigateBackOrFallback,
  overrideRecordedNavigationPair,
} from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { registerAndroidBackInterceptor } from "../runtime/android-back-button";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const DesktopCreateGroupDialog = lazy(async () => {
  const mod =
    await import("../features/desktop/chat/desktop-create-group-dialog");
  return { default: mod.DesktopCreateGroupDialog };
});

export function CreateGroupPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const routeState = useMemo(() => parseCreateGroupRouteHash(hash), [hash]);
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  // 走查（新一轮 R1）：原本有 `const [name, setName] = useState("")` + 在
  // baseUrl change effect 里 setName("")，但整页 JSX 里没有任何 <input> 绑到
  // setName——这是删 UI 时遗留的死状态。mutationFn 永远走 `name.trim() ||
  // defaultGroupName` 后半段（空串 trim 也空），等于 100% 用 defaultGroupName，
  // 多渲一次 useState + 一段 reset 噪音，给后续读代码的人留疑问"用户是不是
  // 应该能改群名？"。删掉 + 直接传 defaultGroupName；群创建后用户进群再
  // 改名（group-chat-edit-page）保持现行流程。
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R1：filteredFriends 直接吃 searchTerm，好友 100+ 时每个 keystroke 都
  // 同步 toLowerCase + filter + buildContactSections 一遍，输入框肉眼可见的卡
  // 顿。和 group-contacts-page / contacts-page / favorites-page / search-page
  // 同口径补 useDeferredValue，让 React 优先把字打进输入框、过滤排到下一个
  // idle 帧。
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const previousBaseUrlRef = useRef(baseUrl);
  const seededSelectionRef = useRef("");
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;

  // 走查 R1：原本用独立 cache key ["app-group-friends"]，结果跟 contacts-page /
  // mobile-add-friend-page 同样的 getFriends() 数据各自维护一份缓存，用户从通讯录
  // 点 + → 发起群聊 → 又重新拉一次 /api/social/friends。统一到 ["app-friends",
  // baseUrl] 直接复用主页面的缓存；配 15s staleTime 跟兄弟页保持一致，bulk /
  // accept-friend / character-detail 等 mutation 已经在显式 invalidate 这条 key。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    staleTime: 15_000,
  });

  // 走查 Round 2：char-default-self 是用户的自我镜像，本质就是你自己；createGroup
  // 后端已经隐式加你（owner role=owner）进群，再让"我自己"作为 character member 也被加
  // 进去会出现"你跟自己同时在群里"的诡异成员列表，且单独选自己一个能造出一条只有
  // 群主一个真人 + 0 个角色的空群。统一在 UI 列表里把 self 过掉，避免用户能选到。
  const friendItems = useMemo(
    () =>
      (friendsQuery.data ?? []).filter(
        (item) =>
          item.friendship.status !== "removed" &&
          item.character.id !== SELF_CHARACTER_ID,
      ),
    [friendsQuery.data],
  );
  const sortedFriendItems = useMemo(
    () => createFriendDirectoryItems(friendItems),
    [friendItems],
  );
  const selectedFriendMap = useMemo(
    () =>
      new Map(
        sortedFriendItems.map(
          (item) =>
            [item.character.id, item] satisfies [string, FriendDirectoryItem],
        ),
      ),
    [sortedFriendItems],
  );
  const selectedFriends = useMemo(
    () =>
      selectedIds
        .map((id) => selectedFriendMap.get(id))
        .filter((item): item is FriendDirectoryItem => Boolean(item)),
    [selectedFriendMap, selectedIds],
  );
  const defaultGroupName = useMemo(
    () => buildDefaultGroupName(t, selectedFriends),
    [t, selectedFriends],
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createGroup(
        {
          name: defaultGroupName,
          memberIds: selectedIds,
        },
        baseUrl,
      ),
    onSuccess: (group) => {
      // 走查 R1：原本 await Promise.all(invalidateQueries) 才 navigate 进新群，
      // 公网隧道 RTT ~600ms × 2 条 invalidate 阻塞导航，用户点完"确定建群"
      // 看着 spinner 多转 ~1s 才进入群聊。invalidate 是给通讯录/会话列表拉刷
      // 用的（目标页面 react-query 监听同 key 自动重拉），fire-and-forget
      // 让导航立刻发生即可。
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
      void queryClient.invalidateQueries({
        queryKey: ["app-conversations", baseUrl],
      });
      const returnPath =
        safeReturnPath ??
        (routeState.source === "chat-details" && routeState.conversationId
          ? `/chat/${routeState.conversationId}/details`
          : routeState.source === "group-contacts"
            ? "/contacts/groups"
            : undefined);
      const groupHash = buildMobileGroupRouteHash({
        returnPath,
        returnHash: safeReturnPath ? safeReturnHash : undefined,
      });
      // 走查（第三次会话 R1）：replace:true 把浏览器 history 里的 /group/new
      // 原地换成 /group/{id}，但 mobile-shell useEffect 看到的 pathname 变化
      // 跟 push 长得一样 → recordAppNavigation 把"被替换掉的 /group/new"当
      // 成 previousPath 写进 sessionStorage。从新群点返回时 group-chat-page
      // 走 navigateBackOrFallback(fallback,"/tabs/chat")，canSafelyNavigateBack
      // 拿 storage prev=/group/new 跟 expected /tabs/chat 比对失败 → fallback
      // 又 push 一条 /tabs/chat，history 变 [/tabs/chat, /group/{id},
      // /tabs/chat]。Android 硬件 Back 从这条幽灵 /tabs/chat 一按又落回
      // /group/{id} 死循环。pre-write storage 让 mobile-shell 的
      // recordAppNavigation 因 currentPath 已等于目标 path 早返兜住，把
      // "真实浏览器 prev"和"storage prev"对齐。
      //
      // R2 注意：mobile-shell 的 effect 算 currentPath 用 pathname+search+hash，
      // storage 里的 curr 也带 hash；只 pre-write `/group/${id}` (无 hash)
      // 跟 mobile-shell 写的 `/group/${id}#returnPath=...` 比对不等 → 早返兜
      // 不住，会被原逻辑覆盖回 {prev:/group/new}。必须拼上 hash 才能命中
      // currentState.currentPath === normalizedPath 那个分支。
      // 仅 returnPath 可定位时调用；深链入场（returnPath 不可知）维持原行为。
      if (returnPath) {
        const groupFullPath = groupHash
          ? `/group/${group.id}#${groupHash}`
          : `/group/${group.id}`;
        overrideRecordedNavigationPair(groupFullPath, returnPath);
      }
      void navigate({
        to: "/group/$groupId",
        params: { groupId: group.id },
        hash: groupHash,
        replace: true,
      });
    },
  });

  const createMutationResetRef = useRef(createMutation.reset);
  createMutationResetRef.current = createMutation.reset;
  // 同步防双击锁——下面 rightActions 的「确定」按钮原本只靠 disabled=
  // createMutation.isPending 兜底，但 disabled 要等 React commit 才生效，
  // 同帧内连点 2 次会同时通过两次 isPending=false → 两个 POST /groups 同时
  // 飞出去，结果用户进的是第 2 个群（replace:true），第 1 个群残留在通讯录里
  // 变成"幽灵群"。submittingRef ref 同步赋值，第一次 click 把它翻 true 之后
  // 同帧的所有后续 click 都被早返兜住；onSettled 解锁，失败也能重试。
  const submittingRef = useRef(false);

  useEffect(() => {
    if (previousBaseUrlRef.current === baseUrl) {
      return;
    }

    previousBaseUrlRef.current = baseUrl;
    seededSelectionRef.current = "";
    setSelectedIds([]);
    setSearchTerm("");
    // 走查（新一轮）：createMutation.reset() 把 mutation observer 清掉，但
    // mutate() 上挂的 inline onSettled 不会被回放——submittingRef 留在 true
    // 就 dead-lock 了：下次 createMutation.isPending=false 让按钮 visually
    // 解禁，但 onClick 那行 `if (submittingRef.current) return;` 一直早返，
    // 用户怎么戳 没反应。这里跟 mutation reset 一起手动平掉。
    submittingRef.current = false;
    createMutationResetRef.current();
  }, [baseUrl]);

  useEffect(() => {
    const seedKey = `${baseUrl}:${routeState.seedMemberIds.join(",")}`;
    if (seededSelectionRef.current === seedKey) {
      return;
    }

    if (!routeState.seedMemberIds.length) {
      seededSelectionRef.current = seedKey;
      return;
    }

    if (friendsQuery.isLoading) {
      return;
    }

    const validSeedIds = routeState.seedMemberIds.filter((id) =>
      selectedFriendMap.has(id),
    );
    seededSelectionRef.current = seedKey;

    if (!validSeedIds.length) {
      return;
    }

    setSelectedIds((current) => {
      const restIds = current.filter((id) => !validSeedIds.includes(id));
      return [...validSeedIds, ...restIds];
    });
  }, [
    baseUrl,
    friendsQuery.isLoading,
    routeState.seedMemberIds,
    selectedFriendMap,
    sortedFriendItems.length,
  ]);

  // 走查 R1：friendsQuery staleTime=15s 期间用户在另一 tab / 另一设备删了某个
  // 好友 → 后台 refetch 进来后 friendship.status='removed' 被 friendItems filter
  // 掉，selectedFriendMap 也丢掉这条；但 selectedIds 仍然攒着这个 stale id ——
  // 横滚「已选联系人」里看不到（selectedFriends 已经按 selectedFriendMap.get
  // 过滤），点「确定」时 createGroup 的 memberIds 里仍带它，后端要么静默剔除
  // 要么 400，用户在 UI 上无任何方式取消这个隐形选择。selectedFriendMap 一旦
  // 重建就 reconcile：丢掉 map 里不再存在的 id。friendsQuery.data 还没回来时
  // (initial null) 不动 selectedIds，免得把 seed/已选当 stale 一刀切。
  useEffect(() => {
    if (!friendsQuery.data) {
      return;
    }
    setSelectedIds((current) => {
      if (current.every((id) => selectedFriendMap.has(id))) {
        return current;
      }
      return current.filter((id) => selectedFriendMap.has(id));
    });
  }, [friendsQuery.data, selectedFriendMap]);

  // 走查（新一轮）：handleBack 的"先清搜索再退页"只在视觉返回按钮 click 上
  // 生效；Android 硬件 Back 走 Capacitor.App.backButton → handleBackPressed →
  // history.back()，完全绕开 handleBack，跟视觉返回 UX 分裂——用户搜一半按
  // 硬件 back 直接退页 + 丢已选。挂个 interceptor 把同一套清搜索逻辑搬到硬件
  // back 上；和 contacts-page R(quick-menu/bulk-mode) 同口径。桌面 layout 没
  // 这个搜索框，effect 提前 noop。用 ref 让 interceptor 始终读到最新
  // searchTerm，避免每次 keystroke 都解/注。
  const searchTermRef = useRef(searchTerm);
  searchTermRef.current = searchTerm;
  useEffect(() => {
    if (isDesktopLayout) {
      return;
    }
    return registerAndroidBackInterceptor((event) => {
      if (searchTermRef.current.trim()) {
        event.preventDefault();
        setSearchTerm("");
        return true;
      }
      return false;
    });
  }, [isDesktopLayout]);

  const filteredFriends = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    if (!keyword) {
      return sortedFriendItems;
    }

    return sortedFriendItems.filter((item) =>
      matchesFriendSearch(item, keyword),
    );
  }, [deferredSearchTerm, sortedFriendItems]);

  const filteredSections = useMemo(
    () => buildContactSections(filteredFriends),
    [filteredFriends],
  );

  // 走查 R1：handleBack 原本一律走 navigate({to: ...}) push 一条新 history
  // 项。用户路径是 /tabs/contacts → 点 + → /group/new → 点返回 ⇒ history 变成
  // [/tabs/contacts, /group/new, /tabs/contacts]，再按浏览器后退又落回
  // /group/new 死循环。mobile-add-friend-page / friend-requests-page 都已统一
  // 走 navigateBackOrFallback：能 history.back() 就 back，安全兜不住时再
  // 用 fallback 里的 fresh navigate。这里把整段重写成同模式，每个 source
  // 对应一条 fallback navigate。
  const exitPage = () => {
    const performFallbackNavigate = () => {
      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      if (isDesktopLayout && routeState.source === "chat-details" && routeState.conversationId) {
        void navigate({
          to: "/tabs/chat",
          hash: buildDesktopChatRouteHash({
            conversationId: routeState.conversationId,
            panel: "details",
          }),
        });
        return;
      }

      if (routeState.source === "chat-details" && routeState.conversationId) {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId: routeState.conversationId },
        });
        return;
      }

      if (routeState.source === "desktop-chat" && routeState.conversationId) {
        void navigate({
          to: buildDesktopChatThreadPath({
            conversationId: routeState.conversationId,
          }),
        });
        return;
      }

      if (isDesktopLayout && routeState.source === "group-contacts") {
        void navigate({
          to: "/tabs/contacts",
          hash: buildDesktopContactsRouteHash({
            pane: "groups",
            showWorldCharacters: false,
          }),
        });
        return;
      }

      if (routeState.source === "group-contacts") {
        void navigate({ to: "/contacts/groups" });
        return;
      }

      void navigate({ to: "/tabs/chat" });
    };

    navigateBackOrFallback(performFallbackNavigate, safeReturnPath);
  };

  const handleBack = () => {
    // 走查（新一轮）：搜不到联系人空态里已有「清空搜索」action，但顶栏「返回」
    // 在 searchTerm 非空时同样应该先吃掉搜索 —— 跟桌面 Escape clearSearch (见
    // desktop-create-group-dialog R 注释) / WeChat 移动端搜索框 back 一致。否则
    // 用户搜到一半想回退一步看全量列表，只能手动点 input 右侧 X 或清字串，反
    // 直觉地从顶栏点返回就直接把整页和已选都吹了。注意 dual 行为只给顶栏左上
    // 这个主"返回"手势用；下面错误/空态卡片里那几个明确写着「返回上一页」
    // 文案的退出按钮一律走 exitPage 直接退页，否则用户在 createMutation 错误
    // 弹框里点了「返回」按钮发现只是清掉搜索词、错误条还留在那 → 二次确认才
    // 真的退出，反人类。
    if (searchTerm.trim()) {
      setSearchTerm("");
      return;
    }

    exitPage();
  };

  const statusBackLabel = safeReturnPath
    ? t(msg`返回上一页`)
    : routeState.source === "group-contacts"
      ? t(msg`返回群聊列表`)
      : routeState.source === "chat-details"
        ? t(msg`返回聊天信息`)
        : routeState.source === "desktop-chat"
          ? t(msg`返回聊天`)
          : t(msg`返回消息列表`);

  const handleRetryLoad = () => {
    void friendsQuery.refetch();
  };

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  if (isDesktopLayout) {
    return (
      <div className="relative flex h-full min-h-0 bg-[color:var(--bg-app)]">
        <Suspense
          fallback={
            <RouteRedirectState
              title={t(msg`正在打开桌面发起群聊`)}
              description={t(msg`正在打开桌面发起群聊，马上恢复当前选择。`)}
              loadingLabel={t(msg`正在打开桌面发起群聊...`)}
            />
          }
        >
          <DesktopCreateGroupDialog
            open
            conversationId={routeState.conversationId}
            seedMemberIds={routeState.seedMemberIds}
            // 走查（新一轮）：桌面 dialog 的 onClose 语义是"关弹窗"，跟移动端
            // searchTerm 没关系；走 exitPage 直接退页，避免 isDesktopLayout
            // 在响应式断点切换时（mobile→desktop）残留的 searchTerm 让 onClose
            // 第一次点变成"清空一个看不见的搜索框"。
            onClose={exitPage}
            onCreated={(groupId) => {
              void navigate({
                to: buildDesktopChatThreadPath({
                  conversationId: groupId,
                }),
                replace: true,
              });
            }}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`选择联系人`)}
        titleAlign="center"
        className="mx-0 mt-0 mb-0 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 py-3 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)]"
            onClick={handleBack}
            // 走查（新一轮）：handleBack 现在 searchTerm 非空时走 setSearchTerm("")
            // 早返，aria-label 还硬编码"返回"对 SR 用户就是骗——听到"返回"按下
            // 去其实是清搜索词，下一次按才真的退页。同 file 内 R2 给搜索 input /
            // 横滚 chip 补 aria-label 是同口径思路，把屏幕阅读器的口播和实际
            // 行为对齐。
            aria-label={
              searchTerm.trim() ? t(msg`清空搜索`) : t(msg`返回`)
            }
          >
            <ArrowLeft size={18} />
          </Button>
        }
        rightActions={
          <button
            type="button"
            onClick={() => {
              if (submittingRef.current) return;
              if (!selectedIds.length || createMutation.isPending) return;
              submittingRef.current = true;
              createMutation.mutate(undefined, {
                onSettled: () => {
                  submittingRef.current = false;
                },
              });
            }}
            disabled={!selectedIds.length || createMutation.isPending}
            className={cn(
              "h-9 rounded-full px-3 text-[15px] font-medium transition",
              selectedIds.length && !createMutation.isPending
                ? "bg-[color:var(--brand-primary)] text-[#3b2206] active:opacity-90"
                : "text-[color:var(--text-dim)]",
            )}
          >
            {createMutation.isPending
              ? t(msg`创建中`)
              : selectedIds.length
                ? t(msg`确定(${selectedIds.length})`)
                : t(msg`确定`)}
          </button>
        }
      >
        <div className="space-y-3 pt-3">
          <div className="-mx-4 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                {t(msg`已选联系人`)}
              </div>
              <div className="text-[12px] text-[color:var(--text-muted)]">
                {selectedIds.length
                  ? t(msg`${selectedIds.length} 人`)
                  : t(msg`未选择`)}
              </div>
            </div>

            {selectedFriends.length ? (
              <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                {selectedFriends.map((item) => {
                  const displayName = getFriendDisplayName(item);
                  return (
                    <button
                      key={item.character.id}
                      type="button"
                      // 走查 R2：原本仅 selection rows disabled={createMutation.isPending}，
                      // 但顶上横滚的「已选 chip」漏锁——用户点了"确定"后到 onSuccess
                      // navigate 之间 ~500ms 公网 RTT 里，chip 还能点 → toggleSelection
                      // 改 state，把那位从 selectedIds 里剔掉；但 mutate() 闭包早就
                      // 抓走了旧 selectedIds 飞出去 → server 仍按原始名单建群，UI
                      // 上看到的"已选 N-1"和实际建好的"群里 N 人"对不上。和 rows 一
                      // 个口径 disable 掉。
                      disabled={createMutation.isPending}
                      onClick={() => toggleSelection(item.character.id)}
                      // 走查（新一轮 R1）：横滚已选联系人头像没有 aria-label，
                      // 屏幕阅读器读到 button 只读出文本子节点（displayName），
                      // 用户听到的就是「张三」「李四」三人连读，毫无可点提示。
                      // X 角标也没有 aria-hidden，盲人用户读 button 文本时容
                      // 易听成「张三 X」之类的乱码。同 contacts-page / 群成员
                      // 移除入口口径补全。
                      aria-label={t(msg`移除已选联系人 ${displayName}`)}
                      className="flex w-14 shrink-0 flex-col items-center gap-1 text-center"
                    >
                      <div className="relative">
                        <AvatarChip
                          name={displayName}
                          src={item.character.avatar}
                          size="wechat"
                        />
                        <span
                          aria-hidden="true"
                          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-white"
                        >
                          <X size={10} />
                        </span>
                      </div>
                      <span className="w-full truncate text-[11px] text-[color:var(--text-secondary)]">
                        {displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-[12px] leading-5 text-[color:var(--text-muted)]">
                {t(msg`先选择联系人，再开始一个新的群聊。`)}
              </div>
            )}
          </div>

          {(routeState.source === "chat-details" ||
            routeState.source === "desktop-chat") &&
          // 走查 R2：原本仅按 routeState.seedMemberIds.length 判断显示。
          // 但如果种子 character 已经被解除好友（friendship.status="removed"），
          // friendItems filter 把它过滤掉 → selectedFriendMap 里也没有 → seed
          // useEffect 跑完 validSeedIds=[] 不进任何 selection。此时上面横滚是
          // 「未选择」状态，下方却仍写「已按当前单聊默认勾选对方」——用户看
          // 着"勾选了哪个？我看不到啊"会以为页面坏了。改为按"种子 id 至少
          // 有一个能落到现有 friend map 里"判断；没有的话整条通知不显示，让
          // 用户直接走"先选择联系人"的空态文案。friendsQuery.isLoading 时
          // 保留显示，避免初次进来 friends 还没回来时通知闪一下又消失。
          (friendsQuery.isLoading ||
            routeState.seedMemberIds.some((id) =>
              selectedFriendMap.has(id),
            )) ? (
            <div className="-mx-4 border-y border-[color:var(--brand-primary)]/12 bg-[color:var(--brand-primary)]/6 px-4 py-3 text-[12px] leading-5 text-[#2f7a4c]">
              {t(msg`已按当前单聊默认勾选对方，你可以继续添加其他联系人。`)}
            </div>
          ) : null}

          <label className="flex items-center gap-2 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-2.5 text-sm text-[color:var(--text-dim)]">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t(msg`搜索`)}
              // 走查 R2：和姊妹页 chat-message-search-panel R1 / 桌面 R24 同款
              // a11y 修法——父 label 没有文本子节点（仅 Search 图标 + input），
              // placeholder 在 SR 上行为分裂，盲人用户 focus 进来听到"编辑栏
              // 空"。挂 aria-label="搜索联系人" 把意图明确表达出来。
              aria-label={t(msg`搜索联系人`)}
              // text-[16px]: iOS Safari focus 时 <16px 会强制 viewport zoom-in。
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              // 备注名 / 角色名 / 关系关键词常常是 ASCII（"wangxiaoming"、
              // "zhang yang"）或者带英文姓名缩写，iOS 默认会句首大写 +
              // autocorrect，用户敲"wang"被改成"Wang"或者"Want"，
              // matchesFriendSearch 内部已 toLowerCase 所以 case 不致命，但
              // autocorrect 把字直接改掉是真坑；同 mobile-search-workspace /
              // mobile-add-friend 同款关掉。enterKeyHint=search 让软键盘的
              // Return 键长得像"搜索"，跟"搜索结果列表"语义对齐。
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {friendsQuery.isLoading ? (
          <div className="px-4 pt-4">
            <MobileCreateGroupStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取联系人`)}
              description={t(msg`稍等一下，正在同步可拉进群的联系人。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {friendsQuery.isError && friendsQuery.error instanceof Error ? (
          <div className="px-4 pt-4">
            <MobileCreateGroupStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`联系人列表暂时不可用`)}
              description={describeRequestError(friendsQuery.error)}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    // 走查（新一轮 R1）：原本只 onClick={refetch} 没有 disabled。
                    // refetch 期间 isFetching=true 但 isError 还停在 true，红色
                    // 卡 + 重试按钮 UI 完全不变；公网隧道 ~600ms 内用户连点重
                    // 试 3~5 下都很正常 — React Query 会 coalesce 同步请求所
                    // 以无副作用，但按钮"按下去没反应"看着像坏了。挂
                    // isFetching 守卫 + 切换文案，跟 mobile-add-friend-page /
                    // friend-requests-page 等"重试读取"按钮统一口径。
                    disabled={friendsQuery.isFetching}
                    onClick={handleRetryLoad}
                  >
                    {friendsQuery.isFetching
                      ? t(msg`正在重试...`)
                      : t(msg`重试读取`)}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-full px-3 text-[11px]"
                    onClick={exitPage}
                  >
                    {statusBackLabel}
                  </Button>
                </div>
              }
              tone="danger"
            />
          </div>
        ) : null}
        {createMutation.isError && createMutation.error instanceof Error ? (
          <div className="px-4 pt-4">
            <InlineNotice
              tone="danger"
              // 走查（新一轮 R1）：createGroup 失败时这条红色 InlineNotice 是
              // 用户唯一的错误反馈，但 InlineNotice 内部是裸 <div>，没 role /
              // aria-live。屏幕阅读器用户点完"确定"后页面无任何播报，听到
              // selection 还在 → 以为操作生效了。tone="danger" 这条 100% 是
              // mutation 失败的语义错误，role="alert" 自带 aria-live="assertive"
              // 让 SR 立刻读出 error.message。读取失败 status card 是用户主动
              // 触发的 friendsQuery，retry 按钮在场不需要 alert。
              role="alert"
              className="rounded-[12px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {describeRequestError(createMutation.error)}
                </span>
                <button
                  type="button"
                  onClick={exitPage}
                  className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
                >
                  {statusBackLabel}
                </button>
              </div>
            </InlineNotice>
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        !friendItems.length ? (
          <div className="px-4 pt-6">
            <MobileCreateGroupStatusCard
              badge={t(msg`联系人`)}
              title={t(msg`还没有可拉进群的人`)}
              description={t(msg`先去通讯录里建立一些关系，再回来创建群聊。`)}
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={exitPage}
                >
                  {statusBackLabel}
                </Button>
              }
            />
          </div>
        ) : null}

        {!friendsQuery.isLoading &&
        !friendsQuery.isError &&
        friendItems.length > 0 &&
        !filteredFriends.length ? (
          <div className="px-4 pt-6">
            <MobileCreateGroupStatusCard
              badge={t(msg`暂无结果`)}
              title={t(msg`没有找到联系人`)}
              description={t(msg`换个名字、备注名或关系关键词试试。`)}
              // 走查（新一轮 R1）：原本只有「返回消息列表」action，但这页"搜不到
              // 联系人"的唯一原因就是 searchTerm 不命中——此时用户真正想做的是
              // 改/清搜索词继续选，而不是退出整个创建群聊页（连已选都丢）。点
              // 「返回消息列表」≈ 误触把用户踢出工作流。换成「清空搜索」，跟
              // contacts-page / favorites-page / search-page 等同款空态的 UX 口径
              // 一致：搜不到先让用户改关键词，而不是放弃当前页面。
              action={
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-full px-3 text-[11px]"
                  onClick={() => setSearchTerm("")}
                >
                  {t(msg`清空搜索`)}
                </Button>
              }
            />
          </div>
        ) : null}

        {filteredSections.length ? (
          <div>
            {filteredSections.map((section) => (
              <section key={section.key} className="mt-2">
                <div className="px-4 py-1.5 text-[12px] text-[color:var(--text-muted)]">
                  {section.title}
                </div>
                <div className="border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
                  {section.items.map((item, index) => (
                    <FriendSelectionRow
                      key={item.character.id}
                      checked={selectedIds.includes(item.character.id)}
                      disabled={createMutation.isPending}
                      name={getFriendDisplayName(item)}
                      relationship={
                        getFriendDisplayName(item) !== item.character.name
                          ? t(msg`昵称：${item.character.name}`)
                          : item.character.relationship
                      }
                      src={item.character.avatar}
                      withDivider={index > 0}
                      onClick={() => toggleSelection(item.character.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </AppPage>
  );
}

function FriendSelectionRow({
  checked,
  disabled,
  name,
  relationship,
  src,
  variant = "mobile",
  withDivider = false,
  onClick,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  relationship?: string;
  src?: string | null;
  variant?: "mobile" | "desktop";
  withDivider?: boolean;
  onClick: () => void;
}) {
  const t = useRuntimeTranslator();
  const isDesktop = variant === "desktop";

  return (
    <button
      type="button"
      // 走查（新一轮 R1）：button 视觉上是 checkbox（右侧绿色 ✓ 圈），但没
      // aria-pressed / aria-checked，屏幕阅读器只读「张三 世界联系人」，
      // 听不到「已选 / 未选」状态——盲人用户切勾完全靠记忆。原生 button
      // 加 aria-pressed 比换 role="checkbox" 风险小（不破坏键盘 Enter/Space
      // 触发），同 mobile-add-friend / group-member-picker 等已用同口径。
      aria-pressed={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 text-left disabled:opacity-60",
        isDesktop
          ? checked
            ? "rounded-[12px] border border-[color:var(--brand-primary)]/18 bg-[color:var(--surface-secondary)] px-4 py-3 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand-primary)_6%,transparent)]"
            : "rounded-[12px] border border-transparent bg-transparent px-4 py-3 transition hover:border-[color:var(--border-faint)] hover:bg-[color:var(--surface-console)]"
          : checked
            ? "bg-[color:var(--brand-primary)]/6 px-4 py-3.5"
            : "bg-[color:var(--bg-canvas-elevated)] px-4 py-3.5",
        !isDesktop && withDivider
          ? "border-t border-[color:var(--border-faint)]"
          : "",
        !isDesktop && !disabled
          ? "hover:bg-[color:var(--surface-card-hover)]"
          : "",
      )}
    >
      <AvatarChip name={name} src={src} size={isDesktop ? "md" : "wechat"} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] text-[color:var(--text-primary)]">
          {name}
        </div>
        {isDesktop ? (
          <div className="mt-1 truncate text-[12px] text-[color:var(--text-muted)]">
            {relationship || t(msg`世界联系人`)}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border transition-colors",
          isDesktop ? "h-6 w-6" : "h-5 w-5",
          checked
            ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-[#3b2206]"
            : isDesktop
              ? "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-transparent"
              : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] text-transparent",
        )}
      >
        <Check size={isDesktop ? 14 : 12} strokeWidth={2.8} />
      </div>
    </button>
  );
}

function buildDefaultGroupName(
  t: Translator,
  items: Array<Pick<FriendListItem, "friendship" | "character">>,
) {
  const names = items
    .map((item) => getFriendDisplayName(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!names.length) {
    return t(msg`临时群聊`);
  }

  if (items.length > 3) {
    return t(msg`${names.join("、")}等${items.length}人`);
  }

  return names.join("、");
}

function MobileCreateGroupStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      // 新会话走查 R1：和姊妹群聊页 StatusCard 一批同款修法——发起群聊页
      // friendsQuery 失败 / 没有可加好友空态时该卡片是页面唯一可读内容。
      // role="alert"+assertive 主动播报错误；loading 用 polite。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
