import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import {
  clearWorldOwnerApiKey,
  getWorldOwner,
  setWorldOwnerApiKey,
  updateWorldOwner,
} from "@yinjie/contracts";
import {
  AppPage,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
  cn,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopUtilityShell } from "../features/desktop/desktop-utility-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import {
  formatChatSendShortcutLabel,
  type ChatSendShortcut,
  useChatPreferencesStore,
} from "../store/chat-preferences-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type SettingsTab = "profile" | "chat" | "ai" | "legal";
type LegalTab = "privacy" | "terms" | "community";

const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "profile", label: "个人资料" },
  { id: "chat", label: "聊天" },
  { id: "ai", label: "AI 设置" },
  { id: "legal", label: "协议与规范" },
];

const legalTabs: Array<{ id: LegalTab; label: string }> = [
  { id: "privacy", label: "隐私政策" },
  { id: "terms", label: "用户协议" },
  { id: "community", label: "社区规范" },
];

const chatSendShortcutOptions: Array<{
  id: ChatSendShortcut;
  label: string;
  description: string;
}> = [
  {
    id: "enter",
    label: "Enter 发送消息",
    description: "按回车直接发送，保持当前更顺手的输入节奏。",
  },
  {
    id: "mod_enter",
    label: "Ctrl/Cmd + Enter 发送消息",
    description: "发送前多一道组合键确认，更接近微信桌面版可切换方式。",
  },
];

