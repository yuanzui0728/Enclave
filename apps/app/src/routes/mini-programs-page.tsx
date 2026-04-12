import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { sendGroupMessage } from "@yinjie/contracts";
import { DesktopMiniProgramsWorkspace } from "../features/desktop/mini-programs/desktop-mini-programs-workspace";
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  miniProgramEntries,
  getMiniProgramWorkspaceTasks,
  type MiniProgramCategoryId,
} from "../features/mini-programs/mini-programs-data";
import { MobileMiniProgramsWorkspace } from "../features/mini-programs/mobile-mini-programs-workspace";
import { useMiniProgramsState } from "../features/mini-programs/use-mini-programs-state";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import {
  buildGroupRelaySummaryMessage,
} from "../features/mini-programs/group-relay-message";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";
import {
  isNativeMobileBridgeAvailable,
  shareWithNativeShell,
} from "../runtime/mobile-bridge";

function resolveDefaultMiniProgramId() {
  return featuredMiniProgramIds[0] ?? miniProgramEntries[0]?.id ?? "";
}

function resolveMiniProgramSelectionFromSearch(search: unknown) {
  const miniProgramId = new URLSearchParams(
    typeof search === "string" ? search : "",
  ).get("miniProgram");

  return miniProgramId && getMiniProgramEntry(miniProgramId)
    ? miniProgramId
    : null;
}

function resolveMiniProgramLaunchContextFromSearch(search: unknown) {
  const searchParams = new URLSearchParams(
    typeof search === "string" ? search : "",
  );
  const sourceGroupId = searchParams.get("sourceGroupId")?.trim() ?? "";
  const sourceGroupName = searchParams.get("sourceGroupName")?.trim() ?? "";

  if (!sourceGroupId) {
    return null;
  }

  return {
    sourceGroupId,
    sourceGroupName: sourceGroupName || "当前群聊",
  };
}

