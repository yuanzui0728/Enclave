import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { deleteUser, getBlockedCharacters, listAuthSessions, listCharacters, listModerationReports, logoutAllSessions, logoutCurrentSession, revokeAuthSession, unblockCharacter, updateUser } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField, useDesktopRuntime } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { disconnectChatSocket } from "../lib/socket";
import { getPlatformCapabilities } from "../lib/platform";
import { resolveConfiguredCoreApiBaseUrl } from "../lib/runtime-config";
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
  const providerReady = useSessionStore((state) => state.providerReady);
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl ?? "default";
  const { hasDesktopRuntimeControl, runtimeMode } = getPlatformCapabilities();

  const [draftName, setDraftName] = useState(username ?? "");
  const [draftSignature, setDraftSignature] = useState(signature);
  const canSave = draftName.trim().length > 0;

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
  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      await logoutAllSessions();
    },
    onSettled: () => {
      disconnectChatSocket();
      logout();
      void navigate({ to: "/onboarding", replace: true });
    },
  });
  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions", baseUrl, userId, token],
    queryFn: () => listAuthSessions(),
    enabled: Boolean(userId && token),
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
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => revokeAuthSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth-sessions", baseUrl, userId, token] });
    },
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
  const { desktopAvailable, desktopStatusQuery, probeMutation, restartMutation, runtimeContextQuery, startMutation, stopMutation } =
    useDesktopRuntime({
      queryKeyPrefix: "desktop",
    });
  const desktopRuntimeBusy =
    probeMutation.isPending || startMutation.isPending || restartMutation.isPending || stopMutation.isPending;
  const desktopRuntimeError =
    (probeMutation.error instanceof Error && probeMutation.error.message) ||
    (startMutation.error instanceof Error && startMutation.error.message) ||
    (restartMutation.error instanceof Error && restartMutation.error.message) ||
    (stopMutation.error instanceof Error && stopMutation.error.message) ||
    null;
  const accountMutationBusy =
    logoutMutation.isPending ||
    logoutAllMutation.isPending ||
    revokeSessionMutation.isPending ||
    deleteAccountMutation.isPending ||
    unblockMutation.isPending;
  const softInfoCardClassName =
    "rounded-2xl border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 text-sm text-[color:var(--text-secondary)]";
  const softListCardClassName =
    "rounded-2xl border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.03))] px-4 py-3 shadow-[var(--shadow-soft)]";

  useEffect(() => {
    setDraftName(username ?? "");
    setDraftSignature(signature);
    saveMutation.reset();
    revokeSessionMutation.reset();
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
      <AppHeader eyebrow="我" title={username ?? "未登录"} description="你的世界，只有你自己拥有。" />

      <AppSection className="space-y-5 p-6">
        <div className="flex items-center gap-4">
          <AvatarChip name={draftName} src={avatar} size="lg" />
          <div>
            <div className="text-xl font-semibold text-white">{username ?? "未登录"}</div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">你的世界，只有你自己拥有</div>
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
          <div className="text-sm font-medium text-white">{hasDesktopRuntimeControl ? "桌面运行时" : "当前运行环境"}</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">把运行时信息和控制动作拆开，减少状态块和按钮混在一起的压迫感。</div>
        </div>
        {hasDesktopRuntimeControl && desktopAvailable ? (
          <>
            <div className="grid gap-3">
              <div className={softInfoCardClassName}>
                Core API：{desktopStatusQuery.data?.baseUrl ?? "loading"}
              </div>
              <div className={softInfoCardClassName}>
                状态：{desktopStatusQuery.data?.running ? "已由桌面托管" : "未托管"} /{" "}
                {desktopStatusQuery.data?.reachable ? "可访问" : "不可访问"}
              </div>
              <div className={softInfoCardClassName}>
                运行目录：{runtimeContextQuery.data?.runtimeDataDir ?? "loading"}
              </div>
              <div className={softInfoCardClassName}>
                数据库：{runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? "loading"}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => probeMutation.mutate()}
                disabled={desktopRuntimeBusy}
                variant="secondary"
              >
                {probeMutation.isPending ? "探活中..." : "探活"}
              </Button>
              <Button
                onClick={() => startMutation.mutate()}
                disabled={desktopRuntimeBusy}
                variant="primary"
              >
                {startMutation.isPending ? "启动中..." : "启动 Core API"}
              </Button>
              <Button
                onClick={() => restartMutation.mutate()}
                disabled={desktopRuntimeBusy}
                variant="secondary"
              >
                {restartMutation.isPending ? "重启中..." : "重启 Core API"}
              </Button>
              <Button
                onClick={() => stopMutation.mutate()}
                disabled={desktopRuntimeBusy}
                variant="danger"
              >
                {stopMutation.isPending ? "停止中..." : "停止 Core API"}
              </Button>
            </div>

            <InlineNotice className="text-xs" tone="muted">
              {probeMutation.data?.message ??
                startMutation.data?.message ??
                restartMutation.data?.message ??
                stopMutation.data?.message ??
                desktopStatusQuery.data?.message ??
                "桌面壳会在这里显示本地 Core API 的启动与探活结果。"}
            </InlineNotice>
            {desktopRuntimeError ? <ErrorBlock message={desktopRuntimeError} /> : null}
          </>
        ) : (
          <div className="space-y-3">
            <InlineNotice tone="muted">
              {runtimeMode === "remote"
                ? `当前运行在远程模式。${providerReady ? "服务端 provider 已就绪。" : "服务端 provider 仍可能处于 fallback 模式。"}`
                : "当前不在 Tauri 桌面壳内，桌面运行时命令不可用。"}
            </InlineNotice>
            <div className={softInfoCardClassName}>
              应用：{runtimeConfig.publicAppName} / {runtimeConfig.appPlatform}
              {runtimeConfig.appVersionName ? ` / v${runtimeConfig.appVersionName}` : ""}
            </div>
            <div className={softInfoCardClassName}>
              服务地址：{runtimeConfig.apiBaseUrl ?? resolveConfiguredCoreApiBaseUrl()}
            </div>
            <div className={softInfoCardClassName}>
              环境：{runtimeConfig.environment}
              {runtimeConfig.applicationId ? ` / ${runtimeConfig.applicationId}` : ""}
            </div>
          </div>
        )}
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">登录会话</div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">当前账号在本地设备上保存的会话。</div>
          </div>
          <Button
            onClick={() => logoutAllMutation.mutate()}
            disabled={accountMutationBusy}
            variant="danger"
            size="sm"
          >
            {logoutAllMutation.isPending ? "正在退出全部..." : "退出全部设备"}
          </Button>
        </div>

        <div className="space-y-3">
          {sessionsQuery.data?.map((session) => (
            <div key={session.sessionId} className={softListCardClassName}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-white">{session.tokenLabel}</div>
                  <div className="mt-2 text-xs leading-6 text-[color:var(--text-secondary)]">
                    最近活动：{formatSessionTime(session.lastSeenAt)}
                  </div>
                  <div className="text-xs leading-6 text-[color:var(--text-muted)]">
                    创建：{formatSessionTime(session.createdAt)} / 过期：{formatSessionTime(session.expiresAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div
                    className={`rounded-full px-2 py-1 text-[10px] ${
                      session.current
                        ? "bg-[linear-gradient(135deg,rgba(249,115,22,0.96),rgba(251,191,36,0.9))] text-white"
                        : "border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] text-white/70"
                    }`}
                  >
                    {session.current ? "当前设备" : "历史会话"}
                  </div>
                  {!session.current ? (
                    <Button
                      onClick={() => revokeSessionMutation.mutate(session.sessionId)}
                      disabled={accountMutationBusy}
                      variant="danger"
                      size="sm"
                      className="text-[10px]"
                    >
                      {revokeSessionMutation.isPending && revokeSessionMutation.variables === session.sessionId
                        ? "正在移除..."
                        : "移除"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
          {sessionsQuery.isLoading ? <LoadingBlock className="px-4 py-3 text-left" label="正在读取会话..." /> : null}
          {sessionsQuery.isError && sessionsQuery.error instanceof Error ? <ErrorBlock message={sessionsQuery.error.message} /> : null}
          {revokeSessionMutation.isError && revokeSessionMutation.error instanceof Error ? <ErrorBlock message={revokeSessionMutation.error.message} /> : null}
          {!sessionsQuery.isLoading && !sessionsQuery.isError && !sessionsQuery.data?.length ? (
            <InlineNotice tone="muted">当前没有可展示的会话记录。</InlineNotice>
          ) : null}
        </div>
      </AppSection>

      <AppSection className="space-y-4 p-5">
        <div>
          <div className="text-sm font-medium text-white">安全与治理</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">把屏蔽名单和举报记录区分成两个子区域，避免一整页都像同类型状态卡。</div>
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
              <div className="text-sm text-white">{report.targetType} · {report.reason}</div>
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
          <div className="text-sm font-medium text-white">控制入口</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">常用入口集中在一起，危险操作放到最后，并和普通跳转明显区分。</div>
        </div>
        <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
          <Link to="/setup" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              {hasDesktopRuntimeControl ? "首次启动与 Provider 配置" : "环境状态与服务连接"}
            </Button>
          </Link>
          <Link to="/friend-requests" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              新的朋友
            </Button>
          </Link>
          <Link to="/login" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              切换账号
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
            {logoutMutation.isPending ? "正在退出..." : "退出当前世界"}
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
