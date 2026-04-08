import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  clearWorldOwnerApiKey,
  getWorldOwner,
  setWorldOwnerApiKey,
  updateWorldOwner,
} from "@yinjie/contracts";
import {
  AppHeader,
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useWorldOwnerStore } from "../store/world-owner-store";

export function ProfilePage() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const username = useWorldOwnerStore((state) => state.username);
  const avatar = useWorldOwnerStore((state) => state.avatar);
  const signature = useWorldOwnerStore((state) => state.signature);
  const updateOwnerStore = useWorldOwnerStore((state) => state.updateOwner);
  const hydrateOwner = useWorldOwnerStore((state) => state.hydrateOwner);

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
  const aiSettingsBusy = saveApiKeyMutation.isPending || clearApiKeyMutation.isPending;

  return (
    <AppPage>
      <AppHeader eyebrow="我的世界" title={username ?? "世界主人"} description="这个服务端实例只属于你。" />

      <AppSection className="space-y-5 p-6">
        <div className="flex items-center gap-4">
          <AvatarChip name={draftName} src={avatar} size="lg" />
          <div>
            <div className="text-xl font-semibold text-[color:var(--text-primary)]">{username ?? "世界主人"}</div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">
              编辑你的身份、签名与这个世界对你的称呼。
            </div>
          </div>
        </div>

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
        {saveProfileMutation.isError && saveProfileMutation.error instanceof Error ? (
          <ErrorBlock message={saveProfileMutation.error.message} />
        ) : null}
        {saveProfileMutation.isSuccess ? <InlineNotice tone="success">世界主人资料已更新。</InlineNotice> : null}
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">专属 AI Key</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            默认会使用实例级 Provider。你也可以只为这个世界主人覆盖成自己的 API Key。
          </div>
        </div>

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

        {ownerQuery.isLoading ? <LoadingBlock className="px-0 py-0 text-left" label="读取世界主人配置..." /> : null}
        {ownerQuery.isError && ownerQuery.error instanceof Error ? <ErrorBlock message={ownerQuery.error.message} /> : null}
        {saveApiKeyMutation.isError && saveApiKeyMutation.error instanceof Error ? (
          <ErrorBlock message={saveApiKeyMutation.error.message} />
        ) : null}
        {clearApiKeyMutation.isError && clearApiKeyMutation.error instanceof Error ? (
          <ErrorBlock message={clearApiKeyMutation.error.message} />
        ) : null}
        {saveApiKeyMutation.isSuccess ? <InlineNotice tone="success">专属 API Key 已保存。</InlineNotice> : null}
        {clearApiKeyMutation.isSuccess ? <InlineNotice tone="success">专属 API Key 已清除。</InlineNotice> : null}
        {ownerQuery.data ? (
          <InlineNotice tone={ownerQuery.data.hasCustomApiKey ? "success" : "muted"}>
            {ownerQuery.data.hasCustomApiKey
              ? `当前世界主人正在使用专属 API Key${
                  ownerQuery.data.customApiBase ? `，Base URL 为 ${ownerQuery.data.customApiBase}` : ""
                }。`
              : "当前未配置专属 API Key，默认使用实例级 Provider。"}
          </InlineNotice>
        ) : null}
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">快捷入口</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">
            常用页面和说明文档都放在这里。
          </div>
        </div>
        <div className="space-y-3">
          <Link to="/friend-requests" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              好友请求
            </Button>
          </Link>
          <Link to="/legal/privacy" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              隐私政策
            </Button>
          </Link>
          <Link to="/legal/terms" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              用户协议
            </Button>
          </Link>
          <Link to="/legal/community" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              社区规范
            </Button>
          </Link>
        </div>
      </AppSection>
    </AppPage>
  );
}
