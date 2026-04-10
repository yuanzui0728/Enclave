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
} from "@yinjie/ui";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { CHAT_BACKGROUND_PRESETS } from "../features/chat/backgrounds/background-catalog";
import { ChatBackgroundPreview } from "../features/chat/backgrounds/chat-background-preview";
import { compressChatBackgroundImage } from "../features/chat/backgrounds/compress-chat-background-image";
import { getChatBackgroundLabel } from "../features/chat/backgrounds/chat-background-helpers";
import { useGroupBackground } from "../features/chat/backgrounds/use-conversation-background";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
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
        <LoadingBlock label="正在读取群聊背景..." />
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <ErrorBlock message={groupQuery.error.message} />
      ) : null}
      {backgroundQuery.isError && backgroundQuery.error instanceof Error ? (
        <ErrorBlock message={backgroundQuery.error.message} />
      ) : null}
      {pageError ? <ErrorBlock message={pageError} /> : null}
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <EmptyPanel
          title="群聊不存在"
          description="这个群聊暂时不可用，返回上一页后再试一次。"
        />
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
                disabled={busy}
                label="跟随默认"
                onClick={() => setGroupMode("inherit")}
              />
              <ModeChip
                active={groupMode === "custom"}
                disabled={busy}
                label="单独设置"
                onClick={() => setGroupMode("custom")}
              />
            </div>

            {groupMode === "custom" ? (
              <>
                <PresetGrid
                  selectedAssetId={groupDraft?.assetId}
                  onSelect={(preset) => handlePresetSelect("group", preset)}
                />
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => openPicker("group")}
                  >
                    上传图片
                  </Button>
                  <Button
                    variant="primary"
                    disabled={busy || !groupDraft}
                    onClick={() => saveGroupMutation.mutate()}
                  >
                    保存当前群聊背景
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => clearGroupMutation.mutate()}
                  >
                    跟随默认背景
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-[20px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.62)] px-4 py-4 text-sm text-[color:var(--text-secondary)]">
                当前群聊会直接沿用默认背景图。切换到“单独设置”后，可以挑选群聊专属背景。
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => saveGroupMutation.mutate()}
              >
                保存当前群聊设置
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
      <AppPage className="min-h-full bg-[linear-gradient(180deg,#f7efe1,#f2f6ee)] px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex items-center justify-between rounded-[28px] border border-white/80 bg-[rgba(255,255,255,0.84)] px-5 py-4 shadow-[var(--shadow-section)] backdrop-blur">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--brand-secondary)]">
                Group Background
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
    <section className="space-y-4 rounded-[28px] border border-white/80 bg-[rgba(255,255,255,0.86)] p-5 shadow-[var(--shadow-section)] backdrop-blur">
      <div>
        <div className="text-lg font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
          {description}
        </div>
        <div className="mt-3 inline-flex rounded-full bg-[rgba(255,248,238,0.9)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
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
          className={`overflow-hidden rounded-[22px] border text-left transition ${
            preset.assetId === selectedAssetId
              ? "border-[color:var(--border-brand)] shadow-[0_12px_24px_rgba(180,100,20,0.14)]"
              : "border-white/75 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
          }`}
        >
          <div
            className="h-28 bg-[linear-gradient(180deg,#fff7ec,#f5ebda)]"
            style={{
              backgroundImage: `url("${preset.thumbnailUrl ?? preset.url}")`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div className="bg-white/92 px-3 py-3 text-sm text-[color:var(--text-primary)]">
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
      className={`rounded-full px-4 py-2 text-sm transition ${
        active
          ? "bg-[linear-gradient(135deg,#fbbf24,#f97316)] text-[color:var(--text-on-brand)] shadow-[0_8px_18px_rgba(249,115,22,0.25)]"
          : "border border-[color:var(--border-faint)] bg-white text-[color:var(--text-secondary)]"
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
    <div className="rounded-[28px] border border-dashed border-[color:var(--border-faint)] bg-[rgba(255,255,255,0.7)] px-5 py-8 text-center">
      <div className="text-lg font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      <div className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
        {description}
      </div>
    </div>
  );
}
