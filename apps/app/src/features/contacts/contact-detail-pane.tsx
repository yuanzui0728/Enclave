import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { MessageCircleMore } from "lucide-react";
import {
  updateFriendProfile,
  type Character,
  type FriendListItem,
  type UpdateFriendProfileRequest,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { SparkBadge } from "../../components/spark-badge";
import { translateCharacterBio } from "../../lib/character-i18n";
import { formatTimestamp } from "../../lib/format";
import { buildYinjieId } from "../../lib/yinjie-id";
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
import { invalidateFriendDisplayQueries } from "./invalidate-friend-display";

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
  defaultVoiceReply?: boolean;
  defaultVoiceReplyPending?: boolean;
  onToggleDefaultVoiceReply?: () => void;
  isBlocked?: boolean;
  blockPending?: boolean;
  onToggleBlock?: () => void;
  deletePending?: boolean;
  onDeleteFriend?: () => void;
  /** 右侧空态（character=null）的自定义渲染。星标朋友 / 标签 这类 sub-pane
   *  传入上下文化的空态，避免默认那条「从左侧通讯录选择好友后...」在 0 starred
   *  / 0 tags 时把用户引向另一个列表。 */
  emptyState?: ReactNode;
};

type FriendProfileFormState = {
  remarkName: string;
  tags: string;
};

type EditableProfileField = "remarkName" | "tags" | null;

