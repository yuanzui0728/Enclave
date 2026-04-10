import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircleMore } from "lucide-react";
import {
  updateFriendProfile,
  type Character,
  type FriendListItem,
  type UpdateFriendProfileRequest,
} from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  DesktopContactProfileActionRow,
  DesktopContactProfileCard,
  DesktopContactProfileInfoRow,
  DesktopContactProfileSection,
  DesktopContactProfileToggleRow,
} from "./desktop-contact-profile-components";

type ContactDetailPaneProps = {
  character?: Character | null;
  friendship?: FriendListItem["friendship"] | null;
  commonGroups?: Array<{
    id: string;
    name: string;
  }>;
  onOpenGroup?: (groupId: string) => void;
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
  deletePending?: boolean;
  onDeleteFriend?: () => void;
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
  commonGroups = [],
  onOpenGroup,
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
  deletePending = false,
  onDeleteFriend,
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
  }, [
    character?.id,
    friendship?.id,
    friendship?.region,
    friendship?.remarkName,
    friendship?.source,
    friendship?.tags,
  ]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateFriendProfileRequest) => {
      if (!character || !friendship) {
        throw new Error("Friend not found");
      }

      return updateFriendProfile(character.id, payload, baseUrl);
    },
    onSuccess: async () => {
      setProfileNotice("联系人资料已更新。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });

  if (!character) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f5f5f5] px-10">
        <div className="flex max-w-sm flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-[22px] border border-black/6 bg-white text-3xl text-[color:var(--text-dim)] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            ···
          </div>
          <div className="mt-5 text-[17px] font-medium text-[color:var(--text-primary)]">
            选择联系人
          </div>
          <p className="mt-2 text-sm leading-7 text-[color:var(--text-secondary)]">
            从左侧通讯录选择一位联系人后，这里会显示联系人资料、内容入口和常用管理操作。
          </p>
        </div>
      </div>
    );
  }

  const isFriend = Boolean(friendship);
  const remarkName = friendship?.remarkName?.trim() || "";
  const displayName = remarkName || character.name;
  const relationshipSummary = isFriend
    ? character.relationship || "联系人"
    : character.relationship || "世界角色";
  const tagsLabel = friendship?.tags?.length
    ? friendship.tags.join(" / ")
    : "未设置";
  const groupsSummary = commonGroups.length
    ? `${commonGroups.length} 个共同群聊`
    : "暂时没有共同群聊";
  const profileRows = isFriend
    ? [
        { label: "备注", value: remarkName || "未设置" },
        { label: "昵称", value: character.name },
        { label: "地区", value: friendship?.region?.trim() || "未设置" },
        { label: "来源", value: friendship?.source?.trim() || "未设置" },
        { label: "标签", value: tagsLabel },
        { label: "隐界号", value: `yinjie_${character.id.slice(0, 8)}` },
        {
          label: "个性签名",
          value: character.currentStatus?.trim() || "这个联系人还没有签名。",
        },
      ]
    : [
        { label: "昵称", value: character.name },
        { label: "身份", value: character.relationship || "世界角色" },
        { label: "隐界号", value: `yinjie_${character.id.slice(0, 8)}` },
        {
          label: "个性签名",
          value: character.currentStatus?.trim() || "这个角色还没有签名。",
        },
      ];

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
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-8 py-8">
        <DesktopContactProfileCard
          avatarName={character.name}
          avatarSrc={character.avatar}
          title={displayName}
          badgeLabel={isFriend ? "联系人" : "世界角色"}
          subtitle={
            remarkName ? `昵称：${character.name}` : relationshipSummary
          }
          meta={`隐界号：yinjie_${character.id.slice(0, 8)}`}
          description={
            character.currentStatus?.trim() ||
            (isFriend
              ? "这个联系人还没有补充签名。"
              : "可以先查看资料，了解这个角色。")
          }
          aside={
            <div className="flex flex-col items-end gap-2">
              {isFriend && onStartChat ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="min-w-28 rounded-[14px]"
                  onClick={onStartChat}
                  disabled={chatPending}
                >
                  <MessageCircleMore size={16} />
                  {chatPending ? "打开中..." : "发消息"}
                </Button>
              ) : null}
              <Button
                variant={isFriend ? "secondary" : "primary"}
                size="lg"
                className="min-w-28 rounded-[14px]"
                onClick={onOpenProfile}
              >
                查看资料
              </Button>
            </div>
          }
        />

        <DesktopContactProfileSection
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
                  className="rounded-full px-3 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:bg-black/5"
                  onClick={() => setIsEditingProfile(true)}
                >
                  编辑
                </button>
              )
            ) : null
          }
        >
          {profileNotice ? (
            <div className="px-4 pt-3">
              <InlineNotice tone="success">{profileNotice}</InlineNotice>
            </div>
          ) : null}
          {updateProfileMutation.isError &&
          updateProfileMutation.error instanceof Error ? (
            <div className="px-4 pt-3">
              <ErrorBlock message={updateProfileMutation.error.message} />
            </div>
          ) : null}
          {isFriend && isEditingProfile ? (
            <div className="px-4 py-4">
              <div className="grid gap-4">
                <EditableDetailField
                  label="备注"
                  value={profileForm.remarkName}
                  placeholder="给联系人添加备注名"
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      remarkName: value,
                    }))
                  }
                />
                <EditableStaticRow label="昵称" value={character.name} />
                <EditableDetailField
                  label="地区"
                  value={profileForm.region}
                  placeholder="例如：上海 / 东京 / 线上"
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      region: value,
                    }))
                  }
                />
                <EditableDetailField
                  label="来源"
                  value={profileForm.source}
                  placeholder="例如：摇一摇 / 场景相遇 / 朋友圈"
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      source: value,
                    }))
                  }
                />
                <EditableDetailField
                  label="标签"
                  value={profileForm.tags}
                  placeholder="用逗号分隔，例如：同事，插画，策展"
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      tags: value,
                    }))
                  }
                />
                <EditableStaticRow
                  label="隐界号"
                  value={`yinjie_${character.id.slice(0, 8)}`}
                />
                <EditableStaticRow
                  label="个性签名"
                  value={
                    character.currentStatus?.trim() || "这个联系人还没有签名。"
                  }
                />
              </div>
            </div>
          ) : (
            profileRows.map((item) => (
              <DesktopContactProfileInfoRow
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))
          )}
        </DesktopContactProfileSection>

        <DesktopContactProfileSection title="内容与关系">
          <DesktopContactProfileActionRow
            label="更多"
            value={isFriend ? "查看角色档案与更多介绍" : "查看完整角色资料"}
            onClick={onOpenProfile}
          />
          <DesktopContactProfileActionRow
            label="朋友圈"
            value={isFriend ? "最近动态入口待接入" : "添加联系人后查看"}
            onClick={onOpenProfile}
          />
          <DesktopContactProfileInfoRow
            label="群聊"
            value={groupsSummary}
            muted={!commonGroups.length}
          />
          {commonGroups.length && onOpenGroup
            ? commonGroups
                .slice(0, 3)
                .map((group) => (
                  <DesktopContactProfileActionRow
                    key={group.id}
                    label="共同群聊"
                    value={group.name}
                    onClick={() => onOpenGroup(group.id)}
                  />
                ))
            : null}
        </DesktopContactProfileSection>

        {isFriend ? (
          <DesktopContactProfileSection title="聊天与管理">
            <DesktopContactProfileToggleRow
              label="置顶"
              checked={isPinned}
              disabled={pinPending}
              onToggle={onTogglePinned}
            />
            <DesktopContactProfileToggleRow
              label="免打扰"
              checked={isMuted}
              disabled={mutePending}
              onToggle={onToggleMuted}
            />
            <DesktopContactProfileToggleRow
              label="星标"
              checked={isStarred}
              disabled={starPending}
              onToggle={onToggleStarred}
            />
            <DesktopContactProfileActionRow
              label="资料"
              value="进入角色资料详情页"
              onClick={onOpenProfile}
            />
            {onToggleBlock ? (
              <DesktopContactProfileActionRow
                label={isBlocked ? "黑名单" : "联系人"}
                value={
                  blockPending
                    ? "正在更新..."
                    : isBlocked
                      ? "移出黑名单"
                      : "加入黑名单"
                }
                onClick={onToggleBlock}
                danger
                disabled={blockPending}
              />
            ) : null}
            {onDeleteFriend ? (
              <DesktopContactProfileActionRow
                label="删除"
                value={deletePending ? "正在删除..." : "从通讯录移除"}
                onClick={onDeleteFriend}
                danger
                disabled={deletePending}
              />
            ) : null}
          </DesktopContactProfileSection>
        ) : null}
      </div>
    </div>
  );
}

function EditableStaticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-20 shrink-0 text-sm text-[color:var(--text-muted)]">
        {label}
      </div>
      <div className="min-w-0 flex-1 rounded-[14px] border border-[color:var(--border-faint)] bg-[#f7f7f7] px-4 py-3 text-sm text-[color:var(--text-primary)]">
        {value}
      </div>
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
      <div className="w-20 shrink-0 text-sm text-[color:var(--text-muted)]">
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-[14px] border border-[color:var(--border-faint)] bg-[#fafafa] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[#07c160] focus:bg-white"
      />
    </label>
  );
}
