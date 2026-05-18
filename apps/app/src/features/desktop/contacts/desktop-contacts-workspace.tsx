import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { msg } from "@lingui/macro";
import {
  LoaderCircle,
  Mic,
  Search,
  Settings,
  Square,
  type LucideIcon,
} from "lucide-react";
import { SELF_CHARACTER_ID } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
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
  indexList?: ReactNode;
  directoryScrollRef?: RefObject<HTMLDivElement | null>;
  notice?: { message: string; tone: "info" | "danger" } | null;
  errors?: string[];
  loading: boolean;
  friendSections: ContactSection<FriendDirectoryItem>[];
  activeFriendId?: string | null;
  pendingCharacterId?: string | null;
  onSelectFriend: (characterId: string) => void;
  onOpenFriendChat: (characterId: string) => void;
  bulkMode?: boolean;
  bulkSelectedIds?: ReadonlySet<string>;
  emptyState?: ReactNode;
  worldCharacterTitle: string;
  worldCharacterSections: ContactSection<WorldCharacterDirectoryItem>[];
  activeWorldCharacterId?: string | null;
  onSelectWorldCharacter: (characterId: string) => void;
  detailContent: ReactNode;
  onOpenManagement?: () => void;
  bulkActionBar?: ReactNode;
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
  indexList = null,
  directoryScrollRef,
  notice = null,
  errors = [],
  loading,
  friendSections,
  activeFriendId = null,
  pendingCharacterId = null,
  onSelectFriend,
  onOpenFriendChat,
  bulkMode = false,
  bulkSelectedIds,
  emptyState = null,
  worldCharacterTitle,
  worldCharacterSections,
  activeWorldCharacterId = null,
  onSelectWorldCharacter,
  detailContent,
  onOpenManagement,
  bulkActionBar = null,
}: DesktopContactsWorkspaceProps) {
  const t = useRuntimeTranslator();
  return (
    <div className="h-full min-h-0">
      <AppPage className="h-full min-h-0 space-y-0 bg-[#f5f5f5] px-0 py-0">
        <div className="flex h-full min-h-0">
          <section className="flex w-[320px] shrink-0 flex-col border-r border-[rgba(0,0,0,0.06)] bg-[#f7f7f7]">
            <div className="border-b border-[rgba(0,0,0,0.06)] bg-[#f7f7f7] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
                  {t(msg`通讯录`)}
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[11px] text-[color:var(--text-muted)]">
                    {directoryCountLabel}
                  </div>
                  {onOpenManagement ? (
                    <button
                      type="button"
                      onClick={onOpenManagement}
                      className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[color:var(--text-secondary)] transition-colors hover:bg-black/5 hover:text-[color:var(--text-primary)]"
                      aria-label={t(msg`通讯录管理`)}
                      title={t(msg`通讯录管理`)}
                    >
                      <Settings size={15} />
                    </button>
                  ) : null}
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
                    placeholder={t(msg`搜索`)}
                    className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
                  />
                  <button
                    type="button"
                    onClick={onSpeechButtonClick}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[color:var(--text-dim)] transition hover:bg-white/70 hover:text-[color:var(--text-primary)]"
                    aria-label={
                      speechListening ? t(msg`结束语音输入`) : t(msg`开始语音输入`)
                    }
                    title={
                      speechSupported
                        ? speechListening
                          ? t(msg`结束语音输入`)
                          : t(msg`语音输入`)
                        : t(msg`当前浏览器不支持语音输入`)
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

            <div className="relative min-h-0 flex-1">
              <div
                ref={directoryScrollRef}
                className="h-full overflow-auto bg-[#f7f7f7] pb-5"
              >
                <div className="px-2 py-2">{shortcutList}</div>

                {notice ? (
                  <div className="px-3 pb-2">
                    <InlineNotice
                      tone={notice.tone}
                      className={
                        notice.tone === "danger"
                          ? "border-[rgba(220,38,38,0.18)] bg-white text-xs"
                          : "border-[rgba(0,0,0,0.06)] bg-white text-xs"
                      }
                    >
                      {notice.message}
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
                    label={t(msg`正在读取联系人...`)}
                  />
                ) : null}

                {!loading && friendSections.length ? (
                  <div className="overflow-hidden">
                    <DesktopDirectoryTitle title={t(msg`联系人`)} />
                    {friendSections.map((section, sectionIndex) => {
                      // 新一轮走查：bulk 模式渲染时把 SELF 滤掉，对齐 toggleBulkSelection /
                      // desktopBulkAllIds 的 SELF 守卫；不然点 "我自己" 的 checkbox 无反应。
                      const items = bulkMode
                        ? section.items.filter(
                            (item) => item.character.id !== SELF_CHARACTER_ID,
                          )
                        : section.items;
                      return (
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
                          {items.map((item, index) => (
                            <DesktopFriendListRow
                              key={item.character.id}
                              item={item}
                              index={index}
                              pendingCharacterId={pendingCharacterId}
                              active={activeFriendId === item.character.id}
                              bulkMode={bulkMode}
                              selected={
                                bulkSelectedIds?.has(item.character.id) ?? false
                              }
                              onClick={() => onSelectFriend(item.character.id)}
                              onDoubleClick={() =>
                                onOpenFriendChat(item.character.id)
                              }
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {!loading && !friendSections.length ? emptyState : null}

                {worldCharacterSections.length ? (
                  <div
                    id="world-character-directory"
                    className="mt-3 overflow-hidden border-t border-[rgba(0,0,0,0.04)] pt-2"
                  >
                    <DesktopDirectoryTitle title={worldCharacterTitle} />
                    {worldCharacterSections.map((section, sectionIndex) => (
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
                          <DesktopWorldCharacterRow
                            key={item.character.id}
                            item={item}
                            index={index}
                            active={activeWorldCharacterId === item.character.id}
                            onClick={() =>
                              onSelectWorldCharacter(item.character.id)
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {indexList}
            </div>
            {bulkActionBar}
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
  bulkMode = false,
  selected = false,
  onClick,
  onDoubleClick,
}: {
  item: FriendDirectoryItem;
  index: number;
  pendingCharacterId?: string | null;
  active?: boolean;
  bulkMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const t = useRuntimeTranslator();
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
      {bulkMode ? (
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-[#07c160] bg-[#07c160] text-white"
              : "border-[color:var(--border-subtle)] bg-white",
          )}
        >
          {selected ? (
            <svg
              viewBox="0 0 16 16"
              width="11"
              height="11"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="3 8.5 6.5 12 13 5" />
            </svg>
          ) : null}
        </span>
      ) : null}
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
            ? t(msg`正在打开会话...`)
            : item.displayName !== item.character.name
              ? t(msg`昵称：${item.character.name}`)
              : item.character.currentStatus?.trim() ||
                item.character.relationship ||
                t(msg`保持联系`)}
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
  const t = useRuntimeTranslator();
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
            t(msg`查看角色资料`)}
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
