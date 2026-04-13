import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  clearGroupBackground,
  clearWorldOwnerChatBackground,
  getGroup,
  setGroupBackground,
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
import { CHAT_BACKGROUND_PRESETS } from "../features/chat/backgrounds/background-catalog";
import { ChatBackgroundPreview } from "../features/chat/backgrounds/chat-background-preview";
import { compressChatBackgroundImage } from "../features/chat/backgrounds/compress-chat-background-image";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useGroupBackground } from "../features/chat/backgrounds/use-conversation-background";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type UploadTarget = "default" | "group";

export function GroupChatBackgroundPage() {
  const { groupId } = useParams({
    from: "/group/$groupId/background",
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
  const [groupMode, setGroupMode] =
    useState<ConversationBackgroundMode>("inherit");
  const [groupDraft, setGroupDraft] = useState<ChatBackgroundAsset | null>(
    null,
  );

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const backgroundQuery = useGroupBackground(groupId);

  useEffect(() => {
    if (!backgroundQuery.data) {
      return;
    }

    setDefaultDraft(backgroundQuery.data.defaultBackground ?? null);
    setGroupMode(backgroundQuery.data.mode);
    setGroupDraft(backgroundQuery.data.conversationBackground ?? null);
  }, [backgroundQuery.data]);

  useEffect(() => {
    setNotice(null);
  }, [groupId]);

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [groupId, groupQuery.error, groupQuery.isLoading, navigate]);

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
        setGroupMode("custom");
        setGroupDraft(result.background);
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
          queryKey: ["app-group-background", baseUrl, groupId],
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
          queryKey: ["app-group-background", baseUrl, groupId],
        }),
      ]);
    },
  });

  const saveGroupMutation = useMutation({
    mutationFn: async () => {
      if (groupMode === "inherit") {
        return setGroupBackground(
          groupId,
          { mode: "inherit", background: null },
          baseUrl,
        );
      }

      if (!groupDraft) {
        throw new Error("请先为当前群聊选择背景图。");
      }

      return setGroupBackground(
        groupId,
        { mode: "custom", background: groupDraft },
        baseUrl,
      );
    },
    onSuccess: async (settings) => {
      setGroupMode(settings.mode);
      setGroupDraft(settings.conversationBackground ?? null);
      setNotice(
        settings.mode === "custom"
          ? "当前群聊背景已保存。"
          : "当前群聊已恢复跟随默认背景。",
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-group-background", baseUrl, groupId],
      });
    },
  });

  const clearGroupMutation = useMutation({
    mutationFn: () => clearGroupBackground(groupId, baseUrl),
    onSuccess: async () => {
      setGroupMode("inherit");
      setGroupDraft(null);
      setNotice("当前群聊已恢复跟随默认背景。");
      await queryClient.invalidateQueries({
        queryKey: ["app-group-background", baseUrl, groupId],
      });
    },
  });

  const effectivePreviewBackground =
    groupMode === "custom" ? groupDraft : defaultDraft;
  const busy =
    uploadMutation.isPending ||
    saveDefaultMutation.isPending ||
    clearDefaultMutation.isPending ||
    saveGroupMutation.isPending ||
    clearGroupMutation.isPending;
  const pageError =
    (uploadMutation.error instanceof Error && uploadMutation.error.message) ||
    (saveDefaultMutation.error instanceof Error &&
      saveDefaultMutation.error.message) ||
    (clearDefaultMutation.error instanceof Error &&
      clearDefaultMutation.error.message) ||
    (saveGroupMutation.error instanceof Error &&
      saveGroupMutation.error.message) ||
    (clearGroupMutation.error instanceof Error &&
      clearGroupMutation.error.message) ||
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

    setGroupMode("custom");
    setGroupDraft(background);
    setNotice("当前群聊背景已切到新预览，保存后生效。");
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
      {groupQuery.isLoading || backgroundQuery.isLoading ? (
        isDesktopLayout ? (
          <LoadingBlock label="正在读取群聊背景..." />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge="读取中"
            title="正在读取群聊背景"
            description="稍等一下，正在同步默认背景和当前群聊设置。"
            tone="loading"
          />
        )
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={groupQuery.error.message} />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge="读取失败"
            title="群聊背景暂时不可用"
            description={groupQuery.error.message}
            tone="danger"
          />
        )
      ) : null}
      {backgroundQuery.isError && backgroundQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock message={backgroundQuery.error.message} />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge="读取失败"
            title="群聊背景暂时不可用"
            description={backgroundQuery.error.message}
            tone="danger"
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
            {pageError}
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

      {!groupQuery.isLoading && !groupQuery.data ? (
        isDesktopLayout ? (
          <EmptyPanel
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页后再试一次。"
          />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge="群聊"
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页后再试一次。"
          />
        )
      ) : null}

      {groupQuery.data ? (
        <>
          {!isDesktopLayout ? (
            <ChatBackgroundPreview
              background={effectivePreviewBackground}
              title={groupQuery.data.name}
              subtitle={
                groupMode === "custom"
                  ? "当前群聊正在预览专属背景"
                  : "当前群聊正在预览默认背景"
              }
            />
          ) : null}

          <SectionCard
            compact={!isDesktopLayout}
            title="默认背景图"
            description="应用到所有未单独设置专属背景的聊天。"
            status={getChatBackgroundLabel(defaultDraft)}
          >
            <PresetGrid
              compact={!isDesktopLayout}
              selectedAssetId={defaultDraft?.assetId}
              onSelect={(preset) => handlePresetSelect("default", preset)}
            />
            <div
              className={`flex flex-wrap gap-3 ${isDesktopLayout ? "" : "gap-2"}`}
            >
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => openPicker("default")}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                上传图片
              </Button>
              <Button
                variant="primary"
                disabled={busy || !defaultDraft}
                onClick={() => saveDefaultMutation.mutate()}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                保存默认背景
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => clearDefaultMutation.mutate()}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                恢复系统背景
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            compact={!isDesktopLayout}
            title="当前群聊背景"
            description="群聊可设置专属背景，优先级高于默认背景图。"
            status={
              groupMode === "custom"
                ? getChatBackgroundLabel(groupDraft)
                : "跟随默认背景"
            }
          >
            <div className="flex flex-wrap gap-2">
              <ModeChip
                active={groupMode === "inherit"}
                compact={!isDesktopLayout}
                disabled={busy}
                label="跟随默认"
                onClick={() => setGroupMode("inherit")}
              />
              <ModeChip
                active={groupMode === "custom"}
                compact={!isDesktopLayout}
                disabled={busy}
                label="单独设置"
                onClick={() => setGroupMode("custom")}
              />
            </div>

            {groupMode === "custom" ? (
              <>
                <PresetGrid
                  compact={!isDesktopLayout}
                  selectedAssetId={groupDraft?.assetId}
                  onSelect={(preset) => handlePresetSelect("group", preset)}
                />
                <div
                  className={`flex flex-wrap gap-3 ${isDesktopLayout ? "" : "gap-2"}`}
                >
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => openPicker("group")}
                    className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
                  >
                    上传图片
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => clearGroupMutation.mutate()}
                    className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
                  >
                    跟随默认背景
                  </Button>
                </div>
              </>
            ) : (
              <div
                className={
                  isDesktopLayout
                    ? "rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.62)] px-4 py-4 text-sm text-[color:var(--text-secondary)]"
                    : "rounded-[16px] border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] px-4 py-3 text-xs leading-6 text-[color:var(--text-secondary)]"
                }
              >
                当前群聊会直接沿用默认背景图。切换到“单独设置”后，可以挑选群聊专属背景。
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={busy || (groupMode === "custom" && !groupDraft)}
                onClick={() => saveGroupMutation.mutate()}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                {groupMode === "custom" ? "保存群聊背景" : "保存当前群聊设置"}
              </Button>
            </div>
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
                群聊背景
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                {groupQuery.data?.name ?? "群聊背景"}
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void navigate({
                  to: "/group/$groupId",
                  params: { groupId },
                });
              }}
              className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[color:var(--surface-console)]"
            >
              返回群聊
            </Button>
          </div>
          <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
            <div className="xl:sticky xl:top-5 xl:self-start">
              {groupQuery.data ? (
                <ChatBackgroundPreview
                  background={effectivePreviewBackground}
                  title={groupQuery.data.name}
                  subtitle="桌面端预览会同步展示在群聊工作区"
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
      title={groupQuery.data?.name ?? "群聊背景"}
      subtitle="默认背景和群聊专属背景"
      onBack={() => {
        void navigate({
          to: "/group/$groupId/details",
          params: { groupId },
        });
      }}
    >
      <div className="space-y-3 px-3">{content}</div>
    </ChatDetailsShell>
  );
}

