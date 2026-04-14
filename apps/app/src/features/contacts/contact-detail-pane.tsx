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
import { DesktopContactTextEditDialog } from "./desktop-contact-text-edit-dialog";
import {
  DesktopContactPaneEmptyState,
  DesktopContactProfileActionRow,
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
  onOpenMoments?: () => void;
  onOpenProfile: () => void;
  showProfileEntry?: boolean;
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
  tags: string;
};

type EditableProfileField = "remarkName" | "tags" | null;

export function ContactDetailPane({
  character,
  friendship,
  commonGroups = [],
  onOpenGroup,
  onOpenMoments,
  onOpenProfile,
  showProfileEntry = true,
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
  const [editingField, setEditingField] = useState<EditableProfileField>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<FriendProfileFormState>({
    remarkName: "",
    tags: "",
  });

  useEffect(() => {
    setEditingField(null);
    setProfileNotice(null);
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [
    character?.id,
    friendship?.id,
    friendship?.remarkName,
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
  const relationshipSummary = remarkName
    ? `昵称：${character.name}`
    : isFriend
      ? character.relationship || "联系人"
      : character.relationship || "世界角色";
  const signature =
    character.currentStatus?.trim() ||
    character.bio?.trim() ||
    (isFriend ? "这个联系人还没有签名。" : "这个角色还没有签名。");
  const tagValue = friendship?.tags?.length ? friendship.tags.join("、") : "未设置";
  const currentEditDialog =
    editingField === "remarkName"
      ? {
          title: "设置备注",
          description: "备注名会优先显示在桌面联系人信息页和聊天信息里。",
          placeholder: "给联系人设置备注名",
          initialValue: profileForm.remarkName,
          onConfirm: async (value: string) => {
            const nextForm = { ...profileForm, remarkName: value };
            setProfileForm(nextForm);
            await handleProfileSave(nextForm);
            setEditingField(null);
          },
        }
      : editingField === "tags"
        ? {
            title: "设置标签",
            description: "用逗号分隔多个标签，例如：同事，插画，策展。",
            placeholder: "输入联系人标签",
            initialValue: profileForm.tags,
            onConfirm: async (value: string) => {
              const nextForm = { ...profileForm, tags: value };
              setProfileForm(nextForm);
              await handleProfileSave(nextForm);
              setEditingField(null);
            },
          }
        : null;

  async function handleProfileSave(nextForm: FriendProfileFormState) {
    await updateProfileMutation.mutateAsync({
      remarkName: nextForm.remarkName.trim() || null,
      tags: nextForm.tags
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
        subline={relationshipSummary}
        identifier={identifier}
        action={
          isFriend && onStartChat ? (
            <Button
              variant="primary"
              size="lg"
              className="min-w-28 rounded-[10px] bg-[#07c160] px-6 text-white shadow-none hover:bg-[#06ad56]"
              onClick={onStartChat}
              disabled={chatPending}
            >
              <MessageCircleMore size={15} />
              {chatPending ? "打开中..." : "发消息"}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="min-w-28 rounded-[10px] bg-[#07c160] px-6 text-white shadow-none hover:bg-[#06ad56]"
              onClick={onOpenProfile}
            >
              查看详细资料
            </Button>
          )
        }
      />

      <DesktopContactProfileSection title={isFriend ? "朋友信息" : "角色信息"}>
        {profileNotice ? (
          <div className="px-6 pb-2">
            <InlineNotice tone="success">{profileNotice}</InlineNotice>
          </div>
        ) : null}
        {updateProfileMutation.isError &&
        updateProfileMutation.error instanceof Error ? (
          <div className="px-6 pb-2">
            <ErrorBlock message={updateProfileMutation.error.message} />
          </div>
        ) : null}
        {isFriend ? (
          <>
            <DesktopContactProfileActionRow
              label="备注"
              value={remarkName || "未设置"}
              onClick={() => setEditingField("remarkName")}
              valueMuted={!remarkName}
            />
            <DesktopContactProfileRow label="昵称" value={character.name} />
            <DesktopContactProfileRow label="隐界号" value={identifier} />
            <DesktopContactProfileRow
              label="地区"
              value={friendship?.region?.trim() || "未设置"}
              muted={!friendship?.region?.trim()}
            />
            <DesktopContactProfileRow
              label="来源"
              value={friendship?.source?.trim() || "未设置"}
              muted={!friendship?.source?.trim()}
            />
            <DesktopContactProfileActionRow
              label="标签"
              value={tagValue}
              onClick={() => setEditingField("tags")}
              valueMuted={!friendship?.tags?.length}
            />
          </>
        ) : (
          <>
            <DesktopContactProfileRow label="昵称" value={character.name} />
            <DesktopContactProfileRow
              label="身份"
              value={character.relationship || "世界角色"}
            />
            <DesktopContactProfileRow label="隐界号" value={identifier} />
          </>
        )}
      </DesktopContactProfileSection>

      <DesktopContactProfileSection title="社交与内容">
        <DesktopContactProfileActionRow
          label="朋友圈"
          value={isFriend && onOpenMoments ? "查看这位好友最近的朋友圈" : "加为好友后可查看"}
          onClick={isFriend && onOpenMoments ? onOpenMoments : onOpenProfile}
          disabled={!isFriend || !onOpenMoments}
          valueMuted={!isFriend || !onOpenMoments}
        />
        <DesktopContactProfileActionRow
          label="共同群聊"
          value={commonGroups.length ? `${commonGroups.length} 个共同群聊` : "暂时没有共同群聊"}
          onClick={() => {
            if (commonGroups[0] && onOpenGroup) {
              onOpenGroup(commonGroups[0].id);
            }
          }}
          disabled={!commonGroups.length || !onOpenGroup}
          valueMuted={!commonGroups.length}
        />
        {showProfileEntry ? (
          <DesktopContactProfileActionRow
            label="详细资料"
            value={isFriend ? "查看角色档案与扩展介绍" : "查看角色资料"}
            onClick={onOpenProfile}
          />
        ) : null}
      </DesktopContactProfileSection>

      <DesktopContactProfileSection title="更多信息">
        <DesktopContactProfileRow label="个性签名" value={signature} multiline muted={!character.currentStatus?.trim() && !character.bio?.trim()} />
        {isFriend ? (
          <DesktopContactProfileRow
            label="最近互动"
            value={formatTimestamp(
              friendship?.lastInteractedAt ?? character.lastActiveAt ?? null,
            )}
          />
        ) : null}
      </DesktopContactProfileSection>

      {isFriend ? (
        <>
          <DesktopContactProfileSection title="聊天与提醒">
            <DesktopContactProfileToggleRow
              label="星标朋友"
              checked={isStarred}
              disabled={starPending}
              onToggle={onToggleStarred}
            />
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
          </DesktopContactProfileSection>

          <DesktopContactProfileSection title="管理">
            {onToggleBlock ? (
              <DesktopContactProfileActionRow
                label={isBlocked ? "黑名单" : "加入黑名单"}
                value={
                  blockPending
                    ? "正在更新..."
                    : isBlocked
                      ? "移出黑名单"
                      : "不再接收这个联系人的互动"
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
              <DesktopContactProfileRow label="删除联系人" value="暂未开放" muted />
            )}
          </DesktopContactProfileSection>
        </>
      ) : null}

      {currentEditDialog ? (
        <DesktopContactTextEditDialog
          open
          title={currentEditDialog.title}
          description={currentEditDialog.description}
          placeholder={currentEditDialog.placeholder}
          initialValue={currentEditDialog.initialValue}
          pending={updateProfileMutation.isPending}
          onClose={() => setEditingField(null)}
          onConfirm={(value) => {
            void currentEditDialog.onConfirm(value);
          }}
        />
      ) : null}
    </DesktopContactProfileShell>
  );
}
