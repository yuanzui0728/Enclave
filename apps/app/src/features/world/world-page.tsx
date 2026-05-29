import { useEffect, useMemo, useState } from "react";
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
          {/* 「我」tab 功能项镜像：个人功能常显，钱包组仅云账号可见。 */}
          <ExploreGroup
            title={t(msg`我的`)}
            entries={personalEntries}
            pathname={pathname}
          />
          {showCloudAccountEntries ? (
            <ExploreGroup
              title={t(msg`钱包`)}
              entries={walletEntries}
              pathname={pathname}
            />
          ) : null}
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
        className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-[length:var(--text-body)] leading-6 text-[color:var(--text-primary)] outline-none focus:border-[color:var(--brand-primary)]"
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
  const focus = pickItems(
    profile?.liveState.focus,
    profile?.liveState.activeTopics,
  );
  const recent = pickItems(
    profile?.recentState.recentGoals,
    profile?.recentState.recurringTopics,
  );
  const signalCount = profile?.signalCount ?? 0;
  const pendingCount = profile?.pendingSignalCount ?? 0;
  // 「了解程度」进度 = 三档置信度均值（缺失按 0）。
  const formedPct = profile
    ? Math.round(
        ((profile.confidence.liveState +
          profile.confidence.recentState +
          profile.confidence.stableCore) /
          3) *
          100,
      )
    : 0;

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
        <span className="relative flex h-16 w-12 shrink-0 items-end justify-center overflow-hidden rounded-[var(--radius-md)] bg-[radial-gradient(120%_90%_at_50%_18%,color-mix(in_srgb,var(--brand-primary)_18%,transparent),color-mix(in_srgb,var(--brand-primary)_5%,transparent)_60%,transparent)]">
          <CyberAvatarPortrait
            portraitImageUrl={profile?.portraitImageUrl}
            gender={gender}
            className="h-[60px]"
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

      {/* 信号进度（empty 态不展示进度，给引导语） */}
      {empty ? (
        <p className="mt-3 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
          {t(msg`多在世界里互动，分身会越来越像你`)}
        </p>
      ) : (
        <div className="mt-3 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
            <div
              className="h-full rounded-full bg-[color:var(--brand-primary)] transition-[width] duration-[var(--motion-fast)] ease-[var(--ease-standard)]"
              style={{ width: `${Math.max(0, Math.min(100, formedPct))}%` }}
            />
          </div>
          <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
            {t(msg`已分析 ${signalCount} 条信号`)}
            {pendingCount > 0 ? t(msg` · 待分析 ${pendingCount} 条`) : ""}
          </div>
        </div>
      )}

      {/* 当前关注：只留一行精简列表（focus 为空回退 recent），最多 3 条，长句单行截断 */}
      {(focus.length > 0 ? focus : recent).length > 0 ? (
        <HeroFocusList
          label={t(msg`当前关注`)}
          items={(focus.length > 0 ? focus : recent).slice(0, 3)}
        />
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

// 取首选数组，空则回退到次选；过滤空白，最多 6 个，避免主区过长。
function pickItems(primary?: string[], fallback?: string[]): string[] {
  const source = (primary ?? []).filter((s) => s && s.trim());
  const list = source.length > 0 ? source : (fallback ?? []).filter((s) => s && s.trim());
  return list.slice(0, 6);
}

// 当前关注：竖排精简列表（替代会换行的 chip 行）。每条单行截断，遗留长句也能裁干净。
function HeroFocusList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex items-start gap-1.5 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]"
          >
            <span className="mt-px shrink-0 text-[color:var(--brand-primary)]">
              ·
            </span>
            <span className="min-w-0 flex-1 truncate">{item}</span>
          </li>
        ))}
      </ul>
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
      <div className="mb-1.5 text-[length:var(--text-caption)] font-medium tracking-[0.02em] text-[color:var(--text-muted)]">
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
