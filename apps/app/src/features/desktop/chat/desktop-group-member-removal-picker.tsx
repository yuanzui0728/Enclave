import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSearchTerm("");
    setSelectedIds([]);
  }, [groupName, open]);

  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return removableMembers.filter((member) => {
      if (!keyword) {
        return true;
      }

      return (
        member.name.toLowerCase().includes(keyword) ||
        member.subtitle.toLowerCase().includes(keyword)
      );
    });
  }, [removableMembers, searchTerm]);

  const selectedMembers = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    return removableMembers.filter((member) => selectedIdSet.has(member.id));
  }, [removableMembers, selectedIds]);

  const toggleSelection = (memberId: string) => {
    setSelectedIds((current) =>
      current.includes(memberId)
        ? current.filter((item) => item !== memberId)
        : [...current, memberId],
    );
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(22,18,14,0.38)] p-6 backdrop-blur-[4px]">
      <button
        type="button"
        aria-label="关闭移除群成员弹层"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative flex h-[min(760px,78vh)] w-full max-w-[1040px] overflow-hidden rounded-[30px] border border-white/20 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.30)]">
        <section className="flex w-[380px] shrink-0 flex-col border-r border-black/6 bg-[#f7f7f7]">
          <div className="border-b border-black/6 px-5 py-5">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              移除群成员
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              {`选择要从“${groupName}”中移除的角色成员。`}
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
                placeholder="搜索群成员"
                className="h-11 w-full rounded-2xl border border-black/8 bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-black/12"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {!removableMembers.length ? (
              <div className="px-2 py-8">
                <EmptyState
                  title="当前没有可移除的成员"
                  description="这个群目前没有可移除的角色成员。"
                />
              </div>
            ) : null}

            {removableMembers.length > 0 && !filteredMembers.length ? (
              <div className="px-5 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
                没有匹配的群成员。
              </div>
            ) : null}

            <div className="space-y-1.5">
              {filteredMembers.map((member) => (
                <CandidateRow
                  key={member.id}
                  checked={selectedIds.includes(member.id)}
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

        <section className="flex min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,#fcfcfc,#f6f6f6)]">
          <div className="flex items-start justify-between gap-4 border-b border-black/6 px-6 py-5">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-dim)]">
                已选成员
              </div>
              <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                已选择 {selectedIds.length} 位群成员
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!pending) {
                  onClose();
                }
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-black/6 bg-white text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={pending}
              aria-label="关闭"
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
                    className="flex items-center gap-3 rounded-[22px] border border-black/6 bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
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
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/6 text-[color:var(--text-secondary)] transition hover:bg-[#f5f5f5] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`移除 ${member.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-8">
                <div className="max-w-[320px] text-center">
                  <div className="text-[16px] font-medium text-[color:var(--text-primary)]">
                    右侧会显示待移除成员
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    从左侧勾选群成员后，就可以一次性把他们移出当前群聊。
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-black/6 px-6 py-4">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              世界主人不会出现在移除列表里。
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={pending}
                className="rounded-2xl"
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onConfirm(selectedIds)}
                disabled={!selectedIds.length || pending}
                className="rounded-2xl px-6"
              >
                {pending ? "正在移除..." : "移出群聊"}
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
      className={cn(
        "flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition disabled:opacity-60",
        checked
          ? "border border-[rgba(7,193,96,0.22)] bg-[rgba(7,193,96,0.08)] shadow-[0_8px_20px_rgba(7,193,96,0.08)]"
          : "border border-transparent bg-transparent hover:bg-white",
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
          ? "border-[#07c160] bg-[#07c160]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-soft)]",
      )}
    />
  );
}
