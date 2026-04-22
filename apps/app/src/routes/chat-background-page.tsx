import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
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
  cn,
} from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatBackgroundPreview } from "../features/chat/backgrounds/chat-background-preview";
import { CHAT_BACKGROUND_PRESETS } from "../features/chat/backgrounds/background-catalog";
import { compressChatBackgroundImage } from "../features/chat/backgrounds/compress-chat-background-image";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useConversationBackground } from "../features/chat/backgrounds/use-conversation-background";
import {
  buildMobileChatRouteHash,
  parseMobileChatRouteState,
} from "../features/chat/mobile-chat-route-state";
import { buildDesktopChatRouteHash } from "../features/desktop/chat/desktop-chat-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type UploadTarget = "default" | "conversation";

export function ChatBackgroundPage() {
  const { conversationId } = useParams({
    from: "/chat/$conversationId/background",
  });
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
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
  const routeState = parseMobileChatRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileChatRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );
  const desktopDetailsFallbackHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId,
        panel: "details",
      }),
    [conversationId],
  );

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

    if (safeReturnPath) {
      void navigate({
        to: safeReturnPath,
        ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        replace: true,
      });
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [
    conversation,
    conversationsQuery.isError,
    conversationsQuery.isLoading,
    navigate,
    safeReturnHash,
    safeReturnPath,
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

  const navigateToRouteStateReturn = () => {
    if (!safeReturnPath) {
      return false;
    }

    void navigate({
      to: safeReturnPath,
      ...(safeReturnHash ? { hash: safeReturnHash } : {}),
    });
    return true;
  };

  const handleErrorStateAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({
      to: "/chat/$conversationId/details",
      params: { conversationId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  };

  const handleRetryLoad = () => {
    void Promise.all([conversationsQuery.refetch(), backgroundQuery.refetch()]);
  };

  const handleMissingConversationAction = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: "/tabs/chat" });
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
        isDesktopLayout ? (
          <LoadingBlock label="正在读取聊天背景..." />
        ) : (
          <MobileBackgroundStatusCard
            badge="读取中"
            title="正在读取聊天背景"
            description="稍等一下，正在同步默认背景和当前聊天设置。"
            tone="loading"
          />
        )
      ) : null}
      {conversationsQuery.isError &&
      conversationsQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={conversationsQuery.error.message} />
        ) : (
          <MobileBackgroundStatusCard
            badge="读取失败"
            title="聊天背景暂时不可用"
            description={conversationsQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  重试读取
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleErrorStateAction}
                >
                  {safeReturnPath ? "返回上一页" : "返回聊天信息"}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {backgroundQuery.isError && backgroundQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={backgroundQuery.error.message} />
        ) : (
          <MobileBackgroundStatusCard
            badge="读取失败"
            title="聊天背景暂时不可用"
            description={backgroundQuery.error.message}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  重试读取
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleErrorStateAction}
                >
                  {safeReturnPath ? "返回上一页" : "返回聊天信息"}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {pageError ? (
        isDesktopLayout ? (
          <ErrorBlock message={pageError} />
        ) : (
          <InlineNotice
            tone="danger"
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{pageError}</span>
              <button
                type="button"
                onClick={handleErrorStateAction}
                className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {safeReturnPath ? "返回上一页" : "返回聊天信息"}
              </button>
            </div>
          </InlineNotice>
        )
      ) : null}
      {notice ? (
        <InlineNotice
          tone="success"
          className={
            isDesktopLayout
              ? undefined
              : "rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          }
        >
          {notice}
        </InlineNotice>
      ) : null}

      {!conversationsQuery.isLoading && !conversation ? (
        isDesktopLayout ? (
          <EmptyPanel
            title="会话不存在"
            description="这段聊天暂时不可用，返回聊天页后再试一次。"
          />
        ) : (
          <MobileBackgroundStatusCard
            badge="会话"
            title="会话不存在"
            description="这段聊天暂时不可用，可以先重试读取，或返回聊天页后再试。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  重试读取
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-white px-3 text-[10px]"
                  onClick={handleMissingConversationAction}
                >
                  {safeReturnPath ? "返回上一页" : "返回消息列表"}
                </Button>
              </div>
            }
          />
        )
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
      <AppPage className="min-h-full bg-[color:var(--bg-app)] px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex items-center justify-between rounded-[16px] border border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
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
                  to: safeReturnPath ?? "/tabs/chat",
                  ...((safeReturnPath ? safeReturnHash : desktopDetailsFallbackHash)
                    ? {
                        hash:
                          (safeReturnPath
                            ? safeReturnHash
                            : desktopDetailsFallbackHash) || undefined,
                      }
                    : {}),
                });
              }}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              返回聊天信息
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
        navigateBackOrFallback(() => {
          void navigate({
            to: "/chat/$conversationId/details",
            params: { conversationId },
            ...(currentRouteHash ? { hash: currentRouteHash } : {}),
          });
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
    <section className="space-y-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]">
      <div>
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
          {description}
        </div>
        <div className="mt-3 inline-flex rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
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
              ? "border-[rgba(7,193,96,0.22)] bg-white shadow-[inset_0_0_0_1px_rgba(7,193,96,0.06)]"
              : "border-[color:var(--border-faint)] bg-white hover:bg-[color:var(--surface-console)]"
          }`}
        >
          <div
            className="h-28 bg-[color:var(--surface-console)]"
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
          ? "border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)]"
          : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] hover:bg-white"
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
    <div className="rounded-[14px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-5 py-8 text-center">
      <div className="text-lg font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </div>
  );
}

function MobileBackgroundStatusCard({
  badge,
  title,
  description,
  tone = "default",
  action,
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
  action?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[16px] border px-3.5 py-4 text-center shadow-none",
        tone === "danger"
          ? "border-[color:var(--border-danger)] bg-[linear-gradient(180deg,rgba(255,245,245,0.96),rgba(254,242,242,0.94))]"
          : "border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]",
      )}
    >
      <div
        className={cn(
          "mx-auto inline-flex rounded-full px-2 py-0.5 text-[8px] font-medium tracking-[0.04em]",
          tone === "danger"
            ? "bg-[rgba(220,38,38,0.08)] text-[color:var(--state-danger-text)]"
            : "bg-[rgba(7,193,96,0.1)] text-[#07c160]",
        )}
      >
        {badge}
      </div>
      {tone === "loading" ? (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/15" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-black/25 [animation-delay:120ms]" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#8ecf9d] [animation-delay:240ms]" />
        </div>
      ) : null}
      <div className="mt-2.5 text-[14px] font-medium text-[color:var(--text-primary)]">
        {title}
      </div>
      <p className="mx-auto mt-1.5 max-w-[17rem] text-[11px] leading-[1.35rem] text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </section>
  );
}
