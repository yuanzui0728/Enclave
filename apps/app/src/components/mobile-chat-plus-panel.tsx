import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFriends,
  type ContactCardAttachment,
  type LocationCardAttachment,
} from "@yinjie/contracts";
import {
  Camera,
  ChevronLeft,
  ContactRound,
  FileText,
  ImagePlus,
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
  readDesktopFavorites,
  type DesktopFavoriteRecord,
} from "../features/desktop/favorites/desktop-favorites-storage";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { AvatarChip } from "./avatar-chip";

type MobileChatPlusPanelProps = {
  open: boolean;
  busy?: boolean;
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
};

type PanelView = "root" | "favorites" | "contacts" | "locations";
const ROOT_ACTIONS_PER_PAGE = 8;

type RootAction = {
  key:
    | "album"
    | "camera"
    | "video-call"
    | "contact"
    | "location"
    | "voice-call"
    | "file"
    | "favorite"
    | "transfer";
  label: string;
  icon: typeof ImagePlus;
  iconClassName: string;
  disabled?: boolean;
  disabledLabel?: string;
};

const rootActions: RootAction[] = [
  {
    key: "album",
    label: "相册",
    icon: ImagePlus,
    iconClassName: "bg-[#5bbd72]",
  },
  {
    key: "camera",
    label: "拍摄",
    icon: Camera,
    iconClassName: "bg-[#54a7ff]",
  },
  {
    key: "video-call",
    label: "视频通话",
    icon: Video,
    iconClassName: "bg-[#60a5fa]",
    disabled: true,
    disabledLabel: "待接入",
  },
  {
    key: "contact",
    label: "名片",
    icon: ContactRound,
    iconClassName: "bg-[#f6b14b]",
  },
  {
    key: "location",
    label: "位置",
    icon: MapPin,
    iconClassName: "bg-[#4cb5f5]",
  },
  {
    key: "voice-call",
    label: "语音通话",
    icon: Phone,
    iconClassName: "bg-[#38b36b]",
    disabled: true,
    disabledLabel: "待接入",
  },
  {
    key: "file",
    label: "文件",
    icon: FileText,
    iconClassName: "bg-[#5cc8c9]",
  },
  {
    key: "favorite",
    label: "收藏",
    icon: Star,
    iconClassName: "bg-[#f3c64e]",
  },
  {
    key: "transfer",
    label: "转账",
    icon: WalletCards,
    iconClassName: "bg-[#f59e0b]",
    disabled: true,
    disabledLabel: "待接入",
  },
] as const;

