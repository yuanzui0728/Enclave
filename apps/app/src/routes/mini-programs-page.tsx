import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { sendGroupMessage } from "@yinjie/contracts";

const t = translateRuntimeMessage;
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  miniProgramEntries,
  getMiniProgramWorkspaceTasks,
  type MiniProgramCategoryId,
} from "../features/mini-programs/mini-programs-data";
import { RouteRedirectState } from "../components/route-redirect-state";
import { MobileMiniProgramsWorkspace } from "../features/mini-programs/mobile-mini-programs-workspace";
import {
  buildMobileMiniProgramsRouteSearch,
  parseMobileMiniProgramsRouteSearch,
} from "../features/mini-programs/mobile-mini-programs-route-state";
import { useMiniProgramsState } from "../features/mini-programs/use-mini-programs-state";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { buildGroupRelaySummaryMessage } from "../features/mini-programs/group-relay-message";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { normalizePathname } from "../lib/normalize-pathname";
import { searchStringToObject } from "../lib/route-search";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import { shareWithNativeShell } from "../runtime/mobile-bridge";
import { writeClipboardText } from "../runtime/native-clipboard";
import {
  isMobileWebShareSurface,
  isNativeMobileShareSurface,
} from "../runtime/mobile-share-surface";
import { buildDesktopChatThreadPath } from "../features/desktop/chat/desktop-chat-route-state";

const DesktopMiniProgramsWorkspace = lazy(async () => {
  const mod =
    await import("../features/desktop/mini-programs/desktop-mini-programs-workspace");
  return { default: mod.DesktopMiniProgramsWorkspace };
});

function resolveDefaultMiniProgramId() {
  return featuredMiniProgramIds[0] ?? miniProgramEntries[0]?.id ?? "";
}

