import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  clearConversationBackground,
  clearWorldOwnerChatBackground,
  getConversations,
  setConversationBackground,
  setWorldOwnerChatBackground,
  uploadChatBackground,
  type ChatBackgroundAsset,
  type ConversationBackgroundMode,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
} from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatBackgroundPreview } from "../features/chat/backgrounds/chat-background-preview";
import { CHAT_BACKGROUND_PRESETS } from "../features/chat/backgrounds/background-catalog";
import { compressChatBackgroundImage } from "../features/chat/backgrounds/compress-chat-background-image";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useConversationBackground } from "../features/chat/backgrounds/use-conversation-background";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type UploadTarget = "default" | "conversation";

export function ChatBackgroundPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/background",
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isDesktopLayout = useDesktopLayout();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>("default");
  const [defaultDraft, setDefaultDraft] = useState<ChatBackgroundAsset | null>(
    null,
  );
  const [conversationMode, setConversationMode] =
    useState<ConversationBackgroundMode>("inherit");
  const [conversationDraft, setConversationDraft] =
    useState<ChatBackgroundAsset | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["app-conversations", baseUrl],
    queryFn: () => getConversations(baseUrl),
  });

  const backgroundQuery = useConversationBackground(conversationId);
  const conversation = useMemo(
    () =>
      (conversationsQuery.data ?? []).find(
        (item) => item.id === conversationId,
      ) ?? null,
    [conversationId, conversationsQuery.data],
  );
  const supportsConversationOverride = conversation?.type !== "group";

  useEffect(() => {
    if (!backgroundQuery.data) {
      return;
    }

    setDefaultDraft(backgroundQuery.data.defaultBackground ?? null);
    setConversationMode(backgroundQuery.data.mode);
    setConversationDraft(backgroundQuery.data.conversationBackground ?? null);
  }, [backgroundQuery.data]);

  useEffect(() => {
    setNotice(null);
  }, [conversationId]);

  useEffect(() => {
    if (conversationsQuery.isLoading || conversationsQuery.isError || conversation) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
  ]);

  const uploadMutation = useMutation({
    mutationFn: async ({ file }: { file: File }) => {
      const compressed = await compressChatBackgroundImage(file);
      const payload = new FormData();
      payload.set("file", compressed.file);
      payload.set("width", String(compressed.width));
      payload.set("height", String(compressed.height));
      return uploadChatBackground(payload, baseUrl);
    },
    onSuccess: (result) => {
      if (uploadTarget === "default") {
        setDefaultDraft(result.background);
      } else {
        setConversationMode("custom");
        setConversationDraft(result.background);
      }
      setNotice("背景图已上传，记得保存当前设置。");
    },
  });

  const saveDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!defaultDraft) {
        throw new Error("请先选择默认背景图。");
      }

      return setWorldOwnerChatBackground({ background: defaultDraft }, baseUrl);
    },
    onSuccess: async (owner) => {
      setDefaultDraft(owner.defaultChatBackground ?? null);
      setNotice("默认背景图已保存。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-owner", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-background", baseUrl, conversationId],
        }),
      ]);
    },
  });

  const clearDefaultMutation = useMutation({
    mutationFn: () => clearWorldOwnerChatBackground(baseUrl),
    onSuccess: async () => {
      setDefaultDraft(null);
      setNotice("默认背景图已恢复系统背景。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["world-owner", baseUrl] }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversation-background", baseUrl, conversationId],
        }),
      ]);
    },
  });

  const saveConversationMutation = useMutation({
    mutationFn: async () => {
      if (conversationMode === "inherit") {
        return setConversationBackground(
          conversationId,
          { mode: "inherit", background: null },
          baseUrl,
        );
      }

      if (!conversationDraft) {
        throw new Error("请先为当前聊天选择背景图。");
      }

      return setConversationBackground(
        conversationId,
        { mode: "custom", background: conversationDraft },
        baseUrl,
      );
    },
    onSuccess: async (settings) => {
      setConversationMode(settings.mode);
      setConversationDraft(settings.conversationBackground ?? null);
      setNotice(
        settings.mode === "custom"
          ? "当前聊天背景已保存。"
          : "当前聊天已恢复跟随默认背景。",
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-conversation-background", baseUrl, conversationId],
      });
    },
  });

  const clearConversationMutation = useMutation({
    mutationFn: () => clearConversationBackground(conversationId, baseUrl),
    onSuccess: async () => {
      setConversationMode("inherit");
      setConversationDraft(null);
      setNotice("当前聊天已恢复跟随默认背景。");
      await queryClient.invalidateQueries({
        queryKey: ["app-conversation-background", baseUrl, conversationId],
      });
    },
  });

  const effectivePreviewBackground =
    conversationMode === "custom" && supportsConversationOverride
      ? conversationDraft
      : defaultDraft;
  const busy =
    uploadMutation.isPending ||
    saveDefaultMutation.isPending ||
    clearDefaultMutation.isPending ||
    saveConversationMutation.isPending ||
    clearConversationMutation.isPending;
  const pageError =
    (uploadMutation.error instanceof Error && uploadMutation.error.message) ||
    (saveDefaultMutation.error instanceof Error &&
      saveDefaultMutation.error.message) ||
    (clearDefaultMutation.error instanceof Error &&
      clearDefaultMutation.error.message) ||
    (saveConversationMutation.error instanceof Error &&
      saveConversationMutation.error.message) ||
    (clearConversationMutation.error instanceof Error &&
      clearConversationMutation.error.message) ||
    null;

  const openPicker = (target: UploadTarget) => {
    setUploadTarget(target);
    fileInputRef.current?.click();
  };

  const handlePresetSelect = (
    target: UploadTarget,
    background: ChatBackgroundAsset,
  ) => {
    if (target === "default") {
      setDefaultDraft(background);
      setNotice("默认背景图已切到新预览，保存后生效。");
      return;
    }

    setConversationMode("custom");
    setConversationDraft(background);
    setNotice("当前聊天背景已切到新预览，保存后生效。");
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    await uploadMutation.mutateAsync({ file });
  };

  const content = (
    <>
      {conversationsQuery.isLoading || backgroundQuery.isLoading ? (
        <LoadingBlock label="正在读取聊天背景..." />
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        <ErrorBlock message={conversationsQuery.error.message} />
      ) : null}
      {backgroundQuery.isError && backgroundQuery.error instanceof Error ? (
        <ErrorBlock message={backgroundQuery.error.message} />
      ) : null}
      {pageError ? <ErrorBlock message={pageError} /> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      {!conversationsQuery.isLoading && !conversation ? (
        <EmptyPanel
          title="会话不存在"
          description="这段聊天暂时不可用，返回聊天页后再试一次。"
        />
      ) : null}

      {conversation ? (
        <>
          {!isDesktopLayout ? (
            <ChatBackgroundPreview
              background={effectivePreviewBackground}
              title={conversation.title}
              subtitle={
                conversationMode === "custom" && supportsConversationOverride
                  ? "当前聊天正在预览专属背景"
                  : "当前聊天正在预览默认背景"
              }
            />
          ) : null}

          <SectionCard
            title="默认背景图"
            description="应用到所有未单独设置专属背景的聊天。"
            status={getChatBackgroundLabel(defaultDraft)}
          >
            <PresetGrid
              selectedAssetId={defaultDraft?.assetId}
              onSelect={(preset) => handlePresetSelect("default", preset)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => openPicker("default")}
              >
                上传图片
              </Button>
              <Button
                variant="primary"
                disabled={busy || !defaultDraft}
                onClick={() => saveDefaultMutation.mutate()}
              >
                保存默认背景
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => clearDefaultMutation.mutate()}
              >
                恢复系统背景
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            title="当前聊天背景"
            description={
              supportsConversationOverride
                ? "单聊可设置专属背景，优先级高于默认背景图。"
                : "当前是群聊会话，暂不支持专属背景，默认跟随全局背景。"
            }
            status={
              conversationMode === "custom" && supportsConversationOverride
                ? getChatBackgroundLabel(conversationDraft)
                : "跟随默认背景"
            }
          >
            <div className="flex flex-wrap gap-2">
              <ModeChip
                active={
                  conversationMode === "inherit" ||
                  !supportsConversationOverride
                }
                disabled={!supportsConversationOverride || busy}
                label="跟随默认"
                onClick={() => setConversationMode("inherit")}
              />
              <ModeChip
                active={
                  conversationMode === "custom" && supportsConversationOverride
                }
                disabled={!supportsConversationOverride || busy}
                label="单独设置"
                onClick={() => setConversationMode("custom")}
              />
            </div>

            {supportsConversationOverride && conversationMode === "custom" ? (
              <>
                <PresetGrid
                  selectedAssetId={conversationDraft?.assetId}
                  onSelect={(preset) =>
                    handlePresetSelect("conversation", preset)
                  }
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => openPicker("conversation")}
                  >
                    上传图片
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !conversationDraft}
                    onClick={() => saveConversationMutation.mutate()}
                  >
                    保存当前聊天背景
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => clearConversationMutation.mutate()}
                  >
                    跟随默认背景
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.62)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                {supportsConversationOverride
                  ? "当前聊天会直接沿用默认背景图。切换到“单独设置”后，可以挑选好友专属背景。"
                  : "群聊当前只会使用默认背景图或系统背景。"}
              </div>
            )}

            {supportsConversationOverride ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => saveConversationMutation.mutate()}
                >
                  保存当前聊天设置
                </Button>
              </div>
            ) : null}
          </SectionCard>
        </>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />
    </>
  );

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[#f3f3f3] px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex items-center justify-between rounded-[14px] border border-black/6 bg-[#f7f7f7] px-5 py-4">
            <div>
              <div className="text-xs tracking-[0.12em] text-[color:var(--text-dim)]">
                聊天背景
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                {conversation?.title ?? "聊天背景"}
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate({
                  to: "/chat/$conversationId",
                  params: { conversationId },
                });
              }}
              className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
            >
              返回聊天
            </Button>
          </div>
          <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
            <div className="xl:sticky xl:top-5 xl:self-start">
              {conversation ? (
                <ChatBackgroundPreview
                  background={effectivePreviewBackground}
                  title={conversation.title}
                  subtitle="桌面端预览会同步展示在聊天工作区"
                />
              ) : null}
            </div>
            <div className="space-y-5">{content}</div>
          </div>
        </div>
      </AppPage>
    );
  }

  return (
    <ChatDetailsShell
      title={conversation?.title ?? "聊天背景"}
      subtitle="默认背景和好友专属背景"
      onBack={() => {
        void navigate({
          to: "/chat/$conversationId/details",
          params: { conversationId },
        });
      }}
    >
      <div className="space-y-3 px-3">{content}</div>
    </ChatDetailsShell>
  );
}