type DangerConfirm = "block" | "delete" | null;

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
  defaultVoiceReply = false,
  defaultVoiceReplyPending = false,
  onToggleDefaultVoiceReply,
  isBlocked = false,
  blockPending = false,
  onToggleBlock,
  deletePending = false,
  onDeleteFriend,
  emptyState,
}: ContactDetailPaneProps) {
  const t = useRuntimeTranslator();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [editingField, setEditingField] = useState<EditableProfileField>(null);
  const [dangerConfirm, setDangerConfirm] = useState<DangerConfirm>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<FriendProfileFormState>({
    remarkName: "",
    tags: "",
  });

  useEffect(() => {
    setEditingField(null);
    setDangerConfirm(null);
    // 不在这里 reset profileNotice：updateProfileMutation.onSuccess 设了
    // 「联系人资料已更新」之后会调 invalidateFriendDisplayQueries，friendship
    // 数据 refetch 回来时 remarkName/tags 变了，这条 effect 立刻 fire 把刚
    // 设的 notice 清掉，用户根本看不到反馈。切换联系人时由下方独立的 effect
    // 清，并加 2.4s 自动消失定时器（跟全局 notice 一致）。
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

  useEffect(() => {
    setProfileNotice(null);
    // 走查发现：updateProfileMutation.error 在 ContactDetailPane 实例上是持续的，
    // 切联系人不会自动清。如果 Alice 上「备注」保存失败留下 .error，用户切到
    // Bob → 点 Bob 的「备注」打开弹层，新加的 dialog.error 会把 Alice 那次的错
    // 翻给 Bob，误导 Bob 改半天发现自己根本没出错。切角色时显式 reset。
    updateProfileMutation.reset();
    // updateProfileMutation 是 useMutation 实例，reset 引用每渲染都新，依赖列表
    // 故意不放 reset 以免 character 不变也反复 fire；只关心 character.id。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  useEffect(() => {
    if (!profileNotice) {
      return;
    }
    const timer = window.setTimeout(() => setProfileNotice(null), 2400);
    return () => window.clearTimeout(timer);
  }, [profileNotice]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateFriendProfileRequest) => {
      if (!character || !friendship) {
        throw new Error("Friend not found"); // i18n-ignore-line: internal error
      }

      return updateFriendProfile(character.id, payload, baseUrl);
    },
    onSuccess: async () => {
      setProfileNotice(t(msg`联系人资料已更新。`));
      await invalidateFriendDisplayQueries(queryClient, baseUrl);
    },
  });

  if (!character) {
    return <>{emptyState ?? <DesktopContactPaneEmptyState />}</>;
  }

  const isFriend = Boolean(friendship);
  const remarkName = friendship?.remarkName?.trim() || "";
  const displayName = remarkName || character.name;
  const identifier = buildYinjieId(character.id);
  const relationshipSummary = remarkName
    ? t(msg`昵称：${character.name}`)
    : isFriend
      ? character.relationship || t(msg`联系人`)
      : character.relationship || t(msg`世界角色`);
  const signature =
    character.currentStatus?.trim() ||
    translateCharacterBio(t, character.bio) ||
    (isFriend
      ? t(msg`这个联系人还没有签名。`)
      : t(msg`这个角色还没有签名。`));
  const tagValue = friendship?.tags?.length
    ? friendship.tags.join("、")
    : t(msg`未设置`);
  const currentEditDialog =
    editingField === "remarkName"
      ? {
          title: t(msg`设置备注`),
          description: t(msg`备注名会优先显示在桌面联系人信息页和聊天信息里。`),
          placeholder: t(msg`给联系人设置备注名`),
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
            title: t(msg`设置标签`),
            description: t(msg`用逗号分隔多个标签，例如：同事，插画，策展。`),
            placeholder: t(msg`输入联系人标签`),
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
    <DesktopContactProfileShell scrollResetKey={character.id}>
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
              {chatPending ? t(msg`打开中...`) : t(msg`发消息`)}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="min-w-28 rounded-[10px] bg-[#07c160] px-6 text-white shadow-none hover:bg-[#06ad56]"
              onClick={onOpenProfile}
            >
              {t(msg`查看详细资料`)}
            </Button>
          )
        }
      />

      <DesktopContactProfileSection
        title={isFriend ? t(msg`朋友信息`) : t(msg`角色信息`)}
      >
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
              label={t(msg`备注`)}
              value={remarkName || t(msg`未设置`)}
              onClick={() => setEditingField("remarkName")}
              valueMuted={!remarkName}
            />
            <DesktopContactProfileRow label={t(msg`昵称`)} value={character.name} />
            <DesktopContactProfileRow label={t(msg`隐界号`)} value={identifier} />
            <DesktopContactProfileRow
              label={t(msg`地区`)}
              value={
                friendship?.region?.trim() ||
                character?.region?.trim() ||
                t(msg`未设置`)
              }
              muted={
                !friendship?.region?.trim() && !character?.region?.trim()
              }
            />
            <DesktopContactProfileRow
              label={t(msg`来源`)}
              value={friendship?.source?.trim() || t(msg`未设置`)}
              muted={!friendship?.source?.trim()}
            />
            <DesktopContactProfileActionRow
              label={t(msg`标签`)}
              value={tagValue}
              onClick={() => setEditingField("tags")}
              valueMuted={!friendship?.tags?.length}
            />
          </>
        ) : (
          <>
            <DesktopContactProfileRow label={t(msg`昵称`)} value={character.name} />
            <DesktopContactProfileRow
              label={t(msg`身份`)}
              value={character.relationship || t(msg`世界角色`)}
            />
            <DesktopContactProfileRow label={t(msg`隐界号`)} value={identifier} />
          </>
        )}
      </DesktopContactProfileSection>

      <DesktopContactProfileSection title={t(msg`社交与内容`)}>
        {/* 非好友（世界角色）拿不到对方朋友圈、也不可能有共同群聊；这两行原本
            会落到 fallback「查看角色资料」/「暂时没有共同群聊」，跟下面的
            「详细资料」入口完全重复 + 给人一种"信息不全"的错觉。只对好友显示。 */}
        {isFriend ? (
          <DesktopContactProfileActionRow
            label={t(msg`朋友圈`)}
            value={
              onOpenMoments
                ? t(msg`查看这位角色最近的朋友圈`)
                : t(msg`查看角色资料`)
            }
            onClick={onOpenMoments ?? onOpenProfile}
            disabled={!onOpenMoments && !onOpenProfile}
            valueMuted={!onOpenMoments && !onOpenProfile}
          />
        ) : null}
        {isFriend ? (
          <DesktopContactProfileActionRow
            label={t(msg`共同群聊`)}
            value={
              commonGroups.length
                ? t(msg`${commonGroups.length} 个共同群聊`)
                : t(msg`暂时没有共同群聊`)
            }
            onClick={() => {
              if (commonGroups[0] && onOpenGroup) {
                onOpenGroup(commonGroups[0].id);
              }
            }}
            disabled={!commonGroups.length || !onOpenGroup}
            valueMuted={!commonGroups.length}
          />
        ) : null}
        {showProfileEntry ? (
          <DesktopContactProfileActionRow
            label={t(msg`详细资料`)}
            value={
              isFriend ? t(msg`查看角色档案与扩展介绍`) : t(msg`查看角色资料`)
            }
            onClick={onOpenProfile}
          />
        ) : null}
      </DesktopContactProfileSection>

      <DesktopContactProfileSection title={t(msg`更多信息`)}>
        <DesktopContactProfileRow
          label={t(msg`个性签名`)}
          value={signature}
          multiline
          muted={!character.currentStatus?.trim() && !character.bio?.trim()}
        />
        {isFriend ? (
          <DesktopContactProfileRow
            label={t(msg`最近互动`)}
            // formatTimestamp(null) 会落到「刚刚」分支——对刚加好友、还没真正
            // 互动过的联系人，「最近互动：刚刚」会让人误以为对方刚刚发了消息；
            // 没有任何 lastInteractedAt / lastActiveAt 时显式落「暂无互动」+ muted。
            value={
              friendship?.lastInteractedAt || character.lastActiveAt
                ? formatTimestamp(
                    friendship?.lastInteractedAt ??
                      character.lastActiveAt ??
                      null,
                  )
                : t(msg`暂无互动`)
            }
            muted={
              !friendship?.lastInteractedAt && !character.lastActiveAt
            }
          />
        ) : null}
        {isFriend && (friendship?.sparkStreak ?? 0) >= 3 ? (
          <DesktopContactProfileRow
            label={t(msg`火花`)}
            value={
              <span className="inline-flex items-center gap-2">
                <SparkBadge streak={friendship?.sparkStreak} size="md" />
                <span className="text-[12px] text-[color:var(--text-muted)]">
                  {t(msg`已连续 ${friendship?.sparkStreak ?? 0} 天互动`)}
                </span>
              </span>
            }
          />
        ) : null}
      </DesktopContactProfileSection>

      {isFriend ? (
        <>
          <DesktopContactProfileSection title={t(msg`聊天与提醒`)}>
            <DesktopContactProfileToggleRow
              label={t(msg`星标朋友`)}
              checked={isStarred}
              disabled={starPending}
              onToggle={onToggleStarred}
            />
            <DesktopContactProfileToggleRow
              label={t(msg`置顶聊天`)}
              checked={isPinned}
              disabled={pinPending}
              onToggle={onTogglePinned}
            />
            <DesktopContactProfileToggleRow
              label={t(msg`消息免打扰`)}
              checked={isMuted}
              disabled={mutePending}
              onToggle={onToggleMuted}
            />
            {onToggleDefaultVoiceReply ? (
              <DesktopContactProfileToggleRow
                label={t(msg`默认用语音回复`)}
                checked={defaultVoiceReply}
                disabled={defaultVoiceReplyPending}
                onToggle={onToggleDefaultVoiceReply}
              />
            ) : null}
          </DesktopContactProfileSection>

          <DesktopContactProfileSection title={t(msg`管理`)}>
            {onToggleBlock ? (
              <DesktopContactProfileActionRow
                label={isBlocked ? t(msg`黑名单`) : t(msg`加入黑名单`)}
                value={
                  blockPending
                    ? t(msg`正在更新...`)
                    : isBlocked
                      ? t(msg`移出黑名单`)
                      : t(msg`不再接收这个联系人的互动`)
                }
                // 拉黑前先要二次确认，避免误点直接把人甩进黑名单（被拉黑后联系人
                // 会从通讯录消失，要从「设置 → 黑名单」找回来才能恢复）；移出黑名单
                // 是恢复操作，可直接执行无需确认。
                onClick={() => {
                  if (isBlocked) {
                    onToggleBlock();
                  } else {
                    setDangerConfirm("block");
                  }
                }}
                danger
                disabled={blockPending}
              />
            ) : null}
            {onDeleteFriend ? (
              <DesktopContactProfileActionRow
                label={t(msg`删除联系人`)}
                value={
                  deletePending ? t(msg`正在删除...`) : t(msg`从通讯录移除`)
                }
                onClick={() => setDangerConfirm("delete")}
                danger
                disabled={deletePending}
              />
            ) : (
              <DesktopContactProfileRow
                label={t(msg`删除联系人`)}
                value={t(msg`暂未开放`)}
                muted
              />
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
          // 走查发现：保存失败时 await mutateAsync 抛错 → setEditingField(null)
          // 不会执行 → 弹层保持打开。下方 section 里的 ErrorBlock 被弹层
          // backdrop 整个遮掉，用户看不到失败原因，只看到「保存」按钮恢复可点，
          // 以为自己没点中按钮。把错误一起塞进弹层内显示，用户立刻知道哪儿挂了
          // + 可以原地改完再点保存。
          error={
            updateProfileMutation.isError &&
            updateProfileMutation.error instanceof Error
              ? updateProfileMutation.error.message
              : null
          }
          onClose={() => {
            // 用户主动关弹层（Esc / Cancel / X / backdrop）时，把上一次失败的
            // mutation.error 也一并清掉。否则关弹层后 section 里的 ErrorBlock 会
            // 把错误又翻出来一次（弹层里已经看过了），需要切走再切回联系人才能消。
            updateProfileMutation.reset();
            setEditingField(null);
          }}
          onConfirm={(value) => {
            void currentEditDialog.onConfirm(value);
          }}
        />
      ) : null}

      {dangerConfirm === "block" && onToggleBlock ? (
        <DangerConfirmDialog
          title={t(msg`确定加入黑名单？`)}
          description={t(
            msg`将不再收到 ${displayName} 的互动；TA 会从通讯录消失，可在「通讯录管理 → 黑名单」恢复。`,
          )}
          confirmLabel={t(msg`加入黑名单`)}
          pending={blockPending}
          onCancel={() => setDangerConfirm(null)}
          onConfirm={() => {
            setDangerConfirm(null);
            onToggleBlock();
          }}
        />
      ) : null}

      {dangerConfirm === "delete" && onDeleteFriend ? (
        <DangerConfirmDialog
          title={t(msg`确定从通讯录删除 ${displayName}？`)}
          description={t(msg`删除后将不会通知对方，可重新添加。`)}
          confirmLabel={t(msg`删除`)}
          pending={deletePending}
          onCancel={() => setDangerConfirm(null)}
          onConfirm={() => {
            setDangerConfirm(null);
            onDeleteFriend();
          }}
        />
      ) : null}
    </DesktopContactProfileShell>
  );
}