export function MiniProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktopLayout = useDesktopLayout();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const nativeMobileShareSupported = isNativeMobileShareSurface({
    isDesktopLayout,
  });
  const mobileWebCopyFallback = isMobileWebShareSurface({
    isDesktopLayout,
  });
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const locationSearch = useRouterState({
    select: (state) => state.location.searchStr,
  });
  const routeState = useMemo(
    () => parseMobileMiniProgramsRouteSearch(locationSearch),
    [locationSearch],
  );
  const {
    activeMiniProgramId,
    completedTaskIdsByMiniProgramId,
    groupRelayPublishCountBySourceGroupId,
    launchCountById,
    lastOpenedAtById,
    pinnedMiniProgramIds,
    recentMiniProgramIds,
    dismissActiveMiniProgram,
    openMiniProgram,
    recordGroupRelayPublish,
    toggleTaskCompletion,
    togglePinned,
  } = useMiniProgramsState();
  const [activeCategory, setActiveCategory] =
    useState<MiniProgramCategoryId>("all");
  const [searchText, setSearchText] = useState("");
  const selectedMiniProgramFromSearch = routeState.miniProgramId ?? null;
  const [selectedMiniProgramId, setSelectedMiniProgramId] = useState(
    selectedMiniProgramFromSearch ?? resolveDefaultMiniProgramId(),
  );
  const routeLaunchContext = useMemo(
    () =>
      routeState.sourceGroupId
        ? {
            sourceGroupId: routeState.sourceGroupId,
            sourceGroupName: routeState.sourceGroupName || t(msg`当前群聊`),
          }
        : null,
    [routeState.sourceGroupId, routeState.sourceGroupName],
  );
  const [groupRelayLaunchContext, setGroupRelayLaunchContext] = useState(
    routeLaunchContext,
  );
  const routeMiniProgramId = useMemo(() => {
    if (selectedMiniProgramFromSearch) {
      return selectedMiniProgramFromSearch;
    }

    return routeLaunchContext ? "group-relay" : null;
  }, [routeLaunchContext, selectedMiniProgramFromSearch]);
  const activeLaunchContext =
    selectedMiniProgramId === "group-relay" ? groupRelayLaunchContext : null;
  const groupRelayEntry = getMiniProgramEntry("group-relay");
  const [successNotice, setSuccessNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [noticeActionState, setNoticeActionState] = useState<{
    label: string;
    message: string;
    onAction: () => void;
  } | null>(null);
  const normalizedPathname = normalizePathname(pathname);
  const isDesktopMiniProgramsRoute =
    normalizedPathname === "/mini-programs" ||
    normalizedPathname === "/tabs/mini-programs" ||
    normalizedPathname === "/discover/mini-programs";
  const normalizedDesktopReturnPath =
    isDesktopLayout && routeState.returnPath === "/discover/mini-programs"
      ? "/tabs/mini-programs"
      : routeState.returnPath;
  const safeReturnPath =
    normalizedDesktopReturnPath &&
    !isDesktopOnlyPath(normalizedDesktopReturnPath)
      ? normalizedDesktopReturnPath
      : undefined;
  const safeReturnHash = safeReturnPath ? routeState.returnHash : undefined;
  const [relaySummaryPublishedAt, setRelaySummaryPublishedAt] = useState(() =>
    new Date().toISOString(),
  );
  const relaySummaryStartedAt =
    groupRelayLaunchContext && lastOpenedAtById["group-relay"]
      ? lastOpenedAtById["group-relay"]
      : relaySummaryPublishedAt;
  const relayPublishCount = groupRelayLaunchContext?.sourceGroupId
    ? (groupRelayPublishCountBySourceGroupId[
        groupRelayLaunchContext.sourceGroupId
      ] ??
        0) + 1
    : 1;
  const relaySummaryMessage = groupRelayLaunchContext
    ? buildGroupRelaySummaryMessage(
        groupRelayLaunchContext.sourceGroupName,
        "published",
        relaySummaryStartedAt,
        relaySummaryPublishedAt,
        isDesktopLayout ? "desktop" : "mobile",
        isDesktopLayout ? "desktop" : "mobile",
        resolveGroupRelayMetricValue(groupRelayEntry?.usersLabel, t(msg`接龙进行中`)),
        resolveGroupRelayMetricValue(groupRelayEntry?.serviceLabel, t(msg`待确认`)),
        t(msg`第 ${relayPublishCount} 次`),
      )
    : "";

  const visibleMiniPrograms = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return miniProgramEntries.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.name,
        item.slogan,
        item.description,
        item.developer,
        item.deckLabel,
        item.openHint,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [activeCategory, searchText]);

  useEffect(() => {
    if (!routeLaunchContext) {
      return;
    }

    setGroupRelayLaunchContext((current) =>
      current?.sourceGroupId === routeLaunchContext.sourceGroupId &&
      current?.sourceGroupName === routeLaunchContext.sourceGroupName
        ? current
        : routeLaunchContext,
    );
  }, [routeLaunchContext]);

  useEffect(() => {
    setRelaySummaryPublishedAt(new Date().toISOString());
  }, [groupRelayLaunchContext?.sourceGroupId]);

  useEffect(() => {
    if (!routeMiniProgramId) {
      return;
    }

    setSelectedMiniProgramId((current) =>
      current === routeMiniProgramId ? current : routeMiniProgramId,
    );
  }, [routeMiniProgramId]);

  useEffect(() => {
    if (!getMiniProgramEntry(selectedMiniProgramId)) {
      setSelectedMiniProgramId(resolveDefaultMiniProgramId());
    }
  }, [selectedMiniProgramId]);

  useEffect(() => {
    if (!visibleMiniPrograms.length) {
      return;
    }

    if (
      !visibleMiniPrograms.some((item) => item.id === selectedMiniProgramId)
    ) {
      setSelectedMiniProgramId(visibleMiniPrograms[0].id);
    }
  }, [selectedMiniProgramId, visibleMiniPrograms]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSuccessNotice("");
      setNoticeActionState(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  useEffect(() => {
    if (
      !isDesktopLayout ||
      !isDesktopMiniProgramsRoute ||
      !selectedMiniProgramId
    ) {
      return;
    }

    const nextSearch = buildMobileMiniProgramsRouteSearch({
      miniProgramId: selectedMiniProgramId,
      sourceGroupId: activeLaunchContext?.sourceGroupId,
      sourceGroupName: activeLaunchContext?.sourceGroupName,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if (
      pathname === "/tabs/mini-programs" &&
      (locationSearch || "") === (nextSearch || "")
    ) {
      return;
    }

    void navigate({
      to: "/tabs/mini-programs",
      search: searchStringToObject(nextSearch),
      replace: true,
    });
  }, [
    activeLaunchContext?.sourceGroupId,
    activeLaunchContext?.sourceGroupName,
    isDesktopMiniProgramsRoute,
    isDesktopLayout,
    locationSearch,
    navigate,
    pathname,
    safeReturnHash,
    safeReturnPath,
    selectedMiniProgramId,
  ]);

  useEffect(() => {
    if (
      isDesktopLayout ||
      normalizedPathname !== "/discover/mini-programs" ||
      !selectedMiniProgramId
    ) {
      return;
    }

    const nextSearch = buildMobileMiniProgramsRouteSearch({
      miniProgramId: selectedMiniProgramId,
      sourceGroupId: activeLaunchContext?.sourceGroupId,
      sourceGroupName: activeLaunchContext?.sourceGroupName,
      returnPath: safeReturnPath,
      returnHash: safeReturnHash,
    });

    if ((locationSearch || "") === (nextSearch || "")) {
      return;
    }

    void navigate({
      to: pathname,
      search: searchStringToObject(nextSearch),
      replace: true,
    });
  }, [
    activeLaunchContext?.sourceGroupId,
    activeLaunchContext?.sourceGroupName,
    isDesktopLayout,
    locationSearch,
    navigate,
    pathname,
    normalizedPathname,
    safeReturnHash,
    safeReturnPath,
    selectedMiniProgramId,
  ]);

  function handleOpenMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    openMiniProgram(miniProgramId);
    setSelectedMiniProgramId(miniProgramId);
    setNoticeTone("success");
    setNoticeActionState(null);
    setSuccessNotice(
      `${miniProgram?.name ?? t(msg`该小程序`)} ${t(msg`已加入最近使用，当前已进入小程序工作台。`)}`,
    );
  }

  function handleTogglePinnedMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const pinned = pinnedMiniProgramIds.includes(miniProgramId);
    togglePinned(miniProgramId);
    setNoticeTone("success");
    setNoticeActionState(null);
    setSuccessNotice(
      `${miniProgram?.name ?? t(msg`该小程序`)} ${t(msg`已`)}${pinned ? t(msg`移出`) : t(msg`加入`)}${t(msg`我的小程序。`)}`,
    );
  }

  function handleToggleMiniProgramTask(miniProgramId: string, taskId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const currentTasks = getMiniProgramWorkspaceTasks(
      miniProgramId,
      completedTaskIdsByMiniProgramId[miniProgramId] ?? [],
    );
    const task = currentTasks.find((item) => item.id === taskId);
    const completed = Boolean(task?.completed);
    toggleTaskCompletion(miniProgramId, taskId);
    setNoticeTone("success");
    setNoticeActionState(null);
    setSuccessNotice(
      `${miniProgram?.name ?? t(msg`该小程序`)} ${t(msg`已`)}${completed ? t(msg`恢复`) : t(msg`完成`)}"${task?.title ?? t(msg`当前待办`)}"${t(msg`。`)}`,
    );
  }

  async function handleCopyMiniProgramToMobile(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const miniProgramLaunchContext =
      miniProgramId === "group-relay" ? groupRelayLaunchContext : null;
    const search = buildMobileMiniProgramsRouteSearch({
      miniProgramId,
      sourceGroupId: miniProgramLaunchContext?.sourceGroupId,
      sourceGroupName: miniProgramLaunchContext?.sourceGroupName,
    });
    const path = `/discover/mini-programs${search ?? ""}`;
    const link = resolveMobileHandoffLink(path);

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${miniProgram?.name ?? t(msg`小程序`)} ${t(msg`入口`)}`,
        text: `${miniProgram?.name ?? t(msg`小程序`)}\n${link}`,
        url: link,
      });

      if (shared) {
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`已打开系统分享面板。`));
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setNoticeActionState(
          nativeMobileShareSupported
            ? {
                label: t(msg`重试分享`),
                message: t(msg`当前设备暂时无法打开系统分享，请稍后重试。`),
                onAction: () => {
                  void handleCopyMiniProgramToMobile(miniProgramId);
                },
              }
            : null,
        );
        setSuccessNotice(t(msg`当前设备暂时无法打开系统分享，请稍后重试。`));
        return;
      }

      try {
        if (!(await writeClipboardText(link))) {
          throw new Error("clipboard copy failed");
        }
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`系统分享暂时不可用，已复制入口链接。`));
      } catch {
        setNoticeActionState({
          label: t(msg`重试分享`),
          message: t(msg`系统分享失败，请稍后重试。`),
          onAction: () => {
            void handleCopyMiniProgramToMobile(miniProgramId);
          },
        });
        setNoticeTone("info");
        setSuccessNotice(t(msg`系统分享失败，请稍后重试。`));
      }
      return;
    }

    if (mobileWebCopyFallback) {
      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setNoticeActionState({
          label: t(msg`重试复制`),
          message: t(msg`当前环境暂不支持复制入口链接。`),
          onAction: () => {
            void handleCopyMiniProgramToMobile(miniProgramId);
          },
        });
        setSuccessNotice(t(msg`当前环境暂不支持复制入口链接。`));
        return;
      }

      try {
        if (!(await writeClipboardText(link))) {
          throw new Error("clipboard copy failed");
        }
        setNoticeTone("success");
        setNoticeActionState(null);
        setSuccessNotice(t(msg`入口链接已复制。`));
      } catch {
        setNoticeActionState({
          label: t(msg`重试复制`),
          message: t(msg`复制入口链接失败，请稍后重试。`),
          onAction: () => {
            void handleCopyMiniProgramToMobile(miniProgramId);
          },
        });
        setNoticeTone("info");
        setSuccessNotice(t(msg`复制入口链接失败，请稍后重试。`));
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setNoticeActionState({
        label: t(msg`重试复制到手机`),
        message: t(msg`当前环境暂不支持复制到手机。`),
        onAction: () => {
          void handleCopyMiniProgramToMobile(miniProgramId);
        },
      });
      setSuccessNotice(t(msg`当前环境暂不支持复制到手机。`));
      return;
    }

    try {
      if (!(await writeClipboardText(link))) {
        throw new Error("clipboard copy failed");
      }
      pushMobileHandoffRecord({
        category: "mini_program",
        description: `${t(msg`把`)} ${miniProgram?.name ?? t(msg`小程序`)} ${t(msg`的当前工作台发到手机继续，保留最近使用和本地待办上下文。`)}`,
        label: `${miniProgram?.name ?? t(msg`小程序`)} ${t(msg`接力`)}`,
        path,
      });
      setNoticeTone("success");
      setNoticeActionState(null);
      setSuccessNotice(
        `${miniProgram?.name ?? t(msg`该小程序`)} ${t(msg`已复制到手机接力链接。`)}`,
      );
    } catch {
      setNoticeActionState({
        label: t(msg`重试复制到手机`),
        message: t(msg`复制到手机失败，请稍后重试。`),
        onAction: () => {
          void handleCopyMiniProgramToMobile(miniProgramId);
        },
      });
      setNoticeTone("info");
      setSuccessNotice(t(msg`复制到手机失败，请稍后重试。`));
    }
  }

  function handleBack() {
    navigateBackOrFallback(() => {
      if (activeLaunchContext) {
        void navigate({
          to: "/group/$groupId",
          params: { groupId: activeLaunchContext.sourceGroupId },
        });
        return;
      }

      if (safeReturnPath) {
        void navigate({
          to: safeReturnPath,
          ...(safeReturnHash ? { hash: safeReturnHash } : {}),
        });
        return;
      }

      void navigate({ to: "/tabs/discover" });
    });
  }

  const statusBackLabel = activeLaunchContext
    ? t(msg`返回群聊`)
    : safeReturnPath
      ? t(msg`返回上一页`)
      : null;

  const sendRelaySummaryMutation = useMutation({
    mutationFn: async () => {
      if (!groupRelayLaunchContext) {
        return null;
      }

      return sendGroupMessage(
        groupRelayLaunchContext.sourceGroupId,
        {
          text: relaySummaryMessage,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      if (!groupRelayLaunchContext) {
        return;
      }

      if (
        !(completedTaskIdsByMiniProgramId["group-relay"] ?? []).includes(
          "publish-result",
        )
      ) {
        toggleTaskCompletion("group-relay", "publish-result");
      }
      recordGroupRelayPublish(groupRelayLaunchContext.sourceGroupId);

      setNoticeTone("success");
      setNoticeActionState(null);
      setSuccessNotice(
        `${t(msg`群接龙结果已回填到"`)}${groupRelayLaunchContext.sourceGroupName}${t(msg`"。`)}`,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "app-group-messages",
            baseUrl,
            groupRelayLaunchContext.sourceGroupId,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
    onError: () => {
      setNoticeTone("info");
      setSuccessNotice(t(msg`群接龙结果回填失败，请稍后重试。`));
    },
  });

  if (isDesktopLayout) {
    return (
      <Suspense
        fallback={
          <RouteRedirectState
            title={t(msg`正在打开桌面小程序`)}
            description={t(msg`正在载入桌面小程序工作区，马上恢复当前小程序上下文。`)}
            loadingLabel={t(msg`载入桌面小程序...`)}
          />
        }
      >
        <DesktopMiniProgramsWorkspace
          activeCategory={activeCategory}
          activeMiniProgramId={activeMiniProgramId}
          completedTaskIdsByMiniProgramId={completedTaskIdsByMiniProgramId}
          launchCountById={launchCountById}
          lastOpenedAtById={lastOpenedAtById}
          panelMiniProgramId={routeMiniProgramId}
          pinnedMiniProgramIds={pinnedMiniProgramIds}
          recentMiniProgramIds={recentMiniProgramIds}
          searchText={searchText}
          selectedMiniProgramId={selectedMiniProgramId}
          successNotice={successNotice}
          noticeTone={noticeTone}
          visibleMiniPrograms={visibleMiniPrograms}
          onCategoryChange={setActiveCategory}
          onCopyMiniProgramToMobile={handleCopyMiniProgramToMobile}
          onDismissActiveMiniProgram={dismissActiveMiniProgram}
          onOpenMiniProgram={handleOpenMiniProgram}
          onSearchTextChange={setSearchText}
          onSelectMiniProgram={setSelectedMiniProgramId}
          onToggleMiniProgramTask={handleToggleMiniProgramTask}
          onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
          launchContext={activeLaunchContext}
          relaySummaryMessage={relaySummaryMessage}
          relaySummaryPending={sendRelaySummaryMutation.isPending}
          onSendRelaySummaryToGroup={
            activeLaunchContext
              ? () => {
                  void sendRelaySummaryMutation.mutateAsync();
                }
              : undefined
          }
          onReturnToGroup={
            activeLaunchContext
              ? () => {
                  void navigate({
                    to: buildDesktopChatThreadPath({
                      conversationId: activeLaunchContext.sourceGroupId,
                    }),
                  });
                }
              : undefined
          }
        />
      </Suspense>
    );
  }

  return (
    <MobileMiniProgramsWorkspace
      activeCategory={activeCategory}
      activeMiniProgramId={activeMiniProgramId}
      completedTaskIdsByMiniProgramId={completedTaskIdsByMiniProgramId}
      launchCountById={launchCountById}
      lastOpenedAtById={lastOpenedAtById}
      panelMiniProgramId={routeMiniProgramId}
      pinnedMiniProgramIds={pinnedMiniProgramIds}
      recentMiniProgramIds={recentMiniProgramIds}
      searchText={searchText}
      selectedMiniProgramId={selectedMiniProgramId}
      successNotice={successNotice}
      noticeTone={noticeTone}
      noticeActionLabel={
        noticeActionState && noticeActionState.message === successNotice
          ? noticeActionState.label
          : null
      }
      statusBackLabel={statusBackLabel}
      visibleMiniPrograms={visibleMiniPrograms}
      onCopyMiniProgramToMobile={handleCopyMiniProgramToMobile}
      onBack={handleBack}
      onCategoryChange={setActiveCategory}
      onDismissActiveMiniProgram={dismissActiveMiniProgram}
      onOpenMiniProgram={handleOpenMiniProgram}
      onSearchTextChange={setSearchText}
      onSelectMiniProgram={setSelectedMiniProgramId}
      onNoticeAction={
        noticeActionState && noticeActionState.message === successNotice
          ? noticeActionState.onAction
          : undefined
      }
      onStatusBack={statusBackLabel ? handleBack : undefined}
      onToggleMiniProgramTask={handleToggleMiniProgramTask}
      onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
    />
  );
}

function resolveGroupRelayMetricValue(
  label: string | undefined,
  suffix: string,
) {
  const value = label?.trim() ?? "";

  if (!value) {
    return null;
  }

  if (value.endsWith(suffix)) {
    return value.slice(0, -suffix.length).trim() || value;
  }

  return value;
}
