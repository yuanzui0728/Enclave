import {
  Suspense,
  lazy,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { onChatMessage, onConversationUpdated } from "../lib/socket";
import { ArrowLeft, MessageSquarePlus, Search, X } from "lucide-react";
import { getConversations, getGroups, type Group } from "@yinjie/contracts";
import { isPersistedGroupConversation } from "../lib/conversation-route";
import { AppPage, Button, cn } from "@yinjie/ui";
import { GroupAvatarChip } from "../components/group-avatar-chip";
import { RouteRedirectState } from "../components/route-redirect-state";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { parseDesktopContactsRouteState } from "../features/contacts/contacts-route-state";
import { stripBidiControl } from "../features/contacts/contact-utils";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildCreateGroupRouteHash } from "../lib/create-group-route-state";
import { formatConversationTimestamp } from "../lib/format";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const t = translateRuntimeMessage;

const DesktopContactsRouteRedirectShell = lazy(async () => {
  const mod =
    await import("../features/contacts/contacts-route-redirect-shell");
  return { default: mod.ContactsRouteRedirectShell };
});

export function GroupContactsPage() {
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const desktopPaneState = useMemo(() => {
    const routeState = parseDesktopContactsRouteState(hash);
    return routeState.pane === "groups" ? routeState : null;
  }, [hash]);

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在切换到桌面群聊`)}
            description={t(msg`正在跳转到桌面通讯录中的群聊视图。`)}
            loadingLabel={t(msg`切换桌面群聊视图...`)}
          />
        }
      >
        <DesktopContactsRouteRedirectShell
          pane="groups"
          characterId={desktopPaneState?.characterId}
        />
      </Suspense>
    );
  }

  return <MobileGroupContactsPage />;
}

function MobileGroupContactsPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchText, setSearchText] = useState("");
  // 走查 Round 8：搜索框直接拿 searchText 喂 filter，长群表（用户加过 50+ 群
  // 时）连续敲字每个 keystroke 都打一次同步 toLowerCase + filter，输入框肉眼可
  // 见的卡顿。和 contacts-page / favorites-page / search-page 同口径补
  // useDeferredValue，让 React 优先把字打进输入框、过滤排到下一个 idle 帧。
  const deferredSearchText = useDeferredValue(searchText);
  const routeState = useMemo(() => parseMobileGroupRouteState(hash), [hash]);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  // 群聊列表页不需要 highlightedMessageId（那是 /group/\$id 聊天页用的）。
  // 不要把它带到 currentRouteHash 里，避免 deep-link 进来时把它泄到子页 returnHash。
  const currentRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [safeReturnHash, safeReturnPath],
  );

  const queryClient = useQueryClient();
  // 走查 Round 8：
  // 1) 没设 staleTime → 默认 0，每次进页都会立刻 refetch /groups 一次。父级
  //    /tabs/contacts 的 contactGroupsQuery 已经用 staleTime:30_000 同 key 在
  //    缓存里，新页一挂载又强制打一次。和父级对齐到 30s。
  // 2) 这页过去只靠 socket onConversationUpdated/onChatMessage 触发 invalidate，
  //    但 cloud-api gateway 的这两个事件都是房间级 emit（client 必须 emit
  //    join_conversation 才会收到），而 /contacts/groups 自己从不 join 任何
  //    group room——chat-list-page 旁边那条 comment 早就点过这个坑。结果就是
  //    用户刚装/重启 app、socket 还没 join 任何房间时，从后台切回前台、群
  //    被改名 / 被另一端 hide / 被另一端 leave 后这里看到的还是旧数据。补
  //    refetchOnWindowFocus 兜底，跟 chat-list-page 同口径。
  const groupsQuery = useQuery({
    queryKey: ["app-contact-groups", baseUrl],
    queryFn: () => getGroups(baseUrl),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  // 走查 R3：本页的群行用 `<GroupAvatarChip name={group.name} />` 单 seed 渲染，
  // 而 chat-list 的群行用 `members={conversation.participants}` 四 seed 渲染——
  // 同一个群在「消息」tab 和「通讯录/群聊」tab 看到的 2×2 马赛克完全不一样，
  // 切 tab 时肉眼可见的"是不是进错了群"。toGroup 后端 DTO 没带 participants
  // 字段（getGroups 仅返回 Group 元数据），改后端会动太多调用方；客户端这里
  // 借 conversations cache 找同 id 的会话 → 拿 participants → 喂给 chip，参与
  // 者列表与 chat-list 完全对齐。conversations 是 chat-list / 群通话页 / 群信息
  // 页都在用的共享 cache，进通讯录前用户大概率刚停过 chat-list，命中率高；
  // 即使冷启 cache 没命中，落回单 seed 渲染（之前的行为），同时本页这次的
  // useQuery 也会顺手把 cache 填上，下次稳态就一致了。
  // 走查 R1：原本没设 staleTime，每次进群聊列表都会立刻 refetch /conversations
  // 一次——本页只用 conversations 来取 participants 给 GroupAvatarChip，对新鲜度
  // 要求不高（即便落后几十秒，群头像 seed 也只是 4 个名字的 hash）。和兄弟页
  // contacts-page (15s) / chat-list (10s) 同口径加 15s staleTime，避免每次从
  // /tabs/chat 切回来都把全量 conversations 当场再拉一遍。
  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    staleTime: 15_000,
  });
  const groupParticipantsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const conversation of conversationsQuery.data ?? []) {
      if (isPersistedGroupConversation(conversation)) {
        map.set(conversation.id, conversation.participants);
      }
    }
    return map;
  }, [conversationsQuery.data]);

  // 走查 Round 5：群被 AI 回复触发 touchGroupActivity → isHidden=false 翻回
  // 可见时，chat-list 通过 socket onChatMessage/onConversationUpdated 立即拉
  // 刷新；但通讯录页只裸 useQuery 没订阅 socket，要等用户离开再回来才看到
  // 这条群。这里订阅同样的两个事件 invalidate 自己的 cache key，对齐
  // chat-list-page 的口径。
  // 走查 Round 6：onChatMessage / onConversationUpdated 都同时分发单聊 + 群
  // 聊事件，原版两条都无条件 invalidate，活跃单聊用户每条消息和每次单聊
  // 更新都把 /groups 强制 refetch 一遍。按 payload 维度过滤——onChatMessage
  // 看 groupId、onConversationUpdated 看 type === "group"。
  useEffect(() => {
    const offUpdated = onConversationUpdated((payload) => {
      if (payload.type !== "group") {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
    });
    const offMessage = onChatMessage((payload) => {
      if (!("groupId" in payload)) {
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["app-contact-groups", baseUrl],
      });
    });
    return () => {
      offUpdated();
      offMessage();
    };
  }, [baseUrl, queryClient]);

  // 走查 Round 3：getGroups 后端 listGroups 不过滤 isHidden，被 hideGroup 隐藏
  // 的群当前会和正常群混在通讯录里——和 hide 的语义不符（hide=暂时从入口摘掉，
  // 收到新消息再重新冒出来；通讯录是"长期入口"，hide 期间不应该有）。客户端先
  // 滤一遍 isHidden=true，避免改后端 listGroups 影响别处。
  const visibleGroups = useMemo(
    () => (groupsQuery.data ?? []).filter((group) => !group.isHidden),
    [groupsQuery.data],
  );
  const filteredGroups = useFilteredGroups(visibleGroups, deferredSearchText);
  // 走查 Round 9：filteredGroups 是按 deferredSearchText 算的，但 hasSearchText
  // 早先跟 searchText 走——清空搜索框那一帧，searchText 已经 "" 但
  // deferredSearchText 还是上一个关键字，filteredGroups 还是 0 条。这时空态判定
  // `!filteredGroups.length` 命中、但 hasSearchText=false，落到了「还没有群聊 /
  // 发起群聊」分支：用户明明只是清空搜索、群也都在，却闪一下「群被清空、要不要
  // 发起新群」的引导，肉眼可见的误导。让 hasSearchText 也跟 deferredSearchText
  // 同步，空态文案永远跟当前列表口径一致。
  const hasSearchText = deferredSearchText.trim().length > 0;

  function navigateToRouteStateReturn() {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  }

  function handleStatusBack() {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/contacts" });
  }

  function handleRetryGroups() {
    void groupsQuery.refetch();
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`群聊`)}
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() =>
              navigateBackOrFallback(
                () => {
                  if (navigateToRouteStateReturn()) {
                    return;
                  }

                  void navigate({ to: "/tabs/contacts" });
                },
                safeReturnPath ?? "/tabs/contacts",
              )
            }
            aria-label={t(msg`返回通讯录`)}
          >
            <ArrowLeft aria-hidden="true" size={18} />
          </Button>
        }
        rightActions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full text-[color:var(--text-primary)] active:bg-black/[0.05]"
            onClick={() => {
              void navigate({
                to: "/group/new",
                hash: buildCreateGroupRouteHash({
                  source: "group-contacts",
                  returnPath: pathname,
                  returnHash: currentRouteHash || undefined,
                }),
              });
            }}
            aria-label={t(msg`发起群聊`)}
          >
            <MessageSquarePlus aria-hidden="true" size={17} />
          </Button>
        }
      >
        <div className="pt-1.5">
          <label className="flex h-9 items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas-elevated)] px-3 text-[length:var(--text-caption)] text-[color:var(--text-dim)]">
            <Search aria-hidden="true" size={14} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t(msg`搜索群聊`)}
              // 走查 R8：和姊妹页 R1-R3 同款 a11y 修法——父 label 没有文本子节点
              // （仅 Search 图标 + input），placeholder 在 SR 上行为分裂，盲人
              // 用户 focus 进来听到"编辑栏 空"。挂 aria-label="搜索群聊"。
              aria-label={t(msg`搜索群聊`)}
              // text-[length:var(--text-title)]: iOS Safari focus 时 <16px 会强制 viewport zoom-in；
              // 和 group-member-picker / create-group 等其他群相关搜索框对齐。
              className="min-w-0 flex-1 bg-transparent text-[length:var(--text-title)] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              // 走查 R1：和姊妹页 create-group-page R1 / group-member-picker-page
              // R1 同款。群名常是 ASCII / 英文（"TeamA"、"discord"），iOS 默认
              // 句首大写 + autocorrect 会把"teamA"改成"TeamA"或"Team"，
              // useFilteredGroups 内部 toLowerCase 所以 case 不致命，但
              // autocorrect 把字直接改掉是真坑。enterKeyHint=search 让软键盘
              // 的 Return 键长得像"搜索"。
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {searchText ? (
              // 走查 R2：和姊妹页 world-characters / starred-friends / tags / mobile-
              // add-friend 一批补齐——type="search" 浏览器原生 X 在 iOS WKWebView /
              // Android Chrome 里渲染极不一致不能依赖，并且空态分支 line 363-371
              // 的"清除搜索"按钮要"先空态触发才出现"，长 query 用户没看到结果
              // 时只能逐字 backspace。
              <button
                type="button"
                onClick={() => setSearchText("")}
                className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-dim)] active:bg-black/5"
                aria-label={t(msg`清空搜索`)}
              >
                <X aria-hidden="true" size={13} />
              </button>
            ) : null}
          </label>
        </div>
      </TabPageTopBar>

      <div className="pb-8">
        {groupsQuery.isLoading ? (
          <div className="px-4 pt-2.5">
            <MobileGroupContactsStatusCard
              badge={t(msg`读取中`)}
              title={t(msg`正在读取群聊`)}
              description={t(msg`稍等一下，正在同步当前世界里的群聊列表。`)}
              tone="loading"
            />
          </div>
        ) : null}
        {groupsQuery.isError && groupsQuery.error instanceof Error ? (
          <div className="px-4 pt-2.5">
            <MobileGroupContactsStatusCard
              badge={t(msg`读取失败`)}
              title={t(msg`群聊列表暂时不可用`)}
              description={describeRequestError(groupsQuery.error)}
              tone="danger"
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={handleRetryGroups}
                  >
                    {t(msg`重试读取`)}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={handleStatusBack}
                  >
                    {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回通讯录`)}
                  </Button>
                </div>
              }
            />
          </div>
        ) : null}

        {!groupsQuery.isLoading &&
        !groupsQuery.isError &&
        !filteredGroups.length ? (
          <div className="px-4 pt-4">
            <MobileGroupContactsStatusCard
              badge={hasSearchText ? t(msg`暂无结果`) : t(msg`群聊`)}
              title={hasSearchText ? t(msg`没有找到匹配的群聊`) : t(msg`还没有群聊`)}
              description={
                hasSearchText
                  ? t(msg`换个群名称或公告关键词试试。`)
                  : t(msg`先发起一个新的群聊，建好后就会出现在这里。`)
              }
              action={
                hasSearchText ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={() => setSearchText("")}
                  >
                    {t(msg`清除搜索`)}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3.5 text-[length:var(--text-eyebrow)]"
                    onClick={() => {
                      void navigate({
                        to: "/group/new",
                        hash: buildCreateGroupRouteHash({
                          source: "group-contacts",
                          returnPath: pathname,
                          returnHash: currentRouteHash || undefined,
                        }),
                      });
                    }}
                  >
                    {t(msg`发起群聊`)}
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {filteredGroups.length ? (
          <section className="mt-1 overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
            {filteredGroups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  void navigate({
                    to: "/group/$groupId",
                    params: { groupId: group.id },
                    hash: buildMobileGroupRouteHash({
                      returnPath: pathname,
                      returnHash: currentRouteHash || undefined,
                    }),
                  });
                }}
                // 走查 Round 9：本页是和 contacts-page 主页、chat-list、
                // world-characters 同口径的"长列表行"——用户加过 30/50+ 群时屏外
                // 的 row 仍然被强制 layout/paint。隔壁页面早就靠 yj-list-item-virtual
                // 把 content-visibility:auto + contain-intrinsic-size 接上，唯独
                // 本页一直裸跑（typical 群行 ≈ 68px，挂在 64px 这一档下没问题）。
                className={cn(
                  "yj-list-item-virtual flex w-full items-center gap-3 bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5 text-left transition-colors hover:bg-[color:var(--surface-card-hover)]",
                  index > 0
                    ? "border-t border-[color:var(--border-faint)]"
                    : undefined,
                )}
              >
                <GroupAvatarChip
                  // 通讯录 mobile 走查 R1：群名是群主 / 改名权限成员可改的用户
                  // 输入端，含 U+202E 类 bidi 控制字符会把后续 timestamp 视觉
                  // 反转，且 GroupAvatarChip 也会把 name 落进 alt 让屏阅器读乱。
                  // 跟 character.name / friendship.remarkName 等其他用户输入端
                  // 的 strip 同口径。
                  name={stripBidiControl(group.name)}
                  members={groupParticipantsMap.get(group.id)}
                  size="wechat"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 truncate text-[length:var(--text-body)] text-[color:var(--text-primary)]">
                      {stripBidiControl(group.name)}
                    </div>
                    <div className="shrink-0 text-[9px] text-[color:var(--text-dim)]">
                      {formatConversationTimestamp(
                        group.savedToContactsAt ?? group.lastActivityAt,
                      )}
                    </div>
                  </div>
                  {!group.savedToContacts ? (
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[color:var(--text-dim)]">
                      <span className="inline-flex items-center rounded-full bg-[color:var(--state-info-bg)] px-1.5 py-0.5 text-[9px] text-[color:var(--text-muted)]">
                        {t(msg`未保存到通讯录`)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

function MobileGroupContactsStatusCard({
  badge,
  title,
  description,
  action,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: "default" | "danger" | "loading";
}) {
  return (
    <section
      // 新会话走查 R1：和姊妹群聊页 StatusCard 一批同款修法——通讯录群聊
      // 列表 load 失败 / 空态时该卡片是页面唯一可读内容，盲人 SR 不知道
      // 是"加载失败要重试"还是"还没有群聊要发起"。role="alert"+assertive
      // 主动播报错误；loading 用 polite 让"正在读取群聊"轻提示。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
      className={cn(
        "rounded-[var(--radius-md)] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[color:var(--state-danger-bg)] text-[color:var(--state-danger-text)]"
            : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[color:var(--state-success-bg)] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[length:var(--text-body)] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[length:var(--text-eyebrow)] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}

function useFilteredGroups(groups: Group[], searchText: string) {
  return useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return groups;
    }

    return groups.filter((group) => {
      const announcement = group.announcement?.trim().toLowerCase() ?? "";
      return (
        group.name.toLowerCase().includes(normalizedSearchText) ||
        announcement.includes(normalizedSearchText)
      );
    });
  }, [groups, searchText]);
}
