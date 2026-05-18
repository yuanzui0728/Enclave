import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { msg } from "@lingui/macro";
import { Search, X } from "lucide-react";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";

type RemovableMember = {
  id: string;
  name: string;
  subtitle: string;
  avatar?: string | null;
};

type DesktopGroupMemberRemovalPickerProps = {
  open: boolean;
  groupName: string;
  removableMembers: RemovableMember[];
  pending?: boolean;
  onClose: () => void;
  onConfirm: (memberIds: string[]) => void;
};

export function DesktopGroupMemberRemovalPicker({
  open,
  groupName,
  removableMembers,
  pending = false,
  onClose,
  onConfirm,
}: DesktopGroupMemberRemovalPickerProps) {
  const t = translateRuntimeMessage;
  const titleId = useId();
  const [searchTerm, setSearchTerm] = useState("");
  // 走查 R2：和姊妹 picker 同款问题；虽然群成员通常 ≤ 50 比好友册小，但每次
  // keystroke 仍同步 toLowerCase × name/subtitle 两路再 filter，慢机上仍
  // 能看到输入框微小卡顿。和 desktop-create-group-dialog / picker 同口径
  // 走 useDeferredValue。
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSelectedIds([]);
  }, [groupName, open]);

  const filteredMembers = useMemo(() => {
    const keyword = deferredSearchTerm.trim().toLowerCase();
    return removableMembers.filter((member) => {
      if (!keyword) {
        return true;
      }

      return (
        member.name.toLowerCase().includes(keyword) ||
        member.subtitle.toLowerCase().includes(keyword)
      );
    });
  }, [deferredSearchTerm, removableMembers]);

  // 走查 R66 配套：和姊妹 desktop-group-member-picker R66 同款修法。原版
  // CandidateRow 每行 checked=selectedIds.includes(member.id) 是 O(K) 线性扫，
  // 群成员通常 ≤ 50 + 多选时 K 可能也 ≤ 50，热路径上 N×K 次字符串比较。
  // 父级 GroupChatDetailsPanel 同样有 typing socket / messages stream /
  // conversations 60s 轮询多源 re-render，每次都白扫。Set 复用——selectedMembers
  // 也省一次 new Set。
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const selectedMembers = useMemo(() => {
    return removableMembers.filter((member) => selectedIdSet.has(member.id));
  }, [removableMembers, selectedIdSet]);

  const toggleSelection = (memberId: string) => {
    setSelectedIds((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    );
  };

  // 走查桌面端群聊 R1：和 desktop-create-group-dialog R3 / desktop-group-member-picker
  // 同款问题，但 remove 路径比 add 严重——parent removeMembersMutation 用
  // Promise.all 并发 DELETE，server 端 removeMember 对"已删除成员"硬抛
  // CHAT_GROUP_MEMBER_NOT_FOUND（add 是幂等返回 existing）。同帧双击 → 第一组
  // DELETE 成功，第二组 DELETE 全部 404 → addMembersMutation/removeMembersMutation
  // 的 error 落回侧栏顶部，用户看到"红条 + 群里其实成员都没了"的矛盾态。
  // sync ref 锁同帧；pending 翻 false 后 useEffect 自动复位。
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

  // 走查桌面端群聊 R4：和 desktop-group-member-picker 对齐，补 Escape 关闭。
  // stopPropagation 避免冒泡触发外层 workspace dismissSidePanel 把背后
  //「聊天信息」侧栏一并关掉。
  //
  // 走查电脑端群聊 R11：和姊妹 desktop-group-member-picker R11 同款 perf——父
  // GroupChatDetailsPanel inline `onClose={() => setMemberPickerOpen(false)}`，
  // 每父 re-render 都换新引用拆装一次 listener。ref 镜像、deps 收紧。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, pending]);

  if (!open) {
    return null;
  }

  return (
    // 走查 R1：和姊妹 picker / browser / confirm / text-edit / forward 一批
    // dialog 同款 portal-shield 缺漏。从「聊天信息」→「成员浏览」→「移除」
    // 打开，inline 渲染在 workspace 根 div 下，无 shield → workspace
    // onPointerDownCapture 在 rightPanelMode=details 时点 dialog 内任意非
    // sidePanel/header/thread 节点都会 dismissSidePanel；操作完回不到详情侧栏。
    // Esc 路径 R4 已 stopPropagation。
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]"
      data-yj-portal-shield="desktop-group-member-removal-picker"
    >
      <button
        type="button"
        aria-label={t(msg`关闭移除群成员弹层`)}
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      {/* 走查 R1：和姊妹 picker / browser / confirm / text-edit / forward 一批
          a11y 修过的 dialog 同款缺漏——modal 但 panel 既没挂 role="dialog" +
          aria-modal 也没挂 aria-labelledby。盲人屏幕阅读器只听到「关闭移除群
          成员弹层 按钮」+ 搜索框 + 成员行，听不到「移除群成员」title。补语义。 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex h-[min(760px,78vh)] w-full max-w-[1040px] overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]"
      >
        <section className="flex w-[380px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
            <div
              id={titleId}
              className="text-[18px] font-medium text-[color:var(--text-primary)]"
            >
              {t(msg`移除群成员`)}
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {t(msg`选择要从“${groupName}”中移除的角色成员。`)}
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
                placeholder={t(msg`搜索群成员`)}
                // 走查 R5：父 label 只含 Search 图标 + input，没文本子节点，
                // SR 进来只听到「编辑栏 搜索群成员 空」分裂行为。和姊妹
                // chat-history R24 / 移动端 group-member-picker R3 同款 a11y。
                aria-label={t(msg`搜索群成员`)}
                className="h-10 w-full rounded-[12px] border border-[color:var(--border-faint)] bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-3 py-3">
            {!removableMembers.length ? (
              <div className="px-2 py-8">
                <EmptyState
                  title={t(msg`当前没有可移除的成员`)}
                  description={t(msg`这个群目前没有可移除的角色成员。`)}
                />
              </div>
            ) : null}

            {removableMembers.length > 0 && !filteredMembers.length ? (
              <div className="px-5 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
                {t(msg`没有匹配的群成员。`)}
              </div>
            ) : null}

            <div className="space-y-1">
              {filteredMembers.map((member) => (
                <CandidateRow
                  key={member.id}
                  checked={selectedIdSet.has(member.id)}
                  disabled={pending}
                  name={member.name}
                  subtitle={member.subtitle}
                  avatar={member.avatar}
                  onClick={() => toggleSelection(member.id)}
                />
              ))}
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
                {t(msg`已选择 ${selectedIds.length} 位群成员`)}
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
            {selectedMembers.length ? (
              <div className="grid grid-cols-2 gap-3">
                {selectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]"
                  >
                    <AvatarChip name={member.name} src={member.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {member.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                        {member.subtitle}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelection(member.id)}
                      disabled={pending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--border-faint)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={t(msg`移除 ${member.name}`)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-8">
                <div className="max-w-[320px] rounded-[18px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-6 py-8 text-center">
                  <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                    {t(msg`右侧会显示待移除成员`)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    {t(msg`从左侧勾选群成员后，就可以一次性把他们移出当前群聊。`)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              {t(msg`世界主人不会出现在移除列表里。`)}
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
                className="rounded-[10px] bg-[#e14c45] px-6 text-white hover:bg-[#cf433d]"
              >
                {pending ? t(msg`正在移除...`) : t(msg`移出群聊`)}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function CandidateRow({
  avatar,
  checked,
  disabled,
  name,
  onClick,
  subtitle,
}: {
  avatar?: string | null;
  checked: boolean;
  disabled?: boolean;
  name: string;
  onClick: () => void;
  subtitle?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      // 走查电脑端群聊 R78：和姊妹 desktop-group-member-picker / desktop-create-
      // group-dialog R3 同款修法。「移除群成员」picker 左列 row 也是 toggle
      // button（点击 select / 点击 deselect），原版只用绿底 + SelectionBadge
      // 视觉差表达勾选态。盲人 SR 走过去听到「${name} ${subtitle}」+ button
      // label 听不到当前选中状态。补 aria-pressed = checked。
      aria-pressed={checked}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] px-4 py-3 text-left transition disabled:opacity-60",
        checked
          ? "border border-[rgba(7,193,96,0.14)] bg-[rgba(7,193,96,0.07)] shadow-[var(--shadow-soft)]"
          : "border border-transparent bg-transparent hover:border-[color:var(--border-faint)] hover:bg-white",
      )}
    >
      <AvatarChip name={name} src={avatar} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
          {name}
        </div>
        <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
          {subtitle}
        </div>
      </div>
      <SelectionBadge checked={checked} />
    </button>
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
