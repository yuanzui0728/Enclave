import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  getConversations,
  getCyberAvatarSelfProfile,
  SELF_CHARACTER_ID,
  type ConversationListItem,
  type CyberAvatarSelfProfile,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, cn } from "@yinjie/ui";
import {
  Blocks,
  Camera,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Fingerprint,
  Gamepad2,
  Gift,
  LayoutGrid,
  Library,
  MapPin,
  MessageSquareText,
  Newspaper,
  PlaySquare,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { AvatarChip } from "../../components/avatar-chip";
import { MonoIconTile } from "../../components/mono-icon-tile";
import { TabPageTopBar } from "../../components/tab-page-top-bar";
import { buildChatComposeTextSearch } from "../chat/chat-compose-shortcut-route";
import { CyberAvatarPortrait } from "../cyber-avatar/cyber-avatar-portrait";
import { buildDesktopChannelsRouteHash } from "../channels/channels-route-state";
import { buildMobileDiscoverToolRouteHash } from "../discover/mobile-discover-tool-route-state";
import { buildFeedRouteHash } from "../feed/feed-route-state";
import { buildMobileGamesRouteSearch } from "../games/mobile-games-route-state";
import { buildMobileMiniProgramsRouteSearch } from "../mini-programs/mobile-mini-programs-route-state";
import { buildDesktopMomentsRouteHash } from "../moments/moments-route-state";
import { useDesktopLayout } from "../shell/use-desktop-layout";
import { CheckinCard } from "../wallet/checkin-card";
import { RouteRedirectState } from "../../components/route-redirect-state";
import { shouldShowCloudAccountControls } from "../../lib/cloud-session";
import { isPersistedGroupConversation } from "../../lib/conversation-route";
import { getConversationDisplayTitle } from "../../lib/conversation-preview";
import { resolveMessageSemanticPreview } from "../../lib/message-attachment-semantic";
import { searchStringToObject } from "../../lib/route-search";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  useCloudSessionStore,
  useHasCloudSession,
} from "../../store/cloud-session-store";
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
  | "/shop"
  // 「我」tab 镜像到世界 tab 的功能入口（普通 Link，不需返回路径）。
  | "/profile/knowledge"
  | "/profile/favorites"
  | "/profile/moments"
  | "/profile/feed"
  | "/profile/wallet"
  | "/profile/subscription"
  | "/gift-cabinet"
  | "/profile/character-import"
  | "/profile/feedback";

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

// 「我」tab 功能项镜像到世界 tab：常显的个人功能（普通 Link，无返回路径）。
const personalEntries: ExploreEntry[] = [
  {
    key: "knowledge",
    label: msg`知识库`,
    hint: msg`我的资料库`,
    icon: Library,
    to: "/profile/knowledge",
  },
  {
    key: "favorites",
    label: msg`收藏`,
    hint: msg`收藏的内容`,
    icon: Star,
    to: "/profile/favorites",
  },
  {
    key: "myMoments",
    label: msg`我的朋友圈`,
    hint: msg`我发布的动态`,
    icon: Camera,
    to: "/profile/moments",
  },
  {
    key: "myFeed",
    label: msg`我的广场`,
    hint: msg`我的广场帖`,
    icon: LayoutGrid,
    to: "/profile/feed",
  },
  {
    key: "characterImport",
    label: msg`导入角色`,
    hint: msg`添加新角色`,
    icon: UserPlus,
    to: "/profile/character-import",
  },
  {
    key: "feedback",
    label: msg`反馈`,
    hint: msg`意见与建议`,
    icon: MessageSquareText,
    to: "/profile/feedback",
  },
];

