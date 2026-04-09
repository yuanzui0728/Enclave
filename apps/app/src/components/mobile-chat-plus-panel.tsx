import { useEffect, useState } from "react";
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
};

type PanelView = "root" | "contacts" | "locations";

const rootActions = [
  {
    key: "album",
    label: "相册",
    icon: ImagePlus,
    iconClassName: "bg-[linear-gradient(135deg,#7dd3fc,#38bdf8)]",
  },
  {
    key: "camera",
    label: "拍摄",
    icon: Camera,
    iconClassName: "bg-[linear-gradient(135deg,#fbbf24,#f97316)]",
  },
  {
    key: "contact",
    label: "名片",
    icon: ContactRound,
    iconClassName: "bg-[linear-gradient(135deg,#4ade80,#16a34a)]",
  },
  {
    key: "location",
    label: "位置",
    icon: MapPin,
    iconClassName: "bg-[linear-gradient(135deg,#fda4af,#fb7185)]",
  },
  {
    key: "file",
    label: "文件",
    icon: FileText,
    iconClassName: "bg-[linear-gradient(135deg,#c4b5fd,#818cf8)]",
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
}: MobileChatPlusPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [activeView, setActiveView] = useState<PanelView>("root");

  const friendsQuery = useQuery({
    queryKey: ["app-chat-plus-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open && activeView === "contacts",
  });

  useEffect(() => {
    if (!open) {
      setActiveView("root");
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="mt-2 overflow-hidden rounded-[24px] border border-white/75 bg-[linear-gradient(180deg,rgba(245,247,250,0.98),rgba(236,240,245,0.98))] shadow-[var(--shadow-section)]">
      <div className="flex justify-center py-2.5">
        <div className="h-1 w-10 rounded-full bg-[rgba(148,163,184,0.45)]" />
      </div>

      {activeView === "root" ? (
        <div className="grid grid-cols-4 gap-y-4 px-4 pb-5 pt-1">
          {rootActions.map((item) => {
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
                      : () => setActiveView("locations");

            return (
              <button
                key={item.key}
                type="button"
                onClick={handleClick}
                disabled={busy}
                className="flex flex-col items-center gap-2 text-center disabled:opacity-60"
              >
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-[18px] text-white shadow-[var(--shadow-soft)]",
                    item.iconClassName,
                  )}
                >
                  <Icon size={22} />
                </div>
                <span className="text-xs text-[color:var(--text-secondary)]">
                  {item.label}
                </span>
              </button>
            );
          })}
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
    <div className="flex items-center gap-2 px-3 pb-2 pt-1">
      <button
        type="button"
        onClick={onBack}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-secondary)] transition hover:bg-white/72"
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
