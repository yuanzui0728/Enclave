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
import { formatTimestamp } from "../../lib/format";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import {
  DesktopContactPaneEmptyState,
  DesktopContactProfileActionRow,
  DesktopContactProfileEditableField,
  DesktopContactProfileHeader,
  DesktopContactProfileRow,
  DesktopContactProfileSection,
  DesktopContactProfileShell,
  DesktopContactProfileToggleRow,
} from "./desktop-contact-profile-blocks";

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
      await queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] });
    },
  });

  if (!character) {
    return <DesktopContactPaneEmptyState />;
  }

  const isFriend = Boolean(friendship);
  const remarkName = friendship?.remarkName?.trim() || "";
  const displayName = remarkName || character.name;
  const identifier = `yinjie_${character.id.slice(0, 8)}`;
  const relationshipSummary = isFriend
    ? remarkName
      ? `昵称：${character.name}`
      : character.relationship || "联系人"
    : character.relationship || "世界角色";
  const signature =
    character.currentStatus?.trim() ||
    character.bio?.trim() ||
    (isFriend ? "这个联系人还没有签名。" : "这个角色还没有签名。");
  const profileRows = isFriend
    ? [
        { label: "备注", value: remarkName || "未设置" },
        { label: "昵称", value: character.name },
        { label: "隐界号", value: identifier },
        { label: "地区", value: friendship?.region?.trim() || "未设置" },
        { label: "来源", value: friendship?.source?.trim() || "未设置" },
        {
          label: "标签",
          value: friendship?.tags?.length ? friendship.tags.join(" / ") : "未设置",
        },
        { label: "个性签名", value: signature },
        {
          label: "最近互动",
          value: formatTimestamp(friendship?.lastInteractedAt ?? character.lastActiveAt ?? null),
        },
      ]
    : [
        { label: "昵称", value: character.name },
        { label: "身份", value: character.relationship || "世界角色" },
        { label: "隐界号", value: identifier },
        { label: "个性签名", value: signature },
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
    <DesktopContactProfileShell>
      <DesktopContactProfileHeader
        avatar={character.avatar}
        name={character.name}
        displayName={displayName}
        badge={isFriend ? "联系人" : "世界角色"}
        subline={relationshipSummary}
        identifier={identifier}
        signature={signature}
        action={
          isFriend && onStartChat ? (
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
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="min-w-28 rounded-[14px]"
              onClick={onOpenProfile}
            >
              查看资料
            </Button>
          )
        }
      />

      <DesktopContactProfileSection
        title={isFriend ? "联系人资料" : "基础资料"}
        action={
          isFriend ? (
            isEditingProfile ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-transparent px-3 py-1 text-xs text-[color:var(--text-dim)] transition-colors hover:border-[color:var(--border-faint)] hover:bg-[rgba(7,193,96,0.06)]"
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
                className="rounded-full border border-transparent px-3 py-1 text-xs text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-faint)] hover:bg-[rgba(7,193,96,0.06)]"
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
        {updateProfileMutation.isError &&
        updateProfileMutation.error instanceof Error ? (
          <div className="px-8 pb-2">
            <ErrorBlock message={updateProfileMutation.error.message} />
          </div>
        ) : null}
        {isFriend && isEditingProfile ? (
          <>
            <DesktopContactProfileEditableField
              label="备注"
              value={profileForm.remarkName}
              placeholder="给联系人添加备注名"
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, remarkName: value }))
              }
            />
            <DesktopContactProfileRow label="昵称" value={character.name} />
            <DesktopContactProfileEditableField
              label="地区"
              value={profileForm.region}
              placeholder="例如：上海 / 东京 / 线上"
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, region: value }))
              }
            />
            <DesktopContactProfileEditableField
              label="来源"
              value={profileForm.source}
              placeholder="例如：摇一摇 / 场景相遇 / 朋友圈"
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, source: value }))
              }
            />
            <DesktopContactProfileEditableField
              label="标签"
              value={profileForm.tags}
              placeholder="用逗号分隔，例如：同事，插画，策展"
              onChange={(value) =>
                setProfileForm((current) => ({ ...current, tags: value }))
              }
            />
            <DesktopContactProfileRow label="隐界号" value={identifier} />
            <DesktopContactProfileRow label="个性签名" value={signature} />
            <DesktopContactProfileRow
              label="最近互动"
              value={formatTimestamp(friendship?.lastInteractedAt ?? character.lastActiveAt ?? null)}
            />
          </>
        ) : (
          profileRows.map((item) => (
            <DesktopContactProfileRow
              key={item.label}
              label={item.label}
              value={item.value}
            />
          ))
        )}
      </DesktopContactProfileSection>

      <DesktopContactProfileSection title="内容与关系">
        <DesktopContactProfileActionRow
          label="更多资料"
          value={isFriend ? "查看角色档案与更多介绍" : "查看完整角色资料"}
          onClick={onOpenProfile}
        />
        <DesktopContactProfileRow label="朋友圈" value="后续接入" muted />
        <DesktopContactProfileRow
          label="共同群聊"
          value={commonGroups.length ? `${commonGroups.length} 个共同群聊` : "暂时没有共同群聊"}
          muted={!commonGroups.length}
        />
        {commonGroups.length && onOpenGroup
          ? commonGroups.slice(0, 3).map((group) => (
              <DesktopContactProfileActionRow
                key={group.id}
                label="群聊"
                value={group.name}
                onClick={() => onOpenGroup(group.id)}
              />
            ))
          : null}
      </DesktopContactProfileSection>

      {isFriend ? (
        <DesktopContactProfileSection title="聊天与管理">
          <DesktopContactProfileToggleRow
            label="置顶聊天"
            checked={isPinned}
            disabled={pinPending}
            onToggle={onTogglePinned}
          />
          <DesktopContactProfileToggleRow
            label="消息免打扰"
            checked={isMuted}
            disabled={mutePending}
            onToggle={onToggleMuted}
          />
          <DesktopContactProfileToggleRow
            label="星标朋友"
            checked={isStarred}
            disabled={starPending}
            onToggle={onToggleStarred}
          />
          <DesktopContactProfileActionRow
            label="查看资料"
            value="进入角色资料详情页"
            onClick={onOpenProfile}
          />
          {onToggleBlock ? (
            <DesktopContactProfileActionRow
              label={isBlocked ? "黑名单" : "联系人管理"}
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
              label="删除联系人"
              value={deletePending ? "正在删除..." : "从通讯录移除"}
              onClick={onDeleteFriend}
              danger
              disabled={deletePending}
            />
          ) : (
            <DesktopContactProfileRow label="删除联系人" value="后续接入" muted />
          )}
        </DesktopContactProfileSection>
      ) : null}
    </DesktopContactProfileShell>
  );
}