// 钱包相关（仅云账号可见，与「我」tab 同款门控）。
const walletEntries: ExploreEntry[] = [
  {
    key: "wallet",
    label: msg`钱包`,
    hint: msg`余额与账单`,
    icon: Wallet,
    to: "/profile/wallet",
  },
  {
    key: "subscription",
    label: msg`会员中心`,
    hint: msg`订阅与权益`,
    icon: CreditCard,
    to: "/profile/subscription",
  },
  {
    key: "giftCabinet",
    label: msg`礼物柜`,
    hint: msg`收到的礼物`,
    icon: Gift,
    to: "/gift-cabinet",
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
  const ownerId = useWorldOwnerStore((state) => state.id);
  // 分身剪影按资料性别取男/女像（未填=女像），与 /cyber-avatar 详情页同源。
  const ownerGender = useWorldOwnerStore((state) => state.gender);
  const cloudAccessToken = useCloudSessionStore((state) => state.accessToken);
  const cloudPhone = useCloudSessionStore((state) => state.phone);

  // 与「我」tab 同款门控：钱包/会员中心/礼物柜/签到仅云账号可见。
  const showCloudAccountEntries = shouldShowCloudAccountControls({
    worldAccessMode: runtimeConfig.worldAccessMode,
    runtimeApiBaseUrl: runtimeConfig.apiBaseUrl,
    runtimeCloudPhone: runtimeConfig.cloudPhone,
    accessToken: cloudAccessToken,
    sessionPhone: cloudPhone,
    worldOwnerId: ownerId,
  });

  const worldDay = useMemo(() => computeWorldDay(ownerCreatedAt), [ownerCreatedAt]);

  // 会话：与 mobile-shell / chat-list 共享同一 cache key + staleTime。
  const { data: conversations } = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
    enabled: hasCloudSession,
    staleTime: 15_000,
  });
  const conversationList = conversations ?? EMPTY_CONVERSATIONS;

  // 赛博分身 profile：世界页主角，状态大区只读展示（重建/深刷留在 /cyber-avatar）。
  const { data: avatarProfile } = useQuery({
    queryKey: ["cyber-avatar-me", baseUrl],
    queryFn: () => getCyberAvatarSelfProfile(baseUrl),
    enabled: hasCloudSession,
    staleTime: 60_000,
  });

  const ownerDisplayName = ownerName?.trim() || t(msg`世界主人`);

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        className="mx-0 mt-0 px-4 sm:mx-0 sm:px-4"
        title={t(msg`你的世界`)}
        subtitle={t(msg`第 ${worldDay} 天`)}
        rightActions={
          <Link
            to="/tabs/profile"
            className="flex items-center gap-1 rounded-full bg-[color:var(--surface-secondary)] py-1 pl-1 pr-2.5 text-[color:var(--text-secondary)]"
            aria-label={t(msg`个人主页`)}
          >
            <AvatarChip name={ownerDisplayName} src={ownerAvatar} size="xs" />
            <span className="text-[length:var(--text-caption)] font-medium">{t(msg`我`)}</span>
          </Link>
        }
      />

      <div className="space-y-6 px-4 pb-24">
        {/* 赛博分身状态大区（世界页主角） */}
        <CyberAvatarStatusHero
          profile={avatarProfile}
          pathname={pathname}
          gender={ownerGender}
        />

        {/* 每日签到卡：仅云账号用户可见（奖励入 cloud 零钱钱包），与「我」tab 同源。
            CheckinCard 自带 px-4 wrapper（为「我」页 px-0 容器设计），这里父级是
            px-4，用 -mx-4 抵消父级内边距，让卡片与上方 hero / 下方探索卡左右对齐，
            不被双重内边距挤窄。 */}
        {showCloudAccountEntries ? (
          <div className="-mx-4">
            <CheckinCard />
          </div>
        ) : null}

        {/* 世界此刻：最近有动静的会话横滑条（复用已拉会话数据，空则整条不渲染），
            让默认首屏「活」起来，而不是一屏静态导航。 */}
        <WorldNowStrip conversations={conversationList} />

        {/* 探索 · 相遇 / 动态 / 生活（原发现全量入口，去彩虹）。
            三组各自有一个整宽重点卡（相遇→分身相遇、动态→朋友圈、生活→游戏），
            其余入口落 2 列网格；「我」tab 镜像来的个人/钱包入口折叠收纳到「更多」降权。 */}
        <section className="space-y-4">
          <SectionHeader title={t(msg`探索`)} />

          {/* 三组各自的重点入口占整行：相遇→分身相遇、动态→朋友圈、生活→游戏。 */}
          <FeaturedExploreGroup
            title={t(msg`相遇`)}
            entries={encounterEntries}
            pathname={pathname}
            featuredKey="avatarEncounter"
          />
          <FeaturedExploreGroup
            title={t(msg`动态`)}
            entries={dynamicsEntries}
            pathname={pathname}
            featuredKey="moments"
          />
          <FeaturedExploreGroup
            title={t(msg`生活`)}
            entries={lifeEntries}
            pathname={pathname}
            featuredKey="games"
          />
          {/* 「我」tab 功能镜像：个人功能常显 + 钱包组仅云账号可见，
              合并折叠到「更多」（默认收起、中性色、纯图标），零功能丢失。 */}
          <CondensedEntryGroup
            title={t(msg`更多`)}
            entries={
              showCloudAccountEntries
                ? [...personalEntries, ...walletEntries]
                : personalEntries
            }
            pathname={pathname}
          />
        </section>
      </div>

      {/* 底部常驻「和我快聊」：敲字发送 → 跳到「我」会话(direct_char-default-self)
          并预填 composer，由聊天页成熟的发送链路真正发消息（世界页不直接发）。 */}
      <SelfQuickChatBar conversations={conversationList} />
    </AppPage>
  );
}