export function MiniProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isDesktopLayout = useDesktopLayout();
  const nativeMobileShareSupported =
    !isDesktopLayout && isNativeMobileBridgeAvailable();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const locationSearch = useRouterState({
    select: (state) => state.location.search,
  });
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
  const selectedMiniProgramFromSearch = useMemo(
    () => resolveMiniProgramSelectionFromSearch(locationSearch),
    [locationSearch],
  );
  const [selectedMiniProgramId, setSelectedMiniProgramId] = useState(
    selectedMiniProgramFromSearch ?? resolveDefaultMiniProgramId(),
  );
  const launchContext = useMemo(
    () => resolveMiniProgramLaunchContextFromSearch(locationSearch),
    [locationSearch],
  );
  const routeMiniProgramId = useMemo(() => {
    if (selectedMiniProgramFromSearch) {
      return selectedMiniProgramFromSearch;
    }

    return launchContext ? "group-relay" : null;
  }, [launchContext, selectedMiniProgramFromSearch]);
  const groupRelayEntry = getMiniProgramEntry("group-relay");
  const [successNotice, setSuccessNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");
  const [relaySummaryPublishedAt, setRelaySummaryPublishedAt] = useState(() =>
    new Date().toISOString(),
  );
  const relaySummaryStartedAt =
    launchContext && lastOpenedAtById["group-relay"]
      ? lastOpenedAtById["group-relay"]
      : relaySummaryPublishedAt;
  const relayPublishCount =
    launchContext?.sourceGroupId
      ? (groupRelayPublishCountBySourceGroupId[launchContext.sourceGroupId] ??
          0) + 1
      : 1;
  const relaySummaryMessage = launchContext
    ? buildGroupRelaySummaryMessage(
        launchContext.sourceGroupName,
        "published",
        relaySummaryStartedAt,
        relaySummaryPublishedAt,
        isDesktopLayout ? "desktop" : "mobile",
        isDesktopLayout ? "desktop" : "mobile",
        resolveGroupRelayMetricValue(groupRelayEntry?.usersLabel, "接龙进行中"),
        resolveGroupRelayMetricValue(groupRelayEntry?.serviceLabel, "待确认"),
        `第 ${relayPublishCount} 次`,
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
    setRelaySummaryPublishedAt(new Date().toISOString());
  }, [launchContext?.sourceGroupId]);

  useEffect(() => {
    if (!routeMiniProgramId) {
      return;
    }

    setSelectedMiniProgramId((current) =>
      current === routeMiniProgramId
        ? current
        : routeMiniProgramId,
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

    const timer = window.setTimeout(() => setSuccessNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  function handleOpenMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    openMiniProgram(miniProgramId);
    setSelectedMiniProgramId(miniProgramId);
    setNoticeTone("success");
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已加入最近使用，当前已进入小程序工作台。`,
    );
  }

  function handleTogglePinnedMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const pinned = pinnedMiniProgramIds.includes(miniProgramId);
    togglePinned(miniProgramId);
    setNoticeTone("success");
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已${pinned ? "移出" : "加入"}我的小程序。`,
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
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已${completed ? "恢复" : "完成"}“${task?.title ?? "当前待办"}”。`,
    );
  }

  async function handleCopyMiniProgramToMobile(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const query = new URLSearchParams({ miniProgram: miniProgramId });
    const path = `/discover/mini-programs?${query.toString()}`;
    const link = resolveMobileHandoffLink(path);

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${miniProgram?.name ?? "小程序"} 入口`,
        text: `${miniProgram?.name ?? "小程序"}\n${link}`,
        url: link,
      });

      if (shared) {
        setNoticeTone("success");
        setSuccessNotice("已打开系统分享面板。");
        return;
      }

      if (
        typeof navigator === "undefined" ||
        !navigator.clipboard ||
        typeof navigator.clipboard.writeText !== "function"
      ) {
        setNoticeTone("info");
        setSuccessNotice("当前设备暂时无法打开系统分享，请稍后重试。");
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        setNoticeTone("success");
        setSuccessNotice("系统分享暂时不可用，已复制入口链接。");
      } catch {
        setNoticeTone("info");
        setSuccessNotice("系统分享失败，请稍后重试。");
      }
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setSuccessNotice("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      pushMobileHandoffRecord({
        description: `把 ${miniProgram?.name ?? "小程序"} 的当前工作台发到手机继续，保留最近使用和本地待办上下文。`,
        label: `${miniProgram?.name ?? "小程序"} 接力`,
        path,
      });
      setNoticeTone("success");
      setSuccessNotice(`${miniProgram?.name ?? "该小程序"} 已复制到手机接力链接。`);
    } catch {
      setNoticeTone("info");
      setSuccessNotice("复制到手机失败，请稍后重试。");
    }
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({ to: "/tabs/discover" });
  }

  const sendRelaySummaryMutation = useMutation({
    mutationFn: async () => {
      if (!launchContext) {
        return null;
      }

      return sendGroupMessage(
        launchContext.sourceGroupId,
        {
          text: relaySummaryMessage,
        },
        baseUrl,
      );
    },
    onSuccess: async () => {
      if (!launchContext) {
        return;
      }

      if (
        !(completedTaskIdsByMiniProgramId["group-relay"] ?? []).includes(
          "publish-result",
        )
      ) {
        toggleTaskCompletion("group-relay", "publish-result");
      }
      recordGroupRelayPublish(launchContext.sourceGroupId);

      setNoticeTone("success");
      setSuccessNotice(`群接龙结果已回填到“${launchContext.sourceGroupName}”。`);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group-messages", baseUrl, launchContext.sourceGroupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
    },
    onError: () => {
      setNoticeTone("info");
      setSuccessNotice("群接龙结果回填失败，请稍后重试。");
    },
  });

  if (isDesktopLayout) {
    return (
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
        launchContext={launchContext}
        relaySummaryMessage={relaySummaryMessage}
        relaySummaryPending={sendRelaySummaryMutation.isPending}
        onSendRelaySummaryToGroup={
          launchContext
            ? () => {
                void sendRelaySummaryMutation.mutateAsync();
              }
            : undefined
        }
        onReturnToGroup={
          launchContext
            ? () => {
                void navigate({
                  to: "/group/$groupId",
                  params: { groupId: launchContext.sourceGroupId },
                });
              }
            : undefined
        }
      />
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
      visibleMiniPrograms={visibleMiniPrograms}
      onCopyMiniProgramToMobile={
        nativeMobileShareSupported ? handleCopyMiniProgramToMobile : undefined
      }
      onBack={handleBack}
      onCategoryChange={setActiveCategory}
      onDismissActiveMiniProgram={dismissActiveMiniProgram}
      onOpenMiniProgram={handleOpenMiniProgram}
      onSearchTextChange={setSearchText}
      onSelectMiniProgram={setSelectedMiniProgramId}
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
