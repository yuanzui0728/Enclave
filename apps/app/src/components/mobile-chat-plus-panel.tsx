import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import {
  getFavorites,
  getFriends,
  type ContactCardAttachment,
  type LocationCardAttachment,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";

type MessageDescriptor = Parameters<ReturnType<typeof useRuntimeTranslator>>[0];
import {
  Camera,
  ChevronLeft,
  ContactRound,
  FileText,
  Gift,
  ImagePlus,
  Keyboard,
  MapPin,
  Phone,
  Star,
  Video,
  WalletCards,
} from "lucide-react";
import { LoadingBlock, cn } from "@yinjie/ui";

type Translator = ReturnType<typeof useRuntimeTranslator>;
import {
  CHAT_LOCATION_SCENES,
  buildLocationCardAttachment,
} from "../features/chat/chat-location-scenes";
import { getFriendDisplayName } from "../features/contacts/contact-utils";
import {
  buildFavoriteShareText,
  computeDesktopFavoritesFingerprint,
  mergeDesktopFavoriteRecords,
  readDesktopFavorites,
  type DesktopFavoriteRecord,
} from "../features/favorites/favorites-storage";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { AvatarChip } from "./avatar-chip";

type MobileChatPlusPanelProps = {
  open: boolean;
  busy?: boolean;
  onClose?: () => void;
  onStartVoiceCall?: () => void;
  onStartVideoCall?: () => void;
  onPickAlbum: () => void;
  onPickCamera: () => void;
  onPickFile: () => void;
  onSelectFavoriteText: (text: string) => void | Promise<void>;
  onSelectContactCard: (
    attachment: ContactCardAttachment,
  ) => void | Promise<void>;
  onSelectLocationCard: (
    attachment: LocationCardAttachment,
  ) => void | Promise<void>;
  onUnavailableAction?: (message: string) => void;
  onUnavailableFallback?: (
    action: RootActionFallbackAction,
    source: RootAction["key"],
  ) => void | Promise<void>;
  // 当前会话的对方 character id 集合。在单聊里，不该把"对方的名片"再推回给对方
  // （包括"我自己"自聊：getFriends 把 self-character 也带进了好友列表，
  // 选中后 ContactCardMessage 会渲染成"把你自己的名片发给你自己"，毫无意义）。
  excludeCharacterIds?: readonly string[];
};

type PanelView = "root" | "favorites" | "contacts" | "locations";
const ROOT_ACTIONS_PER_PAGE = 8;

type RootAction = {
  key:
    | "album"
    | "camera"
    | "video-call"
    | "red-packet"
    | "transfer"
    | "contact"
    | "location"
    | "voice-call"
    | "file"
    | "favorite";
  label: MessageDescriptor;
  icon: typeof ImagePlus;
  iconClassName: string;
  disabled?: boolean;
  disabledLabel?: MessageDescriptor;
  unavailableTitle?: MessageDescriptor;
  unavailableDescription?: MessageDescriptor;
  fallbackLabel?: MessageDescriptor;
  fallbackAction?: RootActionFallbackAction;
};

type RootActionFallbackAction = "voice-message" | "camera" | "album";

const rootActions: Record<RootAction["key"], RootAction> = {
  album: {
    key: "album",
    label: msg`相册`,
    icon: ImagePlus,
    iconClassName: "bg-[#5bbd72]",
  },
  camera: {
    key: "camera",
    label: msg`拍摄`,
    icon: Camera,
    iconClassName: "bg-[#54a7ff]",
  },
  "video-call": {
    key: "video-call",
    label: msg`视频通话`,
    icon: Video,
    iconClassName: "bg-[#07c160]",
    disabled: true,
    disabledLabel: msg`待接入`,
    unavailableTitle: msg`视频通话暂未接入`,
    unavailableDescription: msg`视频通话功能开发中，敬请期待。`,
    fallbackLabel: msg`改为拍摄`,
    fallbackAction: "camera",
  },
  "red-packet": {
    key: "red-packet",
    label: msg`红包`,
    icon: Gift,
    iconClassName: "bg-[#ef6a62]",
    disabled: true,
    disabledLabel: msg`待接入`,
    unavailableTitle: msg`红包暂未接入`,
    unavailableDescription: msg`支付与到账链路还没接入，这里先保留和微信一致的能力入口。`,
  },
  transfer: {
    key: "transfer",
    label: msg`转账`,
    icon: WalletCards,
    iconClassName: "bg-[#1fc86a]",
    disabled: true,
    disabledLabel: msg`待接入`,
    unavailableTitle: msg`转账暂未接入`,
    unavailableDescription: msg`后续会补金额确认、到账反馈和会话内转账记录，这一版先保留入口。`,
  },
  contact: {
    key: "contact",
    label: msg`名片`,
    icon: ContactRound,
    iconClassName: "bg-[#4cb5f5]",
  },
  location: {
    key: "location",
    label: msg`位置`,
    icon: MapPin,
    iconClassName: "bg-[#4cb5f5]",
  },
  "voice-call": {
    key: "voice-call",
    label: msg`语音通话`,
    icon: Phone,
    iconClassName: "bg-[#38b36b]",
    disabled: true,
    disabledLabel: msg`待接入`,
    unavailableTitle: msg`语音通话暂未接入`,
    unavailableDescription: msg`当前可以先用按住说话发送语音消息，实时语音通话会在后续单独接入。`,
    fallbackLabel: msg`改发语音消息`,
    fallbackAction: "voice-message",
  },
  file: {
    key: "file",
    label: msg`文件`,
    icon: FileText,
    iconClassName: "bg-[#5cc8c9]",
  },
  favorite: {
    key: "favorite",
    label: msg`收藏`,
    icon: Star,
    iconClassName: "bg-[#f3c64e]",
  },
};

const PRIMARY_ROOT_ACTION_ORDER: RootAction["key"][] = [
  "album",
  "camera",
  "file",
  "favorite",
  "contact",
  "location",
  "video-call",
  "voice-call",
];

const RESERVED_ROOT_ACTION_ORDER: RootAction["key"][] = [
  "red-packet",
  "transfer",
];

export function MobileChatPlusPanel({
  open,
  busy = false,
  onClose,
  onStartVoiceCall,
  onStartVideoCall,
  onPickAlbum,
  onPickCamera,
  onPickFile,
  onSelectFavoriteText,
  onSelectContactCard,
  onSelectLocationCard,
  onUnavailableAction,
  onUnavailableFallback,
  excludeCharacterIds,
}: MobileChatPlusPanelProps) {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [activeView, setActiveView] = useState<PanelView>("root");
  const [activeRootPage, setActiveRootPage] = useState(0);
  const [favoriteRecords, setFavoriteRecords] = useState<
    DesktopFavoriteRecord[]
  >([]);
  const [unavailableAction, setUnavailableAction] = useState<RootAction | null>(
    null,
  );
  const rootPagerRef = useRef<HTMLDivElement | null>(null);
  const activeRootPageRef = useRef(0);

  const friendsQuery = useQuery({
    // 用全局通用 key ["app-friends", baseUrl]——contacts-page / character-detail-page /
    // create-group-page 等都吃这条；统一后好友 mutate（拉黑/解除/改备注）的
    // invalidateQueries 会自动把这里的列表也刷掉，否则关掉黑名单后 + 面板里那位
    // 还在，用户能继续给已黑联系人发名片。staleTime 也跟着复用全局缓存。
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open && activeView === "contacts",
    staleTime: 30_000,
  });
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    enabled: open && activeView === "favorites",
    // 同上：收藏在 + 面板里只读，频繁开合不必每次都重抓。
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) {
      setActiveView("root");
      setActiveRootPage(0);
      setUnavailableAction(null);
    }
  }, [open]);

  useEffect(() => {
    activeRootPageRef.current = activeRootPage;
  }, [activeRootPage]);

  useEffect(() => {
    if (!open || activeView !== "root") {
      return;
    }

    const pager = rootPagerRef.current;
    if (!pager) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      pager.scrollTo({
        left: pager.clientWidth * activeRootPageRef.current,
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeView, open]);

  useEffect(() => {
    if (!open || activeView !== "favorites") {
      return;
    }

    // 走查新一轮 R3：favoritesQuery 后台 refetch（30s staleTime 之外）每次回来都
    // 会重新合并 + setState 一份新数组，favoriteRecords 引用一换就把所有 favorite
    // <button> 重 render。30s 内同一份云端数据 + 同一份 localStorage 多半内容
    // 不变，先用 fingerprint（sourceId@collectedAt 轻量串）对比，相等就跳过
    // setState 避免无意义重渲。
    const nextRecords = mergeDesktopFavoriteRecords(
      favoritesQuery.data ?? [],
      readDesktopFavorites(),
    );
    setFavoriteRecords((current) =>
      computeDesktopFavoritesFingerprint(current) ===
      computeDesktopFavoritesFingerprint(nextRecords)
        ? current
        : nextRecords,
    );
  }, [activeView, favoritesQuery.data, open]);

  useEffect(() => {
    if (activeView !== "root") {
      setUnavailableAction(null);
    }
  }, [activeView]);

  // 父级 ChatComposer 任意 state（输入框聚焦、socket 重连、消息到达）都会触发
  // 重渲；buildRootActionPages 每次 render 都跑两个 filter + 一次 chunk，
  // 但 hasVoiceCall / hasVideoCall 在单次会话生命周期里其实是常量
  // （callers 总是同步传 onStartVoiceCall / onStartVideoCall）。memo 掉省掉
  // 这条每帧重排的小开销，更重要的是 rootActionPages 数组引用稳定后，下面
  // pages.map 的 page 引用也稳定，里面 button 的 props identity 不会因为父级
  // 重渲被打断。
  const hasVoiceCall = Boolean(onStartVoiceCall);
  const hasVideoCall = Boolean(onStartVideoCall);
  const rootActionPages = useMemo(
    () => buildRootActionPages({ hasVoiceCall, hasVideoCall }),
    [hasVoiceCall, hasVideoCall],
  );

  // 父级 ChatComposer 每次 keystroke 都把 plus 面板带着重渲，excludeCharacterIds
  // 数组也是单聊侧每次 render new 一个 [participants[0]]——不 memo 就每帧 new Set
  // 再 filter 66 个好友一遍。memo 之后引用稳定，下面 friends.map 的 button 也能
  // 配合 useMemo 后的 friends 数组拿到 stable identity。
  // ※必须放在 `if (!open) return null` 之前，否则 rules-of-hooks 违例。
  const excludeIdSet = useMemo(
    () =>
      excludeCharacterIds && excludeCharacterIds.length
        ? new Set(excludeCharacterIds)
        : null,
    [excludeCharacterIds],
  );
  const friends = useMemo(
    () =>
      excludeIdSet
        ? (friendsQuery.data ?? []).filter(
            ({ character }) => !excludeIdSet.has(character.id),
          )
        : (friendsQuery.data ?? []),
    [excludeIdSet, friendsQuery.data],
  );

  if (!open) {
    return null;
  }

  const UnavailableIcon = unavailableAction?.icon;
  const unavailableFallbackAction = unavailableAction?.fallbackAction;
  const unavailableFallbackLabel = unavailableAction?.fallbackLabel;
  const showFriendsError = friendsQuery.isError && friends.length === 0;
  const showFavoritesError =
    favoritesQuery.isError && favoriteRecords.length === 0;

  return (
    <div className="mt-1.5 min-h-[232px] overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] shadow-none">
      {activeView === "root" ? (
        <div className="pb-4 pt-3">
          <PanelHeader t={t} title={t(msg`更多功能`)} onClose={onClose} />
          <div
            ref={rootPagerRef}
            className="relative flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(event) => {
              const target = event.currentTarget;
              const nextPage = Math.round(
                target.scrollLeft / Math.max(target.clientWidth, 1),
              );

              setActiveRootPage((currentPage) =>
                currentPage === nextPage ? currentPage : nextPage,
              );
            }}
          >
            <div className="flex min-w-full">
              {rootActionPages.map((page, pageIndex) => (
                <div
                  key={`page-${pageIndex}`}
                  className="grid min-w-full shrink-0 snap-start grid-cols-4 grid-rows-2 gap-y-4.5 px-3.5"
                >
                  {page.map((item, slotIndex) => {
                    if (!item) {
                      return (
                        <div
                          key={`placeholder-${pageIndex}-${slotIndex}`}
                          aria-hidden="true"
                          className="flex select-none flex-col items-center gap-1.5 opacity-0"
                        >
                          <div className="h-13 w-13 rounded-[12px] border border-transparent" />
                          <div className="min-h-[2rem] w-full" />
                        </div>
                      );
                    }

                    const itemDisabled =
                      item.key === "voice-call"
                        ? !onStartVoiceCall
                        : item.key === "video-call"
                          ? !onStartVideoCall
                          : (item.disabled ?? false);
                    const itemDisabledLabel =
                      item.key === "voice-call" && onStartVoiceCall
                        ? undefined
                        : item.key === "video-call" && onStartVideoCall
                          ? undefined
                          : item.disabledLabel;
                    const Icon = item.icon;
                    // 走查 R1：原版是 9 层嵌套三元，每个 tile 每帧 new 6+ 个
                    // 闭包候选 + 跟踪起来眼睛要瞎。归并成单条 dispatcher，可读
                    // 性 + 闭包数减少；语义保持不变。
                    const handleClick = () => {
                      if (itemDisabled) {
                        setUnavailableAction(item);
                        onUnavailableAction?.(
                          item.unavailableDescription
                            ? t(item.unavailableDescription)
                            : t(msg`${t(item.label)} 暂未接入。`),
                        );
                        return;
                      }

                      setUnavailableAction(null);
                      switch (item.key) {
                        case "album":
                          onPickAlbum();
                          return;
                        case "camera":
                          onPickCamera();
                          return;
                        case "file":
                          onPickFile();
                          return;
                        case "favorite":
                          setFavoriteRecords(
                            mergeDesktopFavoriteRecords(
                              favoritesQuery.data ?? [],
                              readDesktopFavorites(),
                            ),
                          );
                          setActiveView("favorites");
                          return;
                        case "contact":
                          setActiveView("contacts");
                          return;
                        case "location":
                          setActiveView("locations");
                          return;
                        case "voice-call":
                          onStartVoiceCall?.();
                          return;
                        case "video-call":
                          onStartVideoCall?.();
                          return;
                        default:
                          return;
                      }
                    };

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={handleClick}
                        disabled={busy}
                        aria-disabled={itemDisabled ? "true" : undefined}
                        className={cn(
                          "flex flex-col items-center gap-1.5 text-center",
                          itemDisabled ? "opacity-80" : "disabled:opacity-60",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-13 w-13 items-center justify-center rounded-[12px] border bg-white text-white shadow-none",
                            "border-[color:var(--border-subtle)]",
                            itemDisabled ? null : item.iconClassName,
                            itemDisabled ? "bg-[#cfcfcf]" : null,
                          )}
                        >
                          <Icon size={20} />
                        </div>
                        <div className="min-h-[2rem] text-center">
                          <div className="text-[11px] text-[#5f5f5f]">
                            {t(item.label)}
                          </div>
                          {itemDisabledLabel ? (
                            <div className="mt-0.5 text-[9px] text-[#a0a0a0]">
                              {t(itemDisabledLabel)}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {rootActionPages.length > 1 ? (
            <div className="mt-3 flex items-center justify-center gap-1.5">
              {rootActionPages.map((_, pageIndex) => (
                <button
                  key={`dot-${pageIndex}`}
                  type="button"
                  onClick={() => {
                    setActiveRootPage(pageIndex);
                    rootPagerRef.current?.scrollTo({
                      left: rootPagerRef.current.clientWidth * pageIndex,
                      behavior: "smooth",
                    });
                  }}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
                    activeRootPage === pageIndex
                      ? "w-5 bg-[#07c160]"
                      : "w-1.5 bg-[rgba(148,163,184,0.42)]",
                  )}
                  aria-label={t(msg`切换到第 ${pageIndex + 1} 页`)}
                />
              ))}
            </div>
          ) : null}

          {unavailableAction ? (
            <div className="mx-3 mt-3 rounded-[14px] border border-[color:var(--border-subtle)] bg-white px-3.5 py-3 shadow-none">
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white",
                    unavailableAction.iconClassName,
                  )}
                >
                  {UnavailableIcon ? <UnavailableIcon size={18} /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-[#111827]">
                    {unavailableAction.unavailableTitle
                      ? t(unavailableAction.unavailableTitle)
                      : t(msg`${t(unavailableAction.label)} 暂未接入`)}
                  </div>
                  <div className="mt-1 text-[11px] leading-[18px] text-[#7a7a7a]">
                    {unavailableAction.unavailableDescription
                      ? t(unavailableAction.unavailableDescription)
                      : t(msg`功能开发中，敬请期待。`)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                {unavailableFallbackAction && unavailableFallbackLabel ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUnavailableAction(null);
                      void onUnavailableFallback?.(
                        unavailableFallbackAction,
                        unavailableAction.key,
                      );
                    }}
                    className="mr-2 rounded-full bg-[#07c160] px-3 py-1.5 text-[11px] font-medium text-white transition active:opacity-90"
                  >
                    {t(unavailableFallbackLabel)}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setUnavailableAction(null)}
                  className="rounded-full bg-[color:var(--surface-panel)] px-3 py-1.5 text-[11px] font-medium text-[#5f5f5f] transition active:bg-[color:var(--surface-card-hover)]"
                >
                  {t(msg`知道了`)}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "contacts" ? (
        <div className="pb-3.5">
          <PanelHeader
            t={t}
            title={t(msg`选择名片`)}
            onBack={() => setActiveView("root")}
            onClose={onClose}
          />
          {friendsQuery.isLoading ? (
            <LoadingBlock
              className="px-4 py-6 text-left"
              label={t(msg`正在读取联系人...`)}
            />
          ) : null}
          {showFriendsError ? (
            <PanelStatusBlock
              title={t(msg`联系人读取失败`)}
              description={t(msg`暂时没能读取联系人名片，请检查网络后重试。`)}
              primaryLabel={t(msg`重新读取`)}
              onPrimary={() => {
                void friendsQuery.refetch();
              }}
              secondaryLabel={t(msg`返回更多功能`)}
              onSecondary={() => setActiveView("root")}
            />
          ) : null}
          {friends.length ? (
            <div className="mx-2.5 max-h-[40dvh] overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
              {friends.map((item, index) => {
                const { character, friendship } = item;
                // 走查 R1：联系人列表跟通讯录 / 群成员选择 / 桌面拓展面板里都
                // 是 remarkName > character.name 的显示规则，但 + 面板这里漏了
                // friendship.remarkName，给了备注的好友（如 "林医生 → 健康顾问"）
                // 在挑名片时只看到原名，跟其它入口对不上。
                const displayName = getFriendDisplayName(item);
                // 走查（第 3 次会话）R3：char-default-self 的 name 与 relationship
                // 都是 "我自己"，picker 上两行都写 "我自己"，自聊以外的会话里
                // 自己会被列出来看着很怪。subtitle 跟主名相同就藏掉那一行。
                const rawSubtitle = friendship.remarkName?.trim()
                  ? character.name
                  : character.relationship || t(msg`世界联系人`);
                const subtitle =
                  rawSubtitle.trim() === displayName.trim() ? null : rawSubtitle;
                return (
                  <button
                    key={character.id}
                    type="button"
                    onClick={() =>
                      void onSelectContactCard({
                        kind: "contact_card",
                        characterId: character.id,
                        name: character.name,
                        avatar: character.avatar,
                        relationship: character.relationship,
                        bio: character.bio ?? undefined,
                      })
                    }
                    disabled={busy}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60",
                      index > 0
                        ? "border-t border-[color:var(--border-subtle)]"
                        : undefined,
                    )}
                  >
                    <AvatarChip
                      name={displayName}
                      src={character.avatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                        {displayName}
                      </div>
                      {subtitle ? (
                        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                          {subtitle}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
          {!friendsQuery.isLoading && !showFriendsError && !friends.length ? (
            <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              {t(msg`还没有可以分享的联系人名片。`)}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "favorites" ? (
        <div className="pb-3.5">
          <PanelHeader
            t={t}
            title={t(msg`发送收藏`)}
            onBack={() => setActiveView("root")}
            onClose={onClose}
          />
          {favoritesQuery.isLoading && !favoriteRecords.length ? (
            <LoadingBlock
              className="px-4 py-6 text-left"
              label={t(msg`正在读取收藏...`)}
            />
          ) : null}
          {showFavoritesError ? (
            <PanelStatusBlock
              title={t(msg`收藏读取失败`)}
              description={t(msg`暂时没能读取收藏内容，请检查网络后重试。`)}
              primaryLabel={t(msg`重新读取`)}
              onPrimary={() => {
                void favoritesQuery.refetch();
              }}
              secondaryLabel={t(msg`返回更多功能`)}
              onSecondary={() => setActiveView("root")}
            />
          ) : null}
          {favoriteRecords.length ? (
            // 走查 R3：title 是 flex row 第一子项，要带 min-w-0/flex-1 才能让
            // truncate 真起作用；badge 加 shrink-0 防被长标题挤变形。
            // 走查新一轮 R2：description 跟 title 一样时（笔记 favorite 几乎都是
            // 这种），picker 第三行只是把 title 又写一遍——share text 那边已经
            // 在 buildFavoriteShareText 去重了，这里 UI 上同步把那行藏掉。
            <div className="mx-2.5 max-h-[40dvh] overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
              {favoriteRecords.map((item, index) => {
                const trimmedTitle = item.title.trim();
                const trimmedDescription = item.description.trim();
                const hasDistinctDescription =
                  trimmedDescription && trimmedDescription !== trimmedTitle;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      void onSelectFavoriteText(buildFavoriteShareText(item))
                    }
                    disabled={busy}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60",
                      index > 0
                        ? "border-t border-[color:var(--border-subtle)]"
                        : undefined,
                    )}
                  >
                    <AvatarChip
                      name={item.avatarName ?? item.title}
                      src={item.avatarSrc}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 truncate text-[13px] text-[color:var(--text-primary)]">
                          {item.title}
                        </div>
                        <span className="shrink-0 rounded-full bg-[rgba(7,193,96,0.10)] px-2 py-0.5 text-[10px] text-[#07c160]">
                          {item.badge}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
                        {item.meta}
                      </div>
                      {hasDistinctDescription ? (
                        <div className="mt-1.5 line-clamp-2 text-[11px] leading-[18px] text-[color:var(--text-secondary)]">
                          {item.description}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : !favoritesQuery.isLoading && !showFavoritesError ? (
            <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              {t(msg`还没有可发送的收藏内容，先在聊天或内容页里把消息加入收藏。`)}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "locations" ? (
        <div className="pb-3.5">
          <PanelHeader
            t={t}
            title={t(msg`选择位置`)}
            onBack={() => setActiveView("root")}
            onClose={onClose}
          />
          <div className="mx-2.5 overflow-hidden rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
            {CHAT_LOCATION_SCENES.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => {
                  const attachment = buildLocationCardAttachment(scene.id);
                  if (attachment) {
                    void onSelectLocationCard(attachment);
                  }
                }}
                disabled={busy}
                className="block w-full px-4 py-2.5 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
              >
                <div className="text-[13px] font-medium text-[color:var(--text-primary)]">
                  {scene.title}
                </div>
                <div className="mt-0.5 text-[11px] leading-[18px] text-[color:var(--text-muted)]">
                  {scene.subtitle}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PanelStatusBlock({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="mx-2.5 rounded-[14px] border border-[color:var(--border-subtle)] bg-white px-4 py-5 text-center shadow-none">
      <div className="text-[13px] font-medium text-[#111827]">{title}</div>
      <div className="mx-auto mt-1.5 max-w-[18rem] text-[11px] leading-[18px] text-[color:var(--text-muted)]">
        {description}
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={onPrimary}
          className="rounded-full bg-[#07c160] px-3 py-1.5 text-[11px] font-medium text-white transition active:opacity-90"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary ? (
          <button
            type="button"
            onClick={onSecondary}
            className="rounded-full bg-[color:var(--surface-panel)] px-3 py-1.5 text-[11px] font-medium text-[#5f5f5f] transition active:bg-[color:var(--surface-card-hover)]"
          >
            {secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PanelHeader({
  t,
  title,
  onBack,
  onClose,
}: {
  t: Translator;
  title: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="relative flex items-center justify-center px-4 pb-1.5 pt-2.5">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-3 flex h-9 w-9 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-card-hover)]"
          aria-label={t(msg`返回`)}
        >
          <ChevronLeft size={18} />
        </button>
      ) : null}
      <div className="text-[13px] font-medium text-[#111827]">{title}</div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 flex h-9 w-9 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-card-hover)]"
          aria-label={t(msg`切换到键盘输入`)}
        >
          <Keyboard size={18} />
        </button>
      ) : null}
    </div>
  );
}

function chunkRootActions<T>(items: readonly T[], size: number) {
  const result: Array<T | null> = [...items];

  while (result.length < size) {
    result.push(null);
  }

  return result.slice(0, size);
}

function buildRootActionPage(keys: readonly RootAction["key"][]) {
  return chunkRootActions(
    keys.map((key) => rootActions[key]),
    ROOT_ACTIONS_PER_PAGE,
  );
}

function buildRootActionPages(input: {
  hasVoiceCall: boolean;
  hasVideoCall: boolean;
}) {
  const enabledPrimaryKeys = PRIMARY_ROOT_ACTION_ORDER.filter((key) =>
    isRootActionEnabled(key, input),
  );
  const disabledPrimaryKeys = PRIMARY_ROOT_ACTION_ORDER.filter(
    (key) => !isRootActionEnabled(key, input),
  );
  const orderedKeys = [
    ...enabledPrimaryKeys,
    ...disabledPrimaryKeys,
    ...RESERVED_ROOT_ACTION_ORDER,
  ];

  const pages: RootAction["key"][][] = [];
  for (let index = 0; index < orderedKeys.length; index += ROOT_ACTIONS_PER_PAGE) {
    pages.push(orderedKeys.slice(index, index + ROOT_ACTIONS_PER_PAGE));
  }

  return pages.map((page) => buildRootActionPage(page));
}

function isRootActionEnabled(
  key: RootAction["key"],
  input: {
    hasVoiceCall: boolean;
    hasVideoCall: boolean;
  },
) {
  if (key === "voice-call") {
    return input.hasVoiceCall;
  }

  if (key === "video-call") {
    return input.hasVideoCall;
  }

  return !(rootActions[key].disabled ?? false);
}
