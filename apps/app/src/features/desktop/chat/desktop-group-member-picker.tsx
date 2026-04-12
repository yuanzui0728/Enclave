import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { getFriends } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";
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
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const friendsQuery = useQuery({
    queryKey: ["desktop-group-member-picker-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
    enabled: open,
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
    const keyword = searchTerm.trim().toLowerCase();
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

      return (
        character.name.toLowerCase().includes(keyword) ||
        (character.relationship ?? "").toLowerCase().includes(keyword) ||
        (friendship.remarkName ?? "").toLowerCase().includes(keyword)
      );
    });
  }, [existingMemberIdSet, friendsQuery.data, searchTerm]);

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

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,24,39,0.28)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label="关闭添加群成员弹层"
        onClick={() => {
          if (!pending) {
            onClose();
          }
        }}
        className="absolute inset-0"
      />

      <div className="relative flex h-[min(760px,78vh)] w-full max-w-[1040px] overflow-hidden rounded-[22px] border border-[color:var(--border-faint)] bg-white/96 shadow-[var(--shadow-overlay)]">
        <section className="flex w-[380px] shrink-0 flex-col border-r border-[color:var(--border-faint)] bg-[rgba(247,250,250,0.88)]">
          <div className="border-b border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
            <div className="text-[18px] font-medium text-[color:var(--text-primary)]">
              添加群成员
            </div>
            <div className="mt-1 text-[12px] text-[color:var(--text-muted)]">
              从通讯录里选择要加入“{groupName}”的角色。
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
                placeholder="搜索联系人"
                className="h-10 w-full rounded-[12px] border border-[color:var(--border-faint)] bg-white pl-10 pr-4 text-sm text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-dim)] focus:border-[color:var(--border-brand)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-[rgba(242,246,245,0.76)] px-3 py-3">
            {friendsQuery.isLoading ? (
              <LoadingBlock
                className="px-2 py-4 text-left"
                label="正在读取联系人..."
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
                  title="通讯录里还没有可选成员"
                  description="先去通讯录建立一些关系，再回来把他们拉进群。"
                />
              </div>
            ) : null}

            {!friendsQuery.isLoading &&
            !friendsQuery.isError &&
            friendsQuery.data &&
            friendsQuery.data.length > 0 &&
            !availableFriends.length ? (
              <div className="px-5 py-10 text-center text-sm leading-6 text-[color:var(--text-muted)]">
                没有可添加的联系人，或者他们已经都在群里了。
              </div>
            ) : null}

            <div className="space-y-1">
              {availableFriends.map(({ character, friendship }) => (
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
                  <AvatarChip name={character.name} src={character.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                      {friendship.remarkName?.trim() || character.name}
                    </div>
                    <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                      {character.relationship}
                    </div>
                  </div>
                  <SelectionBadge
                    checked={selectedIds.includes(character.id)}
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col bg-[rgba(255,255,255,0.62)]">
          <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div>
              <div className="text-[11px] tracking-[0.12em] text-[color:var(--text-dim)]">
                已选成员
              </div>
              <div className="mt-2 text-[15px] font-medium text-[color:var(--text-primary)]">
                已选择 {selectedIds.length} 位联系人
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
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            {selectedFriends.length ? (
              <div className="grid grid-cols-2 gap-3">
                {selectedFriends.map(({ character, friendship }) => (
                  <div
                    key={character.id}
                    className="flex items-center gap-3 rounded-[14px] border border-[color:var(--border-faint)] bg-white px-4 py-4 shadow-[var(--shadow-soft)]"
                  >
                    <AvatarChip name={character.name} src={character.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[color:var(--text-primary)]">
                        {friendship.remarkName?.trim() || character.name}
                      </div>
                      <div className="mt-1 truncate text-xs text-[color:var(--text-muted)]">
                        {character.relationship}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelection(character.id)}
                      disabled={pending}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[color:var(--border-faint)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label={`移除 ${character.name}`}
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
                    右侧会显示待加入成员
                  </div>
                  <div className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                    从左侧勾选联系人后，就可以一次性把他们加入当前群聊。
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[color:var(--border-faint)] bg-white/78 px-6 py-4 backdrop-blur-xl">
            <div className="text-[12px] text-[color:var(--text-muted)]">
              已在群里的成员不会重复出现。
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={pending}
                className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
              >
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => onConfirm(selectedIds)}
                disabled={!selectedIds.length || pending}
                className="rounded-[10px] bg-[color:var(--brand-primary)] px-6 text-white hover:opacity-95"
              >
                {pending ? "正在添加..." : "加入群聊"}
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
