import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageCircleMore } from "lucide-react";
import { updateFriendProfile, type Character, type FriendListItem, type UpdateFriendProfileRequest } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { AvatarChip } from "../../components/avatar-chip";
import { formatTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";

type ContactDetailPaneProps = {
  character?: Character | null;
  friendship?: FriendListItem["friendship"] | null;
  onOpenProfile: () => void;
  onStartChat?: () => void;
  chatPending?: boolean;
  isPinned?: boolean;
  pinPending?: boolean;
  onTogglePinned?: () => void;
  isMuted?: boolean;
  mutePending?: boolean;
  onToggleMuted?: () => void;
  isStarred?: boolean;
  starPending?: boolean;
  onToggleStarred?: () => void;
  isBlocked?: boolean;
  blockPending?: boolean;
  onToggleBlock?: () => void;
};

type FriendProfileFormState = {
  remarkName: string;
  region: string;
  source: string;
  tags: string;
};

export function ContactDetailPane({
  character,
  friendship,
  onOpenProfile,
  onStartChat,
  chatPending = false,
  isPinned = false,
  pinPending = false,
  onTogglePinned,
  isMuted = false,
  mutePending = false,
  onToggleMuted,
  isStarred = false,
  starPending = false,
  onToggleStarred,
  isBlocked = false,
  blockPending = false,
  onToggleBlock,
}: ContactDetailPaneProps) {
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<FriendProfileFormState>({
    remarkName: "",
    region: "",
    source: "",
    tags: "",
  });

  useEffect(() => {
    setIsEditingProfile(false);
    setProfileNotice(null);
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      region: friendship?.region ?? "",
      source: friendship?.source ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [character?.id, friendship?.id, friendship?.region, friendship?.remarkName, friendship?.source, friendship?.tags]);

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
  const remarkName = friendship?.remarkName?.trim() || "";
  const displayName = remarkName || character.name;
  const relationshipSummary = isFriend ? character.relationship || "联系人" : character.relationship || "世界角色";
  const description = character.bio?.trim() || (isFriend ? "这个联系人还没有补充更多资料。" : "可以先查看资料，了解这个角色。");
  const profileRows = isFriend
    ? [
        { label: "备注", value: remarkName || "未设置" },
        { label: "昵称", value: character.name },
        { label: "地区", value: friendship?.region?.trim() || "未设置" },
        { label: "来源", value: friendship?.source?.trim() || "未设置" },
        { label: "标签", value: friendship?.tags?.length ? friendship.tags.join(" / ") : "未设置" },
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

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateFriendProfileRequest) => {
      if (!character || !isFriend) {
        throw new Error("Friend not found");
      }

      return updateFriendProfile(character.id, payload, baseUrl);
    },
    onSuccess: async () => {
      setProfileNotice("联系人资料已更新。");
      await queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] });
    },
  });

  async function handleProfileSave() {
    await updateProfileMutation.mutateAsync({
      remarkName: profileForm.remarkName,
      region: profileForm.region,
      source: profileForm.source,
      tags: profileForm.tags
        .split(/[，,]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }

  return (
    <div className="flex h-full overflow-auto bg-[#f5f5f5]">
      <div className="mx-auto flex w-full max-w-[720px] flex-col px-10 py-10">
        <section className="overflow-hidden rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.06)]">
          <div className="flex items-start justify-between gap-6 px-8 py-8">
            <div className="flex min-w-0 flex-1 items-start gap-5">
              <AvatarChip name={character.name} src={character.avatar} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-[30px] font-medium tracking-[0.01em] text-[color:var(--text-primary)]">{displayName}</h2>
                  <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-3 py-1 text-xs text-[color:var(--text-secondary)]">
                    {isFriend ? "联系人" : "世界角色"}
                  </span>
                </div>
                <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
                  {remarkName ? `昵称：${character.name}` : "备注：未设置"}
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

          <DetailSection
            title="基础资料"
            action={
              isFriend ? (
                isEditingProfile ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-full px-3 py-1 text-xs text-[color:var(--text-dim)] transition-colors hover:bg-[rgba(15,23,42,0.05)]"
                      onClick={() => {
                        setIsEditingProfile(false);
                        setProfileForm({
                          remarkName: friendship?.remarkName ?? "",
                          region: friendship?.region ?? "",
                          source: friendship?.source ?? "",
                          tags: friendship?.tags?.join("，") ?? "",
                        });
                      }}
                      disabled={updateProfileMutation.isPending}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className="rounded-full bg-[#07c160] px-3 py-1 text-xs text-white transition-colors hover:brightness-105 disabled:opacity-60"
                      onClick={async () => {
                        await handleProfileSave();
                        setIsEditingProfile(false);
                      }}
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending ? "保存中..." : "保存"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="rounded-full px-3 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-[rgba(15,23,42,0.05)]"
                    onClick={() => setIsEditingProfile(true)}
                  >
                    编辑
                  </button>
                )
              ) : null
            }
          >
            {profileNotice ? (
              <div className="px-8 pb-2">
                <InlineNotice tone="success">{profileNotice}</InlineNotice>
              </div>
            ) : null}
            {updateProfileMutation.isError && updateProfileMutation.error instanceof Error ? (
              <div className="px-8 pb-2">
                <ErrorBlock message={updateProfileMutation.error.message} />
              </div>
            ) : null}
            {isFriend && isEditingProfile ? (
              <div className="px-8 pb-6">
                <div className="grid gap-4">
                  <EditableDetailField
                    label="备注"
                    value={profileForm.remarkName}
                    placeholder="给联系人添加备注名"
                    onChange={(value) => setProfileForm((current) => ({ ...current, remarkName: value }))}
                  />
                  <StaticDetailRow label="昵称" value={character.name} />
                  <EditableDetailField
                    label="地区"
                    value={profileForm.region}
                    placeholder="例如：上海 / 东京 / 线上"
                    onChange={(value) => setProfileForm((current) => ({ ...current, region: value }))}
                  />
                  <EditableDetailField
                    label="来源"
                    value={profileForm.source}
                    placeholder="例如：摇一摇 / 场景相遇 / 朋友圈"
                    onChange={(value) => setProfileForm((current) => ({ ...current, source: value }))}
                  />
                  <EditableDetailField
                    label="标签"
                    value={profileForm.tags}
                    placeholder="用逗号分隔，例如：同事，插画，策展"
                    onChange={(value) => setProfileForm((current) => ({ ...current, tags: value }))}
                  />
                  <StaticDetailRow label="隐界号" value={`yinjie_${character.id.slice(0, 8)}`} />
                  <StaticDetailRow label="个性签名" value={character.currentStatus?.trim() || "这个联系人还没有签名。"} />
                  <StaticDetailRow label="最近互动" value={formatTimestamp(friendship?.lastInteractedAt ?? character.lastActiveAt ?? null)} />
                </div>
              </div>
            ) : (
              profileRows.map((item) => <StaticDetailRow key={item.label} label={item.label} value={item.value} />)
            )}
          </DetailSection>

          <DetailSection title="内容与关系">
            <ActionDetailRow
              label="更多资料"
              value={isFriend ? "查看角色档案与更多介绍" : "查看完整角色资料"}
              onClick={onOpenProfile}
            />
            <StaticDetailRow label="朋友圈" value="后续接入" muted />
            <StaticDetailRow label="共同群聊" value="后续接入" muted />
          </DetailSection>

          {isFriend ? (
            <DetailSection title="聊天与管理">
              <ToggleDetailRow
                label="置顶聊天"
                checked={isPinned}
                disabled={pinPending}
                onToggle={onTogglePinned}
              />
              <ToggleDetailRow
                label="消息免打扰"
                checked={isMuted}
                disabled={mutePending}
                onToggle={onToggleMuted}
              />
              <ToggleDetailRow
                label="星标朋友"
                checked={isStarred}
                disabled={starPending}
                onToggle={onToggleStarred}
              />
              <ActionDetailRow label="查看资料" value="进入角色资料详情页" onClick={onOpenProfile} />
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
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="border-t border-[rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between gap-3 px-8 pt-6 pb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">{title}</div>
        {action}
      </div>
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

function EditableDetailField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-4">
      <div className="w-24 shrink-0 text-sm text-[color:var(--text-muted)]">{label}</div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-2xl border border-[color:var(--border-faint)] bg-[rgba(245,245,245,0.9)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[#07c160]"
      />
    </label>
  );
}

function ToggleDetailRow({
  label,
  checked,
  disabled = false,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || !onToggle}
      className="flex w-full items-center gap-4 px-8 py-4 text-left text-sm transition-colors hover:bg-[rgba(15,23,42,0.03)] disabled:opacity-60"
      role="switch"
      aria-checked={checked}
    >
      <div className="w-24 shrink-0 text-[color:var(--text-muted)]">{label}</div>
      <div className="flex flex-1 justify-end">
        <span
          className={`relative h-7 w-12 rounded-full transition-colors ${
            checked ? "bg-[#07c160]" : "bg-[rgba(15,23,42,0.14)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
              checked ? "left-5" : "left-0.5"
            }`}
          />
        </span>
      </div>
    </button>
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
