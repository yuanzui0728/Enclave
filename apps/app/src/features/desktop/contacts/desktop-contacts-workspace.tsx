import type { KeyboardEvent, ReactNode, RefObject } from "react";
import {
  LoaderCircle,
  Mic,
  Search,
  Square,
  type LucideIcon,
} from "lucide-react";
import {
  AppPage,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import type { SpeechInputStatus } from "../../chat/speech-input-types";
import {
  type ContactSection,
  type FriendDirectoryItem,
  type WorldCharacterDirectoryItem,
} from "../../contacts/contact-utils";

export type DesktopContactsShortcutItem = {
  key: string;
  label: string;
  subtitle?: string;
  badgeCount?: number;
  icon: LucideIcon;
  iconClassName: string;
  onClick: () => void;
};

export type DesktopContactsWorkspaceProps = {
  directoryCountLabel: string;
  searchContainerRef?: RefObject<HTMLDivElement | null>;
  searchText: string;
  onSearchTextChange: (value: string) => void;
  onSearchOpen: () => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  searchPanel?: ReactNode;
  speechListening: boolean;
  speechStatus: SpeechInputStatus;
  speechSupported: boolean;
  speechButtonDisabled: boolean;
  onSpeechButtonClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  shortcutList: ReactNode;
  notice?: string | null;
  errors?: string[];
  loading: boolean;
  friendSections: ContactSection<FriendDirectoryItem>[];
  activeFriendId?: string | null;
  pendingCharacterId?: string | null;
  onSelectFriend: (characterId: string) => void;
  onOpenFriendChat: (characterId: string) => void;
  emptyState?: ReactNode;
  worldCharacterTitle: string;
  worldCharacterItems: WorldCharacterDirectoryItem[];
  activeWorldCharacterId?: string | null;
  onSelectWorldCharacter: (characterId: string) => void;
  detailContent: ReactNode;
};

export function DesktopContactsWorkspace({
  directoryCountLabel,
  searchContainerRef,
  searchText,
  onSearchTextChange,
  onSearchOpen,
  onSearchKeyDown,
  searchPanel,
  speechListening,
  speechStatus,
  speechSupported,
  speechButtonDisabled,
  onSpeechButtonClick,
  shortcutList,
  notice = null,
  errors = [],
  loading,
  friendSections,
  activeFriendId = null,
  pendingCharacterId = null,
  onSelectFriend,
  onOpenFriendChat,
  emptyState = null,
  worldCharacterTitle,
  worldCharacterItems,
  activeWorldCharacterId = null,
  onSelectWorldCharacter,
  detailContent,
}: DesktopContactsWorkspaceProps) {
  return (
    <div className="h-full min-h-0">
      <AppPage className="h-full min-h-0 space-y-0 bg-[#f5f5f5] px-0 py-0">
        <div className="flex h-full min-h-0">
          <section className="flex w-[320px] shrink-0 flex-col border-r border-[rgba(0,0,0,0.06)] bg-[#f7f7f7]">
            <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#f7f7f7] px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  通讯录
                </div>
                <div className="text-[11px] text-[color:var(--text-muted)]">
                  {directoryCountLabel}
                </div>
              </div>

              <div ref={searchContainerRef} className="relative mt-3">
                <label
                  onClick={onSearchOpen}
                  className="flex items-center gap-2 rounded-[8px] border border-transparent bg-[#ececec] px-3 py-2 text-sm text-[color:var(--text-dim)] transition-colors hover:bg-[#e7e7e7]"
                >
                  <Search size={15} className="shrink-0" />
                  <input
                    type="search"
                    value={searchText}
                    onChange={(event) => onSearchTextChange(event.target.value)}
                    onFocus={onSearchOpen}
                    onKeyDown={onSearchKeyDown}
                    placeholder="搜索"
                    className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
                  />
                  <button
                    type="button"
                    onClick={onSpeechButtonClick}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-dim)] transition hover:bg-white/70 hover:text-[color:var(--text-primary)]"
                    aria-label={
                      speechListening ? "结束语音输入" : "开始语音输入"
                    }
                    title={
                      speechSupported
                        ? speechListening
                          ? "结束语音输入"
                          : "语音输入"
                        : "当前浏览器不支持语音输入"
                    }
                    disabled={speechButtonDisabled || !speechSupported}
                  >
                    {speechStatus === "requesting-permission" ||
                    speechStatus === "processing" ? (
                      <LoaderCircle size={15} className="animate-spin" />
                    ) : speechListening ? (
                      <Square size={13} fill="currentColor" />
                    ) : (
                      <Mic size={15} />
                    )}
                  </button>
                </label>
                {searchPanel}
              </div>
            </div>

            <div className="px-2 py-2">{shortcutList}</div>

            <div className="min-h-0 flex-1 overflow-auto bg-[#f7f7f7] pb-5">
              {notice ? (
                <div className="px-3 pb-2">
                  <InlineNotice
                    tone="info"
                    className="border-[rgba(0,0,0,0.06)] bg-white text-xs"
                  >
                    {notice}
                  </InlineNotice>
                </div>
              ) : null}

              {errors.map((message) => (
                <div key={message} className="px-3 pb-2">
                  <ErrorBlock message={message} />
                </div>
              ))}

              {loading ? (
                <LoadingBlock
                  className="px-4 py-6 text-left"
                  label="正在读取联系人..."
                />
              ) : null}

              {!loading && friendSections.length ? (
                <div className="overflow-hidden">
                  <DesktopDirectoryTitle title="联系人" />
                  {friendSections.map((section, sectionIndex) => (
                    <div
                      key={section.key}
                      id={section.anchorId}
                      className={cn(
                        sectionIndex > 0
                          ? "mt-2 border-t border-[rgba(0,0,0,0.04)] pt-2"
                          : undefined,
                      )}
                    >
                      <DesktopSectionHeader title={section.title} />
                      {section.items.map((item, index) => (
                        <DesktopFriendListRow
                          key={item.character.id}
                          item={item}
                          index={index}
                          pendingCharacterId={pendingCharacterId}
                          active={activeFriendId === item.character.id}
                          onClick={() => onSelectFriend(item.character.id)}
                          onDoubleClick={() =>
                            onOpenFriendChat(item.character.id)
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {!loading && !friendSections.length ? emptyState : null}

              {worldCharacterItems.length ? (
                <div
                  id="world-character-directory"
                  className="mt-3 overflow-hidden border-t border-[rgba(0,0,0,0.04)] pt-2"
                >
                  <DesktopDirectoryTitle title={worldCharacterTitle} />
                  {worldCharacterItems.map((item, index) => (
                    <DesktopWorldCharacterRow
                      key={item.character.id}
                      item={item}
                      index={index}
                      active={activeWorldCharacterId === item.character.id}
                      onClick={() => onSelectWorldCharacter(item.character.id)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          <section className="min-w-0 flex-1 bg-[#f5f5f5]">
            {detailContent}
          </section>
        </div>
      </AppPage>
    </div>
  );
}

function DesktopDirectoryTitle({ title }: { title: string }) {
  return (
    <div className="px-4 pb-1 pt-1 text-[11px] font-medium tracking-[0.04em] text-[color:var(--text-muted)]">
      {title}
    </div>
  );
}

function DesktopFriendListRow({
  item,
  index,
  pendingCharacterId,
  active,
  onClick,
  onDoubleClick,
}: {
  item: FriendDirectoryItem;
  index: number;
  pendingCharacterId?: string | null;
  active?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/80",
        index > 0 ? "border-t border-[rgba(0,0,0,0.04)]" : undefined,
        active
          ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
          : undefined,
      )}
    >
      <AvatarChip
        name={item.character.name}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-[color:var(--text-primary)]">
          {item.displayName}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {pendingCharacterId === item.character.id
            ? "正在打开会话..."
            : item.displayName !== item.character.name
              ? `昵称：${item.character.name}`
              : item.character.currentStatus?.trim() ||
                item.character.relationship ||
                "保持联系"}
        </div>
      </div>
    </button>
  );
}

function DesktopWorldCharacterRow({
  item,
  index,
  active,
  onClick,
}: {
  item: WorldCharacterDirectoryItem;
  index: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/80",
        index > 0 ? "border-t border-[rgba(0,0,0,0.04)]" : undefined,
        active
          ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
          : undefined,
      )}
    >
      <AvatarChip
        name={item.character.name}
        src={item.character.avatar}
        size="wechat"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] text-[color:var(--text-primary)]">
          {item.character.name}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
          {item.character.relationship ||
            item.character.currentStatus?.trim() ||
            "查看角色资料"}
        </div>
      </div>
    </button>
  );
}

function DesktopSectionHeader({ title }: { title: string }) {
  return (
    <div className="px-4 py-1 text-[11px] font-medium tracking-[0.08em] text-[color:var(--text-muted)]">
      {title}
    </div>
  );
}