function DangerConfirmDialog({
  title,
  description,
  confirmLabel,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useRuntimeTranslator();
  // Esc 关弹层：DesktopContactTextEditDialog 已经加过同款；这里漏了，用户在「加入
  // 黑名单 / 删除联系人」二次确认对话框前误点出来 Esc 关不掉，得鼠标去找最右下角
  // 「取消」或背景点白 backdrop，不符合标准 modal 交互。stopPropagation 防止 Esc
  // 一路冒泡到 desktop chat workspace 把背后的侧栏也带关掉。pending 中不响应，
  // 跟 cancel 按钮的 disabled 语义对齐——避免请求飞行中按 Esc 让对话框走，但
  // mutation 仍在跑导致用户以为取消了。
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || pending) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, pending]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(17,24,39,0.32)] p-6 backdrop-blur-[3px]">
      <button
        type="button"
        aria-label={t(msg`关闭`)}
        onClick={onCancel}
        className="absolute inset-0"
      />
      <div className="relative w-full max-w-[380px] overflow-hidden rounded-[16px] bg-white shadow-[var(--shadow-overlay)]">
        <div className="px-5 py-5 text-center">
          <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
            {title}
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[color:var(--text-muted)]">
            {description}
          </p>
        </div>
        <div className="grid grid-cols-2 border-t border-[color:var(--border-faint)]">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 text-[14px] text-[color:var(--text-secondary)]"
          >
            {t(msg`取消`)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="h-11 border-l border-[color:var(--border-faint)] text-[14px] font-medium text-[#d74b45] disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
