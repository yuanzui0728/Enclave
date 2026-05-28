import { useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  getConversations,
  getCyberAvatarSelfProfile,
  getFriends,
  type ConversationListItem,
  type FriendListItem,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, cn } from "@yinjie/ui";
import {
  Blocks,
  ChevronRight,
  Fingerprint,
  Gamepad2,
  MapPin,
  Newspaper,
  Plus,
  PlaySquare,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { MonoIconTile } from "../../components/mono-icon-tile";
import { TabPageTopBar } from "../../components/tab-page-top-bar";
import { buildDesktopChannelsRouteHash } from "../channels/channels-route-state";
import { buildMobileDiscoverToolRouteHash } from "../discover/mobile-discover-tool-route-state";
import { buildFeedRouteHash } from "../feed/feed-route-state";
import { buildMobileGamesRouteSearch } from "../games/mobile-games-route-state";
import { buildMobileMiniProgramsRouteSearch } from "../mini-programs/mobile-mini-programs-route-state";
import { buildDesktopMomentsRouteHash } from "../moments/moments-route-state";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { RouteRedirectState } from "../../components/route-redirect-state";
import { formatConversationTimestamp } from "../../lib/format";
import { searchStringToObject } from "../../lib/route-search";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { useHasCloudSession } from "../../store/cloud-session-store";
import { useWorldOwnerStore } from "../../store/world-owner-store";

type WorldMessage = ReturnType<typeof msg>;

// 探索入口目标路由（与 discover-page 的 to 联合一致，复用同一批 build* 辅助函数 →
// 跳转后能正确返回世界页，所有功能零丢失）。
type ExploreTo =
  | "/discover/moments"
  | "/discover/encounter"
  | "/discover/avatar-encounter"
  | "/cyber-avatar"
  | "/discover/scene"
  | "/discover/feed"
  | "/discover/channels"
  | "/discover/games"
  | "/discover/mini-programs"
  | "/shop";

type ExploreEntry = {
  key: string;
  label: WorldMessage;
  hint: WorldMessage;
  icon: LucideIcon;
  to: ExploreTo;
  buildSearch?: (ctx: { hash: string; pathname: string }) => string | undefined;
  buildHash?: (ctx: { hash: string; pathname: string }) => string | undefined;
};

// 原「发现」10 入口全量保留，重组为 相遇 / 动态 / 生活 三组（去彩虹单色图标）。
const encounterEntries: ExploreEntry[] = [
  {
    key: "encounter",
    label: msg`摇一摇`,
    hint: msg`随机相遇`,
    icon: Sparkles,
    to: "/discover/encounter",
    buildHash: ({ pathname, hash }) =>
      buildMobileDiscoverToolRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "avatarEncounter",
    label: msg`分身相遇`,
    hint: msg`分身互访`,
    icon: UsersRound,
    to: "/discover/avatar-encounter",
    buildHash: ({ pathname, hash }) =>
      buildMobileDiscoverToolRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "scene",
    label: msg`场景相遇`,
    hint: msg`特定场景`,
    icon: MapPin,
    to: "/discover/scene",
    buildHash: ({ pathname, hash }) =>
      buildMobileDiscoverToolRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "cyberAvatarSelf",
    label: msg`赛博分身`,
    hint: msg`你的镜像`,
    icon: Fingerprint,
    to: "/cyber-avatar",
    buildHash: ({ pathname, hash }) =>
      buildMobileDiscoverToolRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
];

const dynamicsEntries: ExploreEntry[] = [
  {
    key: "feed",
    label: msg`广场动态`,
    hint: msg`世界居民公开可见`,
    icon: Newspaper,
    to: "/discover/feed",
    buildHash: ({ pathname, hash }) =>
      buildFeedRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "moments",
    label: msg`朋友圈`,
    hint: msg`世界角色日常`,
    icon: Users,
    to: "/discover/moments",
    buildHash: ({ pathname, hash }) =>
      buildDesktopMomentsRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "channels",
    label: msg`视频号`,
    hint: msg`内容流`,
    icon: PlaySquare,
    to: "/discover/channels",
    buildHash: ({ pathname, hash }) =>
      buildDesktopChannelsRouteHash({ returnPath: pathname, returnHash: hash || undefined }),
  },
];

const lifeEntries: ExploreEntry[] = [
  {
    key: "shop",
    label: msg`商城`,
    hint: msg`好物`,
    icon: ShoppingBag,
    to: "/shop",
  },
  {
    key: "games",
    label: msg`游戏`,
    hint: msg`娱乐`,
    icon: Gamepad2,
    to: "/discover/games",
    buildSearch: ({ pathname, hash }) =>
      buildMobileGamesRouteSearch({ returnPath: pathname, returnHash: hash || undefined }),
  },
  {
    key: "miniPrograms",
    label: msg`小程序`,
    hint: msg`工具`,
    icon: Blocks,
    to: "/discover/mini-programs",
    buildSearch: ({ pathname, hash }) =>
      buildMobileMiniProgramsRouteSearch({ returnPath: pathname, returnHash: hash || undefined }),
  },
];

export function WorldPage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();

  // 世界页是移动端首屏改造，桌面端继续走原发现工作台（与 cyber-avatar 同款守卫）。
  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }
    void navigate({ to: "/tabs/discover", replace: true });
  }, [isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到发现页`)}
        description={t(msg`「世界」首屏当前在移动端开放。`)}
        loadingLabel={t(msg`正在切换...`)}
      />
    );
  }

  return <MobileWorldPage />;
}

function MobileWorldPage() {
  const t = useRuntimeTranslator();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const hasCloudSession = useHasCloudSession();

  const ownerName = useWorldOwnerStore((state) => state.username);
  const ownerAvatar = useWorldOwnerStore((state) => state.avatar);
  const ownerCreatedAt = useWorldOwnerStore((state) => state.createdAt);

  const worldDay = useMemo(() => computeWorldDay(ownerCreatedAt), [ownerCreatedAt]);

  // 会话：与 mobile-shell / chat-list 共享同一 cache key + staleTime。
  const { data: conversations } = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: hasCloudSession,
    staleTime: 15_000,
  });
  const conversationList = conversations ?? EMPTY_CONVERSATIONS;

  // 专家团队：好友（世界角色）。与 discover 的失效 key 对齐。
  const { data: friends } = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: hasCloudSession,
    staleTime: 30_000,
  });
  const expertList = friends ?? EMPTY_FRIENDS;

  // 分身：用于双核右卡的「守护中」状态与今日信号兜底。
  const { data: avatarProfile } = useQuery({
    queryKey: ["cyber-avatar-me", baseUrl],
    queryFn: () => getCyberAvatarSelfProfile(baseUrl),
    enabled: hasCloudSession,
    staleTime: 60_000,
  });

  // 今日 · 主动：专家主动找你 = 有未读的会话（最近活跃在前，取前 3）。
  const proactive = useMemo(
    () =>
      [...conversationList]
        .filter((c) => !c.isMuted && c.unreadCount > 0)
        .sort(
          (a, b) =>
            new Date(b.lastActivityAt).getTime() -
            new Date(a.lastActivityAt).getTime(),
        )
        .slice(0, 3),
    [conversationList],
  );

  // 最近对话：最近活跃在前，取前 4。
  const recentConversations = useMemo(
    () =>
      [...conversationList]
        .sort(
          (a, b) =>
            new Date(b.lastActivityAt).getTime() -
            new Date(a.lastActivityAt).getTime(),
        )
        .slice(0, 4),
    [conversationList],
  );

  const avatarReady = avatarProfile?.readiness === "ready";
  const avatarBuilding = avatarProfile?.readiness === "building";
  const pendingSignals = avatarProfile?.pendingSignalCount ?? 0;
  // 分身「今天替你看着世界」的兜底信号：待处理信号数（无聚合时用可得信号）。
  const avatarSignalHint =
    pendingSignals > 0
      ? t(msg`分身记下了 ${pendingSignals} 条新动向`)
      : avatarReady
        ? t(msg`分身在你不在时替你留意世界`)
        : t(msg`多在世界里互动，分身会越来越像你`);

  const ownerDisplayName = ownerName?.trim() || t(msg`世界主人`);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`你的世界`)}
        subtitle={t(msg`第 ${worldDay} 天`)}
        rightActions={
          <Link
            to="/tabs/profile"
            className="flex items-center gap-1 rounded-full bg-[color:var(--surface-secondary)] py-1 pl-1 pr-2.5 text-[color:var(--text-secondary)]"
            aria-label={t(msg`个人主页`)}
          >
            <AvatarChip name={ownerDisplayName} src={ownerAvatar} size="xs" />
            <span className="text-[12px] font-medium">{t(msg`我`)}</span>
          </Link>
        }
      />

      <div className="space-y-6 px-4 pb-10">
        {/* 双核 header：你 ⟷ 你的分身 */}
        <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[image:var(--surface-card-gradient)] p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-stretch gap-2">
            <DualCoreCard
              avatar={
                <AvatarChip name={ownerDisplayName} src={ownerAvatar} size="lg" />
              }
              title={ownerDisplayName}
              caption={t(msg`世界主人`)}
            />
            <div className="flex flex-col items-center justify-center px-1 text-[color:var(--brand-primary)]">
              <span className="text-[18px] leading-none">⟷</span>
            </div>
            <DualCoreCard
              avatar={
                <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
                  <Fingerprint size={24} strokeWidth={1.6} />
                </span>
              }
              title={t(msg`你的分身`)}
              caption={
                avatarReady
                  ? t(msg`守护中`)
                  : avatarBuilding
                    ? t(msg`成形中`)
                    : t(msg`待唤醒`)
              }
              captionTone={avatarReady ? "online" : "muted"}
            />
          </div>
          <Link
            to="/cyber-avatar"
            className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-soft)] px-3 py-2.5 text-left"
          >
            <ShieldCheck
              size={16}
              className="shrink-0 text-[color:var(--brand-primary)]"
            />
            <span className="min-w-0 flex-1 truncate text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {avatarSignalHint}
            </span>
            <ChevronRight size={15} className="shrink-0 text-[color:var(--text-dim)]" />
          </Link>
        </section>

        {/* 今日 · 主动 */}
        <section className="space-y-2.5">
          <SectionHeader
            title={t(msg`今日 · 主动`)}
            actionLabel={proactive.length > 0 ? t(msg`去消息`) : undefined}
            to={proactive.length > 0 ? "/tabs/chat" : undefined}
          />
          {proactive.length > 0 ? (
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)]">
              {proactive.map((conversation, index) => (
                <ProactiveRow
                  key={conversation.id}
                  conversation={conversation}
                  first={index === 0}
                  fallbackName={t(msg`世界角色`)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-4 py-5 text-center">
              <div className="text-[13px] font-medium text-[color:var(--text-secondary)]">
                {t(msg`今天还没有新的主动消息`)}
              </div>
              <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
                {t(msg`你的专家团队会在合适的时机主动找你`)}
              </div>
            </div>
          )}
        </section>

        {/* 专家团队 roster */}
        <section className="space-y-2.5">
          <SectionHeader
            title={t(msg`专家团队`)}
            actionLabel={t(msg`全部`)}
            to="/tabs/contacts"
          />
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              to="/add-friend"
              className="flex w-16 shrink-0 flex-col items-center gap-1.5"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-dashed border-[color:var(--border-strong)] text-[color:var(--brand-primary)]">
                <Plus size={22} />
              </span>
              <span className="truncate text-[11px] text-[color:var(--text-muted)]">
                {t(msg`找专家`)}
              </span>
            </Link>
            {expertList.slice(0, 12).map((friend) => (
              <ExpertChip key={friend.character.id} friend={friend} />
            ))}
          </div>
        </section>

        {/* 探索 · 相遇 / 动态 / 生活（原发现全量入口，去彩虹） */}
        <section className="space-y-4">
          <SectionHeader title={t(msg`探索`)} />

          <ExploreGroup
            title={t(msg`相遇`)}
            entries={encounterEntries}
            pathname={pathname}
          />
          <ExploreGroup
            title={t(msg`动态`)}
            entries={dynamicsEntries}
            pathname={pathname}
          />
          <ExploreGroup
            title={t(msg`生活`)}
            entries={lifeEntries}
            pathname={pathname}
          />
        </section>

        {/* 最近对话 */}
        {recentConversations.length > 0 ? (
          <section className="space-y-2.5">
            <SectionHeader
              title={t(msg`最近对话`)}
              actionLabel={t(msg`全部消息`)}
              to="/tabs/chat"
            />
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] shadow-[var(--shadow-soft)]">
              {recentConversations.map((conversation, index) => (
                <ProactiveRow
                  key={conversation.id}
                  conversation={conversation}
                  first={index === 0}
                  fallbackName={t(msg`世界角色`)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </AppPage>
  );
}

const EMPTY_CONVERSATIONS: ConversationListItem[] = [];
const EMPTY_FRIENDS: FriendListItem[] = [];

function computeWorldDay(createdAt: string | null): number {
  if (!createdAt) {
    return 1;
  }
  const start = new Date(createdAt).getTime();
  if (Number.isNaN(start)) {
    return 1;
  }
  const days = Math.floor((Date.now() - start) / 86_400_000) + 1;
  return days < 1 ? 1 : days;
}

function DualCoreCard({
  avatar,
  title,
  caption,
  captionTone = "muted",
}: {
  avatar: ReactNode;
  title: string;
  caption: string;
  captionTone?: "muted" | "online";
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-md)] bg-[color:var(--surface-card)] px-2 py-3 text-center shadow-[var(--shadow-soft)]">
      {avatar}
      <div className="mt-0.5 max-w-full truncate text-[13px] font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div
        className={cn(
          "inline-flex items-center gap-1 text-[11px]",
          captionTone === "online"
            ? "text-[color:var(--brand-primary)]"
            : "text-[color:var(--text-muted)]",
        )}
      >
        {captionTone === "online" ? (
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)]" />
        ) : null}
        {caption}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  actionLabel,
  to,
}: {
  title: string;
  actionLabel?: string;
  to?: "/tabs/chat" | "/tabs/contacts";
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-[color:var(--text-primary)]">
        {title}
      </h2>
      {actionLabel && to ? (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-[12px] text-[color:var(--text-muted)]"
        >
          {actionLabel}
          <ChevronRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

function ProactiveRow({
  conversation,
  first,
  fallbackName,
}: {
  conversation: ConversationListItem;
  first: boolean;
  fallbackName: string;
}) {
  const name = conversation.title?.trim() || fallbackName;
  const lastText = conversation.lastMessage?.text?.trim() ?? "";
  return (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      className={cn(
        "flex items-center gap-3 px-3.5 py-2.5",
        first ? undefined : "border-t border-[color:var(--border-faint)]",
      )}
    >
      <AvatarChip name={name} src={conversation.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
            {name}
          </span>
          <span className="shrink-0 text-[11px] text-[color:var(--text-dim)]">
            {formatConversationTimestamp(conversation.lastActivityAt)}
          </span>
        </div>
        {lastText ? (
          <div className="mt-0.5 truncate text-[12px] text-[color:var(--text-muted)]">
            {lastText}
          </div>
        ) : null}
      </div>
      {conversation.unreadCount > 0 ? (
        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-[#fa5151] px-1 text-[11px] leading-none text-white">
          {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

function ExpertChip({ friend }: { friend: FriendListItem }) {
  const { character } = friend;
  const subtitle = character.expertDomains?.[0] ?? character.relationship ?? "";
  return (
    <Link
      to="/character/$characterId"
      params={{ characterId: character.id }}
      className="flex w-16 shrink-0 flex-col items-center gap-1.5"
    >
      <AvatarChip name={character.name} src={character.avatar} size="lg" />
      <span className="max-w-full truncate text-[11px] font-medium text-[color:var(--text-primary)]">
        {character.name}
      </span>
      {subtitle ? (
        <span className="-mt-1 max-w-full truncate text-[10px] text-[color:var(--text-muted)]">
          {subtitle}
        </span>
      ) : null}
    </Link>
  );
}

function ExploreGroup({
  title,
  entries,
  pathname,
}: {
  title: string;
  entries: ExploreEntry[];
  pathname: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-medium tracking-[0.02em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {entries.map((entry) => (
          <ExploreTile key={entry.key} entry={entry} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}

function ExploreTile({
  entry,
  pathname,
}: {
  entry: ExploreEntry;
  pathname: string;
}) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const nextSearch = entry.buildSearch?.({ hash: "", pathname });
  const nextHash = entry.buildHash?.({ hash: "", pathname });

  return (
    <Link
      to={entry.to}
      onClick={(event) => {
        if (!nextSearch && !nextHash) {
          return;
        }
        event.preventDefault();
        void navigate({
          to: entry.to,
          search: searchStringToObject(nextSearch),
          hash: nextHash,
        });
      }}
      className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-[color:var(--surface-card-hover)]"
    >
      <MonoIconTile icon={entry.icon} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-[color:var(--text-primary)]">
          {t(entry.label)}
        </div>
        <div className="truncate text-[11px] text-[color:var(--text-muted)]">
          {t(entry.hint)}
        </div>
      </div>
    </Link>
  );
}
