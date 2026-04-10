import type { Character, FriendListItem } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { EmptyState } from "../../components/empty-state";
import { formatTimestamp } from "../../lib/format";

type ContactDetailPaneProps = {
  character?: Character | null;
  friendship?: FriendListItem["friendship"] | null;
  onOpenProfile: () => void;
  onStartChat?: () => void;
  chatPending?: boolean;
};

export function ContactDetailPane({
  character,
  friendship,
  onOpenProfile,
  onStartChat,
  chatPending = false,
}: ContactDetailPaneProps) {
  if (!character) {
    return (
      <div className="flex h-full items-center justify-center px-10">
        <EmptyState title="先选择一个联系人" description="左侧会保留微信式联系人目录，你可以在这里查看资料或继续发消息。" />
      </div>
    );
  }

  const detailItems = friendship
    ? [
        { label: "关系", value: character.relationship || "联系人" },
        { label: "当前状态", value: character.currentStatus?.trim() || character.relationship || "保持联系" },
        { label: "最近互动", value: formatTimestamp(friendship.lastInteractedAt ?? character.lastActiveAt ?? null) },
      ]
    : [
        { label: "身份", value: character.relationship || "世界角色" },
        { label: "当前状态", value: character.currentStatus?.trim() || character.relationship || "查看角色资料" },
        { label: "擅长领域", value: character.expertDomains.slice(0, 3).join(" / ") || "查看角色资料" },
        { label: "最近活跃", value: formatTimestamp(character.lastActiveAt ?? null) },
      ];

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,248,250,0.98))]">
      <div className="border-b border-[rgba(15,23,42,0.06)] px-8 py-8">
        <div className="flex items-start gap-5">
          <AvatarChip name={character.name} src={character.avatar} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[28px] font-semibold tracking-[0.01em] text-[color:var(--text-primary)]">{character.name}</h2>
              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                {friendship ? "联系人" : "世界角色"}
              </span>
            </div>
            <div className="mt-2 text-sm text-[color:var(--text-secondary)]">{character.currentStatus?.trim() || character.relationship || "保持联系"}</div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">
              {character.bio?.trim() || "这里会展示联系人资料、关系状态和常用动作。"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {friendship && onStartChat ? (
            <Button variant="primary" size="lg" className="min-w-32 rounded-2xl" onClick={onStartChat} disabled={chatPending}>
              {chatPending ? "正在打开会话..." : "发消息"}
            </Button>
          ) : null}
          <Button
            variant={friendship ? "secondary" : "primary"}
            size="lg"
            className="min-w-32 rounded-2xl"
            onClick={onOpenProfile}
          >
            查看资料
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-8 py-8 lg:grid-cols-2">
        {detailItems.map((item) => (
          <div
            key={item.label}
            className="rounded-[24px] border border-[rgba(15,23,42,0.06)] bg-white/92 px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
          >
            <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{item.label}</div>
            <div className="mt-3 text-sm leading-7 text-[color:var(--text-primary)]">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
