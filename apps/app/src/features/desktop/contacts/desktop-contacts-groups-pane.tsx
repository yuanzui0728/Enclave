import { useEffect, useMemo, useState } from "react";
import type { Group } from "@yinjie/contracts";
import { MessageSquarePlus, Search } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { formatConversationTimestamp } from "../../../lib/format";

type DesktopContactsGroupsPaneProps = {
  groups: Group[];
  selectedGroupId: string | null;
  loading: boolean;
  error?: string | null;
  onSelectGroup: (groupId: string | null) => void;
  onCreateGroup: () => void;
  onOpenGroup: (groupId: string) => void;
  onOpenGroupDetails: (groupId: string) => void;
};

export function DesktopContactsGroupsPane({
  groups,
  selectedGroupId,
  loading,
  error = null,
  onSelectGroup,
  onCreateGroup,
  onOpenGroup,
  onOpenGroupDetails,
}: DesktopContactsGroupsPaneProps) {
  const [searchText, setSearchText] = useState("");
  const normalizedSearchText = searchText.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!normalizedSearchText) {
      return groups;
    }

    return groups.filter((group) => {
      const announcement = group.announcement?.trim().toLowerCase() ?? "";
      return (
        group.name.toLowerCase().includes(normalizedSearchText) ||
        announcement.includes(normalizedSearchText)
      );
    });
  }, [groups, normalizedSearchText]);
  const selectedGroup =
    filteredGroups.find((group) => group.id === selectedGroupId) ??
    groups.find((group) => group.id === selectedGroupId) ??
    null;

  useEffect(() => {
    if (
      selectedGroupId &&
      filteredGroups.some((group) => group.id === selectedGroupId)
    ) {
      return;
    }

    onSelectGroup(filteredGroups[0]?.id ?? null);
  }, [filteredGroups, onSelectGroup, selectedGroupId]);

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-medium text-[color:var(--text-primary)]">
                群聊
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {groups.length} 个群聊
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCreateGroup}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              <MessageSquarePlus size={14} />
              发起群聊
            </Button>
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索群聊"
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] pb-4">
          {loading ? (
            <div className="px-3 pt-3">
              <LoadingBlock label="正在读取群聊..." />
            </div>
          ) : error ? (
            <div className="px-3 pt-3">
              <ErrorBlock message={error} />
            </div>
          ) : !filteredGroups.length ? (
            <div className="px-3 pt-6">
              <EmptyState
                title={
                  normalizedSearchText
                    ? "没有找到匹配的群聊"
                    : "还没有群聊"
                }
                description={
                  normalizedSearchText
                    ? "换个关键词试试。"
                    : "先创建新的群聊，建好后就会出现在这里。"
                }
                action={
                  <Button variant="secondary" onClick={onCreateGroup}>
                    发起群聊
                  </Button>
                }
              />
            </div>
          ) : (
            <section className="px-3 py-3">
              <div className="overflow-hidden rounded-[18px] border border-[color:var(--border-faint)] bg-white shadow-[var(--shadow-section)]">
                {filteredGroups.map((group, index) => {
                  const isSelected = group.id === selectedGroup?.id;

                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => onSelectGroup(group.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        isSelected
                          ? "bg-[rgba(7,193,96,0.07)] shadow-[inset_3px_0_0_0_var(--brand-primary)]"
                          : "bg-white hover:bg-[color:var(--surface-console)]",
                        index > 0
                          ? "border-t border-[color:var(--border-faint)]"
                          : undefined,
                      )}
                    >
                      <GroupAvatarChip name={group.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--text-primary)]">
                            {group.name}
                          </div>
                          <div className="shrink-0 text-[11px] text-[color:var(--text-dim)]">
                            {formatConversationTimestamp(
                              group.savedToContactsAt ?? group.lastActivityAt,
                            )}
                          </div>
                        </div>
                        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                          {getGroupDescription(group)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </section>

      <section className="min-w-0 flex-1 bg-[color:var(--bg-app)]">
        <div className="flex h-full min-h-0 items-center justify-center p-8">
          {selectedGroup ? (
            <div className="w-full max-w-[520px] rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
              <div className="flex items-center gap-4">
                <GroupAvatarChip name={selectedGroup.name} size="wechat" />
                <div className="min-w-0">
                  <div className="truncate text-xl font-semibold text-[color:var(--text-primary)]">
                    {selectedGroup.name}
                  </div>
                  <div className="mt-1 text-sm text-[color:var(--text-muted)]">
                    最近活跃
                    {formatConversationTimestamp(
                      selectedGroup.savedToContactsAt ??
                        selectedGroup.lastActivityAt,
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-5 py-4 text-sm leading-6 text-[color:var(--text-muted)]">
                {getGroupDescription(selectedGroup)}
              </div>

              <div className="mt-6 flex gap-3">
                <Button
                  type="button"
                  className="flex-1 rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
                  onClick={() => onOpenGroup(selectedGroup.id)}
                >
                  进入群聊
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1 rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
                  onClick={() => onOpenGroupDetails(selectedGroup.id)}
                >
                  群聊信息
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-sm">
              <EmptyState
                title="选择一个群聊"
                description="左侧展示的是当前世界里的群聊，选中后可以直接进入会话或查看群信息。"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function getGroupDescription(group: Group) {
  const announcement = group.announcement?.trim();
  if (announcement) {
    return announcement;
  }

  const statusLabel = group.savedToContacts ? "已保存到通讯录" : "未保存到通讯录";
  return group.isMuted ? `${statusLabel} · 已开启消息免打扰` : statusLabel;
}