function SectionCard({
  compact = false,
  title,
  description,
  status,
  children,
}: {
  compact?: boolean;
  title: string;
  description: string;
  status: string;
  children: ReactNode;
}) {
  return (
    <section
      className={
        compact
          ? "space-y-4 overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-4 py-4 shadow-none"
          : "space-y-4 rounded-[16px] border border-[color:var(--border-faint)] bg-white p-5 shadow-[var(--shadow-section)]"
      }
    >
      <div>
        <div
          className={
            compact
              ? "text-[17px] font-medium text-[color:var(--text-primary)]"
              : "text-lg font-semibold text-[color:var(--text-primary)]"
          }
        >
          {title}
        </div>
        <div
          className={
            compact
              ? "mt-1 text-xs leading-6 text-[color:var(--text-secondary)]"
              : "mt-1 text-sm leading-6 text-[color:var(--text-secondary)]"
          }
        >
          {description}
        </div>
        <div
          className={
            compact
              ? "mt-3 inline-flex rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] px-3 py-1 text-[11px] text-[color:var(--text-muted)]"
              : "mt-3 inline-flex rounded-[8px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] px-3 py-1 text-xs text-[color:var(--text-muted)]"
          }
        >
          当前：{status}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function PresetGrid({
  compact = false,
  selectedAssetId,
  onSelect,
}: {
  compact?: boolean;
  selectedAssetId?: string;
  onSelect: (background: ChatBackgroundAsset) => void;
}) {
  return (
    <div
      className={`grid grid-cols-2 ${compact ? "gap-2" : "gap-3"} sm:grid-cols-3`}
    >
      {CHAT_BACKGROUND_PRESETS.map((preset) => (
        <button
          key={preset.assetId}
          type="button"
          onClick={() => onSelect(preset)}
          className={`overflow-hidden rounded-[12px] border text-left transition ${
            preset.assetId === selectedAssetId
              ? "border-[rgba(7,193,96,0.22)] bg-white shadow-[inset_0_0_0_1px_rgba(7,193,96,0.06)]"
              : compact
                ? "border-[color:var(--border-subtle)] bg-white active:bg-[color:var(--surface-card-hover)]"
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
  compact = false,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  compact?: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`border transition ${
        compact
          ? "rounded-full px-4 py-2 text-[13px]"
          : "rounded-[8px] px-4 py-2 text-sm"
      } ${
        active
          ? compact
            ? "border-[rgba(7,193,96,0.16)] bg-[rgba(247,251,248,0.96)] text-[#15803d]"
            : "border-[color:var(--border-faint)] bg-white text-[color:var(--text-primary)]"
          : compact
            ? "border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] text-[color:var(--text-secondary)] active:bg-white"
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

function MobileGroupBackgroundStatusCard({
  badge,
  title,
  description,
  tone = "default",
}: {
  badge: string;
  title: string;
  description: string;
  tone?: "default" | "danger" | "loading";
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
    </section>
  );
}
