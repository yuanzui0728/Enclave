import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { deleteUser, getBlockedCharacters, listCharacters, listModerationReports, logoutCurrentSession, unblockCharacter, updateUser } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { DesktopRuntimePanel } from "../features/profile/desktop-runtime-panel";
import { disconnectChatSocket } from "../lib/socket";
import { resolveAppRuntimeContext } from "../runtime/platform";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { useSessionStore } from "../store/session-store";

export function ProfilePage() {
  const navigate = useNavigate();
  const token = useSessionStore((state) => state.token);
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const avatar = useSessionStore((state) => state.avatar);
  const signature = useSessionStore((state) => state.signature);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const logout = useSessionStore((state) => state.logout);
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const runtimeContext = resolveAppRuntimeContext(runtimeConfig.appPlatform);
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";

  const [draftName, setDraftName] = useState(username ?? "");
  const [draftSignature, setDraftSignature] = useState(signature);
  const canSave = draftName.trim().length > 0;
  const softListCardClassName =
    "rounded-2xl border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 shadow-[var(--shadow-soft)]";

  useEffect(() => {
    setDraftName(username ?? "");
  }, [username]);

  useEffect(() => {
    setDraftSignature(signature);
  }, [signature]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        return;
      }
      await updateUser(userId, { username: draftName.trim(), signature: draftSignature.trim() });
      updateProfile({
        username: draftName.trim(),
        signature: draftSignature.trim(),
      });
    },
  });
  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logoutCurrentSession();
    },
    onSettled: () => {
      disconnectChatSocket();
      logout();
      void navigate({ to: "/onboarding", replace: true });
    },
  });
  const blockedCharactersQuery = useQuery({
    queryKey: ["blocked-characters", baseUrl, userId, token],
    queryFn: () => getBlockedCharacters(userId!),
    enabled: Boolean(userId && token),
  });
  const charactersQuery = useQuery({
    queryKey: ["profile-characters", baseUrl],
    queryFn: () => listCharacters(),
  });
  const reportsQuery = useQuery({
    queryKey: ["moderation-reports", baseUrl, userId, token],
    queryFn: () => listModerationReports(userId!),
    enabled: Boolean(userId && token),
  });
  const unblockMutation = useMutation({
    mutationFn: async (characterId: string) => {
      if (!userId) {
        throw new Error("missing user session");
      }

      await unblockCharacter({ userId, characterId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["blocked-characters", baseUrl, userId, token] }),
        queryClient.invalidateQueries({ queryKey: ["app-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-chat-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-discover-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-moments-blocked-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-characters", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-conversations", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-friends-quick-start", baseUrl, userId] }),
        queryClient.invalidateQueries({ queryKey: ["app-group-friends", baseUrl, userId] }),
      ]);
    },
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      if (!userId) {
        throw new Error("missing user session");
      }

      await deleteUser(userId);
    },
    onSuccess: () => {
      disconnectChatSocket();
      logout();
      void navigate({ to: "/onboarding", replace: true });
    },
  });
  const accountMutationBusy =
    logoutMutation.isPending ||
    deleteAccountMutation.isPending ||
    unblockMutation.isPending;

  useEffect(() => {
    setDraftName(username ?? "");
    setDraftSignature(signature);
    saveMutation.reset();
    unblockMutation.reset();
    deleteAccountMutation.reset();
  }, [baseUrl, signature, username]);

  function handleDeleteAccount() {
    if (!userId) {
      return;
    }

    const confirmed = window.confirm("删除账号会让当前账号立即失效，并清空当前设备上的登录状态。确定继续吗？");
    if (!confirmed) {
      return;
    }

    deleteAccountMutation.mutate();
  }

  return (
    <AppPage>
      <AppHeader eyebrow="我" title={username ?? "未登录"} description="你的世界，只由你自己拥有。" />

      <AppSection className="space-y-5 p-6">
        <div className="flex items-center gap-4">
          <AvatarChip name={draftName} src={avatar} size="lg" />
          <div>
            <div className="text-xl font-semibold text-white">{username ?? "未登录"}</div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">你的世界，只由你自己拥有</div>
          </div>
        </div>

        <div className="space-y-3">
          <TextField
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="昵称"
          />
          <TextAreaField
            value={draftSignature}
            onChange={(event) => setDraftSignature(event.target.value)}
            className="min-h-24 resize-none"
            placeholder="签名"
          />
        </div>

        <Button
          onClick={() => saveMutation.mutate()}
          disabled={!canSave || saveMutation.isPending}
          variant="primary"
        >
          {saveMutation.isPending ? "正在保存..." : "保存资料"}
        </Button>
        {saveMutation.isError && saveMutation.error instanceof Error ? <ErrorBlock message={saveMutation.error.message} /> : null}
        {saveMutation.isSuccess ? <InlineNotice tone="success">资料已更新。</InlineNotice> : null}
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div>
          <div className="text-sm font-medium text-white">安全与治理</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">你对隐界的屏蔽和举报记录会保存在这里。</div>
        </div>
        <div className="space-y-3">
          {(blockedCharactersQuery.data ?? []).map((item) => {
            const character = charactersQuery.data?.find((entry) => entry.id === item.characterId);

            return (
              <div key={item.id} className={softListCardClassName}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-white">{character?.name ?? item.characterId}</div>
                    <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                      已屏蔽：{formatSessionTime(item.createdAt)}
                    </div>
                    <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                      原因：{item.reason?.trim() || "未填写"}
                    </div>
                  </div>
                  <Button
                    onClick={() => unblockMutation.mutate(item.characterId)}
                    disabled={accountMutationBusy}
                    variant="secondary"
                    size="sm"
                  >
                    {unblockMutation.isPending && unblockMutation.variables === item.characterId ? "解除中..." : "解除屏蔽"}
                  </Button>
                </div>
              </div>
            );
          })}
          {blockedCharactersQuery.isLoading ? <LoadingBlock className="px-4 py-3 text-left" label="正在读取屏蔽名单..." /> : null}
          {blockedCharactersQuery.isError && blockedCharactersQuery.error instanceof Error ? <ErrorBlock message={blockedCharactersQuery.error.message} /> : null}
          {unblockMutation.isError && unblockMutation.error instanceof Error ? <ErrorBlock message={unblockMutation.error.message} /> : null}
          {!blockedCharactersQuery.isLoading && !blockedCharactersQuery.isError && !blockedCharactersQuery.data?.length ? (
            <InlineNotice tone="muted">当前没有屏蔽中的角色。</InlineNotice>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-[color:var(--border-faint)] pt-4">
          {(reportsQuery.data ?? []).slice(0, 6).map((report) => (
            <div key={report.id} className={softListCardClassName}>
              <div className="text-sm text-white">{report.targetType} 路 {report.reason}</div>
              <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">提交：{formatSessionTime(report.createdAt)}</div>
              <div className="text-xs leading-6 text-[color:var(--text-muted)]">状态：{report.status}</div>
            </div>
          ))}
          {reportsQuery.isLoading ? <LoadingBlock className="px-4 py-3 text-left" label="正在读取举报记录..." /> : null}
          {reportsQuery.isError && reportsQuery.error instanceof Error ? <ErrorBlock message={reportsQuery.error.message} /> : null}
          {!reportsQuery.isLoading && !reportsQuery.isError && !reportsQuery.data?.length ? (
            <InlineNotice tone="muted">你提交的举报会显示在这里。</InlineNotice>
          ) : null}
        </div>
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div>
          <div className="text-sm font-medium text-white">常用入口</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">常用页面集中在这里，账号操作放在最后。</div>
        </div>
        <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
          <Link to="/friend-requests" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              新的朋友
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
              社区与安全说明
            </Button>
          </Link>
          <Button
            onClick={() => logoutMutation.mutate()}
            disabled={accountMutationBusy}
            variant="danger"
            size="lg"
            className="w-full justify-start rounded-2xl"
          >
            {logoutMutation.isPending ? "正在退出..." : "退出当前账号"}
          </Button>
          <Button
            onClick={handleDeleteAccount}
            disabled={accountMutationBusy}
            variant="danger"
            size="lg"
            className="w-full justify-start rounded-2xl"
          >
            {deleteAccountMutation.isPending ? "正在删除账号..." : "删除账号"}
          </Button>
        </div>
        {deleteAccountMutation.isError && deleteAccountMutation.error instanceof Error ? (
          <ErrorBlock className="mt-3" message={deleteAccountMutation.error.message} />
        ) : null}
        <InlineNotice className="mt-3" tone="warning">
          删除账号会立即让当前账号和所有历史会话失效。后续将继续收口动态、好友和会话数据的完整清理策略。
        </InlineNotice>
      </AppSection>

      {runtimeContext.hostRole === "host" ? (
        <AppSection className="space-y-4 p-5">
          <DesktopRuntimePanel />
        </AppSection>
      ) : null}
    </AppPage>
  );
}

function formatSessionTime(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "未知";
  }

  return new Date(parsed).toLocaleString("zh-CN", {
    hour12: false,
  });
}