function SelfQuickChatBar({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");

  function go() {
    const text = draft.trim();
    // 找恒置顶的「我」会话；找不到回退到 canonical 字面量（后端同款拼法）。
    const selfConversationId =
      conversations.find(
        (c) => c.type === "direct" && c.participants[0] === SELF_CHARACTER_ID,
      )?.id ?? `direct_${SELF_CHARACTER_ID}`;
    void navigate({
      to: "/chat/$conversationId",
      params: { conversationId: selfConversationId },
      search: buildChatComposeTextSearch({ text: text || null, autoSend: true }),
    });
    setDraft("");
  }

  return (
    <div
      className="sticky bottom-0 z-10 flex items-end gap-2 border-t border-[color:var(--border-faint)] bg-[color:var(--surface-overlay)] px-4 py-2.5 backdrop-blur-xl"
      style={{ bottom: "var(--keyboard-inset, 0px)" }}
    >
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            go();
          }
        }}
        rows={1}
        placeholder={t(msg`和我说点什么…`)}
        aria-label={t(msg`和我说点什么…`)}
        className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-[length:var(--text-body)] leading-6 text-[color:var(--text-primary)] outline-none focus:border-[color:var(--brand-primary)]"
      />
      <button
        type="button"
        onClick={go}
        aria-label={t(msg`发送`)}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)] transition-opacity active:opacity-90"
      >
        <Send size={17} />
      </button>
    </div>
  );
}

const EMPTY_CONVERSATIONS: ConversationListItem[] = [];
const WORLD_NOW_MAX = 6;

