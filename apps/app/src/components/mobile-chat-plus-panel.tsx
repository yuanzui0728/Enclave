import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFavorites,
  getFriends,
  type ContactCardAttachment,
  type LocationCardAttachment,
} from "@yinjie/contracts";
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
import {
  CHAT_LOCATION_SCENES,
  buildLocationCardAttachment,
} from "../features/chat/chat-location-scenes";
import {
  buildFavoriteShareText,
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
  unavailableBackActionLabel?: string;
  onUnavailableBack?: () => void;
  onUnavailableFallback?: (
    action: RootActionFallbackAction,
    source: RootAction["key"],
  ) => void | Promise<void>;
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
  label: string;
  icon: typeof ImagePlus;
  iconClassName: string;
  disabled?: boolean;
  disabledLabel?: string;
  unavailableTitle?: string;
  unavailableDescription?: string;
  fallbackLabel?: string;
  fallbackAction?: RootActionFallbackAction;
};

type RootActionFallbackAction = "voice-message" | "camera" | "album";

const rootActions: Record<RootAction["key"], RootAction> = {
  album: {
    key: "album",
    label: "相册",
    icon: ImagePlus,
    iconClassName: "bg-[#5bbd72]",
  },
  camera: {
    key: "camera",
    label: "拍摄",
    icon: Camera,
    iconClassName: "bg-[#54a7ff]",
  },
  "video-call": {
    key: "video-call",
    label: "视频通话",
    icon: Video,
    iconClassName: "bg-[#07c160]",
    disabled: true,
    disabledLabel: "待接入",
    unavailableTitle: "视频通话暂未接入",
    unavailableDescription:
      "当前先保留微信式入口位，后续会接到设备联动和真视频通话链路。",
    fallbackLabel: "改为拍摄",
    fallbackAction: "camera",
  },
  "red-packet": {
    key: "red-packet",
    label: "红包",
    icon: Gift,
    iconClassName: "bg-[#ef6a62]",
    disabled: true,
    disabledLabel: "待接入",
    unavailableTitle: "红包暂未接入",
    unavailableDescription:
      "支付与到账链路还没接入，这里先保留和微信一致的能力入口。",
  },
  transfer: {
    key: "transfer",
    label: "转账",
    icon: WalletCards,
    iconClassName: "bg-[#1fc86a]",
    disabled: true,
    disabledLabel: "待接入",
    unavailableTitle: "转账暂未接入",
    unavailableDescription:
      "后续会补金额确认、到账反馈和会话内转账记录，这一版先保留入口。",
  },
  contact: {
    key: "contact",
    label: "名片",
    icon: ContactRound,
    iconClassName: "bg-[#4cb5f5]",
  },
  location: {
    key: "location",
    label: "位置",
    icon: MapPin,
    iconClassName: "bg-[#4cb5f5]",
  },
  "voice-call": {
    key: "voice-call",
    label: "语音通话",
    icon: Phone,
    iconClassName: "bg-[#38b36b]",
    disabled: true,
    disabledLabel: "待接入",
    unavailableTitle: "语音通话暂未接入",
    unavailableDescription:
      "当前可以先用按住说话发送语音消息，实时语音通话会在后续单独接入。",
    fallbackLabel: "改发语音消息",
    fallbackAction: "voice-message",
  },
  file: {
    key: "file",
    label: "文件",
    icon: FileText,
    iconClassName: "bg-[#5cc8c9]",
  },
  favorite: {
    key: "favorite",
    label: "收藏",
    icon: Star,
    iconClassName: "bg-[#f3c64e]",
  },
} as const;

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
  unavailableBackActionLabel,
  onUnavailableBack,
  onUnavailableFallback,
}: MobileChatPlusPanelProps) {
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
    queryKey: ["app-chat-plus-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open && activeView === "contacts",
  });
  const favoritesQuery = useQuery({
    queryKey: ["app-favorites", baseUrl],
    queryFn: () => getFavorites(baseUrl),
    enabled: open && activeView === "favorites",
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

    setFavoriteRecords(
      mergeDesktopFavoriteRecords(
        favoritesQuery.data ?? [],
        readDesktopFavorites(),
      ),
    );
  }, [activeView, favoritesQuery.data, open]);

  useEffect(() => {
    if (activeView !== "root") {
      setUnavailableAction(null);
    }
  }, [activeView]);

  const rootActionPages = buildRootActionPages({
    hasVoiceCall: Boolean(onStartVoiceCall),
    hasVideoCall: Boolean(onStartVideoCall),
  });

  if (!open) {
    return null;
  }

  const UnavailableIcon = unavailableAction?.icon;
  const unavailableFallbackAction = unavailableAction?.fallbackAction;
  const unavailableFallbackLabel = unavailableAction?.fallbackLabel;

  return (
    <div className="mt-1.5 min-h-[232px] overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] shadow-none">
      {activeView === "root" ? (
        <div className="pb-4 pt-3">
          <PanelHeader title="更多功能" onClose={onClose} />
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
                    const handleClick = itemDisabled
                      ? () => {
                          setUnavailableAction(item);
                          onUnavailableAction?.(
                            item.unavailableDescription ??
                              `${item.label} 暂未接入。`,
                          );
                        }
                      : item.key === "album"
                        ? () => {
                            setUnavailableAction(null);
                            onPickAlbum();
                          }
                        : item.key === "camera"
                          ? () => {
                              setUnavailableAction(null);
                              onPickCamera();
                            }
                          : item.key === "favorite"
                            ? () => {
                                setUnavailableAction(null);
                                setFavoriteRecords(
                                  mergeDesktopFavoriteRecords(
                                    favoritesQuery.data ?? [],
                                    readDesktopFavorites(),
                                  ),
                                );
                                setActiveView("favorites");
                              }
                            : item.key === "contact"
                              ? () => {
                                  setUnavailableAction(null);
                                  setActiveView("contacts");
                                }
                              : item.key === "file"
                                ? () => {
                                    setUnavailableAction(null);
                                    onPickFile();
                                  }
                                : item.key === "voice-call"
                                  ? () => {
                                      setUnavailableAction(null);
                                      onStartVoiceCall?.();
                                    }
                                  : item.key === "video-call"
                                    ? () => {
                                        setUnavailableAction(null);
                                        onStartVideoCall?.();
                                      }
                                  : () => {
                                      setUnavailableAction(null);
                                      setActiveView("locations");
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
                            {item.label}
                          </div>
                          {itemDisabledLabel ? (
                            <div className="mt-0.5 text-[9px] text-[#a0a0a0]">
                              {itemDisabledLabel}
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
                  aria-label={`切换到第 ${pageIndex + 1} 页`}
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
                    {unavailableAction.unavailableTitle ??
                      `${unavailableAction.label} 暂未接入`}
                  </div>
                  <div className="mt-1 text-[11px] leading-[18px] text-[#7a7a7a]">
                    {unavailableAction.unavailableDescription ??
                      "当前版本先保留这个入口位，后续再补完整链路。"}
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
                    {unavailableFallbackLabel}
                  </button>
                ) : null}
                {unavailableBackActionLabel && onUnavailableBack ? (
                  <button
                    type="button"
                    onClick={() => {
                      setUnavailableAction(null);
                      onUnavailableBack();
                    }}
                    className="mr-2 rounded-full bg-[color:var(--surface-panel)] px-3 py-1.5 text-[11px] font-medium text-[#5f5f5f] transition active:bg-[color:var(--surface-card-hover)]"
                  >
                    {unavailableBackActionLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setUnavailableAction(null)}
                  className="rounded-full bg-[color:var(--surface-panel)] px-3 py-1.5 text-[11px] font-medium text-[#5f5f5f] transition active:bg-[color:var(--surface-card-hover)]"
                >
                  知道了
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "contacts" ? (
        <div className="pb-3.5">
          <PanelHeader
            title="选择名片"
            onBack={() => setActiveView("root")}
            onClose={onClose}
          />
          {friendsQuery.isLoading ? (
            <LoadingBlock
              className="px-4 py-6 text-left"
              label="正在读取联系人..."
            />
          ) : null}
          {friendsQuery.data?.length ? (
            <div className="mx-2.5 max-h-64 overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
              {friendsQuery.data.map(({ character }, index) => (
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
                    name={character.name}
                    src={character.avatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                      {character.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
                      {character.relationship || "世界联系人"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
          {!friendsQuery.isLoading && !friendsQuery.data?.length ? (
            <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              还没有可以分享的联系人名片。
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "favorites" ? (
        <div className="pb-3.5">
          <PanelHeader
            title="发送收藏"
            onBack={() => setActiveView("root")}
            onClose={onClose}
          />
          {favoritesQuery.isLoading && !favoriteRecords.length ? (
            <LoadingBlock
              className="px-4 py-6 text-left"
              label="正在读取收藏..."
            />
          ) : null}
          {favoriteRecords.length ? (
            <div className="mx-2.5 max-h-64 overflow-auto rounded-[14px] border border-[color:var(--border-subtle)] bg-white">
              {favoriteRecords.map((item, index) => (
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
                      <div className="truncate text-[13px] text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2 py-0.5 text-[10px] text-[#07c160]">
                        {item.badge}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-[color:var(--text-muted)]">
                      {item.meta}
                    </div>
                    <div className="mt-1.5 line-clamp-2 text-[11px] leading-[18px] text-[color:var(--text-secondary)]">
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : !favoritesQuery.isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              还没有可发送的收藏内容，先在聊天或内容页里把消息加入收藏。
            </div>
          ) : null}
        </div>
      ) : null}

      {activeView === "locations" ? (
        <div className="pb-3.5">
          <PanelHeader
            title="选择位置"
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

function PanelHeader({
  title,
  onBack,
  onClose,
}: {
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
          className="absolute left-3 flex h-7 w-7 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-card-hover)]"
          aria-label="返回"
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}
      <div className="text-[13px] font-medium text-[#111827]">{title}</div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 flex h-7 w-7 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-card-hover)]"
          aria-label="切换到键盘输入"
        >
          <Keyboard size={16} />
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