export function ProfileSettingsPage() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isDesktopLayout = useDesktopLayout();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const username = useWorldOwnerStore((state) => state.username);
  const signature = useWorldOwnerStore((state) => state.signature);
  const updateOwnerStore = useWorldOwnerStore((state) => state.updateOwner);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);
  const sendMessageShortcut = useChatPreferencesStore(
    (state) => state.sendMessageShortcut,
  );
  const setSendMessageShortcut = useChatPreferencesStore(
    (state) => state.setSendMessageShortcut,
  );

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [activeLegalTab, setActiveLegalTab] = useState<LegalTab>("privacy");

  const [draftName, setDraftName] = useState(username ?? "");
  const [draftSignature, setDraftSignature] = useState(signature);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiBaseDraft, setApiBaseDraft] = useState("");

  useEffect(() => {
    setDraftName(username ?? "");
  }, [username]);

  useEffect(() => {
    setDraftSignature(signature);
  }, [signature]);

  const ownerQuery = useQuery({
    queryKey: ["world-owner", baseUrl],
    queryFn: () => getWorldOwner(baseUrl),
  });

  useEffect(() => {
    if (!ownerQuery.data) {
      return;
    }

    hydrateOwner(ownerQuery.data);
    setApiBaseDraft(ownerQuery.data.customApiBase ?? "");
  }, [hydrateOwner, ownerQuery.data]);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      const owner = await updateWorldOwner(
        {
          username: draftName.trim(),
          signature: draftSignature.trim(),
        },
        baseUrl,
      );
      hydrateOwner(owner);
      updateOwnerStore({
        username: owner.username,
        signature: owner.signature,
      });
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async () => {
      const owner = await setWorldOwnerApiKey(
        {
          apiKey: apiKeyDraft.trim(),
          apiBase: apiBaseDraft.trim() || undefined,
        },
        baseUrl,
      );
      hydrateOwner(owner);
    },
    onSuccess: () => {
      setApiKeyDraft("");
    },
  });

  const clearApiKeyMutation = useMutation({
    mutationFn: async () => {
      const owner = await clearWorldOwnerApiKey(baseUrl);
      hydrateOwner(owner);
      setApiKeyDraft("");
      setApiBaseDraft(owner.customApiBase ?? "");
    },
  });

  const canSaveProfile = draftName.trim().length > 0;
  const aiSettingsBusy =
    saveApiKeyMutation.isPending || clearApiKeyMutation.isPending;
  const desktopSettingsRoute = pathname.startsWith("/desktop/settings");
  const desktopMode = isDesktopLayout;
  const backTo = desktopMode ? "/tabs/chat" : "/tabs/profile";
  const desktopBackTo = desktopSettingsRoute ? "/tabs/chat" : "/tabs/profile";
  const desktopBackLabel = desktopSettingsRoute ? "返回消息" : "返回资料";

  const content = (
    <>
      {desktopMode ? null : (
        <div className="overflow-hidden border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5">
          <div className="flex gap-1 rounded-[12px] bg-[#f5f5f5] p-[3px]">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 rounded-[10px] py-1.5 text-[12px] font-medium transition-all duration-[var(--motion-fast)]",
                  activeTab === tab.id
                    ? "bg-white text-[color:var(--text-primary)] shadow-sm"
                    : "text-[color:var(--text-muted)] hover:bg-white/70",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === "profile" ? (
        <MobileSettingsSection
          desktop={desktopMode}
          title={desktopMode ? "个人资料" : undefined}
          description={desktopMode ? "这里的名称和签名会用于移动端资料页和世界主人展示。" : undefined}
        >
          <div className="space-y-3">
            <MobileFieldGroup label="显示名称">
              <TextField
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="输入显示名称"
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[13px] shadow-none focus:translate-y-0"
              />
            </MobileFieldGroup>
            <MobileFieldGroup label="签名">
              <TextAreaField
                value={draftSignature}
                onChange={(event) => setDraftSignature(event.target.value)}
                className="min-h-[5.5rem] resize-none rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[13px] leading-[1.35rem] shadow-none focus:translate-y-0"
                placeholder="介绍一下你自己，或者写一句当前状态"
              />
            </MobileFieldGroup>
          </div>

          <div className="pt-1">
            <Button
              onClick={() => saveProfileMutation.mutate()}
              disabled={!canSaveProfile || saveProfileMutation.isPending}
              variant="primary"
              className={cn(
                "h-9 w-full rounded-[10px] text-[12px] text-white shadow-none",
                desktopMode
                  ? "bg-[color:var(--brand-primary)] hover:opacity-95"
                  : "bg-[#07c160] hover:bg-[#06ad56]",
              )}
            >
              {saveProfileMutation.isPending ? "保存中..." : "保存资料"}
            </Button>
          </div>
          {saveProfileMutation.isError &&
          saveProfileMutation.error instanceof Error ? (
            <ErrorBlock message={saveProfileMutation.error.message} />
          ) : null}
          {saveProfileMutation.isSuccess ? (
            <InlineNotice tone="success">资料已更新。</InlineNotice>
          ) : null}
        </MobileSettingsSection>
      ) : null}

      {activeTab === "chat" ? (
        <MobileSettingsSection
          desktop={desktopMode}
          title={desktopMode ? "聊天设置" : undefined}
          description={
            desktopMode
              ? "调整桌面和 Web 键盘聊天输入时的发送快捷键。"
              : "设置键盘聊天输入时的发送快捷键"
          }
        >
          <div
            className={cn(
              "overflow-hidden rounded-[16px] border",
              desktopMode
                ? "border-[color:var(--border-faint)] bg-[color:var(--surface-console)]"
                : "border-[color:var(--border-faint)] bg-white",
            )}
          >
            {chatSendShortcutOptions.map((option, index) => {
              const selected = sendMessageShortcut === option.id;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSendMessageShortcut(option.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition",
                    index > 0 && "border-t border-[color:var(--border-faint)]",
                    selected
                      ? desktopMode
                        ? "bg-[rgba(7,193,96,0.07)]"
                        : "bg-[rgba(7,193,96,0.08)]"
                      : "hover:bg-[color:var(--surface-card-hover)]",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium text-[color:var(--text-primary)]">
                      {option.label}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
                      {option.description}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                      selected
                        ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)] text-white"
                        : "border-[color:var(--border-faint)] bg-white text-transparent",
                    )}
                    aria-hidden="true"
                  >
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                </button>
              );
            })}
          </div>

          <InlineNotice tone="muted">
            当前仅影响桌面和 Web 的键盘聊天输入，移动端仍以发送按钮和语音入口为主。
          </InlineNotice>
        </MobileSettingsSection>
      ) : null}

      {activeTab === "ai" ? (
        <MobileSettingsSection
          desktop={desktopMode}
          title={desktopMode ? "AI 设置" : undefined}
          description={
            desktopMode
              ? "你可以为当前世界主人单独配置专属 API Key 和兼容 Base URL。"
              : "专属 API Key 与兼容 Base URL"
          }
        >
          {ownerQuery.isLoading ? (
            <LoadingBlock className="px-0 py-0 text-left" label="读取配置..." />
          ) : null}
          {ownerQuery.isError && ownerQuery.error instanceof Error ? (
            <ErrorBlock message={ownerQuery.error.message} />
          ) : null}
          {ownerQuery.data ? (
            <InlineNotice
              tone={ownerQuery.data.hasCustomApiKey ? "success" : "muted"}
            >
              {ownerQuery.data.hasCustomApiKey
                ? `当前使用专属 API Key${ownerQuery.data.customApiBase ? `，Base URL：${ownerQuery.data.customApiBase}` : ""}。`
                : "当前使用实例级 Provider。"}
            </InlineNotice>
          ) : null}

          <div className="space-y-3">
            <MobileFieldGroup label="专属 API Key">
              <TextField
                type="password"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                placeholder={
                  ownerQuery.data?.hasCustomApiKey
                    ? "已保存专属 API Key，输入新的值可替换"
                    : "输入你的专属 API Key"
                }
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[13px] shadow-none focus:translate-y-0"
              />
            </MobileFieldGroup>
            <MobileFieldGroup label="兼容 Base URL">
              <TextField
                value={apiBaseDraft}
                onChange={(event) => setApiBaseDraft(event.target.value)}
                placeholder="可选，例如 https://api.openai.com/v1"
                className="rounded-[11px] border-[color:var(--border-faint)] px-3.5 py-2.5 text-[13px] shadow-none focus:translate-y-0"
              />
            </MobileFieldGroup>
          </div>

          <div className="space-y-2 pt-1">
            <Button
              onClick={() => saveApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !apiKeyDraft.trim()}
              variant="primary"
              className={cn(
                "h-9 w-full rounded-[10px] text-[12px] text-white shadow-none",
                desktopMode
                  ? "bg-[color:var(--brand-primary)] hover:opacity-95"
                  : "bg-[#07c160] hover:bg-[#06ad56]",
              )}
            >
              {saveApiKeyMutation.isPending ? "保存中..." : "保存专属 API Key"}
            </Button>
            <Button
              onClick={() => clearApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !ownerQuery.data?.hasCustomApiKey}
              variant="secondary"
              className="h-9 w-full rounded-[10px] border-[color:var(--border-faint)] bg-white text-[12px] shadow-none hover:bg-[#f5f7f7]"
            >
              {clearApiKeyMutation.isPending ? "清除中..." : "清除专属 API Key"}
            </Button>
          </div>

          {saveApiKeyMutation.isError &&
          saveApiKeyMutation.error instanceof Error ? (
            <ErrorBlock message={saveApiKeyMutation.error.message} />
          ) : null}
          {clearApiKeyMutation.isError &&
          clearApiKeyMutation.error instanceof Error ? (
            <ErrorBlock message={clearApiKeyMutation.error.message} />
          ) : null}
          {saveApiKeyMutation.isSuccess ? (
            <InlineNotice tone="success">专属 API Key 已保存。</InlineNotice>
          ) : null}
          {clearApiKeyMutation.isSuccess ? (
            <InlineNotice tone="success">专属 API Key 已清除。</InlineNotice>
          ) : null}
        </MobileSettingsSection>
      ) : null}

      {activeTab === "legal" ? (
        <>
          {desktopMode ? null : (
            <section className="mt-1.5 divide-y divide-[color:var(--border-faint)] border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)]">
              <MobileLinkRow
                label="隐私政策"
                onClick={() =>
                  void navigate({
                    to: "/legal/privacy",
                  })
                }
              />
              <MobileLinkRow
                label="服务条款"
                onClick={() =>
                  void navigate({
                    to: "/legal/terms",
                  })
                }
              />
              <MobileLinkRow
                label="社区规范"
                onClick={() =>
                  void navigate({
                    to: "/legal/community",
                  })
                }
              />
            </section>
          )}

          {desktopMode ? (
            <MobileSettingsSection
              desktop
              title="协议与规范"
              description="桌面端保留当前文档切换和独立打开入口。"
            >
              <div className="flex gap-1 rounded-[12px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-1">
                {legalTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveLegalTab(tab.id)}
                    className={cn(
                      "flex-1 rounded-[10px] py-2 text-[12px] font-medium transition-all duration-[var(--motion-fast)]",
                      activeLegalTab === tab.id
                        ? "bg-white text-[color:var(--text-primary)] shadow-sm"
                        : "text-[color:var(--text-muted)] hover:bg-white/70",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    void navigate({
                      to:
                        activeLegalTab === "privacy"
                          ? "/legal/privacy"
                          : activeLegalTab === "terms"
                            ? "/legal/terms"
                            : "/legal/community",
                    })
                  }
                >
                  打开当前文档
                </Button>
                <InlineNotice tone="muted">
                  {activeLegalTab === "privacy"
                    ? "查看世界隐私政策和数据使用说明。"
                    : activeLegalTab === "terms"
                      ? "查看世界服务使用协议。"
                      : "查看世界社区规范和反馈口径。"}
                </InlineNotice>
              </div>
            </MobileSettingsSection>
          ) : null}
        </>
      ) : null}
    </>
  );

  if (desktopMode) {
    return (
      <DesktopUtilityShell
        title={desktopSettingsRoute ? "设置" : "资料与设置"}
        subtitle={
          activeTab === "profile"
            ? "在桌面工作区里管理世界主人的资料与签名。"
            : activeTab === "chat"
              ? "调整桌面和 Web 键盘聊天输入的发送快捷键。"
            : activeTab === "ai"
              ? "管理专属 API Key 和兼容 Base URL。"
              : "查看当前世界相关的协议和社区规范。"
        }
        toolbar={
          <Button
            onClick={() => navigate({ to: desktopBackTo })}
            variant="secondary"
            className="rounded-[10px] border-[color:var(--border-faint)] bg-white shadow-none hover:bg-[#f5f7f7]"
          >
            {desktopBackLabel}
          </Button>
        }
        sidebar={
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] px-4 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                设置分类
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                桌面端把资料、AI 配置和协议查看收口到同一个工作区。
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3">
              <div className="space-y-1">
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-left text-sm transition",
                      activeTab === tab.id
                        ? "bg-[rgba(7,193,96,0.10)] text-[color:var(--text-primary)]"
                        : "text-[color:var(--text-secondary)] hover:bg-white/80 hover:text-[color:var(--text-primary)]",
                    )}
                  >
                    <span>{tab.label}</span>
                    {activeTab === tab.id ? (
                      <span className="h-2 w-2 rounded-full bg-[color:var(--brand-primary)]" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
        aside={
          <div className="flex h-full min-h-0 flex-col">
            <div className="border-b border-[color:var(--border-faint)] px-5 py-4">
              <div className="text-sm font-medium text-[color:var(--text-primary)]">
                当前状态
              </div>
              <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                右侧显示世界主人信息和当前配置摘要。
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-5">
              <div className="space-y-3">
                <DesktopStatCard
                  label="当前世界主人"
                  value={username ?? "世界主人"}
                />
                <DesktopStatCard
                  label="签名"
                  value={signature?.trim() || "暂无签名"}
                />
                <DesktopStatCard
                  label="配置状态"
                  value={
                    ownerQuery.data?.hasCustomApiKey
                      ? "已配置专属 API Key"
                      : "使用实例级 Provider"
                  }
                />
                <DesktopStatCard
                  label="发送快捷键"
                  value={formatChatSendShortcutLabel(sendMessageShortcut)}
                />
                {activeTab === "legal" ? (
                  <DesktopStatCard
                    label="当前文档"
                    value={
                      activeLegalTab === "privacy"
                        ? "隐私政策"
                        : activeLegalTab === "terms"
                          ? "用户协议"
                          : "社区规范"
                    }
                  />
                ) : null}
              </div>
            </div>
          </div>
        }
      >
        <div className="p-5">{content}</div>
      </DesktopUtilityShell>
    );
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title="设置"
        titleAlign="center"
        className="mx-0 mb-0 mt-0 border-b border-[color:var(--border-faint)] bg-[rgba(247,247,247,0.94)] px-4 pb-1.5 pt-1.5 text-[color:var(--text-primary)] shadow-none"
        leftActions={
          <Button
            onClick={() => navigate({ to: backTo })}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </Button>
        }
      />
      <div className="space-y-1.5 pb-8">{content}</div>
    </AppPage>
  );
}

function DesktopStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[color:var(--border-faint)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function MobileSettingsSection({
  desktop = false,
  title,
  description,
  children,
}: {
  desktop?: boolean;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "space-y-2.5",
        desktop
          ? "rounded-[20px] border border-[color:var(--border-faint)] bg-white px-5 py-5 shadow-[var(--shadow-section)]"
          : "mt-1.5 border-y border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-4 py-2.5",
      )}
    >
      {title || description ? (
        <div>
          {title ? (
            <div className="text-[15px] font-medium text-[color:var(--text-primary)]">
              {title}
            </div>
          ) : null}
          {description ? (
            <div className="mt-1 text-[12px] leading-5 text-[color:var(--text-muted)]">
              {description}
            </div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function MobileFieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 text-[12px] font-medium text-[color:var(--text-secondary)]">
        {label}
      </div>
      {children}
    </label>
  );
}

function MobileLinkRow({
  label,
  subtitle,
  onClick,
}: {
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-card-hover)]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-[color:var(--text-primary)]">
          {label}
        </div>
        {subtitle ? (
          <div className="mt-0.5 text-[11px] leading-[1.125rem] text-[color:var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      <div className="text-[13px] text-[color:var(--text-dim)]">›</div>
    </button>
  );
}
