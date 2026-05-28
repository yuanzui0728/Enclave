import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
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
import { useRuntimeTranslator } from "@yinjie/i18n";
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
import {
  buildMobileGroupRouteHash,
  parseMobileGroupRouteState,
} from "../features/chat/mobile-group-route-state";
import { buildDesktopChatRouteHash } from "../features/desktop/chat/desktop-chat-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { describeRequestError } from "../lib/request-error";
import { pickImageFiles } from "../runtime/native-image-picker";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type UploadTarget = "default" | "group";

export function GroupChatBackgroundPage() {
  const t = useRuntimeTranslator();
  const { groupId } = useParams({
    from: "/group/$groupId/background",
  });
  const navigate = useNavigate();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const isDesktopLayout = useDesktopLayout();
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
  const routeState = parseMobileGroupRouteState(hash);
  const safeReturnPath =
    routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
      ? routeState.returnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const currentRouteHash = useMemo(
    () =>
      buildMobileGroupRouteHash({
        highlightedMessageId: routeState.highlightedMessageId,
        returnPath: safeReturnPath,
        returnHash: safeReturnHash,
      }),
    [routeState.highlightedMessageId, safeReturnHash, safeReturnPath],
  );
  const desktopDetailsFallbackHash = useMemo(
    () =>
      buildDesktopChatRouteHash({
        conversationId: groupId,
        panel: "details",
      }),
    [groupId],
  );

  // 走查电脑端群聊 R91：和单聊侧 R95/R96 同款问题——本页 groupQuery 没设
  // staleTime（默认 0），桌面 layout 下「聊天信息 → 聊天背景」是常用入口，
  // 用户在 desktop 工作区点入此页时 thread-panel 的同 key app-group 1s 前
  // 才刚 fetch 过（thread-panel 已带 staleTime: 15_000），但本页 mount 立刻
  // 触发同 key 的冗余 RTT、用户从 thread-panel 切过来还要等 group 数据回
  // 来才能渲染 ChatDetailsShell 标题。和 thread-panel / member-picker /
  // qr-page / message-search 一批 app-group query 对齐 staleTime: 15_000。
  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
    staleTime: 15_000,
  });
  const backgroundQuery = useGroupBackground(groupId);

  // 走查 Round 4：原版每次 backgroundQuery.data 变化都把 draft 三连冲掉。
  // useGroupBackground 在 window-focus / 切换前后台时会 refetch；用户上传完
  // 还没点保存就切到后台/最小化再回来，refetch 命中老服务器 data，effect 把
  // 用户的上传 draft 覆盖回旧值——白上传一次。同 edit/announcement 页路数：
  // 只在第一次拿到服务端值时 seed，之后用户控制 draft；如果用户点了
  // saveDefault/saveGroup/clearDefault/clearGroup 把服务端值改写了，
  // 那些 onSuccess 里手动 setDefault/setGroup 也会显式 reset 这个 ref。
  const draftInitializedRef = useRef(false);
  useEffect(() => {
    if (!backgroundQuery.data) {
      return;
    }
    if (draftInitializedRef.current) {
      return;
    }
    draftInitializedRef.current = true;
    setDefaultDraft(backgroundQuery.data.defaultBackground ?? null);
    setGroupMode(backgroundQuery.data.mode);
    setGroupDraft(backgroundQuery.data.conversationBackground ?? null);
  }, [backgroundQuery.data]);
  // groupId 切换（同账号切到另一群）必须强制 re-seed，否则下一群的 draft
  // 还是上一群的；和上面那条 effect 配对。
  // 走查 R1：仅 reset ref 不够——还得把 defaultDraft/groupMode/groupDraft 三个
  // state 也回归到 initial（null/inherit/null），否则 backgroundQuery.data 还在
  // 飞那几百 ms 内界面会先用 A 群的 draft 渲染 B 群的预览，包括 PresetGrid 上
  // 高亮的也是上一群的选中项。uploadMutation 的取消挂起单独放在另一个 effect
  // 里（声明顺序在它之下）。
  useEffect(() => {
    draftInitializedRef.current = false;
    setDefaultDraft(null);
    setGroupMode("inherit");
    setGroupDraft(null);
  }, [baseUrl, groupId]);

  useEffect(() => {
    setNotice(null);
  }, [groupId]);

  // 走查移动端群聊 R1：和姊妹路径 chat-background-page.tsx 走查 R2（commit
  // c16fa822e）同款修法——本页 setNotice("背景图已上传，记得保存当前设置。") /
  // setNotice("默认背景图已保存。") / setNotice("当前群聊背景已保存。") 等 8
  // 处 success 文案没 auto-dismiss，notice 一直挂在背景预览上方直到用户离开
  // 页面或切到下一群（[groupId] effect 重置）。单聊版同位置已经按 chat-list /
  // chat-details 口径对齐 3.5s 自动消，本页漏修。pageError 走 mutation.error
  // 单独渲染，不经 notice 状态，无需顾及。
  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
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
    groupId,
    groupQuery.error,
    groupQuery.isLoading,
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
        setGroupMode("custom");
        setGroupDraft(result.background);
      }
      setNotice(t(msg`背景图已上传，记得保存当前设置。`));
    },
  });

  // 走查 R1：切群时取消挂起的 upload onSuccess 副作用——A 群上传 mutation 在
  // 飞、用户切到 B 群、A 的 upload 回来 onSuccess 会 setDefaultDraft / setGroupDraft
  // 把 B 群预览覆盖成 A 群上传的图。reset() 把 mutation 状态拨回 idle，等同丢弃
  // in-flight 结果（compressChatBackgroundImage / uploadChatBackground 已经发出
  // 的网络请求不取消，但成功后 onSuccess 不再触发）。
  const uploadMutationResetRef = useRef(uploadMutation.reset);
  uploadMutationResetRef.current = uploadMutation.reset;
  useEffect(() => {
    uploadMutationResetRef.current();
  }, [baseUrl, groupId]);

  // 走查 R3：四个 mutation 的 onSuccess 原本都 await invalidateQueries 才
  // resolve；runningMutationRef 共用锁在 onSettled 才释放（line 295），等于
  // 用户点完"保存"按钮要等 invalidate 全部返回才能再次操作（公网隧道 RTT
  // 600ms × N 条），busy 状态多撑 1-2s。setNotice 已经在 await 前发了，剩下
  // invalidate 是给其它页面拉刷用的，fire-and-forget 即可。和 R1 announcement/
  // edit/create 三个页面同口径修法。
  const saveDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!defaultDraft) {
        throw new Error(t(msg`请先选择默认背景图。`));
      }

      return setWorldOwnerChatBackground({ background: defaultDraft }, baseUrl);
    },
    onSuccess: (owner) => {
      setDefaultDraft(owner.defaultChatBackground ?? null);
      setNotice(t(msg`默认背景图已保存。`));
      void queryClient.invalidateQueries({ queryKey: ["world-owner", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-background", baseUrl, groupId],
      });
    },
  });

  const clearDefaultMutation = useMutation({
    mutationFn: () => clearWorldOwnerChatBackground(baseUrl),
    onSuccess: () => {
      setDefaultDraft(null);
      setNotice(t(msg`默认背景图已恢复系统背景。`));
      void queryClient.invalidateQueries({ queryKey: ["world-owner", baseUrl] });
      void queryClient.invalidateQueries({
        queryKey: ["app-group-background", baseUrl, groupId],
      });
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
        throw new Error(t(msg`请先为当前群聊选择背景图。`));
      }

      return setGroupBackground(
        groupId,
        { mode: "custom", background: groupDraft },
        baseUrl,
      );
    },
    onSuccess: (settings) => {
      setGroupMode(settings.mode);
      setGroupDraft(settings.conversationBackground ?? null);
      setNotice(
        settings.mode === "custom"
          ? t(msg`当前群聊背景已保存。`)
          : t(msg`当前群聊已恢复跟随默认背景。`),
      );
      void queryClient.invalidateQueries({
        queryKey: ["app-group-background", baseUrl, groupId],
      });
    },
  });

  const clearGroupMutation = useMutation({
    mutationFn: () => clearGroupBackground(groupId, baseUrl),
    onSuccess: () => {
      setGroupMode("inherit");
      setGroupDraft(null);
      setNotice(t(msg`当前群聊已恢复跟随默认背景。`));
      void queryClient.invalidateQueries({
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
  // 同步防双击锁——下面 4 个保存/清除按钮都是 `() => xxxMutation.mutate()`
  // 直裸触发，busy=isPending sum 要等 React commit 才生效。同帧连点 2 次会
  // 同时通过 busy=false → 两份 PATCH 同时飞（公网隧道 RTT 下不罕见），
  // 服务端虽然幂等但 UI 上 setNotice 会被后到的 onSuccess 反复写一遍。
  // 4 个 mutation 共用一把锁——任意一个 in-flight 时其它的也禁用，对齐
  // busy 的语义。
  const runningMutationRef = useRef(false);
  const guard = (run: () => void) => () => {
    if (runningMutationRef.current) return;
    if (busy) return;
    runningMutationRef.current = true;
    run();
  };
  // 用 onSettled 解锁；4 个 mutation 共用一把锁
  const releaseLock = () => {
    runningMutationRef.current = false;
  };
  const runSaveDefault = guard(() =>
    saveDefaultMutation.mutate(undefined, { onSettled: releaseLock }),
  );
  const runClearDefault = guard(() =>
    clearDefaultMutation.mutate(undefined, { onSettled: releaseLock }),
  );
  const runSaveGroup = guard(() =>
    saveGroupMutation.mutate(undefined, { onSettled: releaseLock }),
  );
  const runClearGroup = guard(() =>
    clearGroupMutation.mutate(undefined, { onSettled: releaseLock }),
  );
  const pageError =
    (uploadMutation.error instanceof Error &&
      describeRequestError(uploadMutation.error)) ||
    (saveDefaultMutation.error instanceof Error &&
      describeRequestError(saveDefaultMutation.error)) ||
    (clearDefaultMutation.error instanceof Error &&
      describeRequestError(clearDefaultMutation.error)) ||
    (saveGroupMutation.error instanceof Error &&
      describeRequestError(saveGroupMutation.error)) ||
    (clearGroupMutation.error instanceof Error &&
      describeRequestError(clearGroupMutation.error)) ||
    null;

  const openPicker = async (target: UploadTarget) => {
    setUploadTarget(target);
    const files = await pickImageFiles({ multiple: false });
    const file = files[0];
    if (!file) {
      return;
    }
    // 用 mutate() 而不是 mutateAsync()——对齐单聊 chat-background-page 同款修法：
    // caller 是 onClick={() => openPicker(...)} fire-and-forget，没人接 rejection；
    // uploadMutation.error 已通过 pageError (line 291-301) 渲染在页面上，业务上
    // 不需要 await。改成 mutate() 后 rejection 不再外泄到 window.unhandledrejection
    // （公网隧道 / cloud token 过期重连时 compressChatBackgroundImage 后端 5xx /
    // 上传 4xx 会抛，每次都污染 telemetry）。
    uploadMutation.mutate({ file });
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
      to: "/group/$groupId/details",
      params: { groupId },
      ...(currentRouteHash ? { hash: currentRouteHash } : {}),
    });
  };

  const handleRetryLoad = () => {
    void Promise.all([groupQuery.refetch(), backgroundQuery.refetch()]);
  };

  const handleMissingGroupAction = () => {
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
      setNotice(t(msg`默认背景图已切到新预览，保存后生效。`));
      return;
    }

    setGroupMode("custom");
    setGroupDraft(background);
    setNotice(t(msg`当前群聊背景已切到新预览，保存后生效。`));
  };

  const content = (
    <>
      {groupQuery.isLoading || backgroundQuery.isLoading ? (
        isDesktopLayout ? (
          <LoadingBlock label={t(msg`正在读取群聊背景...`)} />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge={t(msg`读取中`)}
            title={t(msg`正在读取群聊背景`)}
            description={t(msg`稍等一下，正在同步默认背景和当前群聊设置。`)}
            tone="loading"
          />
        )
      ) : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        isDesktopLayout ? (
          // 走查电脑端群聊 R84：和姊妹 group-chat-thread-panel R67 /
          // GroupChatDetailsPanel R45 一批 ErrorBlock 同款 a11y 修法——「群聊
          // 背景」是群聊「聊天信息」→「聊天背景」入口，desktop 分支 3 处
          // ErrorBlock 都裸 <ErrorBlock>，盲人 SR 加载失败时静默；mobile 分支
          // 已经用 MobileGroupBackgroundStatusCard 自带 tone="danger"，desktop
          // 对齐挂 role="alert"。
          <ErrorBlock role="alert" message={describeRequestError(groupQuery.error)} />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`群聊背景暂时不可用`)}
            description={describeRequestError(groupQuery.error)}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleErrorStateAction}
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {backgroundQuery.isError && backgroundQuery.error instanceof Error ? (
        isDesktopLayout ? (
          <ErrorBlock role="alert" message={describeRequestError(backgroundQuery.error)} />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge={t(msg`读取失败`)}
            title={t(msg`群聊背景暂时不可用`)}
            description={describeRequestError(backgroundQuery.error)}
            tone="danger"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleErrorStateAction}
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
                </Button>
              </div>
            }
          />
        )
      ) : null}
      {pageError ? (
        isDesktopLayout ? (
          <ErrorBlock role="alert" message={pageError} />
        ) : (
          <InlineNotice
            // 新会话走查 R4：和姊妹 desktop 分支 ErrorBlock 同款 a11y 修法——
            // pageError 是上传/保存/清除背景 5 路 mutation 失败时的兜底反馈，
            // mobile 这条裸 InlineNotice 没 role/aria-live。盲人 SR 点完保存
            // 听不到任何错误播报，以为操作生效。role="alert"+assertive 立刻
            // 播报 pageError 内容。
            role="alert"
            tone="danger"
            className="rounded-[12px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1">{pageError}</span>
              <button
                type="button"
                onClick={handleErrorStateAction}
                className="shrink-0 rounded-full border border-[rgba(220,38,38,0.14)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回群聊信息`)}
              </button>
            </div>
          </InlineNotice>
        )
      ) : null}
      {notice ? (
        // 走查电脑端群聊 R90：和姊妹 R86/R88/R89 一批 transient toast 同款修法——
        // 「群聊背景」页（群聊「聊天信息」→「聊天背景」入口）的 notice 是 3500ms
        // 自动消失的反馈（line ~146-151 useEffect），始终 tone="success"，反馈
        //「已应用背景」/「已恢复默认」等。原版裸 InlineNotice 没 role / aria-live，
        // 盲人 SR 完全感知不到这条短暂反馈。polite 不抢断 SR 当前朗读。
        <InlineNotice
          role="status"
          aria-live="polite"
          tone="success"
          className={
            isDesktopLayout
              ? undefined
              : "rounded-[12px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          }
        >
          {notice}
        </InlineNotice>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        isDesktopLayout ? (
          <EmptyPanel
            title={t(msg`群聊不存在`)}
            description={t(msg`这个群聊暂时不可用，返回上一页后再试一次。`)}
          />
        ) : (
          <MobileGroupBackgroundStatusCard
            badge={t(msg`群聊`)}
            title={t(msg`群聊不存在`)}
            description={t(msg`这个群聊暂时不可用，可以先重试读取，或返回上一页后再试。`)}
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleRetryLoad}
                >
                  {t(msg`重试读取`)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 rounded-full border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-3 text-[10px]"
                  onClick={handleMissingGroupAction}
                >
                  {safeReturnPath ? t(msg`返回上一页`) : t(msg`返回消息列表`)}
                </Button>
              </div>
            }
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
                  ? t(msg`当前群聊正在预览专属背景`)
                  : t(msg`当前群聊正在预览默认背景`)
              }
            />
          ) : null}

          <SectionCard
            compact={!isDesktopLayout}
            title={t(msg`默认背景图`)}
            description={t(msg`应用到所有未单独设置专属背景的聊天。`)}
            status={t(msg`当前：${getChatBackgroundLabel(defaultDraft)}`)}
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
                {t(msg`上传图片`)}
              </Button>
              <Button
                variant="primary"
                disabled={busy || !defaultDraft}
                onClick={runSaveDefault}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                {t(msg`保存默认背景`)}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={runClearDefault}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                {t(msg`恢复系统背景`)}
              </Button>
            </div>
          </SectionCard>

          <SectionCard
            compact={!isDesktopLayout}
            title={t(msg`当前群聊背景`)}
            description={t(msg`群聊可设置专属背景，优先级高于默认背景图。`)}
            status={
              groupMode === "custom"
                ? t(msg`当前：${getChatBackgroundLabel(groupDraft)}`)
                : t(msg`当前：跟随默认背景`)
            }
          >
            <div className="flex flex-wrap gap-2">
              <ModeChip
                active={groupMode === "inherit"}
                compact={!isDesktopLayout}
                disabled={busy}
                label={t(msg`跟随默认`)}
                onClick={() => setGroupMode("inherit")}
              />
              <ModeChip
                active={groupMode === "custom"}
                compact={!isDesktopLayout}
                disabled={busy}
                label={t(msg`单独设置`)}
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
                    {t(msg`上传图片`)}
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={runClearGroup}
                    className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
                  >
                    {t(msg`跟随默认背景`)}
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
                {t(msg`当前群聊会直接沿用默认背景图。切换到"单独设置"后，可以挑选群聊专属背景。`)}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                disabled={busy || (groupMode === "custom" && !groupDraft)}
                onClick={runSaveGroup}
                className={!isDesktopLayout ? "min-h-11 rounded-full px-4" : undefined}
              >
                {groupMode === "custom"
                  ? t(msg`保存群聊背景`)
                  : t(msg`保存当前群聊设置`)}
              </Button>
            </div>
          </SectionCard>
        </>
      ) : null}

    </>
  );

  if (isDesktopLayout) {
    return (
      <AppPage className="min-h-full bg-[color:var(--bg-app)] px-4 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div className="flex items-center justify-between rounded-[16px] border border-[color:var(--border-faint)] bg-white/78 px-5 py-4 backdrop-blur-xl">
            <div>
              <div className="text-xs tracking-[0.12em] text-[color:var(--text-dim)]">
                {t(msg`群聊背景`)}
              </div>
              <div className="mt-2 text-2xl font-semibold text-[color:var(--text-primary)]">
                {groupQuery.data?.name || t(msg`群聊背景`)}
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
              className="rounded-[12px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-none hover:bg-[color:var(--surface-console)]"
            >
              {t(msg`返回群聊信息`)}
            </Button>
          </div>
          <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
            <div className="xl:sticky xl:top-5 xl:self-start">
              {groupQuery.data ? (
                <ChatBackgroundPreview
                  background={effectivePreviewBackground}
                  title={groupQuery.data.name}
                  subtitle={t(msg`桌面端预览会同步展示在群聊`)}
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
      title={groupQuery.data?.name || t(msg`群聊背景`)}
      subtitle={t(msg`默认背景和群聊专属背景`)}
      onBack={() => {
        navigateBackOrFallback(
          () => {
            void navigate({
              to: "/group/$groupId/details",
              params: { groupId },
              ...(currentRouteHash ? { hash: currentRouteHash } : {}),
            });
          },
          `/group/${groupId}/details`,
        );
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
          ? "space-y-4 overflow-hidden rounded-[20px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)] px-4 py-4 shadow-none"
          : "space-y-4 rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-section)]"
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
          {status}
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
              ? "border-[rgba(245,158,11,0.22)] bg-[color:var(--surface-card)] shadow-[inset_0_0_0_1px_rgba(245,158,11,0.06)]"
              : compact
                ? "border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] active:bg-[color:var(--surface-card-hover)]"
                : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] hover:bg-[color:var(--surface-console)]"
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
          <div className="bg-[color:var(--surface-card)] px-3 py-3 text-sm text-[color:var(--text-primary)]">
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
            ? "border-[rgba(245,158,11,0.16)] bg-[rgba(247,251,248,0.96)] text-[color:var(--brand-primary)]"
            : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)]"
          : compact
            ? "border-[color:var(--border-subtle)] bg-[color:var(--bg-canvas)] text-[color:var(--text-secondary)] active:bg-[color:var(--surface-card)]"
            : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-card)]"
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
    <div className="rounded-[16px] border border-dashed border-[color:var(--border-faint)] bg-white/84 px-5 py-8 text-center">
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
      // 新会话走查 R1：和姊妹群聊页 StatusCard 一批同款 a11y 修法——load 失败 /
      // 群不存在时本卡片是 mobile layout 唯一可读内容；之前盲人 SR 听不到错误
      // 原因。role="alert"+assertive 立刻播报；loading 用 polite 兜底。
      role={
        tone === "danger" ? "alert" : tone === "loading" ? "status" : undefined
      }
      aria-live={
        tone === "danger" ? "assertive" : tone === "loading" ? "polite" : undefined
      }
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
            : "bg-[rgba(245,158,11,0.1)] text-[color:var(--brand-primary)]",
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
