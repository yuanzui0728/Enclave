import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { getGroupMembers, type Group } from "@yinjie/contracts";
import { MessageSquarePlus, Search } from "lucide-react";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import { GroupAvatarChip } from "../../../components/group-avatar-chip";
import { formatConversationTimestamp } from "../../../lib/format";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

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
  const t = useRuntimeTranslator();
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

    // 父组件的 onSelectGroup 回调每渲染都是新引用 + 不做 idempotent 比较，
    // 搜了个匹配 0 条的关键词后 selectedGroupId 已经为 null 时如果再调一次
    // onSelectGroup(null)，父端 setDesktopSelection 总是新对象 → 无限循环
    // → "Maximum update depth exceeded"。
    const nextId = filteredGroups[0]?.id ?? null;
    if (nextId === selectedGroupId) {
      return;
    }
    onSelectGroup(nextId);
  }, [filteredGroups, onSelectGroup, selectedGroupId]);

  return (
    <div className="flex h-full min-h-0">
      <section className="flex w-[320px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
        <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-base font-medium text-[color:var(--text-primary)]">
                {t(msg`群聊`)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                {t(msg`${groups.length} 个群聊`)}
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
              {t(msg`发起群聊`)}
            </Button>
          </div>

          <label className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 text-sm text-[color:var(--text-dim)] shadow-none">
            <Search size={15} className="shrink-0" />
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t(msg`搜索群聊`)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] pb-4">
          {loading ? (
            <div className="px-3 pt-3">
              <LoadingBlock label={t(msg`正在读取群聊...`)} />
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
                    ? t(msg`没有找到匹配的群聊`)
                    : t(msg`还没有群聊`)
                }
                description={
                  normalizedSearchText
                    ? t(msg`换个关键词试试。`)
                    : t(msg`先创建新的群聊，建好后就会出现在这里。`)
                }
                action={
                  <Button variant="secondary" onClick={onCreateGroup}>
                    {t(msg`发起群聊`)}
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
                          ? "bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)] shadow-[inset_3px_0_0_0_var(--brand-primary)]"
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
                          {getGroupDescription(group, t)}
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
            <DesktopGroupDetailCard
              group={selectedGroup}
              onOpenGroup={onOpenGroup}
              onOpenGroupDetails={onOpenGroupDetails}
            />
          ) : (
            <div className="max-w-sm">
              <EmptyState
                title={t(msg`选择一个群聊`)}
                description={t(msg`左侧展示的是当前世界里的群聊，选中后可以直接进入会话或查看群信息。`)}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function getGroupDescription(
  group: Group,
  t: (descriptor: import("@lingui/core").MessageDescriptor) => string,
) {
  const announcement = group.announcement?.trim();
  if (announcement) {
    return announcement;
  }

  const statusLabel = group.savedToContacts
    ? t(msg`已保存到通讯录`)
    : t(msg`未保存到通讯录`);
  return group.isMuted
    ? t(msg`${statusLabel} · 已开启消息免打扰`)
    : statusLabel;
}

const MEMBER_PREVIEW_LIMIT = 8;

function DesktopGroupDetailCard({
  group,
  onOpenGroup,
  onOpenGroupDetails,
}: {
  group: Group;
  onOpenGroup: (groupId: string) => void;
  onOpenGroupDetails: (groupId: string) => void;
}) {
  const t = useRuntimeTranslator();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  // 走查电脑端群聊 R4：和姊妹 DirectChatDetailsPanel R2（commit 34f317955）/
  // GroupChatDetailsPanel R1（commit bf7e3914b — 本会话上一轮）/ 电脑端单聊
  // 通话按钮 R3（commit 5fbb61838）同款 pattern。「进入群聊」/「群聊信息」
  // 两个按钮分别裸跑 `onClick={() => onOpenGroup(group.id)}` /
  // `onClick={() => onOpenGroupDetails(group.id)}`，父级 contacts-page line
  // 2340-2355 inline 是 `() => void navigate({to: buildDesktopChatThreadPath(...)
  // 或 hash: details})`，无任何 throttle。同帧 <16ms 双击都通过 →
  // tanstack-router push 2 条相同 history 项 → 用户从群聊页返回还要按 2 次
  // 返回才回到通讯录 group pane；GroupChatThreadPanel mount 时发 group /
  // members / messages 3 路公网 RTT（~600ms × 3），第 2 次也会重复发出。
  // raf 释放兜底"navigate 没真正切走"边界。
  const navigateFiredRef = useRef(false);
  const guardNavigate = useCallback(
    <Args extends unknown[]>(handler: (...args: Args) => void) => {
      return (...args: Args) => {
        if (navigateFiredRef.current) return;
        navigateFiredRef.current = true;
        handler(...args);
        if (typeof window !== "undefined") {
          window.requestAnimationFrame(() => {
            navigateFiredRef.current = false;
          });
        }
      };
    },
    [],
  );
  const handleOpenGroup = guardNavigate(() => onOpenGroup(group.id));
  const handleOpenGroupDetails = guardNavigate(() =>
    onOpenGroupDetails(group.id),
  );
  // 走查电脑端群聊 R74：和姊妹「发起群聊」R2 / 「添加成员」R2 / 「查找聊天记录」
  // R3 / 头像 popover R3 同款 cache 复用问题——原 queryKey 用独立的
  // "app-contacts-group-members"，不复用 group-chat-thread-panel /
  // desktop-chat-details-panel / desktop-chat-history-panel / desktop-message-
  // avatar-popover 已经在用的 "app-group-members"。用户从「通讯录 → 群聊」
  // 选一个群看 group detail card 时拉一份 members；点「进入群聊」/「群聊
  // 信息」navigate 进群 thread → membersQuery 在另一份 cache key 上发新请求，
  // 公网隧道 ~600ms RTT 再走一发。统一到共享 cache key + 15s staleTime（和其它
  // 入口对齐），点进群聊立刻渲染。
  const membersQuery = useQuery({
    queryKey: ["app-group-members", baseUrl, group.id],
    queryFn: () => getGroupMembers(group.id, baseUrl),
    staleTime: 15_000,
  });
  const members = membersQuery.data ?? [];
  const memberCount = members.length;
  const previewMembers = members.slice(0, MEMBER_PREVIEW_LIMIT);
  const overflowCount = Math.max(0, memberCount - previewMembers.length);
  const lastActivityLabel = formatConversationTimestamp(
    group.savedToContactsAt ?? group.lastActivityAt,
  );

  return (
    <div className="w-full max-w-[520px] rounded-[20px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-4">
        <GroupAvatarChip
          name={group.name}
          members={previewMembers
            .map((member) => member.memberName || member.memberId)
            .filter(Boolean)}
          size="wechat"
        />
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-[color:var(--text-primary)]">
            {group.name}
          </div>
          <div className="mt-1 text-sm text-[color:var(--text-muted)]">
            {memberCount > 0
              ? t(msg`${memberCount} 人 · 最近活跃 ${lastActivityLabel}`)
              : t(msg`最近活跃 ${lastActivityLabel}`)}
          </div>
        </div>
      </div>

      {membersQuery.isLoading ? (
        <div className="mt-6">
          <LoadingBlock label={t(msg`正在读取群成员...`)} />
        </div>
      ) : memberCount > 0 ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {previewMembers.map((member) => (
            <div
              key={member.id}
              className="flex w-14 min-w-0 flex-col items-center gap-1"
              title={member.memberName ?? ""}
            >
              <AvatarChip
                name={member.memberName}
                src={member.memberAvatar}
                size="sm"
              />
              <span className="w-full truncate text-center text-[11px] text-[color:var(--text-muted)]">
                {member.memberName || "—"}
              </span>
            </div>
          ))}
          {overflowCount > 0 ? (
            <div className="flex w-14 min-w-0 flex-col items-center gap-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-[16px] border border-dashed border-[color:var(--border-faint)] text-[11px] text-[color:var(--text-muted)]">
                +{overflowCount}
              </div>
              <span className="w-full truncate text-center text-[11px] text-[color:var(--text-muted)]">
                {t(msg`更多`)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-5 py-4 text-sm leading-6 text-[color:var(--text-muted)]">
        {getGroupDescription(group, t)}
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          type="button"
          className="flex-1 rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
          onClick={handleOpenGroup}
        >
          {t(msg`进入群聊`)}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="flex-1 rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
          onClick={handleOpenGroupDetails}
        >
          {t(msg`群聊信息`)}
        </Button>
      </div>
    </div>
  );
}
