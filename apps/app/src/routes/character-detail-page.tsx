import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronRight,
  MessageCircleMore,
  Phone,
  Star,
  Video,
} from "lucide-react";
import {
  blockCharacter,
  deleteFriend,
  getBlockedCharacters,
  getCharacter,
  getFriendRequests,
  getFriends,
  getOrCreateConversation,
  sendFriendRequest,
  setFriendStarred,
  unblockCharacter,
  updateFriendProfile,
  type UpdateFriendProfileRequest,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { EmptyState } from "../components/empty-state";
import { ChatCallFallbackNotice } from "../features/chat/chat-call-fallback-notice";
import { buildChatCallFallbackShortcutSearch } from "../features/chat/chat-compose-shortcut-route";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { formatTimestamp } from "../lib/format";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type FriendProfileFormState = {
  remarkName: string;
  region: string;
  source: string;
  tags: string;
};

export function CharacterDetailPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const isDesktopLayout = useDesktopLayout();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const ownerName = useWorldOwnerStore((state) => state.username) ?? "我";
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingCallFallback, setPendingCallFallback] = useState<
    "voice" | "video" | null
  >(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<FriendProfileFormState>({
    remarkName: "",
    region: "",
    source: "",
    tags: "",
  });

  const characterQuery = useQuery({
    queryKey: ["app-character", baseUrl, characterId],
    queryFn: () => getCharacter(characterId, baseUrl),
  });
  const friendsQuery = useQuery({
    queryKey: ["app-friends", baseUrl],
    queryFn: () => getFriends(baseUrl),
  });
  const friendRequestsQuery = useQuery({
    queryKey: ["app-friend-requests", baseUrl],
    queryFn: () => getFriendRequests(baseUrl),
  });
  const blockedQuery = useQuery({
    queryKey: ["app-chat-details-blocked", baseUrl],
    queryFn: () => getBlockedCharacters(baseUrl),
  });

  const character = characterQuery.data;
  const friendship = useMemo(
    () =>
      (friendsQuery.data ?? []).find(
        (item) => item.character.id === characterId,
      )?.friendship ?? null,
    [characterId, friendsQuery.data],
  );
  const isFriend = Boolean(friendship);
  const isBlocked = (blockedQuery.data ?? []).some(
    (item) => item.characterId === characterId,
  );
  const hasPendingFriendRequest = (friendRequestsQuery.data ?? []).some(
    (item) => item.characterId === characterId && item.status === "pending",
  );
  const remarkName = friendship?.remarkName?.trim() ?? "";
  const displayName = remarkName || character?.name || "详细资料";
  const signature =
    character?.currentStatus?.trim() ||
    character?.bio?.trim() ||
    (isFriend ? "这个朋友还没有个性签名。" : "这个角色还没有个性签名。");
  const expertiseSummary = character?.expertDomains?.length
    ? character.expertDomains.join("、")
    : "未设置";
  const activitySummary =
    character?.currentActivity?.trim() ||
    character?.relationship?.trim() ||
    "暂无状态";
  const toneSummary =
    character?.profile?.traits?.emotionalTone?.trim() || "未设置";
  const tagSummary = friendship?.tags?.length
    ? friendship.tags.join("、")
    : "未设置";

  useEffect(() => {
    setNotice(null);
    setPendingCallFallback(null);
    setIsEditingProfile(false);
    setProfileForm({
      remarkName: friendship?.remarkName ?? "",
      region: friendship?.region ?? "",
      source: friendship?.source ?? "",
      tags: friendship?.tags?.join("，") ?? "",
    });
  }, [
    characterId,
    friendship?.remarkName,
    friendship?.region,
    friendship?.source,
    friendship?.tags,
  ]);

  const startChatMutation = useMutation({
    mutationFn: async () => {
      if (!character) {
        return null;
      }

      return getOrCreateConversation({ characterId: character.id }, baseUrl);
    },
    onSuccess: (conversation) => {
      if (!conversation) {
        return;
      }

      const nextSearch = pendingCallFallback
        ? buildChatCallFallbackShortcutSearch({
            kind: pendingCallFallback,
          })
        : undefined;

      setPendingCallFallback(null);
      void navigate({
        to: "/chat/$conversationId",
        params: { conversationId: conversation.id },
        search: nextSearch,
      });
    },
  });
  const sendFriendRequestMutation = useMutation({
    mutationFn: () =>
      sendFriendRequest(
        {
          characterId,
          greeting: `${ownerName} 想把你加到通讯录里。`,
        },
        baseUrl,
      ),
    onSuccess: async () => {
      setNotice("已发送好友申请。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
  });
  const setStarredMutation = useMutation({
    mutationFn: (starred: boolean) =>
      setFriendStarred(characterId, { starred }, baseUrl),
    onSuccess: async (_, starred) => {
      setNotice(starred ? "已设为星标朋友。" : "已取消星标朋友。");
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const updateProfileMutation = useMutation({
    mutationFn: (payload: UpdateFriendProfileRequest) =>
      updateFriendProfile(characterId, payload, baseUrl),
    onSuccess: async () => {
      setNotice("朋友资料已更新。");
      setIsEditingProfile(false);
      await queryClient.invalidateQueries({
        queryKey: ["app-friends", baseUrl],
      });
    },
  });
  const blockMutation = useMutation({
    mutationFn: async (blocked: boolean) => {
      if (blocked) {
        await unblockCharacter({ characterId }, baseUrl);
        return;
      }

      await blockCharacter(
        {
          characterId,
          reason: "来自好友资料页加入黑名单",
        },
        baseUrl,
      );
    },
    onSuccess: async (_, blocked) => {
      setNotice(blocked ? "已移出黑名单。" : "已加入黑名单。");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-chat-details-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-contacts-blocked", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-chat-blocked-characters", baseUrl],
        }),
      ]);
    },
  });
  const deleteFriendMutation = useMutation({
    mutationFn: () => deleteFriend(characterId, baseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({ to: "/tabs/contacts" });
    },
  });

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({ to: "/tabs/contacts" });
  };

  const handleSaveProfile = async () => {
    await updateProfileMutation.mutateAsync({
      remarkName: profileForm.remarkName.trim() || null,
      region: profileForm.region.trim() || null,
      source: profileForm.source.trim() || null,
      tags: profileForm.tags
        .split(/[，,]/)
        .map((item) => item.trim())
        .filter(Boolean),
    });
  };

  const handleVoiceCall = () => {
    setNotice(null);
    setPendingCallFallback("voice");
  };

  const handleVideoCall = () => {
    setNotice(null);
    setPendingCallFallback("video");
  };

  return (
    <AppPage className="min-h-full space-y-0 bg-[#ededed] px-0 py-0 text-[#111827]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[rgba(247,247,247,0.95)] px-2 py-2.5 backdrop-blur-xl">
        <div className="relative flex min-h-11 items-center gap-1.5">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#111827] transition active:bg-black/5"
            aria-label="返回"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="pointer-events-none absolute inset-x-12 text-center">
            <div className="truncate text-[17px] font-medium text-[#111827]">
              {isFriend ? "朋友信息" : "详细资料"}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[#8c8c8c]">
              {character?.relationship || "查看角色资料"}
            </div>
          </div>
          <div className="ml-auto h-10 w-10 shrink-0" aria-hidden="true" />
        </div>
      </header>

      {characterQuery.isLoading ? (
        <div className="px-3 py-4">
          <LoadingBlock label="正在读取朋友资料..." />
        </div>
      ) : null}

      {characterQuery.isError && characterQuery.error instanceof Error ? (
        <div className="px-3 py-4">
          <ErrorBlock message={characterQuery.error.message} />
        </div>
      ) : null}

      {!characterQuery.isLoading && !character ? (
        <div className="px-3 py-4">
          <EmptyState
            title="角色不存在"
            description="这个资料暂时不可用，返回通讯录再试一次。"
          />
        </div>
      ) : null}

      {character ? (
        <div
          className={cn(
            "space-y-3 px-3 pb-6 pt-3",
            isDesktopLayout ? "mx-auto w-full max-w-[720px]" : undefined,
          )}
        >
          {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
          {friendsQuery.isError && friendsQuery.error instanceof Error ? (
            <ErrorBlock message={friendsQuery.error.message} />
          ) : null}
          {friendRequestsQuery.isError &&
          friendRequestsQuery.error instanceof Error ? (
            <ErrorBlock message={friendRequestsQuery.error.message} />
          ) : null}
          {blockedQuery.isError && blockedQuery.error instanceof Error ? (
            <ErrorBlock message={blockedQuery.error.message} />
          ) : null}
          {startChatMutation.isError &&
          startChatMutation.error instanceof Error ? (
            <ErrorBlock message={startChatMutation.error.message} />
          ) : null}
          {sendFriendRequestMutation.isError &&
          sendFriendRequestMutation.error instanceof Error ? (
            <ErrorBlock message={sendFriendRequestMutation.error.message} />
          ) : null}
          {setStarredMutation.isError &&
          setStarredMutation.error instanceof Error ? (
            <ErrorBlock message={setStarredMutation.error.message} />
          ) : null}
          {updateProfileMutation.isError &&
          updateProfileMutation.error instanceof Error ? (
            <ErrorBlock message={updateProfileMutation.error.message} />
          ) : null}
          {blockMutation.isError && blockMutation.error instanceof Error ? (
            <ErrorBlock message={blockMutation.error.message} />
          ) : null}
          {deleteFriendMutation.isError &&
          deleteFriendMutation.error instanceof Error ? (
            <ErrorBlock message={deleteFriendMutation.error.message} />
          ) : null}

          <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white">
            <div className="flex items-start gap-4 px-4 py-4">
              <AvatarChip
                name={character.name}
                src={character.avatar}
                size={isDesktopLayout ? "xl" : "lg"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-[24px] font-medium text-[#111827]">
                    {displayName}
                  </div>
                  {friendship?.isStarred ? (
                    <Star
                      size={16}
                      className="shrink-0 text-[#f59e0b]"
                      fill="currentColor"
                    />
                  ) : null}
                </div>
                <div className="mt-1 text-sm text-[#6b7280]">
                  {remarkName
                    ? `昵称：${character.name}`
                    : character.relationship}
                </div>
                <div className="mt-1 text-sm text-[#8c8c8c]">
                  隐界号：yinjie_{character.id.slice(0, 8)}
                </div>
                <div className="mt-3 text-sm leading-6 text-[#4b5563]">
                  {signature}
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[18px] border border-black/5 bg-black/5">
            <div
              className={cn(
                "grid gap-px",
                isFriend ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              <ActionPanelButton
                icon={<MessageCircleMore size={18} />}
                label={startChatMutation.isPending ? "正在打开..." : "发消息"}
                onClick={() => startChatMutation.mutate()}
                disabled={startChatMutation.isPending}
              />
              {isFriend ? (
                <>
                  <ActionPanelButton
                    icon={<Phone size={18} />}
                    label="语音通话"
                    onClick={handleVoiceCall}
                  />
                  <ActionPanelButton
                    icon={<Video size={18} />}
                    label="视频通话"
                    onClick={handleVideoCall}
                  />
                </>
              ) : (
                <ActionPanelButton
                  icon={<ChevronRight size={18} />}
                  label={
                    hasPendingFriendRequest
                      ? "已发送申请"
                      : sendFriendRequestMutation.isPending
                        ? "发送中..."
                        : "添加到通讯录"
                  }
                  onClick={() => sendFriendRequestMutation.mutate()}
                  disabled={
                    hasPendingFriendRequest ||
                    sendFriendRequestMutation.isPending
                  }
                />
              )}
            </div>
          </section>

          {pendingCallFallback ? (
            <ChatCallFallbackNotice
              variant="card"
              kind={pendingCallFallback}
              description={
                pendingCallFallback === "voice"
                  ? "先进入聊天页继续，用按住说话发送语音消息会更接近现在可用的体验。"
                  : "先进入聊天页继续，先拍一张图或发送图片消息，会更接近当前能替代视频通话的体验。"
              }
              primaryLabel={
                startChatMutation.isPending
                  ? "正在打开..."
                  : pendingCallFallback === "voice"
                    ? "去聊天发语音"
                    : "去聊天拍摄"
              }
              secondaryLabel="知道了"
              onPrimaryAction={() => startChatMutation.mutate()}
              onSecondaryAction={() => setPendingCallFallback(null)}
              primaryDisabled={startChatMutation.isPending}
              secondaryDisabled={startChatMutation.isPending}
            />
          ) : null}

          <ProfileSection title={isFriend ? "资料设置" : "基本资料"}>
            {isFriend ? (
              <ProfileRow
                label="设置备注和标签"
                value={buildRemarkSummary(
                  friendship?.remarkName,
                  friendship?.tags,
                )}
                onClick={() => setIsEditingProfile((current) => !current)}
              />
            ) : null}
            {isFriend && isEditingProfile ? (
              <div className="border-t border-black/5 bg-[#fafafa] px-4 py-4">
                <div className="space-y-3">
                  <DetailInputField
                    label="备注"
                    value={profileForm.remarkName}
                    placeholder="给朋友设置备注名"
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        remarkName: value,
                      }))
                    }
                  />
                  <DetailInputField
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
                  <DetailInputField
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
                  <DetailInputField
                    label="标签"
                    value={profileForm.tags}
                    placeholder="用逗号分隔，例如：同事，策展"
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        tags: value,
                      }))
                    }
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsEditingProfile(false);
                      setProfileForm({
                        remarkName: friendship?.remarkName ?? "",
                        region: friendship?.region ?? "",
                        source: friendship?.source ?? "",
                        tags: friendship?.tags?.join("，") ?? "",
                      });
                    }}
                    className="flex-1 rounded-full"
                    disabled={updateProfileMutation.isPending}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void handleSaveProfile()}
                    className="flex-1 rounded-full"
                    disabled={updateProfileMutation.isPending}
                  >
                    {updateProfileMutation.isPending ? "保存中..." : "保存"}
                  </Button>
                </div>
              </div>
            ) : null}
            <ProfileRow
              label="地区"
              value={
                isFriend
                  ? friendship?.region?.trim() || "未设置"
                  : character.relationship || "世界角色"
              }
            />
            <ProfileRow
              label="来源"
              value={
                isFriend
                  ? friendship?.source?.trim() || "未设置"
                  : "世界内自然认识"
              }
            />
            <ProfileRow label="标签" value={isFriend ? tagSummary : "未设置"} />
            <ProfileRow label="个性签名" value={signature} multiline />
            <ProfileRow
              label="最近互动"
              value={
                isFriend
                  ? formatTimestamp(
                      friendship?.lastInteractedAt ?? character.lastActiveAt,
                    )
                  : formatTimestamp(character.lastActiveAt)
              }
            />
            <ProfileRow label="朋友圈" value="后续接入" />
          </ProfileSection>

          <ProfileSection title="更多信息">
            <ProfileRow label="当前状态" value={activitySummary} />
            <ProfileRow label="擅长领域" value={expertiseSummary} multiline />
            <ProfileRow label="语气风格" value={toneSummary} />
            <div className="border-t border-black/5 px-4 py-4">
              <div className="text-xs uppercase tracking-[0.16em] text-[#8c8c8c]">
                角色简介
              </div>
              <div className="mt-2 text-sm leading-7 text-[#4b5563]">
                {character.bio?.trim() || "暂时没有更多介绍。"}
              </div>
            </div>
          </ProfileSection>

          <ProfileSection title="关系管理">
            {isFriend ? (
              <ProfileSwitchRow
                label="设为星标朋友"
                checked={friendship?.isStarred ?? false}
                onToggle={() =>
                  setStarredMutation.mutate(!(friendship?.isStarred ?? false))
                }
                disabled={setStarredMutation.isPending}
              />
            ) : null}
            <ProfileRow
              label={isBlocked ? "移出黑名单" : "加入黑名单"}
              value={
                blockMutation.isPending
                  ? "正在更新..."
                  : isBlocked
                    ? "恢复正常联系"
                    : "不再接收对方互动"
              }
              danger
              onClick={() => {
                const confirmed = window.confirm(
                  isBlocked
                    ? "确认把这个角色移出黑名单吗？"
                    : "加入黑名单后，将不再接收这个角色的互动。确认继续吗？",
                );
                if (!confirmed) {
                  return;
                }

                blockMutation.mutate(isBlocked);
              }}
              disabled={blockMutation.isPending}
            />
            {isFriend ? (
              <ProfileRow
                label="删除联系人"
                value={
                  deleteFriendMutation.isPending
                    ? "正在删除..."
                    : "从通讯录移除"
                }
                danger
                onClick={() => {
                  if (!window.confirm("确认删除这个联系人吗？")) {
                    return;
                  }

                  deleteFriendMutation.mutate();
                }}
                disabled={deleteFriendMutation.isPending}
              />
            ) : null}
          </ProfileSection>
        </div>
      ) : null}
    </AppPage>
  );
}

function ActionPanelButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[78px] flex-col items-center justify-center gap-2 bg-white text-[#111827] transition active:bg-[#f5f5f5] disabled:opacity-45"
    >
      <span className="text-[#606266]">{icon}</span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

function ProfileSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-black/5 bg-white">
      <div className="px-4 py-3 text-xs uppercase tracking-[0.16em] text-[#8c8c8c]">
        {title}
      </div>
      <div className="border-t border-black/5">{children}</div>
    </section>
  );
}

function ProfileRow({
  label,
  value,
  onClick,
  danger = false,
  disabled = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  multiline?: boolean;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center gap-4 px-4 py-4 text-left text-sm transition active:bg-[#f5f5f5] disabled:opacity-60"
      >
        <div
          className={cn(
            "w-24 shrink-0",
            danger ? "text-[#d74b45]" : "text-[#111827]",
          )}
        >
          {label}
        </div>
        <div
          className={cn(
            "min-w-0 flex-1 text-right",
            multiline
              ? "whitespace-pre-wrap break-words text-[#8c8c8c]"
              : "truncate text-[#8c8c8c]",
            danger ? "text-[#d74b45]" : undefined,
          )}
        >
          {value}
        </div>
        <ChevronRight size={18} className="shrink-0 text-[#c7c7cc]" />
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-4 px-4 py-4 text-left text-sm">
      <div
        className={cn(
          "w-24 shrink-0",
          danger ? "text-[#d74b45]" : "text-[#111827]",
        )}
      >
        {label}
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 text-right text-[#8c8c8c]",
          multiline ? "whitespace-pre-wrap break-words" : "truncate",
          danger ? "text-[#d74b45]" : undefined,
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ProfileSwitchRow({
  label,
  checked,
  onToggle,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left disabled:opacity-60"
      role="switch"
      aria-checked={checked}
    >
      <span className="text-[16px] text-[#111827]">{label}</span>
      <span
        className={cn(
          "relative h-8 w-13 rounded-full transition-colors",
          checked ? "bg-[#07c160]" : "bg-[#d5d5d5]",
        )}
      >
        <span
          className={cn(
            "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-6" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function DetailInputField({
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
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.12em] text-[#8c8c8c]">
        {label}
      </div>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[12px] border border-black/6 bg-white px-3 py-3 text-sm text-[#111827] outline-none placeholder:text-[#a3a3a3]"
      />
    </label>
  );
}

function buildRemarkSummary(
  remarkName?: string | null,
  tags?: string[] | null,
) {
  const segments = [
    remarkName?.trim(),
    tags?.filter(Boolean).join("、"),
  ].filter(Boolean);

  return segments.length ? segments.join(" · ") : "未设置";
}
