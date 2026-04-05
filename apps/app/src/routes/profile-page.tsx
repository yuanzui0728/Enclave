import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listAuthSessions, logoutAllSessions, logoutCurrentSession, revokeAuthSession, updateUser } from "@yinjie/contracts";
import { AppHeader, AppPage, AppSection, Button, ErrorBlock, InlineNotice, LoadingBlock, TextAreaField, TextField, useDesktopRuntime } from "@yinjie/ui";
import { AvatarChip } from "../components/avatar-chip";
import { useSessionStore } from "../store/session-store";

export function ProfilePage() {
  const token = useSessionStore((state) => state.token);
  const userId = useSessionStore((state) => state.userId);
  const username = useSessionStore((state) => state.username);
  const avatar = useSessionStore((state) => state.avatar);
  const signature = useSessionStore((state) => state.signature);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const logout = useSessionStore((state) => state.logout);
  const queryClient = useQueryClient();

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
      logout();
    },
  });
  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      await logoutAllSessions();
    },
    onSettled: () => {
      logout();
    },
  });
  const sessionsQuery = useQuery({
    queryKey: ["auth-sessions", userId, token],
    queryFn: () => listAuthSessions(),
    enabled: Boolean(userId && token),
  });
  const revokeSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => revokeAuthSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["auth-sessions", userId, token] });
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

  return (
    <AppPage>
      <AppHeader eyebrow="我" title={username ?? "未登录"} description="你的世界，只有你自己拥有。" />

      <AppSection className="p-6">
        <div className="flex items-center gap-4">
          <AvatarChip name={draftName} src={avatar} size="lg" />
          <div>
            <div className="text-xl font-semibold text-white">{username ?? "未登录"}</div>
            <div className="mt-1 text-sm text-[color:var(--text-secondary)]">你的世界，只有你自己拥有</div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
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
          className="mt-4"
        >
          {saveMutation.isPending ? "正在保存..." : "保存资料"}
        </Button>
        {saveMutation.isError && saveMutation.error instanceof Error ? <ErrorBlock className="mt-3" message={saveMutation.error.message} /> : null}
        {saveMutation.isSuccess ? <InlineNotice className="mt-3" tone="success">资料已更新。</InlineNotice> : null}
      </AppSection>

      <AppSection className="p-5">
        <div className="text-sm font-medium text-white">桌面运行时</div>
        {desktopAvailable ? (
          <>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                Core API：{desktopStatusQuery.data?.baseUrl ?? "loading"}
              </div>
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                状态：{desktopStatusQuery.data?.running ? "已由桌面托管" : "未托管"} /{" "}
                {desktopStatusQuery.data?.reachable ? "可访问" : "不可访问"}
              </div>
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                运行目录：{runtimeContextQuery.data?.runtimeDataDir ?? "loading"}
              </div>
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3 text-sm text-[color:var(--text-secondary)]">
                数据库：{runtimeContextQuery.data?.databasePath ?? desktopStatusQuery.data?.databasePath ?? "loading"}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
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

            <InlineNotice className="mt-4 text-xs" tone="muted">
              {probeMutation.data?.message ??
                startMutation.data?.message ??
                restartMutation.data?.message ??
                stopMutation.data?.message ??
                desktopStatusQuery.data?.message ??
                "桌面壳会在这里显示本地 Core API 的启动与探活结果。"}
            </InlineNotice>
            {desktopRuntimeError ? <ErrorBlock className="mt-3" message={desktopRuntimeError} /> : null}
          </>
        ) : (
          <InlineNotice className="mt-4" tone="muted">
            当前不在 Tauri 桌面壳内，桌面运行时命令不可用。
          </InlineNotice>
        )}
      </AppSection>

      <AppSection className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-white">登录会话</div>
            <div className="mt-1 text-xs text-[color:var(--text-muted)]">当前账号在本地设备上保存的会话。</div>
          </div>
          <Button
            onClick={() => logoutAllMutation.mutate()}
            disabled={logoutAllMutation.isPending || logoutMutation.isPending || revokeSessionMutation.isPending}
            variant="danger"
            size="sm"
          >
            {logoutAllMutation.isPending ? "正在退出全部..." : "退出全部设备"}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {sessionsQuery.data?.map((session) => (
            <div key={session.sessionId} className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-input)] px-4 py-3">
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
                      session.current ? "bg-white text-slate-950" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {session.current ? "当前设备" : "历史会话"}
                  </div>
                  {!session.current ? (
                    <Button
                      onClick={() => revokeSessionMutation.mutate(session.sessionId)}
                      disabled={logoutMutation.isPending || logoutAllMutation.isPending || revokeSessionMutation.isPending}
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

      <AppSection className="p-5">
        <div className="text-sm font-medium text-white">控制入口</div>
        <div className="mt-4 space-y-3 text-sm text-[color:var(--text-secondary)]">
          <Link to="/setup" className="block">
            <Button variant="secondary" size="lg" className="w-full justify-start rounded-2xl">
              首次启动与 Provider 配置
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
          <Button
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending || logoutAllMutation.isPending || revokeSessionMutation.isPending}
            variant="danger"
            size="lg"
            className="w-full justify-start rounded-2xl"
          >
            {logoutMutation.isPending ? "正在退出..." : "退出当前世界"}
          </Button>
        </div>
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