// 世界此刻：最近有动静的会话横滑条。复用已在拉的 getConversations 数据，
// 按 lastActivityAt 降序取前几条最近活跃的会话，点进直接进对应聊天。空则整条不渲染。
function WorldNowStrip({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  const t = useRuntimeTranslator();

  const recent = useMemo(() => {
    return conversations
      .filter(
        (c) =>
          // 排除「我」自己的会话（底部快聊已专门入口），世界此刻只呈现世界里的动静；
          // 只取有最新消息的会话（媒体/语音等非文字消息也算，预览走语义占位）。
          !(c.type === "direct" && c.participants[0] === SELF_CHARACTER_ID) &&
          Boolean(c.lastMessage),
      )
      .slice()
      .sort(
        (a, b) =>
          // NaN 兜底：lastActivityAt 异常时按 0 处理，避免排序不稳定。
          (new Date(b.lastActivityAt).getTime() || 0) -
          (new Date(a.lastActivityAt).getTime() || 0),
      )
      .slice(0, WORLD_NOW_MAX);
  }, [conversations]);

  if (recent.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-1.5 text-[length:var(--text-caption)] font-medium tracking-[0.02em] text-[color:var(--text-muted)]">
        {t(msg`世界此刻`)}
      </div>
      {/* 负 margin + padding 让两端贴屏边滑，隐藏滚动条 */}
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {recent.map((conv) => (
          <WorldNowChip key={conv.id} conversation={conv} />
        ))}
      </div>
    </section>
  );
}

// 单张「世界此刻」卡：按会话类型路由（群聊→/group、单聊→/chat），用 Link 保留
// 原生跳转/无障碍语义；预览复用 chat-list 同款语义占位（[图片]/[语音] 等）。
function WorldNowChip({
  conversation,
}: {
  conversation: ConversationListItem;
}) {
  const isGroup = isPersistedGroupConversation(conversation);
  // 与 chat-list 一致：把服务端遗留 title sentinel 翻成当前 locale。
  const title = getConversationDisplayTitle(conversation.title);
  const preview = conversation.lastMessage
    ? resolveMessageSemanticPreview(conversation.lastMessage, {
        maxChars: 80,
        bracketedFallback: true,
      })
    : "";

  const className =
    "flex w-[150px] shrink-0 flex-col gap-2 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] p-3 text-left shadow-[var(--shadow-soft)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-[color:var(--surface-card-hover)]";

  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className="relative shrink-0">
          <AvatarChip name={title} src={conversation.avatar} size="sm" />
          {conversation.unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[color:var(--surface-card)] bg-[color:var(--brand-accent)]" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
          {title}
        </span>
      </div>
      <p className="line-clamp-2 min-h-[2.5rem] text-[length:var(--text-eyebrow)] leading-5 text-[color:var(--text-muted)]">
        {preview}
      </p>
    </>
  );

  return isGroup ? (
    <Link
      to="/group/$groupId"
      params={{ groupId: conversation.id }}
      search={{}}
      className={className}
    >
      {inner}
    </Link>
  ) : (
    <Link
      to="/chat/$conversationId"
      params={{ conversationId: conversation.id }}
      search={{}}
      className={className}
    >
      {inner}
    </Link>
  );
}

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

// 赛博分身状态大区（世界页主角，只读展示；重建/深刷留在 /cyber-avatar）。
function CyberAvatarStatusHero({
  profile,
  pathname,
  gender,
}: {
  profile: CyberAvatarSelfProfile | undefined;
  pathname: string;
  gender?: "male" | "female" | "other" | "";
}) {
  const t = useRuntimeTranslator();

  const detailHash = buildMobileDiscoverToolRouteHash({ returnPath: pathname });

  const readiness = profile?.readiness;
  const ready = readiness === "ready";
  const building = readiness === "building";
  const empty = readiness === "empty";

  const mood = profile?.liveState.mood?.trim() || "";
  const energy = profile?.liveState.energy?.trim() || "";

  const readinessLabel = ready
    ? t(msg`守护中`)
    : building
      ? t(msg`成形中`)
      : empty
        ? t(msg`待唤醒`)
        : t(msg`加载中…`);

  return (
    <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[image:var(--surface-card-gradient)] p-4 shadow-[var(--shadow-card)]">
      {/* 头部：分身标识 + 标题 + 就绪度徽标 */}
      <div className="flex items-center gap-3">
        {/* 分身人像：有专属 AI 立绘则显立绘，无图回退到同源 SVG 剪影（未填性别=女像），
            放在 3:4 竖版柔光框里，替代原来的指纹图标。 */}
        <span className="relative flex aspect-[3/4] w-12 shrink-0 items-end justify-center overflow-hidden rounded-[var(--radius-md)] bg-[radial-gradient(120%_90%_at_50%_18%,color-mix(in_srgb,var(--brand-primary)_18%,transparent),color-mix(in_srgb,var(--brand-primary)_5%,transparent)_60%,transparent)]">
          <CyberAvatarPortrait
            portraitImageUrl={profile?.portraitImageUrl}
            gender={gender}
            className="h-full"
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`你的分身`)}
          </div>
          {ready && (mood || energy) ? (
            <div className="mt-0.5 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
              {[
                mood ? t(msg`心情 ${mood}`) : "",
                energy ? t(msg`能量 ${energy}`) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[length:var(--text-eyebrow)]",
            ready
              ? "text-[color:var(--brand-primary)]"
              : "text-[color:var(--text-muted)]",
          )}
        >
          {ready ? (
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--brand-primary)]" />
          ) : null}
          {readinessLabel}
        </span>
      </div>

      {/* empty 态给引导语；非 empty 不再展示「了解程度」进度 / 信号数 / 当前关注列表——
          这些分析信号只在管理后台可见，用户端的世界页只保留温度感（立绘+心情+守护状态）。 */}
      {empty ? (
        <p className="mt-3 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
          {t(msg`多在世界里互动，分身会越来越像你`)}
        </p>
      ) : null}

      {/* 看完整画像 */}
      <Link
        to="/cyber-avatar"
        hash={detailHash}
        className="mt-3 flex items-center gap-2 rounded-[var(--radius-md)] bg-[color:var(--surface-soft)] px-3 py-2.5 text-left"
      >
        <Sparkles
          size={16}
          className="shrink-0 text-[color:var(--brand-primary)]"
        />
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
          {empty ? t(msg`去看看你的赛博分身`) : t(msg`看完整画像与对话`)}
        </span>
        <ChevronRight size={15} className="shrink-0 text-[color:var(--text-dim)]" />
      </Link>
    </section>
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
      <h2 className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
        {title}
      </h2>
      {actionLabel && to ? (
        <Link
          to={to}
          className="flex items-center gap-0.5 text-[length:var(--text-caption)] text-[color:var(--text-muted)]"
        >
          {actionLabel}
          <ChevronRight size={14} />
        </Link>
      ) : null}
    </div>
  );
}

