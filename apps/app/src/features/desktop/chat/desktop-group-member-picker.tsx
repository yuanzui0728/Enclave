import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import { getFriends } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
import {
  getFriendDisplayName,
  matchesFriendSearch,
} from "../../contacts/contact-utils";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

type DesktopGroupMemberPickerProps = {
  open: boolean;
  groupName: string;
  existingMemberIds: string[];
  pending?: boolean;
  onClose: () => void;
  onConfirm: (memberIds: string[]) => void;
};

export function DesktopGroupMemberPicker({
  open,
  groupName,
  existingMemberIds,
  pending = false,
  onClose,
  onConfirm,
}: DesktopGroupMemberPickerProps) {
  const t = translateRuntimeMessage;
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const titleId = useId();
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R2：和移动端 group-member-picker-page 同款问题。availableFriends
  // 每个 keystroke 同步 toLowerCase + matchesFriendSearch（remarkName/region/
  // source/tags 几路 haystack 各 lowercase 一遍），yuanzui0728_5999 测号
  // 70+ 好友输入框肉眼可见 backlog。useDeferredValue 让 React 先把字打进
  // 输入框，过滤排到下个 idle 帧。
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 走查新会话桌面端群聊 R2：和 desktop-create-group-dialog 同款问题——原版
  // 用独立 cache key 「desktop-group-member-picker-friends」，不复用其它路径
  // 已加载的 "app-friends" cache（contacts/chat-details/group-chat-thread-panel
  // / message-avatar-popover 全部用 "app-friends"）。「添加成员」弹层是从群聊
  // 详情侧栏触发，那一侧 friendsQuery 几百 ms 前刚拉过新数据，这里又走一发
  // getFriends。统一 cache key + staleTime 15s（与其它入口对齐）。
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSelectedIds([]);
  }, [open, groupName]);

  const existingMemberIdSet = useMemo(
    () => new Set(existingMemberIds),
    [existingMemberIds],
  );

  const availableFriends = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    return (friendsQuery.data ?? []).filter(({ character, friendship }) => {
      if (existingMemberIdSet.has(character.id)) {
        return false;
      }

      if (friendship.status === "removed") {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return matchesFriendSearch({ character, friendship }, keyword);
    });
  }, [deferredSearchTerm, existingMemberIdSet, friendsQuery.data]);

  const selectedFriends = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return (friendsQuery.data ?? []).filter(({ character }) =>
      selectedSet.has(character.id),
    );
  }, [friendsQuery.data, selectedIds]);

  const toggleSelection = (characterId: string) => {
    setSelectedIds((current) =>
      current.includes(characterId)
        ? current.filter((item) => item !== characterId)
        : [...current, characterId],
    );
  };

  // 走查桌面端群聊 R1：和 desktop-create-group-dialog R3 同款问题。
  // "加入群聊" 按钮只靠 `disabled={pending}`，pending 是来自父组件 React state
  // 的 `addMembersMutation.isPending`，要等 commit 才进 DOM。同帧连点两次都看到
  // pending=false → onConfirm 飞两份 → parent addMembersMutation.mutate(memberIds)
  // 跑两遍，sequential `for await addGroupMember` 把同样的 N 个成员循环 POST 一遍。
  // 服务端虽对"已存在成员"幂等返回 existing 不重复插行，但公网隧道 RTT ~600ms × N
  // 白来一遍。sync ref 锁同帧；pending 翻 false（success 或 error）后 useEffect
  // 自动复位。
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!pending) {
      submittingRef.current = false;
    }
  }, [pending]);

  const handleConfirm = () => {
    if (!selectedIds.length || pending || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    onConfirm(selectedIds);
  };

  // 走查桌面端群聊 R4：和 DesktopGroupMemberBrowserDialog / DesktopCreateGroupDialog
  // 对齐口径，补 Escape 关闭。原版只有 X / 背板点击能关。pending 时不关，
  // stopPropagation 避免冒泡到外层 workspace 的 dismissSidePanel 把背后的
  //「聊天信息」侧栏一并关掉。
  useEffect(() => {
    if (!open) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // 走查电脑端群聊 R6（和 R5 同款）：pending 时仍要消费 Esc，否则
      // workspace queueMicrotask 兜底跑 dismissSidePanel 把背后的"聊天信息"
      // 侧栏偷关掉，本 dialog 因为 pending 不真关，结果"按 Esc 没关 dialog
      // 倒把侧栏弄没了"。
      event.preventDefault();
      event.stopPropagation();
      if (pending) {
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open, pending]);

  if (!open) {
    return null;
  }

  return (
    // 走查 R1：和姊妹 confirm/text-edit/forward/create-group/note-send 一批
    // dialog 同款 portal-shield 缺漏。该 picker 从「聊天信息」侧栏「+ 添加成员」
    // 打开，workspace 在 rightPanelMode=details 时挂的 onPointerDownCapture
    // 兜底在「点击不落在 thread/header/sidePanel/shield 子树」时 dismissSidePanel
    // —— picker inline 渲染在 workspace 根 div 下，无 shield → 用户在 dialog
    // 内点搜索框 / 联系人行 / 取消 / X / 背板 时 pointerdown capture 先把
    // 背后的「聊天信息」侧栏偷关，操作完回不到侧栏继续。Esc 路径 R4 时已
    // stopPropagation。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-group-member-picker"
    >
      <button
        type="button"
        aria-label={t(msg`关闭添加群成员弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      {/* 走查 R1：和姊妹 confirm/text-edit/forward/create-group/note-send 一批
          a11y 修过的 dialog 同款缺漏——modal 但 panel 既没挂 role="dialog"
          + aria-modal 也没挂 aria-labelledby。盲人屏幕阅读器只听到「关闭添加
          群成员弹层 按钮」+ 搜索框 + 联系人行，听不到「添加群成员」title。
          补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[85vh] w-full max-w-[1040px] overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
      >
        <section className="flex w-[380px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {t(msg`添加群成员`)}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {t(msg`从通讯录里选择要加入“${groupName}”的角色。`)}
            </div>

            <label className="relative mt-4 block">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-dim)]"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t(msg`搜索联系人`)}
                // 走查 R5：父 label 只含 Search 图标 + input，没文本子节点，
                // SR 进来只听到「编辑栏 搜索联系人 空」分裂行为。和姊妹
                // chat-history R24 / 移动端 group-member-picker R3 同款 a11y。
                aria-label={t(msg`搜索联系人`)}
                className="h-10 w-full rounded-[12px] border border-[color:var(--border-faint)] bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-3 py-3">
            {friendsQuery.isLoading ? (
              <LoadingBlock
                className="px-2 py-4 text-left"
                label={t(msg`正在读取联系人...`)}
              />
            ) : null}

            {friendsQuery.isError && friendsQuery.error instanceof Error ? (
              <div className="px-2 py-2">
                <ErrorBlock message={friendsQuery.error.message} />
              </div>
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            !(friendsQuery.data?.length ?? 0) ? (
              <div className="px-2 py-8">
                <EmptyState
                  title={t(msg`通讯录里还没有可选成员`)}
                  description={t(msg`先去通讯录建立一些关系，再回来把他们拉进群。`)}
                />
              </div>
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            friendsQuery.data &&
            friendsQuery.data.length > 0 &&
            !availableFriends.length ? (
              <div className="px-5 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
                {t(msg`没有可添加的联系人，或者他们已经都在群里了。`)}
              </div>
            ) : null}

            <div className="space-y-1">
              {availableFriends.map(({ character, friendship }) => {
                const displayName = getFriendDisplayName({ character, friendship });
                const subtitle =
                  displayName !== character.name
                    ? t(msg`昵称：${character.name}`)
                    : character.relationship;

                return (
                  <button
                    key={character.id}
                    type="button"
                    disabled={pending}
                    onClick={() => toggleSelection(character.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-left transition disabled:opacity-60",
                      selectedIds.includes(character.id)
                        ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[var(--shadow-soft)]"
                        : "border border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white",
                    )}
                  >
                    <AvatarChip name={displayName} src={character.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {displayName}
                      </div>
                      <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                        {subtitle}
                      </div>
                    </div>
                    <SelectionBadge
                      checked={selectedIds.includes(character.id)}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-[rgba(255,255,255,0.62)]">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div>
              <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`已选成员`)}
              </div>
              <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                {t(msg`已选择 ${selectedIds.length} 位联系人`)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!pending) {
                  onClose();
                }
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              aria-label={t(msg`关闭`)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            {selectedFriends.length ? (
              <div className="grid grid-cols-2 gap-3">
                {selectedFriends.map(({ character, friendship }) => {
                  const displayName = getFriendDisplayName({
                    character,
                    friendship,
                  });
                  const subtitle =
                    displayName !== character.name
                      ? t(msg`昵称：${character.name}`)
                      : character.relationship;

                  return (
                    <div
                      key={character.id}
                      className="flex items-center gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]"
                    >
                      <AvatarChip name={displayName} src={character.avatar} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                          {displayName}
                        </div>
                        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                          {subtitle}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleSelection(character.id)}
                        disabled={pending}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--border-faint)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={t(msg`移除 ${displayName}`)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-8">
                <div className="max-w-[320px] rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-6 py-8 text-center">
                  <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                    {t(msg`右侧会显示待加入成员`)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {t(msg`从左侧勾选联系人后，就可以一次性把他们加入当前群聊。`)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              {t(msg`已在群里的成员不会重复出现。`)}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={pending}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                {t(msg`取消`)}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirm}
                disabled={!selectedIds.length || pending}
                className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
              >
                {pending ? t(msg`正在添加...`) : t(msg`加入群聊`)}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SelectionBadge({ checked }: { checked: boolean }) {
  return (
    <div
      className={cn(
        "h-6 w-6 shrink-0 rounded-full border transition-colors",
        checked
          ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]",
      )}
    />
  );
}