function SectionCard({
  title,
  description,
  status,
  children,
}: {
  title: string;
  description: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[12px] border border-black/6 bg-white p-5">
      <div>
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
          {description}
        </div>
        <div className="mt-3 inline-flex rounded-[8px] bg-[#f3f3f3] px-3 py-1 text-xs text-[color:var(--text-muted)]">
          当前：{status}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PresetGrid({
  selectedAssetId,
  onSelect,
}: {
  selectedAssetId?: string;
  onSelect: (background: ChatBackgroundAsset) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {CHAT_BACKGROUND_PRESETS.map((preset) => (
        <button
          key={preset.assetId}
          type="button"
          onClick={() => onSelect(preset)}
          className={`overflow-hidden rounded-[12px] border text-left transition ${
            preset.assetId === selectedAssetId
              ? "border-[#07c160] bg-white"
              : "border-black/6 bg-white hover:bg-[#fafafa]"
          }`}
        >
          <div
            className="h-28 bg-[#f3f3f3]"
            style={{
              backgroundImage: `url("${preset.thumbnailUrl ?? preset.url}")`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div className="bg-white px-3 py-3 text-sm text-[color:var(--text-primary)]">
            {preset.label}
          </div>
        </button>
      ))}
    </div>
  );
}

function ModeChip({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-[8px] border px-4 py-2 text-sm transition ${
        active
          ? "border-[#d6d6d6] bg-white text-[color:var(--text-primary)]"
          : "border-transparent bg-[#ececec] text-[color:var(--text-secondary)]"
      } disabled:cursor-not-allowed disabled:opacity-45`}
    >
      {label}
    </button>
  );
}

function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-black/8 bg-white px-5 py-8 text-center">
      <div className="text-lg font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </div>
  );
}
