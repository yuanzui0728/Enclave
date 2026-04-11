import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  clearWorldOwnerApiKey,
  getWorldOwner,
  setWorldOwnerApiKey,
  updateWorldOwner,
} from "@yinjie/contracts";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
  cn,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { DesktopEntryShell } from "../features/desktop/desktop-entry-shell";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

type SettingsTab = "profile" | "ai" | "legal";
type LegalTab = "privacy" | "terms" | "community";

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
      <div className="flex gap-1 rounded-[12px] border border-black/6 bg-[#f7f7f7] p-1">
        {(
          [
            { id: "profile", label: "个人资料" },
            { id: "ai", label: "AI 设置" },
            { id: "legal", label: "协议与规范" },
          ] as { id: SettingsTab; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 rounded-[10px] py-2 text-[13px] font-medium transition-all duration-[var(--motion-fast)]",
              activeTab === tab.id
                ? "bg-white text-[color:var(--text-primary)] shadow-sm"
                : "text-[color:var(--text-muted)] hover:bg-white/70",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" ? (
        <AppSection className="space-y-4">
          <div className="space-y-3">
            <TextField
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="显示名称"
            />
            <TextAreaField
              value={draftSignature}
              onChange={(event) => setDraftSignature(event.target.value)}
              className="min-h-24 resize-none"
              placeholder="签名"
            />
          </div>

          <Button
            onClick={() => saveProfileMutation.mutate()}
            disabled={!canSaveProfile || saveProfileMutation.isPending}
            variant="primary"
          >
            {saveProfileMutation.isPending ? "保存中..." : "保存资料"}
          </Button>
          {saveProfileMutation.isError &&
          saveProfileMutation.error instanceof Error ? (
            <ErrorBlock message={saveProfileMutation.error.message} />
          ) : null}
          {saveProfileMutation.isSuccess ? (
            <InlineNotice tone="success">资料已更新。</InlineNotice>
          ) : null}
        </AppSection>
      ) : null}

      {activeTab === "ai" ? (
        <AppSection className="space-y-4">
          <div className="space-y-3">
            <TextField
              type="password"
              value={apiKeyDraft}
              onChange={(event) => setApiKeyDraft(event.target.value)}
              placeholder={
                ownerQuery.data?.hasCustomApiKey
                  ? "已保存专属 API Key，输入新的值可替换"
                  : "输入你的专属 API Key"
              }
            />
            <TextField
              value={apiBaseDraft}
              onChange={(event) => setApiBaseDraft(event.target.value)}
              placeholder="可选兼容 Base URL，例如 https://api.openai.com/v1"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => saveApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !apiKeyDraft.trim()}
              variant="primary"
            >
              {saveApiKeyMutation.isPending ? "保存中..." : "保存专属 API Key"}
            </Button>
            <Button
              onClick={() => clearApiKeyMutation.mutate()}
              disabled={aiSettingsBusy || !ownerQuery.data?.hasCustomApiKey}
              variant="secondary"
            >
              {clearApiKeyMutation.isPending ? "清除中..." : "清除专属 API Key"}
            </Button>
          </div>

          {ownerQuery.isLoading ? (
            <LoadingBlock className="px-0 py-0 text-left" label="读取配置..." />
          ) : null}
          {ownerQuery.isError && ownerQuery.error instanceof Error ? (
            <ErrorBlock message={ownerQuery.error.message} />
          ) : null}
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
          {ownerQuery.data ? (
            <InlineNotice
              tone={ownerQuery.data.hasCustomApiKey ? "success" : "muted"}
            >
              {ownerQuery.data.hasCustomApiKey
                ? `当前使用专属 API Key${ownerQuery.data.customApiBase ? `，Base URL：${ownerQuery.data.customApiBase}` : ""}。`
                : "当前使用实例级 Provider。"}
            </InlineNotice>
          ) : null}
        </AppSection>
      ) : null}

      {activeTab === "legal" ? (
        <AppSection className="space-y-4">
          <div className="flex gap-1 rounded-[12px] border border-black/6 bg-[#f7f7f7] p-1">
            {(
              [
                { id: "privacy", label: "隐私政策" },
                { id: "terms", label: "用户协议" },
                { id: "community", label: "社区规范" },
              ] as { id: LegalTab; label: string }[]
            ).map((tab) => (
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
        </AppSection>
      ) : null}
    </>
  );

  if (desktopMode) {
    return (
      <div className="h-full overflow-auto bg-[#f3f3f3] px-6 py-6">
        <DesktopEntryShell
          badge={desktopSettingsRoute ? "Settings" : "Profile"}
          title="桌面模式下统一收口世界资料和 AI 配置"
          description={
            desktopSettingsRoute
              ? "更多菜单进入设置后，不再跳回手机式页面，而是在桌面工作区内完成资料编辑、专属 API Key 管理和协议查看。"
              : "从头像进入资料与设置时，也保持桌面工作区形态，避免切回手机式页面。"
          }
          aside={
            <div className="space-y-3">
              <DesktopStatCard
                label="当前世界主人"
                value={username ?? "世界主人"}
              />
              <DesktopStatCard
                label="配置状态"
                value={
                  ownerQuery.data?.hasCustomApiKey
                    ? "已配置专属 API Key"
                    : "使用实例级 Provider"
                }
              />
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button
                onClick={() => navigate({ to: desktopBackTo })}
                variant="ghost"
                className="rounded-[10px] border-black/8 bg-white shadow-none hover:bg-[#efefef]"
              >
                {desktopBackLabel}
              </Button>
            </div>
            {content}
          </div>
        </DesktopEntryShell>
      </div>
    );
  }

  return (
    <AppPage className="space-y-4">
      <TabPageTopBar
        title="设置"
        titleAlign="center"
        leftActions={
          <Button
            onClick={() => navigate({ to: backTo })}
            variant="ghost"
            size="icon"
            className="border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />
      {content}
    </AppPage>
  );
}

function DesktopStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-black/6 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="text-xs text-[color:var(--text-muted)]">{label}</div>
      <div className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
