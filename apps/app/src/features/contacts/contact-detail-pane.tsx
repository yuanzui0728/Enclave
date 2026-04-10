import type { ReactNode } from "react";
import { ChevronRight, MessageCircleMore } from "lucide-react";
import type { Character, FriendListItem } from "@yinjie/contracts";
import { Button } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { formatTimestamp } from "../../lib/format";

type ContactDetailPaneProps = {
  character?: Character | null;
  friendship?: FriendListItem["friendship"] | null;
  onOpenProfile: () => void;
  onStartChat?: () => void;
  chatPending?: boolean;
  isStarred?: boolean;
  starPending?: boolean;
  onToggleStarred?: () => void;
  isBlocked?: boolean;
  blockPending?: boolean;
  onToggleBlock?: () => void;
};

export function ContactDetailPane({
  character,
  friendship,
  onOpenProfile,
  onStartChat,
  chatPending = false,
  isStarred = false,
  starPending = false,
  onToggleStarred,
  isBlocked = false,
  blockPending = false,
  onToggleBlock,
}: ContactDetailPaneProps) {
  if (!character) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f5f5f5] px-10">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-[rgba(15,23,42,0.08)] bg-white text-3xl text-[color:var(--text-dim)] shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
            ···
          </div>
          <div className="mt-6 text-[17px] font-medium text-[color:var(--text-primary)]">选择联系人</div>
          <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            从左侧通讯录选择一位好友后，这里会显示更接近微信电脑端的联系人资料与常用操作。
          </p>
        </div>
      </div>
    );
  }

  const isFriend = Boolean(friendship);
  const profileRows = isFriend
    ? [
        { label: "备注", value: "暂无" },
        { label: "昵称", value: character.name },
        { label: "隐界号", value: `yinjie_${character.id.slice(0, 8)}` },
        { label: "个性签名", value: character.currentStatus?.trim() || "这个联系人还没有签名。" },
        { label: "最近互动", value: formatTimestamp(friendship?.lastInteractedAt ?? character.lastActiveAt ?? null) },
      ]
    : [
        { label: "昵称", value: character.name },
        { label: "身份", value: character.relationship || "世界角色" },
        { label: "隐界号", value: `yinjie_${character.id.slice(0, 8)}` },
        { label: "个性签名", value: character.currentStatus?.trim() || "这个角色还没有签名。" },
      ];

  const relationshipSummary = isFriend ? character.relationship || "联系人" : character.relationship || "世界角色";
  const description = character.bio?.trim() || (isFriend ? "这个联系人还没有补充更多资料。" : "可以先查看资料，了解这个角色。");

  return (
    <div className="flex h-full overflow-auto bg-[#f5f5f5]">
      <div className="mx-auto flex w-full max-w-[720px] flex-col px-10 py-10">
        <section className="overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-6 px-8 py-8">
            <div className="flex min-w-0 flex-1 items-start gap-5">
              <AvatarChip name={character.name} src={character.avatar} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[30px] font-medium tracking-[0.01em] text-[color:var(--text-primary)]">{character.name}</h2>
                  <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                    {isFriend ? "联系人" : "世界角色"}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  备注：暂无
                  <span className="mx-2 text-[color:var(--border-faint)]">|</span>
                  {relationshipSummary}
                </div>
                <div className="mt-1 text-sm text-[color:var(--text-dim)]">隐界号：yinjie_{character.id.slice(0, 8)}</div>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-[color:var(--text-secondary)]">{description}</p>
              </div>
            </div>

            <div className="shrink-0">
              {isFriend && onStartChat ? (
                <Button variant="primary" size="lg" className="min-w-32 rounded-2xl" onClick={onStartChat} disabled={chatPending}>
                  <MessageCircleMore size={16} />
                  {chatPending ? "正在打开会话..." : "发消息"}
                </Button>
              ) : (
                <Button variant="primary" size="lg" className="min-w-32 rounded-2xl" onClick={onOpenProfile}>
                  查看资料
                </Button>
              )}
            </div>
          </div>

          <DetailSection title="基础资料">
            {profileRows.map((item) => (
              <StaticDetailRow key={item.label} label={item.label} value={item.value} />
            ))}
          </DetailSection>

          <DetailSection title="内容与关系">
            <ActionDetailRow
              label="更多资料"
              value={isFriend ? "查看角色档案与更多介绍" : "查看完整角色资料"}
              onClick={onOpenProfile}
            />
            <StaticDetailRow label="朋友圈" value="暂未接入" muted />
            <StaticDetailRow label="共同群聊" value="暂未接入" muted />
          </DetailSection>

          {isFriend ? (
            <DetailSection title="聊天与管理">
              <StaticDetailRow label="置顶聊天" value="后续接入" muted />
              <StaticDetailRow label="消息免打扰" value="后续接入" muted />
              <ActionDetailRow label="查看资料" value="进入角色资料详情页" onClick={onOpenProfile} />
              {onToggleStarred ? (
                <ActionDetailRow
                  label="星标朋友"
                  value={starPending ? "正在更新..." : isStarred ? "取消星标" : "设为星标朋友"}
                  onClick={onToggleStarred}
                  disabled={starPending}
                />
              ) : null}
              {onToggleBlock ? (
                <ActionDetailRow
                  label={isBlocked ? "黑名单" : "联系人管理"}
                  value={blockPending ? "正在更新..." : isBlocked ? "移出黑名单" : "加入黑名单"}
                  onClick={onToggleBlock}
                  danger
                  disabled={blockPending}
                />
              ) : null}
              <StaticDetailRow label="删除联系人" value="后续接入" muted />
            </DetailSection>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[rgba(15,23,42,0.08)]">
      <div className="px-8 pt-6 pb-3 text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{title}</div>
      <div>{children}</div>
    </section>
  );
}

function StaticDetailRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-8 py-4 text-sm">
      <div className="w-24 shrink-0 text-[color:var(--text-muted)]">{label}</div>
      <div className={muted ? "text-[color:var(--text-dim)]" : "text-[color:var(--text-primary)]"}>{value}</div>
    </div>
  );
}

function ActionDetailRow({
  label,
  value,
  onClick,
  danger = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-4 px-8 py-4 text-left text-sm transition-colors ${
        danger
          ? "text-[color:var(--state-danger-text)] hover:bg-[rgba(239,68,68,0.05)] disabled:text-[color:var(--text-dim)]"
          : "hover:bg-[rgba(15,23,42,0.03)]"
      }`}
    >
      <div className="w-24 shrink-0 text-[color:var(--text-muted)]">{label}</div>
      <div
        className={`min-w-0 flex-1 truncate ${
          danger
            ? disabled
              ? "text-[color:var(--text-dim)]"
              : "text-[color:var(--state-danger-text)]"
            : "text-[color:var(--text-primary)]"
        }`}
      >
        {value}
      </div>
      <ChevronRight size={16} className="shrink-0 text-[color:var(--text-dim)]" />
    </button>
  );
}