// 探索入口共享导航逻辑：buildSearch/buildHash 的入口走 navigate 带状态，
// 普通入口走 Link 默认跳转。ExploreTile / FeaturedExploreTile / 「更多」格子共用。
function useExploreLinkProps(entry: ExploreEntry, pathname: string) {
  const navigate = useNavigate();
  const nextSearch = entry.buildSearch?.({ hash: "", pathname });
  const nextHash = entry.buildHash?.({ hash: "", pathname });
  return {
    to: entry.to,
    onClick: (event: MouseEvent) => {
      if (!nextSearch && !nextHash) {
        return;
      }
      event.preventDefault();
      void navigate({
        to: entry.to,
        search: searchStringToObject(nextSearch),
        hash: nextHash,
      });
    },
  };
}

// featured 组：按 featuredKey 取一个入口作整宽大主卡，其余按原顺序走 2 列网格。
function FeaturedExploreGroup({
  title,
  entries,
  pathname,
  featuredKey,
}: {
  title: string;
  entries: ExploreEntry[];
  pathname: string;
  // 指定哪个入口作为整宽重点卡（按 key），找不到回退第一个；其余按原顺序进网格。
  featuredKey?: string;
}) {
  const featured =
    entries.find((entry) => entry.key === featuredKey) ?? entries[0];
  const rest = entries.filter((entry) => entry !== featured);
  return (
    <div>
      <div className="mb-1.5 text-[length:var(--text-caption)] font-medium tracking-[0.02em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="space-y-2.5">
        {featured ? (
          <FeaturedExploreTile entry={featured} pathname={pathname} />
        ) : null}
        {rest.length > 0 ? (
          <div className="grid grid-cols-2 gap-2.5">
            {rest.map((entry) => (
              <ExploreTile key={entry.key} entry={entry} pathname={pathname} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FeaturedExploreTile({
  entry,
  pathname,
}: {
  entry: ExploreEntry;
  pathname: string;
}) {
  const t = useRuntimeTranslator();
  const linkProps = useExploreLinkProps(entry, pathname);

  return (
    <Link
      {...linkProps}
      className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[image:var(--surface-card-gradient)] px-4 py-3.5 shadow-[var(--shadow-card)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-[color:var(--surface-card-hover)]"
    >
      <MonoIconTile icon={entry.icon} size="lg" tone="brand" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-title)] font-semibold text-[color:var(--text-primary)]">
          {t(entry.label)}
        </div>
        <div className="truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
          {t(entry.hint)}
        </div>
      </div>
      <ChevronRight
        size={18}
        className="shrink-0 text-[color:var(--text-dim)]"
      />
    </Link>
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
  const linkProps = useExploreLinkProps(entry, pathname);

  return (
    <Link
      {...linkProps}
      className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-[color:var(--surface-card-hover)]"
    >
      <MonoIconTile icon={entry.icon} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
          {t(entry.label)}
        </div>
        <div className="truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
          {t(entry.hint)}
        </div>
      </div>
    </Link>
  );
}

// 「更多」：折叠收纳「我」tab 镜像来的个人/钱包入口。默认收起、中性色、
// 纯图标 4 列网格——三重降权，明确次于上方 brand 色 featured/标准组，且零功能丢失。
function CondensedEntryGroup({
  title,
  entries,
  pathname,
}: {
  title: string;
  entries: ExploreEntry[];
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const panelId = "world-more-entries";

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex w-full items-center justify-between py-0.5 text-[length:var(--text-caption)] font-medium tracking-[0.02em] text-[color:var(--text-muted)]"
      >
        <span>{title}</span>
        <ChevronDown
          size={16}
          className={cn(
            "shrink-0 transition-transform duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
            expanded ? "rotate-180" : "rotate-0",
          )}
        />
      </button>
      {expanded ? (
        <div id={panelId} className="mt-2 grid grid-cols-4 gap-x-2 gap-y-3">
          {entries.map((entry) => (
            <CondensedEntryCell
              key={entry.key}
              entry={entry}
              pathname={pathname}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CondensedEntryCell({
  entry,
  pathname,
}: {
  entry: ExploreEntry;
  pathname: string;
}) {
  const t = useRuntimeTranslator();
  const linkProps = useExploreLinkProps(entry, pathname);

  return (
    <Link
      {...linkProps}
      className="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] py-1 text-center transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] active:bg-[color:var(--surface-card-hover)]"
    >
      <MonoIconTile icon={entry.icon} size="md" tone="neutral" />
      <span className="w-full truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
        {t(entry.label)}
      </span>
    </Link>
  );
}
