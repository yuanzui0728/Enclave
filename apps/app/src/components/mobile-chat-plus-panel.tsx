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
  Star,
} from "lucide-react";
import { LoadingBlock, cn } from "@yinjie/ui";
import {
  CHAT_LOCATION_SCENES,
  buildLocationCardAttachment,
} from "../features/chat/chat-location-scenes";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { AvatarChip } from "./avatar-chip";

type MobileChatPlusPanelProps = {
  open: boolean;
  busy?: boolean;
  onPickAlbum: () => void;
  onPickCamera: () => void;
  onPickFile: () => void;
  onSelectContactCard: (
    attachment: ContactCardAttachment,
  ) => void | Promise<void>;
  onSelectLocationCard: (
    attachment: LocationCardAttachment,
  ) => void | Promise<void>;
  onUnavailableAction?: (message: string) => void;
};

type PanelView = "root" | "contacts" | "locations";
const ROOT_ACTIONS_PER_PAGE = 8;

const rootActions = [
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
    unavailableNotice: "收藏面板待接入，当前先保留微信式入口。",
  },
] as const;

export function MobileChatPlusPanel({
  open,
  busy = false,
  onPickAlbum,
  onPickCamera,
  onPickFile,
  onSelectContactCard,
  onSelectLocationCard,
  onUnavailableAction,
}: MobileChatPlusPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [activeView, setActiveView] = useState<PanelView>("root");
  const [activeRootPage, setActiveRootPage] = useState(0);
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

  const rootActionPages = chunkRootActions(rootActions, ROOT_ACTIONS_PER_PAGE);

  if (!open) {
    return null;
  }

  return (
    <div className="mt-2 overflow-hidden border-t border-black/6 bg-[#f7f7f7] shadow-none">
      {activeView === "root" ? (
        <div className="pb-6 pt-4">
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
                  className="grid min-w-full shrink-0 snap-start grid-cols-4 gap-y-5 px-5"
                >
                  {page.map((item) => {
                    const Icon = item.icon;
                    const handleClick =
                      item.key === "album"
                        ? onPickAlbum
                        : item.key === "camera"
                          ? onPickCamera
                          : item.key === "contact"
                            ? () => setActiveView("contacts")
                            : item.key === "file"
                              ? onPickFile
                              : item.key === "favorite"
                                ? () =>
                                    onUnavailableAction?.(
                                      item.unavailableNotice ??
                                        "该入口暂未接入。",
                                    )
                                : () => setActiveView("locations");

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={handleClick}
                        disabled={busy}
                        className="flex flex-col items-center gap-2.5 text-center disabled:opacity-60"
                      >
                        <div
                          className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-[16px] border border-black/6 text-white shadow-none",
                            item.iconClassName,
                          )}
                        >
                          <Icon size={22} />
                        </div>
                        <span className="text-[12px] text-[#5f5f5f]">
                          {item.label}
                        </span>
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
            <div className="max-h-72 overflow-auto px-2">
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
                    "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-white/72 disabled:opacity-60",
                    index > 0
                      ? "border-t border-[rgba(148,163,184,0.12)]"
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

      {activeView === "locations" ? (
        <div className="pb-4">
          <PanelHeader title="选择位置" onBack={() => setActiveView("root")} />
          <div className="grid gap-2 px-3">
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
                className="rounded-[18px] border border-white/80 bg-white/72 px-4 py-3 text-left shadow-[var(--shadow-soft)] transition-colors hover:bg-white disabled:opacity-60"
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
    <div className="flex items-center gap-2 px-3 pb-2 pt-2">
      <button
        type="button"
        onClick={onBack}
        className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[color:var(--text-secondary)] transition hover:bg-white/72"
        aria-label="返回"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="text-sm font-medium text-[color:var(--text-primary)]">
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