export function MobileChatPlusPanel({
  open,
  busy = false,
  onPickAlbum,
  onPickCamera,
  onPickFile,
  onSelectFavoriteText,
  onSelectContactCard,
  onSelectLocationCard,
  onUnavailableAction,
}: MobileChatPlusPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [activeView, setActiveView] = useState<PanelView>("root");
  const [activeRootPage, setActiveRootPage] = useState(0);
  const [favoriteRecords, setFavoriteRecords] = useState<
    DesktopFavoriteRecord[]
  >([]);
  const rootPagerRef = useRef<HTMLDivElement | null>(null);

  const friendsQuery = useQuery({
    queryKey: ["app-chat-plus-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open && activeView === "contacts",
  });

  useEffect(() => {
    if (!open) {
      setActiveView("root");
      setActiveRootPage(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || activeView !== "favorites") {
      return;
    }

    setFavoriteRecords(readDesktopFavorites());
  }, [activeView, open]);

  const rootActionPages = chunkRootActions(rootActions, ROOT_ACTIONS_PER_PAGE);

  if (!open) {
    return null;
  }

  return (
    <div className="mt-2 min-h-[248px] overflow-hidden border-t border-black/6 bg-[#f1f1f1] shadow-none">
      {activeView === "root" ? (
        <div className="pb-5 pt-4">
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
                  className="grid min-w-full shrink-0 snap-start grid-cols-4 gap-y-5 px-4"
                >
                  {page.map((item) => {
                    const Icon = item.icon;
                    const handleClick =
                      item.key === "album"
                        ? onPickAlbum
                        : item.key === "camera"
                          ? onPickCamera
                          : item.key === "favorite"
                            ? () => setActiveView("favorites")
                            : item.key === "contact"
                              ? () => setActiveView("contacts")
                              : item.key === "file"
                                ? onPickFile
                                : item.key === "location"
                                  ? () => setActiveView("locations")
                                  : () =>
                                      onUnavailableAction?.("该入口暂未接入。");

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={handleClick}
                        disabled={busy || item.disabled}
                        className={cn(
                          "flex flex-col items-center gap-2 text-center",
                          item.disabled
                            ? "cursor-not-allowed opacity-55"
                            : "disabled:opacity-60",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-[14px] border bg-white text-white shadow-none",
                            item.disabled
                              ? "border-black/5 bg-[#d7d7d7]"
                              : "border-black/6",
                            item.disabled ? null : item.iconClassName,
                          )}
                        >
                          <Icon size={22} />
                        </div>
                        <div className="min-h-[2.15rem] text-center">
                          <div className="text-[12px] text-[#5f5f5f]">
                            {item.label}
                          </div>
                          {item.disabledLabel ? (
                            <div className="mt-0.5 text-[10px] text-[#a0a0a0]">
                              {item.disabledLabel}
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
            <div className="mt-4 flex items-center justify-center gap-1.5">
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
        </div>
      ) : null}

      {activeView === "contacts" ? (
        <div className="pb-4">
          <PanelHeader title="选择名片" onBack={() => setActiveView("root")} />
          {friendsQuery.isLoading ? (
            <LoadingBlock
              className="px-4 py-6 text-left"
              label="正在读取联系人..."
            />
          ) : null}
          {friendsQuery.data?.length ? (
            <div className="mx-3 max-h-72 overflow-auto rounded-[10px] bg-white">
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
                    "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors active:bg-[#f5f5f5] disabled:opacity-60",
                    index > 0
                      ? "border-t border-black/[0.06]"
                      : undefined,
                  )}
                >
                  <AvatarChip
                    name={character.name}
                    src={character.avatar}
                    size="wechat"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[color:var(--text-primary)]">
                      {character.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--text-muted)]">
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
        <div className="pb-4">
          <PanelHeader title="发送收藏" onBack={() => setActiveView("root")} />
          {favoriteRecords.length ? (
            <div className="mx-3 max-h-72 overflow-auto rounded-[10px] bg-white">
              {favoriteRecords.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    void onSelectFavoriteText(buildFavoriteShareText(item))
                  }
                  disabled={busy}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors active:bg-[#f5f5f5] disabled:opacity-60",
                    index > 0
                      ? "border-t border-black/[0.06]"
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
                      <div className="truncate text-sm text-[color:var(--text-primary)]">
                        {item.title}
                      </div>
                      <span className="rounded-full bg-[rgba(7,193,96,0.10)] px-2 py-0.5 text-[10px] text-[#07c160]">
                        {item.badge}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                      {item.meta}
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-[color:var(--text-secondary)]">
                      {item.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-[color:var(--text-muted)]">
              还没有可发送的收藏内容，先在聊天或内容页里把消息加入收藏。
            </div>
          )}
        </div>
      ) : null}

      {activeView === "locations" ? (
        <div className="pb-4">
          <PanelHeader title="选择位置" onBack={() => setActiveView("root")} />
          <div className="mx-3 overflow-hidden rounded-[10px] bg-white">
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
                className="block w-full px-4 py-3 text-left transition-colors active:bg-[#f5f5f5] disabled:opacity-60"
              >
                <div className="text-sm font-medium text-[color:var(--text-primary)]">
                  {scene.title}
                </div>
                <div className="mt-1 text-xs leading-5 text-[color:var(--text-muted)]">
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

function PanelHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="relative flex items-center justify-center px-4 pb-2 pt-3">
      <button
        type="button"
        onClick={onBack}
        className="absolute left-3 flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--text-secondary)] transition active:bg-[#e5e5e5]"
        aria-label="返回"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="text-sm font-medium text-[#111827]">
        {title}
      </div>
    </div>
  );
}

function chunkRootActions<T>(items: readonly T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push([...items.slice(index, index + size)]);
  }

  return result;
}
